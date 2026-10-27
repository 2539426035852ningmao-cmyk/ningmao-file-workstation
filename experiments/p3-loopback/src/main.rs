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
    sync::Arc,
    time::{Duration, Instant},
};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const MAX_BODY: usize = 16 * 1024 * 1024;
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
    let mut stream = client(root)?;
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
        bytes.len()
    )?;
    stream.write_all(bytes)?;
    stream.flush()?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response)?;
    let offset = response
        .windows(4)
        .position(|b| b == b"\r\n\r\n")
        .ok_or("response framing")?;
    let status = std::str::from_utf8(&response[..offset])?
        .split_whitespace()
        .nth(1)
        .ok_or("status")?
        .parse()?;
    Ok((status, serde_json::from_slice(&response[offset + 4..])?))
}
fn read_request(reader: &mut impl Read) -> Result<(String, Vec<u8>)> {
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
    for h in req.headers.iter() {
        if h.name.eq_ignore_ascii_case("Transfer-Encoding") {
            return Err("chunked not supported by bounded probe".into());
        }
        if h.name.eq_ignore_ascii_case("Content-Length") {
            if length.is_some() {
                return Err("duplicate length".into());
            }
            length = Some(std::str::from_utf8(h.value)?.parse::<usize>()?);
        }
    }
    let len = length.ok_or("length required")?;
    if len > MAX_BODY {
        return Err("payload limit".into());
    }
    // Bounded probe only: buffer <=16MiB. Streaming/backpressure is required before LAN integration.
    let mut body = vec![0; len];
    reader.read_exact(&mut body)?;
    Ok((path, body))
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
fn publish(root: &Path, name: &str, bytes: &[u8]) -> Result<()> {
    validate_name(name)?;
    let mut temp = tempfile::NamedTempFile::new_in(root)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    let p = Path::new(name);
    let stem = p.file_stem().ok_or("stem")?.to_string_lossy();
    let ext = p
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for n in 0..1000 {
        let target = root.join(if n == 0 {
            name.to_owned()
        } else {
            format!("{stem} ({n}){ext}")
        });
        match temp.persist_noclobber(target) {
            Ok(_) => return Ok(()),
            Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => temp = e.file,
            Err(e) => return Err(e.error.into()),
        }
    }
    Err("collision limit".into())
}
fn handle(
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
        if session.as_ref().is_some_and(|s| !s.files.is_empty()) {
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
                    || f.size > MAX_BODY as u64
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
        *session = Some(Session { id, files });
        return Ok((200, response));
    }
    let Some(s) = session.as_mut() else {
        return Ok((403, json!({})));
    };
    if q.get("sessionId") != Some(&s.id.as_str()) {
        return Ok((403, json!({})));
    }
    if route == "/api/localsend/v2/cancel" {
        *session = None;
        return Ok((200, json!({})));
    }
    if route != "/api/localsend/v2/upload" {
        return Ok((404, json!({})));
    }
    let Some(id) = q.get("fileId") else {
        return Ok((400, json!({})));
    };
    let Some((f, token)) = s.files.get(*id) else {
        return Ok((403, json!({})));
    };
    if q.get("token") != Some(&token.as_str()) {
        return Ok((403, json!({})));
    }
    let f = f.clone();
    s.files.remove(*id);
    if body.len() as u64 != f.size || digest(body) != f.sha256.to_lowercase() {
        return Ok((422, json!({})));
    }
    publish(&root.join("received"), &f.file_name, body)?;
    Ok((200, json!({})))
}
fn receive(root: &Path) -> Result<()> {
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
    let mut session = None;
    while !root.join("stop").exists() {
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
        // Windows inherits the listener's nonblocking mode; TLS framing here is blocking.
        socket.set_nonblocking(false)?;
        socket.set_read_timeout(Some(Duration::from_secs(3)))?;
        socket.set_write_timeout(Some(Duration::from_secs(3)))?;
        let mut stream = StreamOwned::new(ServerConnection::new(config.clone())?, socket);
        let (status, value) =
            match read_request(&mut stream).and_then(|(p, b)| handle(root, &mut session, &p, &b)) {
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
    fs::write(
        root.join("sender-result.json"),
        serde_json::to_vec_pretty(
            &json!({"status":"SUCCESS","scope":"TWO_PROCESS_LOOPBACK_MTLS","singleFile":true,"batchFiles":2,"sha256":sha,"sourcePreserved":true,"collisionProtected":true,"receiverRejected":true,"badNamesRejected":5,"badTokenRejected":true,"replayRejected":true,"cancelBeforeUpload":true,"checksumMismatchRejected":true,"disconnectNoPublish":true,"lan":"NOT_TESTED","streaming":"NOT_IMPLEMENTED; bounded16MiB probe"}),
        )?,
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
        if start.elapsed() > Duration::from_secs(30) {
            return Err("worker deadline".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}
fn probe(root: &Path) -> Result<()> {
    fs::create_dir(root)?;
    fs::write(root.join("SYNTHETIC-ONLY.txt"), MARKER)?;
    for dir in ["source", "received"] {
        fs::create_dir(root.join(dir))?;
    }
    fs::write(
        root.join("source/角色.txt"),
        b"Ningmao synthetic encrypted file\n".repeat(4096),
    )?;
    fs::write(root.join("received/角色.txt"), b"existing-target")?;
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
