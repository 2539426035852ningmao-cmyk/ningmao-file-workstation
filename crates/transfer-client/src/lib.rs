//! Bounded mTLS client for the localhost-only P3 runtime seam.
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

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const MAX_CONTROL: usize = 64 * 1024;
const MAX_FILE: u64 = 512 * 1024 * 1024;
const CHUNK: usize = 64 * 1024;

fn key(bytes: &[u8]) -> PrivateKeyDer<'static> {
    PrivatePkcs8KeyDer::from(bytes.to_vec()).into()
}

fn roots(bytes: &[u8]) -> Result<RootCertStore> {
    let mut roots = RootCertStore::empty();
    roots.add(CertificateDer::from(bytes.to_vec()))?;
    Ok(roots)
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
        let config = ClientConfig::builder()
            .with_root_certificates(roots(&server_cert)?)
            .with_client_auth_cert(vec![CertificateDer::from(client_cert)], key(&client_key))?;
        Ok(Self {
            config: Arc::new(config),
            port,
        })
    }

    fn connect(&self) -> Result<StreamOwned<ClientConnection, TcpStream>> {
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
        self.upload_with_progress(session, file_id, token, length, source, |_| Ok(()))
    }

    /// Reports bytes written; a callback error stops the stream before its next chunk.
    pub fn upload_with_progress(
        &self,
        session: &str,
        file_id: &str,
        token: &str,
        length: u64,
        source: &mut impl Read,
        progress: impl FnMut(u64) -> Result<()>,
    ) -> Result<(u16, Value)> {
        if length > MAX_FILE || ![session, file_id, token].into_iter().all(valid_parameter) {
            return Err("invalid transfer parameters".into());
        }
        let path =
            format!("/api/localsend/v2/upload?sessionId={session}&fileId={file_id}&token={token}");
        request_with_progress(self.connect()?, &path, length, source, progress)
    }

    pub fn cancel(&self, session: &str) -> Result<(u16, Value)> {
        if !valid_parameter(session) {
            return Err("invalid transfer parameters".into());
        }
        let path = format!("/api/localsend/v2/cancel?sessionId={session}");
        request_on(self.connect()?, &path, 0, &mut io::empty())
    }

    #[cfg(feature = "probe-hooks")]
    #[doc(hidden)]
    pub fn probe_connect(&self) -> Result<StreamOwned<ClientConnection, TcpStream>> {
        self.connect()
    }
}

fn valid_parameter(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn request_on(
    stream: StreamOwned<ClientConnection, TcpStream>,
    path: &str,
    length: u64,
    reader: &mut impl Read,
) -> Result<(u16, Value)> {
    request_with_progress(stream, path, length, reader, |_| Ok(()))
}

fn request_with_progress(
    mut stream: StreamOwned<ClientConnection, TcpStream>,
    path: &str,
    length: u64,
    reader: &mut impl Read,
    mut progress: impl FnMut(u64) -> Result<()>,
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
        progress(length - left)?;
        let want = left.min(CHUNK as u64) as usize;
        let read = reader.read(&mut buffer[..want])?;
        if read == 0 {
            return Err("source ended early".into());
        }
        stream.write_all(&buffer[..read])?;
        left -= read as u64;
    }
    stream.flush()?;
    progress(length)?;
    read_response(&mut stream)
}

fn read_response(reader: &mut impl Read) -> Result<(u16, Value)> {
    let mut header = Vec::new();
    while !header.ends_with(b"\r\n\r\n") {
        if header.len() >= 8192 {
            return Err("response header too large".into());
        }
        let mut byte = [0];
        reader.read_exact(&mut byte)?;
        header.push(byte[0]);
    }
    let mut headers = [httparse::EMPTY_HEADER; 32];
    let mut response = httparse::Response::new(&mut headers);
    response.parse(&header)?;
    let status = response.code.ok_or("response status")?;
    let mut length = None;
    for header in response.headers.iter() {
        if header.name.eq_ignore_ascii_case("Content-Length") {
            if length.is_some() {
                return Err("duplicate response length".into());
            }
            length = Some(std::str::from_utf8(header.value)?.parse::<usize>()?);
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

#[cfg(feature = "probe-hooks")]
#[doc(hidden)]
pub fn probe_request_on(
    stream: StreamOwned<ClientConnection, TcpStream>,
    path: &str,
    length: u64,
    reader: &mut impl Read,
) -> Result<(u16, Value)> {
    request_on(stream, path, length, reader)
}

#[cfg(feature = "probe-hooks")]
#[doc(hidden)]
pub fn probe_read_response(reader: &mut impl Read) -> Result<(u16, Value)> {
    read_response(reader)
}
