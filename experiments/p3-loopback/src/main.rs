mod destination;
use destination::Destination;
use rustls::{
    ClientConfig, ClientConnection, RootCertStore, ServerConfig, ServerConnection, StreamOwned,
    pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const MAX_CONTROL: usize = 64 * 1024;
const MAX_FILE: u64 = 512 * 1024 * 1024;
const CHUNK: usize = 64 * 1024;
const MARKER: &str = "Ningmao loopback synthetic files only\n";
fn digest(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
fn validate_name(name: &str) -> Result<()> {
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
#[derive(Serialize, Deserialize)]
struct Keys {
    server_cert: Vec<u8>,
    server_key: Vec<u8>,
    client_cert: Vec<u8>,
    client_key: Vec<u8>,
}
fn keypair() -> Result<(Vec<u8>, Vec<u8>)> {
    let k = rcgen::generate_simple_self_signed(vec!["localhost".into()])?;
    Ok((k.cert.der().to_vec(), k.signing_key.serialize_der()))
}
fn key(b: &[u8]) -> PrivateKeyDer<'static> {
    PrivatePkcs8KeyDer::from(b.to_vec()).into()
}
fn roots(b: &[u8]) -> Result<RootCertStore> {
    let mut r = RootCertStore::empty();
    r.add(CertificateDer::from(b.to_vec()))?;
    Ok(r)
}
fn load(root: &Path) -> Result<Keys> {
    if fs::read_to_string(root.join("SYNTHETIC-ONLY.txt"))? != MARKER {
        return Err("synthetic root required".into());
    }
    Ok(serde_json::from_slice(&fs::read(root.join("keys.json"))?)?)
}
fn client(root: &Path) -> Result<StreamOwned<ClientConnection, TcpStream>> {
    let k = load(root)?;
    let c = ClientConfig::builder()
        .with_root_certificates(roots(&k.server_cert)?)
        .with_client_auth_cert(
            vec![CertificateDer::from(k.client_cert)],
            key(&k.client_key),
        )?;
    let port: u16 = serde_json::from_slice::<Value>(&fs::read(root.join("ready.json"))?)?["port"]
        .as_u64()
        .ok_or("port")?
        .try_into()?;
    let socket =
        TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_secs(3))?;
    socket.set_read_timeout(Some(Duration::from_secs(5)))?;
    socket.set_write_timeout(Some(Duration::from_secs(5)))?;
    Ok(StreamOwned::new(
        ClientConnection::new(Arc::new(c), ServerName::try_from("localhost")?)?,
        socket,
    ))
}
fn request(root: &Path, path: &str, bytes: &[u8]) -> Result<(u16, Value)> {
    request_stream(root, path, bytes.len() as u64, &mut io::Cursor::new(bytes))
}
fn request_stream(
    root: &Path,
    path: &str,
    length: u64,
    reader: &mut impl Read,
) -> Result<(u16, Value)> {
    let mut stream = client(root)?;
    let expect = path.starts_with("/api/localsend/v2/upload?");
    let interim = if expect {
        "Expect: 100-continue\r\n"
    } else {
        ""
    };
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Length: {length}\r\n{interim}\r\n"
    )?;
    stream.flush()?;
    if expect {
        let response = read_response(&mut stream)?;
        if response.0 != 100 {
            return Ok(response);
        }
    }
    let mut buffer = [0; CHUNK];
    let mut left = length;
    while left > 0 {
        let want = left.min(CHUNK as u64) as usize;
        let n = reader.read(&mut buffer[..want])?;
        if n == 0 {
            return Err("source ended early".into());
        }
        stream.write_all(&buffer[..n])?;
        left -= n as u64;
    }
    stream.flush()?;
    read_response(&mut stream)
}
fn read_response(reader: &mut impl Read) -> Result<(u16, Value)> {
    let mut header = Vec::new();
    while !header.ends_with(b"\r\n\r\n") {
        if header.len() >= 8192 {
            return Err("response header too large".into());
        }
        let mut b = [0];
        reader.read_exact(&mut b)?;
        header.push(b[0]);
    }
    let mut headers = [httparse::EMPTY_HEADER; 32];
    let mut response = httparse::Response::new(&mut headers);
    response.parse(&header)?;
    let status = response.code.ok_or("response status")?;
    let mut length = None;
    for h in response.headers.iter() {
        if h.name.eq_ignore_ascii_case("Content-Length") {
            if length.is_some() {
                return Err("duplicate response length".into());
            }
            length = Some(std::str::from_utf8(h.value)?.parse::<usize>()?);
        }
    }
    let length = length.ok_or("response length")?;
    if length > MAX_CONTROL {
        return Err("response too large".into());
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    Ok((
        status,
        if bytes.is_empty() {
            json!({})
        } else {
            serde_json::from_slice(&bytes)?
        },
    ))
}
fn hash_file(path: &Path) -> Result<String> {
    let mut source = fs::File::open(path)?;
    let mut sha = Sha256::new();
    let mut buffer = [0; CHUNK];
    loop {
        let n = source.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        sha.update(&buffer[..n]);
    }
    Ok(format!("{:x}", sha.finalize()))
}
fn stage_body(
    reader: &mut impl Read,
    temp: &mut fs::File,
    length: u64,
    cancelled: &AtomicBool,
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
    }
    temp.sync_all()?;
    Ok(format!("{:x}", sha.finalize()))
}
fn read_header(reader: &mut impl Read) -> Result<(String, u64, bool)> {
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
    let len = length.ok_or("length required")?;
    if len > MAX_FILE {
        return Err("payload limit".into());
    }
    Ok((path, len, expect))
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileMeta {
    file_name: String,
    size: u64,
    sha256: String,
}
struct Session {
    id: String,
    files: HashMap<String, (FileMeta, String)>,
    cancelled: Arc<AtomicBool>,
    in_flight: usize,
    completed: usize,
}
fn params(path: &str) -> Option<(&str, HashMap<&str, &str>)> {
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
    root: &Path,
    session: &mut Option<Session>,
    path: &str,
    body: &[u8],
) -> Result<(u16, Value)> {
    let Some((route, q)) = params(path) else {
        return Ok((400, json!({})));
    };
    if route == "/api/localsend/v2/prepare-upload" {
        if fs::read_to_string(root.join("decision.txt"))?.trim() != "accept" {
            return Ok((403, json!({})));
        }
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
        *session = Some(Session {
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
    let (f, cancelled, session_id) = {
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
        (f, s.cancelled.clone(), s.id.clone())
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
        let sha = stage_body(reader, temp.as_file_mut(), length, &cancelled)?;
        Ok((sha == f.sha256.to_lowercase()).then_some(temp))
    })();
    let mut guard = session.lock().map_err(|_| "session lock")?;
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
        destination.publish(&f.file_name, temp)?;
        s.completed += 1;
        Ok((200, json!({})))
    } else {
        Ok((409, json!({"status":"cancelled"})))
    }
}
fn serve(
    root: &Path,
    destination: &Destination,
    session: &Mutex<Option<Session>>,
    config: Arc<ServerConfig>,
    socket: TcpStream,
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
        handle_control(root, &mut guard, &path, &body)
    })();
    let (status, value) = match result {
        Ok(r) => r,
        Err(e) => {
            eprintln!("request rejected: {e}");
            (400, json!({"message":"invalid or incomplete request"}))
        }
    };
    let bytes = serde_json::to_vec(&value)?;
    let _=write!(stream,"HTTP/1.1 {status} Result\r\nContent-Length: {}\r\nConnection: close\r\nContent-Type: application/json\r\n\r\n",bytes.len()).and_then(|_|stream.write_all(&bytes)).and_then(|_|stream.flush());
    stream.conn.send_close_notify();
    let _ = stream.flush();
    Ok(())
}

