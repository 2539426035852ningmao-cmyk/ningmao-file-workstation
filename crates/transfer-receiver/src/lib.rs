pub mod destination;
pub mod tasks;
use destination::Destination;
use rustls::{ServerConfig, ServerConnection, StreamOwned};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{self, Read, Write},
    net::{SocketAddrV4, TcpListener, TcpStream},
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const MAX_CONTROL: usize = 64 * 1024;
const MAX_FILE: u64 = 512 * 1024 * 1024;
const CHUNK: usize = 64 * 1024;
#[derive(Clone, serde::Serialize)]
pub struct IncomingFile {
    pub name: String,
    pub size: u64,
}
#[derive(Clone, serde::Serialize)]
pub struct IncomingBatch {
    pub id: String,
    pub alias: String,
    pub files: Vec<IncomingFile>,
}
pub type Confirmation = Arc<dyn Fn(&IncomingBatch, &AtomicBool) -> bool + Send + Sync>;

pub struct Receiver {
    pub address: SocketAddrV4,
    stopping: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<Result<()>>>,
    session: Arc<Mutex<Option<Session>>>,
}
impl Receiver {
    pub fn start(
        address: SocketAddrV4,
        directory: &Path,
        config: Arc<ServerConfig>,
        journal: tasks::Journal,
        confirm: Confirmation,
    ) -> Result<Self> {
        if !address.ip().is_loopback() && !address.ip().is_private() {
            return Err("请选择本机局域网 IPv4 地址。".into());
        }
        let destination = Arc::new(Destination::open(directory)?);
        let listener = TcpListener::bind(address)?;
        listener.set_nonblocking(true)?;
        let std::net::SocketAddr::V4(address) = listener.local_addr()? else {
            return Err("IPv4 required".into());
        };
        let stopping = Arc::new(AtomicBool::new(false));
        let stop = stopping.clone();
        let session = Arc::new(Mutex::new(None::<Session>));
        let current = session.clone();
        let worker = std::thread::spawn(move || {
            let session = current;
            let mut workers: Vec<std::thread::JoinHandle<()>> = Vec::new();
            while !stop.load(Ordering::SeqCst) {
                let mut i = 0;
                while i < workers.len() {
                    if workers[i].is_finished() {
                        workers
                            .swap_remove(i)
                            .join()
                            .map_err(|_| "connection worker failed")?;
                    } else {
                        i += 1;
                    }
                }
                let socket = match listener.accept() {
                    Ok((socket, _)) => socket,
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    Err(error) => return Err(error.into()),
                };
                if workers.len() >= 4 {
                    drop(socket);
                    continue;
                }
                let (session, config, destination, journal, confirm, stop) = (
                    session.clone(),
                    config.clone(),
                    destination.clone(),
                    journal.clone(),
                    confirm.clone(),
                    stop.clone(),
                );
                workers.push(std::thread::spawn(move || {
                    let _ = serve(
                        &confirm,
                        &stop,
                        &destination,
                        &session,
                        config,
                        socket,
                        &journal,
                    );
                }));
            }
            if let Some(session) = session.lock().map_err(|_| "session lock")?.as_ref() {
                session.cancelled.store(true, Ordering::SeqCst);
                session.task.lock().map_err(|_| "task lock")?.cancel()?;
            }
            for worker in workers {
                worker.join().map_err(|_| "connection worker failed")?;
            }
            Ok(())
        });
        Ok(Self {
            address,
            stopping,
            worker: Some(worker),
            session,
        })
    }
    pub fn cancel_current(&self) -> Result<()> {
        if let Some(session) = self.session.lock().map_err(|_| "session lock")?.take() {
            session.cancelled.store(true, Ordering::SeqCst);
            session.task.lock().map_err(|_| "task lock")?.cancel()?;
        }
        Ok(())
    }
    pub fn stop(mut self) -> Result<()> {
        self.stopping.store(true, Ordering::SeqCst);
        self.worker
            .take()
            .ok_or("receiver stopped")?
            .join()
            .map_err(|_| "receiver worker failed")?
    }
}
impl Drop for Receiver {
    fn drop(&mut self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
pub fn validate_name(name: &str) -> Result<()> {
    let stem = name
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end_matches([' ', '.'])
        .to_uppercase();
    if name.is_empty()
        || name.len() > 240
        || name == "."
        || name == ".."
        || name.ends_with([' ', '.'])
        || name
            .chars()
            .any(|c| c.is_control() || r#"/\:<>"|?*"#.contains(c))
        || ["CON", "PRN", "AUX", "NUL", "CLOCK$"].contains(&stem.as_str())
        || ["COM", "LPT"].iter().any(|p| {
            stem.strip_prefix(p).is_some_and(|n| {
                ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].contains(&n)
            })
        })
    {
        return Err("invalid single filename".into());
    }
    Ok(())
}
pub fn stage_body(
    reader: &mut impl Read,
    temp: &mut fs::File,
    length: u64,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(u64) -> Result<()>,
) -> Result<String> {
    if length > MAX_FILE {
        return Err("payload limit".into());
    }
    let mut sha = Sha256::new();
    let mut buffer = [0; CHUNK];
    let mut left = length;
    let started = Instant::now();
    while left > 0 {
        if cancelled.load(Ordering::SeqCst) {
            return Err("upload cancelled".into());
        }
        if started.elapsed() > Duration::from_secs(60) {
            return Err("upload deadline".into());
        }
        let want = left.min(CHUNK as u64) as usize;
        let n = match reader.read(&mut buffer[..want]) {
            Ok(0) => return Err("incomplete upload".into()),
            Ok(n) => n,
            Err(e)
                if [
                    io::ErrorKind::TimedOut,
                    io::ErrorKind::WouldBlock,
                    io::ErrorKind::Interrupted,
                ]
                .contains(&e.kind()) =>
            {
                continue;
            }
            Err(e) => return Err(e.into()),
        };
        if cancelled.load(Ordering::SeqCst) {
            return Err("upload cancelled".into());
        }
        temp.write_all(&buffer[..n])?;
        sha.update(&buffer[..n]);
        left -= n as u64;
        progress(n as u64)?;
    }
    temp.sync_all()?;
    Ok(format!("{:x}", sha.finalize()))
}
pub fn read_header(reader: &mut impl Read) -> Result<(String, u64, bool)> {
    let mut header = Vec::new();
    while !header.ends_with(b"\r\n\r\n") {
        if header.len() >= 8192 {
            return Err("header too large".into());
        }
        let mut b = [0];
        reader.read_exact(&mut b)?;
        header.push(b[0]);
    }
    let mut headers = [httparse::EMPTY_HEADER; 32];
    let mut req = httparse::Request::new(&mut headers);
    if !req.parse(&header)?.is_complete() || req.method != Some("POST") {
        return Err("invalid request".into());
    }
    let path = req.path.ok_or("path")?.to_owned();
    if path.len() > 512 {
        return Err("path too long".into());
    }
    let mut length = None;
    let mut expect = false;
    for h in req.headers.iter() {
        if h.name.eq_ignore_ascii_case("Expect") {
            if h.value != b"100-continue" || expect {
                return Err("unsupported expectation".into());
            }
            expect = true;
        }
        if h.name.eq_ignore_ascii_case("Transfer-Encoding") {
            return Err("chunked not supported by bounded probe".into());
        }
        if h.name.eq_ignore_ascii_case("Content-Length") {
            if length.is_some() {
                return Err("duplicate length".into());
            }
            length = Some(std::str::from_utf8(h.value)?.parse::<u64>()?);
        }
    }
    let len = length.unwrap_or(0);
    if len > MAX_FILE {
        return Err("payload limit".into());
    }
    Ok((path, len, expect))
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    file_name: String,
    size: u64,
    sha256: String,
}
struct Session {
    task: Arc<Mutex<tasks::ReceiverTask>>,
    id: String,
    files: HashMap<String, (FileMeta, String)>,
    cancelled: Arc<AtomicBool>,
    in_flight: usize,
    completed: usize,
}
pub fn params(path: &str) -> Option<(&str, HashMap<&str, &str>)> {
    let (route, q) = path.split_once('?').unwrap_or((path, ""));
    let mut map = HashMap::new();
    for p in q.split('&').filter(|s| !s.is_empty()) {
        let (k, v) = p.split_once('=')?;
        if map.insert(k, v).is_some() {
            return None;
        }
    }
    Some((route, map))
}
fn handle_control(
    confirm: &Confirmation,
    stopping: &AtomicBool,
    session: &mut Option<Session>,
    path: &str,
    body: &[u8],
    journal: &tasks::Journal,
) -> Result<(u16, Value)> {
    let Some((route, q)) = params(path) else {
        return Ok((400, json!({})));
    };
    if route == "/api/localsend/v2/prepare-upload" {
        if session
            .as_ref()
            .is_some_and(|s| !s.files.is_empty() || s.in_flight > 0)
        {
            return Ok((409, json!({})));
        }
        let value: Value = serde_json::from_slice(body)?;
        let files: HashMap<String, FileMeta> =
            serde_json::from_value(value.get("files").ok_or("files")?.clone())?;
        if files.is_empty()
            || files.len() > 16
            || files.iter().any(|(id, f)| {
                id.is_empty()
                    || id.len() > 64
                    || validate_name(&f.file_name).is_err()
                    || f.size > MAX_FILE
                    || f.sha256.len() != 64
                    || !f.sha256.bytes().all(|c| c.is_ascii_hexdigit())
            })
        {
            return Ok((400, json!({})));
        }
        let request = IncomingBatch {
            id: uuid::Uuid::new_v4().to_string(),
            alias: value["info"]["alias"]
                .as_str()
                .unwrap_or("设备")
                .chars()
                .filter(|c| !c.is_control())
                .take(80)
                .collect(),
            files: files
                .values()
                .map(|file| IncomingFile {
                    name: file.file_name.clone(),
                    size: file.size,
                })
                .collect(),
        };
        if !(confirm)(&request, stopping) || stopping.load(Ordering::SeqCst) {
            return Ok((403, json!({})));
        }
        let files: HashMap<_, _> = files
            .into_iter()
            .map(|(id, f)| (id, (f, uuid::Uuid::new_v4().to_string())))
            .collect();
        let id = uuid::Uuid::new_v4().to_string();
        let tokens: HashMap<_, _> = files
            .iter()
            .map(|(id, (_, token))| (id.clone(), token.clone()))
            .collect();
        let response = json!({"sessionId":id,"files":tokens});
        let task = Arc::new(Mutex::new(tasks::ReceiverTask::new(
            journal.clone(),
            files.len() as u32,
            files.values().map(|(f, _)| f.size).sum(),
        )?));
        *session = Some(Session {
            task,
            id,
            files,
            cancelled: Arc::new(AtomicBool::new(false)),
            in_flight: 0,
            completed: 0,
        });
        return Ok((200, response));
    }
    let Some(s) = session.as_mut() else {
        return Ok((403, json!({})));
    };
    if q.get("sessionId") != Some(&s.id.as_str()) {
        return Ok((403, json!({})));
    }
    if route == "/api/localsend/v2/cancel" {
        s.cancelled.store(true, Ordering::SeqCst);
        s.task.lock().map_err(|_| "task lock")?.cancel()?;
        let completed = s.completed;
        *session = None;
        return Ok((200, json!({"completedFiles":completed})));
    }
    Ok((404, json!({})))
}
fn handle_upload(
    destination: &Destination,
    session: &Mutex<Option<Session>>,
    path: &str,
    length: u64,
    reader: &mut (impl Read + Write),
    expect: bool,
) -> Result<(u16, Value)> {
    let Some((_, q)) = params(path) else {
        return Ok((400, json!({})));
    };
    let (f, cancelled, session_id, task) = {
        let mut guard = session.lock().map_err(|_| "session lock")?;
        let Some(s) = guard.as_mut() else {
            return Ok((403, json!({})));
        };
        if q.get("sessionId") != Some(&s.id.as_str()) {
            return Ok((403, json!({})));
        }
        let Some(id) = q.get("fileId") else {
            return Ok((400, json!({})));
        };
        let Some((_, token)) = s.files.get(*id) else {
            return Ok((403, json!({})));
        };
        if q.get("token") != Some(&token.as_str()) {
            return Ok((403, json!({})));
        }
        let (f, _) = s.files.remove(*id).ok_or("file reservation")?;
        s.in_flight += 1;
        s.task.lock().map_err(|_| "task lock")?.start()?;
        (f, s.cancelled.clone(), s.id.clone(), s.task.clone())
    };
    // Stage and hash outside the session lock: cancel must remain responsive during slow I/O.
    let staged = (|| -> Result<Option<destination::Staged>> {
        if f.size != length {
            return Ok(None);
        }
        let mut temp = destination.stage()?;
        if expect {
            reader.write_all(b"HTTP/1.1 100 Continue\r\nContent-Length: 0\r\n\r\n")?;
            reader.flush()?;
        }
        let sha = stage_body(reader, temp.as_file_mut(), length, &cancelled, |n| {
            task.lock().map_err(|_| "task lock")?.advance(n)
        })?;
        task.lock().map_err(|_| "task lock")?.verifying()?;
        Ok((sha == f.sha256.to_lowercase()).then_some(temp))
    })();
    let mut guard = session.lock().map_err(|_| "session lock")?;
    let outcome = (|| -> Result<(u16, Value)> {
        let current = guard.as_mut().filter(|s| s.id == session_id);
        if let Some(s) = current {
            s.in_flight -= 1;
            if cancelled.load(Ordering::SeqCst) {
                return Ok((409, json!({"status":"cancelled"})));
            }
            let Some(temp) = staged? else {
                return Ok((422, json!({})));
            };
            // Publish and cancellation acknowledgement are serialized. Nothing publishes after an ack.
            task.lock().map_err(|_| "task lock")?.verifying()?;
            destination.publish(&f.file_name, temp)?;
            s.completed += 1;
            Ok((200, json!({})))
        } else {
            Ok((409, json!({"status":"cancelled"})))
        }
    })();
    // Keep the session lock through terminal publication: a late cancel cannot race a committed file.
    // The closure has dropped every uncommitted staging handle before terminal publication.
    task.lock()
        .map_err(|_| "task lock")?
        .finish(matches!(outcome, Ok((200, _))))?;
    outcome
}

fn serve(
    confirm: &Confirmation,
    stopping: &AtomicBool,
    destination: &Destination,
    session: &Mutex<Option<Session>>,
    config: Arc<ServerConfig>,
    socket: TcpStream,
    journal: &tasks::Journal,
) -> Result<()> {
    socket.set_nonblocking(false)?;
    socket.set_read_timeout(Some(Duration::from_millis(500)))?;
    socket.set_write_timeout(Some(Duration::from_secs(3)))?;
    let mut stream = StreamOwned::new(ServerConnection::new(config)?, socket);
    let result = (|| -> Result<(u16, Value)> {
        let (path, length, expect) = read_header(&mut stream)?;
        if params(&path).is_some_and(|(route, _)| route == "/api/localsend/v2/upload") {
            return handle_upload(destination, session, &path, length, &mut stream, expect);
        }
        if length > MAX_CONTROL as u64 {
            return Ok((413, json!({})));
        }
        let mut body = vec![0; length as usize];
        stream.read_exact(&mut body)?;
        let mut guard = session.lock().map_err(|_| "session lock")?;
        handle_control(confirm, stopping, &mut guard, &path, &body, journal)
    })();
    let (status, value) = match result {
        Ok(r) => r,
        Err(_) => (400, json!({"message":"invalid or incomplete request"})),
    };
    let bytes = serde_json::to_vec(&value)?;
    let _=write!(stream,"HTTP/1.1 {status} Result\r\nContent-Length: {}\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n",bytes.len()).and_then(|_|stream.write_all(&bytes)).and_then(|_|stream.flush());
    stream.conn.send_close_notify();
    let _ = stream.flush();
    if status >= 400 {
        let _ = finish_rejected_socket(&mut stream.sock);
    }
    Ok(())
}

pub fn finish_rejected_socket(socket: &mut TcpStream) -> usize {
    // Closing with unread request bytes may reset TCP and discard the rejection response (RFC9293 3.6.1).
    // Stop sending first; discard only a bounded amount of ciphertext, never stage or publish it.
    let _ = socket.shutdown(std::net::Shutdown::Write);
    if socket
        .set_read_timeout(Some(Duration::from_millis(50)))
        .is_err()
    {
        return 0;
    }
    let start = Instant::now();
    let mut discarded = 0;
    let mut buffer = [0; CHUNK];
    while start.elapsed() < Duration::from_millis(500) && discarded < 4 * 1024 * 1024 {
        let remaining = (4 * 1024 * 1024 - discarded).min(CHUNK);
        match socket.read(&mut buffer[..remaining]) {
            Ok(0) => break,
            Ok(n) => discarded += n,
            Err(e)
                if [
                    io::ErrorKind::WouldBlock,
                    io::ErrorKind::TimedOut,
                    io::ErrorKind::Interrupted,
                ]
                .contains(&e.kind()) => {}
            Err(_) => break,
        }
    }
    discarded
}
