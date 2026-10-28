use crate::Result;
use rustls::{
    ClientConfig, ClientConnection, RootCertStore, StreamOwned,
    pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName},
};
use serde_json::{Value, json};
use std::{
    io::{self, Read, Write},
    net::TcpStream,
    sync::Arc,
    time::Duration,
};
const MAX_CONTROL: usize = 64 * 1024;
const MAX_FILE: u64 = 512 * 1024 * 1024;
const CHUNK: usize = 64 * 1024;
fn key(b: &[u8]) -> PrivateKeyDer<'static> {
    PrivatePkcs8KeyDer::from(b.to_vec()).into()
}
fn roots(b: &[u8]) -> Result<RootCertStore> {
    let mut r = RootCertStore::empty();
    r.add(CertificateDer::from(b.to_vec()))?;
    Ok(r)
}
/// In-memory pinned mTLS client. It can only connect to IPv4 localhost.
pub struct LoopbackClient {
    config: Arc<ClientConfig>,
    port: u16,
}
impl LoopbackClient {
    pub fn new(
        server_cert: Vec<u8>,
        client_cert: Vec<u8>,
        client_key: Vec<u8>,
        port: u16,
    ) -> Result<Self> {
        if port == 0 {
            return Err("invalid loopback port".into());
        }
        let c = ClientConfig::builder()
            .with_root_certificates(roots(&server_cert)?)
            .with_client_auth_cert(vec![CertificateDer::from(client_cert)], key(&client_key))?;
        Ok(Self {
            config: Arc::new(c),
            port,
        })
    }
    pub(crate) fn connect(&self) -> Result<StreamOwned<ClientConnection, TcpStream>> {
        let socket = TcpStream::connect_timeout(
            &([127, 0, 0, 1], self.port).into(),
            Duration::from_secs(3),
        )?;
        socket.set_read_timeout(Some(Duration::from_secs(5)))?;
        socket.set_write_timeout(Some(Duration::from_secs(5)))?;
        Ok(StreamOwned::new(
            ClientConnection::new(self.config.clone(), ServerName::try_from("localhost")?)?,
            socket,
        ))
    }
    /// Peer confirmation is performed by the receiving endpoint; this method cannot bypass it.
    pub fn prepare(&self, files: Value) -> Result<(u16, Value)> {
        let body = serde_json::to_vec(
            &json!({"info":{"alias":"Ningmao","version":"2.2","deviceType":"desktop","protocol":"https"},"files":files}),
        )?;
        if body.len() > MAX_CONTROL {
            return Err("control request too large".into());
        }
        request_on(
            self.connect()?,
            "/api/localsend/v2/prepare-upload",
            body.len() as u64,
            &mut io::Cursor::new(body),
        )
    }
    pub fn upload(
        &self,
        session: &str,
        file_id: &str,
        token: &str,
        length: u64,
        source: &mut impl Read,
    ) -> Result<(u16, Value)> {
        if length > MAX_FILE || ![session, file_id, token].into_iter().all(valid_parameter) {
            return Err("invalid transfer parameters".into());
        }
        let path =
            format!("/api/localsend/v2/upload?sessionId={session}&fileId={file_id}&token={token}");
        request_on(self.connect()?, &path, length, source)
    }
    pub fn cancel(&self, session: &str) -> Result<(u16, Value)> {
        if !valid_parameter(session) {
            return Err("invalid transfer parameters".into());
        }
        let path = format!("/api/localsend/v2/cancel?sessionId={session}");
        request_on(self.connect()?, &path, 0, &mut io::empty())
    }
}
fn valid_parameter(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
pub(crate) fn request_on(
    mut stream: StreamOwned<ClientConnection, TcpStream>,
    path: &str,
    length: u64,
    reader: &mut impl Read,
) -> Result<(u16, Value)> {
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
pub(crate) fn read_response(reader: &mut impl Read) -> Result<(u16, Value)> {
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