fn receive(root: &Path) -> Result<()> {
    let _root_guard = Destination::open(root)?;
    let destination = Arc::new(Destination::open(&root.join("received"))?);
    let k = load(root)?;
    let verifier =
        rustls::server::WebPkiClientVerifier::builder(Arc::new(roots(&k.client_cert)?)).build()?;
    let config = Arc::new(
        ServerConfig::builder()
            .with_client_cert_verifier(verifier)
            .with_single_cert(
                vec![CertificateDer::from(k.server_cert)],
                key(&k.server_key),
            )?,
    );
    // Never bind wildcard, enumerate interfaces, broadcast, or discover LAN peers in this probe.
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(true)?;
    fs::write(
        root.join("ready.json"),
        serde_json::to_vec(&json!({"port":listener.local_addr()?.port()}))?,
    )?;
    let session = Arc::new(Mutex::new(None::<Session>));
    let mut workers: Vec<std::thread::JoinHandle<()>> = Vec::new();
    while !root.join("stop").exists() {
        let mut i = 0;
        while i < workers.len() {
            if workers[i].is_finished() {
                workers
                    .swap_remove(i)
                    .join()
                    .map_err(|_| "connection worker panicked")?;
            } else {
                i += 1;
            }
        }
        let (socket, peer) = match listener.accept() {
            Ok(p) => p,
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(10));
                continue;
            }
            Err(e) => return Err(e.into()),
        };
        if !peer.ip().is_loopback() {
            return Err("loopback peer required".into());
        }
        if workers.len() >= 4 {
            drop(socket);
            continue;
        }
        let root = root.to_owned();
        let session = session.clone();
        let config = config.clone();
        let destination = destination.clone();
        workers.push(std::thread::spawn(move || {
            if let Err(e) = serve(&root, &destination, &session, config, socket) {
                eprintln!("connection failed: {e}");
            }
        }));
    }
    if let Some(s) = session.lock().map_err(|_| "session lock")?.as_ref() {
        s.cancelled.store(true, Ordering::SeqCst);
    }
    for worker in workers {
        worker.join().map_err(|_| "connection worker panicked")?;
    }

    Ok(())
}
fn prepare(root: &Path, files: Value) -> Result<(u16, Value)> {
    request(
        root,
        "/api/localsend/v2/prepare-upload",
        &serde_json::to_vec(
            &json!({"info":{"alias":"Ningmao synthetic sender","version":"2.2","deviceType":"desktop","protocol":"https"},"files":files}),
        )?,
    )
}
fn upload(root: &Path, plan: &Value, id: &str, bytes: &[u8], token: Option<&str>) -> Result<u16> {
    let token = token
        .or_else(|| plan["files"][id].as_str())
        .ok_or("token")?;
    Ok(request(
        root,
        &format!(
            "/api/localsend/v2/upload?sessionId={}&fileId={id}&token={token}",
            plan["sessionId"].as_str().ok_or("session")?
        ),
        bytes,
    )?
    .0)
}
fn cancel(root: &Path, p: &Value) -> Result<()> {
    let status = request(
        root,
        &format!(
            "/api/localsend/v2/cancel?sessionId={}",
            p["sessionId"].as_str().ok_or("session")?
        ),
        b"",
    )?
    .0;
    assert_eq!(status, 200);
    Ok(())
}
fn upload_path(plan: &Value, id: &str) -> Result<String> {
    Ok(format!(
        "/api/localsend/v2/upload?sessionId={}&fileId={id}&token={}",
        plan["sessionId"].as_str().ok_or("session")?,
        plan["files"][id].as_str().ok_or("token")?
    ))
}
fn staging_size(root: &Path) -> Result<u64> {
    let mut bytes = 0;
    for entry in fs::read_dir(root.join("received"))? {
        let e = entry?;
        if e.file_name()
            .to_string_lossy()
            .starts_with(".ningmao-receive-")
        {
            // Windows directory-entry sizes can lag while the writer still has the file open.
            // Observe through a file handle so this checks actual partial staging, not close time.
            match fs::File::open(e.path()).and_then(|f| f.metadata()) {
                Ok(m) => bytes += m.len(),
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
    }
    Ok(bytes)
}
fn await_staging(root: &Path, exists: bool) -> Result<()> {
    let started = Instant::now();
    loop {
        let bytes = staging_size(root)?;
        if (exists && bytes >= CHUNK as u64) || (!exists && bytes == 0) {
            return Ok(());
        }
        if started.elapsed() > Duration::from_secs(5) {
            return Err("staging observation deadline".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}
fn partial_upload(
    root: &Path,
    plan: &Value,
    size: u64,
) -> Result<StreamOwned<ClientConnection, TcpStream>> {
    let mut stream = client(root)?;
    let path = upload_path(plan, "f")?;
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nContent-Length: {size}\r\n\r\n"
    )?;
    let block = [42; CHUNK];
    for _ in 0..16 {
        stream.write_all(&block)?;
    }
    stream.flush()?;
    await_staging(root, true)?;
    Ok(stream)
}
fn streaming_tests(root: &Path) -> Result<Value> {
    let source = root.join("source/large.bin");
    let size = fs::metadata(&source)?.len();
    let sha = hash_file(&source)?;
    let meta = |name: &str| json!({"fileName":name,"size":size,"sha256":sha});
    let mut oversized = meta("oversized.bin");
    oversized["size"] = json!(MAX_FILE + 1);
    assert_eq!(prepare(root, json!({"f":oversized}))?.0, 400);
    let mut control = client(root)?;
    write!(
        control,
        "POST /api/localsend/v2/prepare-upload HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\n\r\n",
        MAX_CONTROL + 1
    )?;
    control.flush()?;
    assert_eq!(read_response(&mut control)?.0, 413);
    let (status, plan) = prepare(root, json!({"f":meta("large.bin")}))?;
    assert_eq!(status, 200);
    let mut source_file = fs::File::open(&source)?;
    assert_eq!(
        request_stream(root, &upload_path(&plan, "f")?, size, &mut source_file)?.0,
        200
    );
    assert_eq!(hash_file(&root.join("received/large.bin"))?, sha);
    eprintln!("large stream/hash verified");
    let (status, plan) = prepare(root, json!({"f":meta("cancelled-mid-flight.bin")}))?;
    assert_eq!(status, 200);
    let mut pending = partial_upload(root, &plan, size)?;
    eprintln!("partial stream observed before cancel");
    assert_eq!(prepare(root, json!({"f":meta("busy.bin")}))?.0, 409);
    let started = Instant::now();
    let (status, ack) = request(
        root,
        &format!(
            "/api/localsend/v2/cancel?sessionId={}",
            plan["sessionId"].as_str().unwrap()
        ),
        b"",
    )?;
    let cancel_ms = started.elapsed().as_millis();
    assert_eq!(status, 200);
    assert_eq!(ack["completedFiles"], 0);
    assert!(cancel_ms < 3000);
    assert_eq!(read_response(&mut pending)?.0, 409);
    eprintln!("cancel acknowledged and upload stopped");
    await_staging(root, false)?;
    assert!(!root.join("received/cancelled-mid-flight.bin").exists());
    assert_eq!(request(root, &upload_path(&plan, "f")?, b"")?.0, 403);
    let (status, plan) = prepare(root, json!({"f":meta("disconnected-large.bin")}))?;
    assert_eq!(status, 200);
    let pending = partial_upload(root, &plan, size)?;
    eprintln!("partial stream observed before disconnect");
    pending.sock.shutdown(std::net::Shutdown::Both)?;
    drop(pending);
    await_staging(root, false)?;
    assert!(!root.join("received/disconnected-large.bin").exists());
    cancel(root, &plan)?;
    // A failed/cancelled stream cannot poison the next accepted session.
    let (status, plan) = prepare(root, json!({"f":meta("after-cancel.bin")}))?;
    assert_eq!(status, 200);
    assert_eq!(
        request_stream(
            root,
            &upload_path(&plan, "f")?,
            size,
            &mut fs::File::open(&source)?
        )?
        .0,
        200
    );
    assert_eq!(hash_file(&root.join("received/after-cancel.bin"))?, sha);
    assert_eq!(hash_file(&source)?, sha);
    assert_eq!(staging_size(root)?, 0);
    assert!(
        !fs::read_dir(root.join("received"))?.any(|e| e.is_ok_and(|e| e
            .file_name()
            .to_string_lossy()
            .starts_with(".ningmao-receive-")))
    );
    Ok(
        json!({"streamingBytes":size,"streamingSha256":sha,"streamChunkBytes":CHUNK,"largeFileHashVerified":true,"sourceLargeFilePreserved":true,"partialStagingObserved":true,"cancelDuringUpload":true,"cancelAckMillis":cancel_ms,"cancelAckCompletedFiles":0,"noPublishAfterCancelAck":true,"disconnectDuringUpload":true,"stagingCleaned":true,"nextSessionSucceeded":true,"maxConcurrentConnections":4,"fileLimitBytes":MAX_FILE,"controlLimitBytes":MAX_CONTROL}),
    )
}
fn send_tests(root: &Path) -> Result<()> {
    eprintln!("start receiver rejection check");
    let original = fs::read(root.join("keys.json"))?;
    let mut wrong = load(root)?;
    let (cert, private) = keypair()?;
    wrong.client_cert = cert;
    wrong.client_key = private;
    fs::write(root.join("keys.json"), serde_json::to_vec(&wrong)?)?;
    let untrusted_client = request(root, "/api/localsend/v2/prepare-upload", b"{}").is_err();
    fs::write(root.join("keys.json"), &original)?;
    assert!(
        untrusted_client,
        "receiver must reject an unpaired client certificate"
    );
    let mut wrong = load(root)?;
    wrong.server_cert = wrong.client_cert.clone();
    fs::write(root.join("keys.json"), serde_json::to_vec(&wrong)?)?;
    let wrong_peer = request(root, "/api/localsend/v2/prepare-upload", b"{}").is_err();
    fs::write(root.join("keys.json"), &original)?;
    assert!(
        wrong_peer,
        "sender must reject a certificate outside the pinned trust root"
    );
    let source = fs::read(root.join("source/角色.txt"))?;
    let sha = digest(&source);
    let file = |name: &str| json!({"id":"f","fileName":name,"fileType":"application/octet-stream","size":source.len(),"sha256":sha});
    fs::write(root.join("decision.txt"), "reject")?;
    assert_eq!(prepare(root, json!({"f":file("角色.txt")}))?.0, 403);
    fs::write(root.join("decision.txt"), "accept")?;
    for name in ["../escape", "a\\b", "NUL.txt", "a:stream", "tail."] {
        assert_eq!(prepare(root, json!({"f":file(name)}))?.0, 400);
    }
    let (status, p) = prepare(root, json!({"f":file("角色.txt")}))?;
    assert_eq!(status, 200);
    struct NeverRead;
    impl Read for NeverRead {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::other("rejected body must not be read"))
        }
    }
    let denied = format!(
        "/api/localsend/v2/upload?sessionId={}&fileId=f&token=wrong",
        p["sessionId"].as_str().unwrap()
    );
    assert_eq!(
        request_stream(root, &denied, MAX_FILE, &mut NeverRead)?.0,
        403
    );
    assert_eq!(upload(root, &p, "f", &source, Some("wrong"))?, 403);
    assert_eq!(upload(root, &p, "f", &source, None)?, 200);
    assert_eq!(upload(root, &p, "f", &source, None)?, 403); // consumed token cannot publish twice
    let (status, p) = prepare(
        root,
        json!({"a":file("batch-a.txt"),"b":file("batch-b.txt")}),
    )?;
    assert_eq!(status, 200);
    for id in ["a", "b"] {
        assert_eq!(upload(root, &p, id, &source, None)?, 200);
    }
    let (_, p) = prepare(root, json!({"f":file("cancelled.txt")}))?;
    cancel(root, &p)?;
    assert_eq!(upload(root, &p, "f", &source, None)?, 403);
    let mut bad = file("bad-hash.txt");
    bad["sha256"] = json!("0".repeat(64));
    let (_, p) = prepare(root, json!({"f":bad}))?;
    assert_eq!(upload(root, &p, "f", &source, None)?, 422);
    let (_, p) = prepare(root, json!({"f":file("disconnected.txt")}))?;
    let mut stream = client(root)?;
    write!(
        stream,
        "POST /api/localsend/v2/upload?sessionId={}&fileId=f&token={} HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\n\r\n",
        p["sessionId"].as_str().unwrap(),
        p["files"]["f"].as_str().unwrap(),
        source.len()
    )?;
    stream.write_all(b"short")?;
    stream.flush()?;
    stream.sock.shutdown(std::net::Shutdown::Both)?;
    drop(stream);
    cancel(root, &p)?;
    assert_eq!(
        fs::read(root.join("received/角色.txt"))?,
        b"existing-target"
    );
    for name in ["角色 (1).txt", "batch-a.txt", "batch-b.txt"] {
        assert_eq!(digest(&fs::read(root.join("received").join(name))?), sha);
    }
    assert_eq!(digest(&fs::read(root.join("source/角色.txt"))?), sha);
    assert_eq!(fs::read_dir(root.join("received"))?.count(), 4);
    let streaming = streaming_tests(root)?;
    assert_eq!(fs::read_dir(root.join("received"))?.count(), 6);
    let mut report = json!({"status":"SUCCESS","scope":"TWO_PROCESS_LOOPBACK_MTLS","singleFile":true,"batchFiles":2,"sha256":sha,"sourcePreserved":true,"collisionProtected":true,"receiverRejected":true,"badNamesRejected":5,"badTokenRejected":true,"replayRejected":true,"cancelBeforeUpload":true,"checksumMismatchRejected":true,"disconnectNoPublish":true,"unpairedClientCertificateRejected":true,"untrustedServerCertificateRejected":true,"lan":"NOT_TESTED","streaming":"PASS"});
    report
        .as_object_mut()
        .unwrap()
        .extend(streaming.as_object().unwrap().clone());
    fs::write(
        root.join("sender-result.json"),
        serde_json::to_vec_pretty(&report)?,
    )?;
    Ok(())
}
struct Worker(Child);
impl Drop for Worker {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_none() {
            let _ = self.0.kill();
        }
        let _ = self.0.wait();
    }
}
fn spawn(mode: &str, root: &Path) -> Result<Worker> {
    let mut command = Command::new(std::env::current_exe()?);
    command
        .arg(mode)
        .arg(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(fs::File::create(
            root.join(format!("{mode}.log")),
        )?));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000 | 0x00004000);
    }
    Ok(Worker(command.spawn()?))
}
fn wait(worker: &mut Worker) -> Result<()> {
    let start = Instant::now();
    loop {
        if let Some(status) = worker.0.try_wait()? {
            if !status.success() {
                return Err("controlled worker failed".into());
            }
            return Ok(());
        }
        if start.elapsed() > Duration::from_secs(120) {
            return Err("worker deadline".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}
fn probe(root: &Path) -> Result<()> {
    let _parent_guard = Destination::open(root.parent().ok_or("synthetic parent required")?)?;
    fs::create_dir(root)?;
    let _root_guard = Destination::open(root)?;
    fs::write(root.join("SYNTHETIC-ONLY.txt"), MARKER)?;
    for dir in ["source", "received"] {
        fs::create_dir(root.join(dir))?;
    }
    fs::write(
        root.join("source/角色.txt"),
        b"Ningmao synthetic encrypted file\n".repeat(4096),
    )?;
    fs::write(root.join("received/角色.txt"), b"existing-target")?;
    let mut large = fs::File::create(root.join("source/large.bin"))?;
    let block = [42; CHUNK];
    for _ in 0..1024 {
        large.write_all(&block)?;
    }
    large.sync_all()?;
    drop(large);
    let (server_cert, server_key) = keypair()?;
    let (client_cert, client_key) = keypair()?;
    fs::write(
        root.join("keys.json"),
        serde_json::to_vec(&Keys {
            server_cert,
            server_key,
            client_cert,
            client_key,
        })?,
    )?;
    fs::write(root.join("decision.txt"), "reject")?;
    let mut receiver = spawn("receive", root)?;
    let start = Instant::now();
    while !root.join("ready.json").exists() {
        if start.elapsed() > Duration::from_secs(10) {
            return Err("receiver readiness deadline".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let mut sender = spawn("send", root)?;
    wait(&mut sender)?;
    fs::write(root.join("stop"), b"stop")?;
    wait(&mut receiver)?;
    println!("{}", fs::read_to_string(root.join("sender-result.json"))?);
    Ok(())
}
fn run() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Usage: ningmao-loopback-probe probe NEW_SYNTHETIC_ROOT".into());
    }
    let root = PathBuf::from(&args[2]);
    if !root.is_absolute() {
        return Err("absolute synthetic path required".into());
    }
    match args[1].as_str() {
        "probe" => probe(&root),
        "receive" => receive(&root),
        "send" => send_tests(&root),
        _ => Err("unknown mode".into()),
    }
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn staged_cleanup_owns_directory_until_after_parent_guard_drops() {
        use std::io::Write;
        let root = tempfile::tempdir().unwrap();
        let mut temp = {
            let dir = super::Destination::open(root.path()).unwrap();
            dir.stage().unwrap()
        };
        temp.write_all(b"synthetic staged bytes").unwrap();
        drop(temp);
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
    }
    fn directory_link(link: &std::path::Path, target: &std::path::Path) {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let result = std::process::Command::new("cmd.exe")
                .args(["/c", "mklink", "/J"])
                .arg(link)
                .arg(target)
                .creation_flags(0x08000000)
                .output()
                .unwrap();
            assert!(result.status.success(), "synthetic junction setup failed");
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, link).unwrap();
    }
    fn remove_directory_link(link: &std::path::Path) {
        #[cfg(windows)]
        std::fs::remove_dir(link).unwrap();
        #[cfg(unix)]
        std::fs::remove_file(link).unwrap();
    }
    #[test]
    fn directory_ancestor_link_and_unsafe_paths_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        let outside = root.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::fs::create_dir(outside.join("child")).unwrap();
        let link = root.path().join("redirect");
        directory_link(&link, &outside);
        assert!(super::Destination::open(&link.join("child")).is_err());
        remove_directory_link(&link);
        assert!(super::Destination::open(std::path::Path::new("relative")).is_err());
        assert!(super::Destination::open(&root.path().join("child/../outside")).is_err());
        assert!(super::Destination::open(&root.path().join("missing")).is_err());
        let file = root.path().join("file.txt");
        std::fs::write(&file, b"synthetic").unwrap();
        assert!(super::Destination::open(&file).is_err());
        #[cfg(windows)]
        for path in [
            r"\\server\share",
            r"\\?\UNC\server\share",
            r"\\.\C:\",
            r"\\?\GLOBALROOT\Device",
        ] {
            assert!(super::Destination::open(std::path::Path::new(path)).is_err());
        }
    }
    #[test]
    fn directory_binding_survives_replacement_attempts_and_releases_on_drop() {
        use std::io::Write;
        let root = tempfile::tempdir().unwrap();
        let branch = root.path().join("branch");
        let received = branch.join("received");
        std::fs::create_dir_all(&received).unwrap();
        let outside = root.path().join("outside");
        std::fs::create_dir_all(outside.join("received")).unwrap();
        std::fs::write(outside.join("sentinel"), b"protected").unwrap();
        let dir = super::Destination::open(&received).unwrap();
        let mut temp = dir.stage().unwrap();
        temp.write_all(b"synthetic payload").unwrap();
        let moved = root.path().join("moved");
        let renamed = std::fs::rename(&branch, &moved);
        #[cfg(windows)]
        {
            assert!(renamed.is_err());
            assert!(std::fs::rename(&received, root.path().join("moved-leaf")).is_err());
            dir.check().unwrap();
            dir.publish("payload.bin", temp).unwrap();
            drop(dir);
            std::fs::rename(&branch, &moved).unwrap(); // all directory handles have been released
            assert_eq!(
                std::fs::read(moved.join("received/payload.bin")).unwrap(),
                b"synthetic payload"
            );
        }
        #[cfg(target_os = "linux")]
        {
            renamed.unwrap();
            directory_link(&branch, &outside);
            assert!(dir.check().is_err());
            assert!(dir.publish("payload.bin", temp).is_err());
            assert_eq!(
                std::fs::read_dir(moved.join("received")).unwrap().count(),
                0
            );
            drop(dir);
            remove_directory_link(&branch);
        }
        assert!(!outside.join("received/payload.bin").exists());
        assert_eq!(
            std::fs::read(outside.join("sentinel")).unwrap(),
            b"protected"
        );
    }
    #[test]
    fn guarded_publish_rejects_foreign_staging_and_preserves_existing_hardlink() {
        use std::io::Write;
        let root = tempfile::tempdir().unwrap();
        let a = root.path().join("a");
        let b = root.path().join("b");
        std::fs::create_dir(&a).unwrap();
        std::fs::create_dir(&b).unwrap();
        let sentinel = root.path().join("sentinel");
        std::fs::write(&sentinel, b"protected hardlink").unwrap();
        std::fs::hard_link(&sentinel, a.join("payload.txt")).unwrap();
        let one = super::Destination::open(&a).unwrap();
        let two = super::Destination::open(&b).unwrap();
        let temp = one.stage().unwrap();
        assert!(two.publish("payload.txt", temp).is_err());
        assert_eq!(std::fs::read_dir(&a).unwrap().count(), 1);
        let mut temp = one.stage().unwrap();
        temp.write_all(b"new payload").unwrap();
        one.publish("payload.txt", temp).unwrap();
        assert_eq!(
            std::fs::read(a.join("payload (1).txt")).unwrap(),
            b"new payload"
        );
        assert_eq!(std::fs::read(&sentinel).unwrap(), b"protected hardlink");
        drop(one);
        drop(two);
    }
    #[test]
    fn redirected_receive_directory_must_not_publish_outside() {
        use std::io::Write;
        let root = tempfile::tempdir().unwrap();
        let outside = root.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("sentinel.txt"), b"protected synthetic").unwrap();
        let link = root.path().join("received");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let result = std::process::Command::new("cmd.exe")
                .args(["/c", "mklink", "/J"])
                .arg(&link)
                .arg(&outside)
                .creation_flags(0x08000000)
                .output()
                .unwrap();
            assert!(result.status.success(), "synthetic junction setup failed");
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        let result = super::Destination::open(&link).and_then(|dir| {
            let mut temp = dir.stage()?;
            temp.write_all(b"synthetic payload")?;
            dir.publish("payload.bin", temp)
        });
        #[cfg(windows)]
        std::fs::remove_dir(&link).unwrap();
        #[cfg(unix)]
        std::fs::remove_file(&link).unwrap();
        assert!(result.is_err(), "redirected directory was accepted");
        assert!(!outside.join("payload.bin").exists());
        assert_eq!(
            std::fs::read(outside.join("sentinel.txt")).unwrap(),
            b"protected synthetic"
        );
    }
    #[test]
    fn partial_staging_is_observable_before_writer_closes() {
        use std::io::Write;
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("received")).unwrap();
        let mut writer = tempfile::Builder::new()
            .prefix(".ningmao-receive-")
            .tempfile_in(root.path().join("received"))
            .unwrap();
        writer.write_all(&[42; super::CHUNK]).unwrap();
        assert_eq!(
            super::staging_size(root.path()).unwrap(),
            super::CHUNK as u64
        );
        drop(writer);
        assert_eq!(super::staging_size(root.path()).unwrap(), 0);
    }
    #[test]
    fn upload_body_is_bounded_and_cancellation_stops_staging() {
        use std::{
            io::{self, Read},
            sync::atomic::{AtomicBool, Ordering},
        };
        struct Source<'a> {
            remaining: usize,
            max_request: usize,
            cancel: &'a AtomicBool,
            stop: bool,
        }
        impl Read for Source<'_> {
            fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
                self.max_request = self.max_request.max(b.len());
                let n = b.len().min(self.remaining);
                b[..n].fill(42);
                self.remaining -= n;
                if self.stop {
                    self.cancel.store(true, Ordering::SeqCst);
                }
                Ok(n)
            }
        }
        let cancel = AtomicBool::new(false);
        let mut source = Source {
            remaining: 2 * 1024 * 1024,
            max_request: 0,
            cancel: &cancel,
            stop: false,
        };
        let mut temp = tempfile::NamedTempFile::new().unwrap();
        super::stage_body(&mut source, temp.as_file_mut(), 2 * 1024 * 1024, &cancel).unwrap();
        assert_eq!(source.remaining, 0);
        assert!(source.max_request <= 64 * 1024);
        assert_eq!(temp.as_file().metadata().unwrap().len(), 2 * 1024 * 1024);
        let mut source = Source {
            remaining: 2 * 1024 * 1024,
            max_request: 0,
            cancel: &cancel,
            stop: true,
        };
        let mut temp = tempfile::NamedTempFile::new().unwrap();
        let path = temp.path().to_path_buf();
        assert!(
            super::stage_body(&mut source, temp.as_file_mut(), 2 * 1024 * 1024, &cancel).is_err()
        );
        assert!(source.remaining > 0);
        drop(temp);
        assert!(!path.exists());
    }
    #[test]
    fn receiver_rejects_windows_paths_and_reserved_names() {
        for bad in [
            "../escape",
            "a/b",
            "a\\b",
            "C:stream",
            "NUL.txt",
            "CON",
            "name.",
            "name ",
            "..",
            "",
            "COM¹.txt",
        ] {
            assert!(super::validate_name(bad).is_err(), "{bad}");
        }
        assert!(super::validate_name("角色 English.txt").is_ok());
    }
    #[test]
    fn duplicate_query_keys_are_rejected() {
        assert!(super::params("/upload?token=one&token=two").is_none());
    }
}
