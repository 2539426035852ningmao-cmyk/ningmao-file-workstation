use futures_util::TryStreamExt;
use localsend::{
    http::{client::LsHttpClientV2, dto_v2::PrepareUploadRequestDtoV2},
    model::discovery::ProtocolType,
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;
struct SizedBody<B> {
    body: B,
    bytes: u64,
}
impl<B: http_body::Body + Unpin> http_body::Body for SizedBody<B> {
    type Data = B::Data;
    type Error = B::Error;
    fn poll_frame(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Result<http_body::Frame<Self::Data>, Self::Error>>> {
        std::pin::Pin::new(&mut self.body).poll_frame(cx)
    }
    fn size_hint(&self) -> http_body::SizeHint {
        http_body::SizeHint::with_exact(self.bytes)
    }
}
struct Receiver(Child, std::path::PathBuf);
impl Drop for Receiver {
    fn drop(&mut self) {
        let _ = fs::write(self.1.join("stop"), b"stop");
        let t = Instant::now();
        loop {
            if self.0.try_wait().ok().flatten().is_some() {
                break;
            }
            if t.elapsed() > Duration::from_secs(10) {
                let _ = self.0.kill();
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = self.0.wait();
    }
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().join("synthetic");
    fs::create_dir(&root)?;
    fs::create_dir(root.join("received"))?;
    fs::write(
        root.join("SYNTHETIC-ONLY.txt"),
        "Ningmao loopback synthetic files only\n",
    )?;
    fs::write(root.join("decision.txt"), "accept")?;
    let server = rcgen::generate_simple_self_signed(vec!["localhost".into()])?;
    let client = rcgen::generate_simple_self_signed(vec!["localhost".into()])?;
    fs::write(
        root.join("keys.json"),
        serde_json::to_vec(
            &serde_json::json!({"server_cert":server.cert.der().to_vec(),"server_key":server.signing_key.serialize_der(),"client_cert":client.cert.der().to_vec(),"client_key":client.signing_key.serialize_der()}),
        )?,
    )?;
    let mut command = Command::new(
        std::env::args_os()
            .nth(1)
            .ok_or("pass the built loopback probe executable")?,
    );
    command
        .arg("receive")
        .arg(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(fs::File::create(root.join("receiver.log"))?));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let _receiver = Receiver(command.spawn()?, root.clone());
    let start = Instant::now();
    while !root.join("ready.json").exists() {
        if start.elapsed() > Duration::from_secs(10) {
            return Err("receiver not ready".into());
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let port =
        serde_json::from_slice::<serde_json::Value>(&fs::read(root.join("ready.json"))?)?["port"]
            .as_u64()
            .ok_or("port")? as u16;
    let fingerprint = localsend::crypto::cert::fingerprint_from_cert_der(server.cert.der());
    let api = LsHttpClientV2::try_new(
        &client.signing_key.serialize_pem(),
        &client.cert.pem(),
        Some(fingerprint),
        Some(Duration::from_secs(10)),
    )?;
    let payload = b"official client synthetic".repeat(16384);
    let hash = format!("{:x}", Sha256::digest(&payload));
    fs::write(root.join("received/item.txt"), b"existing")?;
    let request: PrepareUploadRequestDtoV2 = serde_json::from_value(
        serde_json::json!({"info":{"alias":"synthetic","version":"2.2","fingerprint":"fixture","port":0,"protocol":"https"},"files":{"f":{"id":"f","fileName":"item.txt","fileType":"application/octet-stream","size":payload.len(),"sha256":hash}}}),
    )?;
    let prepared = api
        .prepare_upload(
            ProtocolType::Https,
            "127.0.0.1",
            port,
            None,
            request,
            None,
            CancellationToken::new(),
        )
        .await?;
    let response = prepared.response.ok_or("no accepted session")?;
    api.upload(
        ProtocolType::Https,
        "127.0.0.1",
        port,
        None,
        &response.session_id,
        "f",
        response.files.get("f").ok_or("no token")?,
        localsend::reqwest::Body::from(payload.clone()),
        CancellationToken::new(),
    )
    .await?;
    assert_eq!(fs::read(root.join("received/item.txt"))?, b"existing");
    assert_eq!(fs::read(root.join("received/item (1).txt"))?, payload);

    let file_path = root.join("synthetic-source.txt");
    fs::write(&file_path, &payload)?;
    let request_file: PrepareUploadRequestDtoV2 = serde_json::from_value(
        serde_json::json!({"info":{"alias":"synthetic","version":"2.2","fingerprint":"fixture","port":0,"protocol":"https"},"files":{"f":{"id":"f","fileName":"file-stream.txt","fileType":"application/octet-stream","size":payload.len(),"sha256":format!("{:x}",Sha256::digest(&payload))}}}),
    )?;
    let prepared_file = api
        .prepare_upload(
            ProtocolType::Https,
            "127.0.0.1",
            port,
            None,
            request_file,
            None,
            CancellationToken::new(),
        )
        .await?
        .response
        .ok_or("no accepted file session")?;
    let file = tokio::fs::File::open(&file_path).await?;
    let stream = tokio_util::io::ReaderStream::new(file).map_ok(http_body::Frame::data);
    let body = localsend::reqwest::Body::wrap(SizedBody {
        body: http_body_util::StreamBody::new(stream),
        bytes: payload.len() as u64,
    });
    api.upload(
        ProtocolType::Https,
        "127.0.0.1",
        port,
        None,
        &prepared_file.session_id,
        "f",
        prepared_file.files.get("f").ok_or("no file token")?,
        body,
        CancellationToken::new(),
    )
    .await?;
    assert_eq!(fs::read(root.join("received/file-stream.txt"))?, payload);
    assert_eq!(fs::read(file_path)?, payload);
    let rejected_cancel_appears_success = api
        .cancel(ProtocolType::Https, "127.0.0.1", port, "wrong-session")
        .await
        .is_ok();
    let unified = localsend::http::client::LsHttpClient::new(
        &client.signing_key.serialize_pem(),
        &client.cert.pem(),
        localsend::http::client::LsHttpClientVersion::V2,
        Some(localsend::crypto::cert::fingerprint_from_cert_der(
            server.cert.der(),
        )),
        Some(Duration::from_secs(10)),
    )?;
    let request2: localsend::http::dto::PrepareUploadRequestDto = serde_json::from_value(
        serde_json::json!({"info":{"alias":"synthetic","version":"2.2","token":"fixture","port":0,"protocol":"HTTPS"},"files":{"f":{"id":"f","fileName":"stream.txt","fileType":"application/octet-stream","size":payload.len(),"sha256":format!("{:x}",Sha256::digest(&payload))}}}),
    )?;
    let prepared2 = unified
        .prepare_upload(
            ProtocolType::Https,
            "127.0.0.1",
            port,
            None,
            request2,
            None,
            CancellationToken::new(),
        )
        .await?;
    let response2 = prepared2.response.ok_or("no accepted session")?;
    let (tx, rx) = tokio::sync::mpsc::channel(2);
    tx.send(payload.clone().into()).await?;
    drop(tx);
    let stream = unified
        .upload(
            ProtocolType::Https,
            "127.0.0.1",
            port,
            None,
            &response2.session_id,
            "f",
            response2.files.get("f").ok_or("no token")?,
            localsend::model::transfer::FileContent::Stream(rx),
            |_| {},
            CancellationToken::new(),
        )
        .await;
    let stream_status = match stream {
        Ok(()) => "PASS".to_string(),
        Err(localsend::http::client::ClientError::StatusCode(e)) => format!("HTTP_{}", e.status),
        Err(_) => "TRANSPORT_ERROR".to_string(),
    };
    let accepted_cancel = api
        .cancel(
            ProtocolType::Https,
            "127.0.0.1",
            port,
            &response2.session_id,
        )
        .await
        .is_ok();
    let history = fs::read_to_string(root.join("task-events.jsonl"))?;
    let cancelled = history.lines().any(|line| {
        serde_json::from_str::<serde_json::Value>(line)
            .ok()
            .is_some_and(|v| v["phase"] == "cancelled")
    });
    let phases: Vec<String> = history
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter_map(|v| v["phase"].as_str().map(str::to_owned))
        .collect();
    println!(
        "valid_cancel_returned_ok={accepted_cancel} valid_cancel_terminal={cancelled} phases={phases:?}"
    );
    let diagnostics = fs::read_to_string(root.join("receiver.log"))?;
    let rejected_chunked = diagnostics.contains("chunked not supported by bounded probe");
    let missing_length = diagnostics.contains("length required");
    let exists = root.join("received/stream.txt").exists();
    assert!(
        accepted_cancel && cancelled,
        "receiver must confirm cancellation"
    );
    assert!(!exists, "rejected stream must not publish a file");
    println!(
        "official_file_stream_known_length=PASS official_client_loopback=PASS peer=127.0.0.1 pinned_tls=true old_target_preserved=true sha256_match=true official_stream={stream_status} streamed_target_exists={exists} valid_cancel_terminal={cancelled} rejected_cancel_appears_success={rejected_cancel_appears_success} receiver_rejected_chunked={rejected_chunked} receiver_missing_length={missing_length}"
    );
    Ok(())
}
