use ningmao_desktop_lib::{chat, store::Store};

#[test]
fn chat_history_survives_restart_and_config_never_returns_a_key() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("state.db");
    let mut store = Store::open(&path).unwrap();
    let session = store.chat_new().unwrap();
    let request = store.chat_begin(session, "第一问").unwrap();
    store
        .chat_finish(request.assistant_id, "第一答", "completed")
        .unwrap();
    let request = store.chat_begin(session, "继续解释").unwrap();
    assert_eq!(request.messages.len(), 3);
    store
        .chat_finish(request.assistant_id, "", "stopped")
        .unwrap();
    drop(store);
    let store = Store::open(&path).unwrap();
    let history = store.chat_messages(session).unwrap();
    assert_eq!(history.len(), 4);
    assert_eq!(history[1].content, "第一答");
    assert_eq!(history[3].status, "stopped");
    assert!(!store.chat_config().unwrap().enabled);
    assert!(chat::endpoint("http://192.168.0.1/v1").is_err());
    assert!(chat::endpoint("https://example.com/v1?key=secret").is_err());
    assert!(chat::endpoint("http://127.0.0.1:1234/v1").is_ok());
    assert!(chat::endpoint("https://example.com/v1").is_ok());
    store.integrity_check().unwrap();
}

#[test]
#[cfg(windows)]
fn key_is_dpapi_protected_and_can_be_removed() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("chat.db");
    let store = Store::open(&path).unwrap();
    let encrypted = chat::protect(b"synthetic-secret-key").unwrap();
    let config = store
        .chat_configure(
            "http://127.0.0.1:1234/v1",
            "synthetic-model",
            true,
            Some(&encrypted),
        )
        .unwrap();
    assert!(config.has_key);
    assert!(
        !serde_json::to_string(&config)
            .unwrap()
            .contains("synthetic-secret-key")
    );
    assert_eq!(
        chat::unprotect(&store.chat_key_ciphertext().unwrap().unwrap()).unwrap(),
        b"synthetic-secret-key"
    );
    for entry in std::fs::read_dir(root.path()).unwrap() {
        let bytes = std::fs::read(entry.unwrap().path()).unwrap();
        assert!(
            !bytes
                .windows(b"synthetic-secret-key".len())
                .any(|w| w == b"synthetic-secret-key")
        );
    }
    store
        .chat_configure("http://127.0.0.1:1235/v1", "synthetic-model", true, None)
        .unwrap();
    assert!(!store.chat_config().unwrap().has_key);
    store
        .chat_configure(
            "http://127.0.0.1:1234/v1",
            "synthetic-model",
            false,
            Some(&[]),
        )
        .unwrap();
    assert!(!store.chat_config().unwrap().has_key);
    assert!(store.chat_key_ciphertext().unwrap().is_none());
}

#[tokio::test]
async fn incomplete_stream_and_provider_error_are_not_success_or_raw_error_text() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        time::Duration,
    };
    for response in [
        "HTTP/1.1 401 Unauthorized\r\nContent-Length: 16\r\nConnection: close\r\n\r\nsynthetic-secret",
        "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 8192];
            assert!(socket.read(&mut request).unwrap() > 0);
            socket.write_all(response.as_bytes()).unwrap();
            std::thread::sleep(Duration::from_millis(50));
        });
        let config = ningmao_desktop_lib::store::ChatConfig {
            base_url: format!("http://{address}/v1"),
            model: "synthetic".into(),
            enabled: true,
            has_key: false,
        };
        let mut output = String::new();
        let result = chat::stream_reply(
            &config,
            None,
            &[],
            &tokio::sync::Notify::new(),
            &mut output,
            |_| Ok(()),
        )
        .await;
        assert!(result.is_err());
        assert!(!result.unwrap_err().contains("synthetic-secret"));
        worker.join().unwrap();
    }
}

#[tokio::test]
async fn real_sse_service_receives_three_rounds_and_stop_preserves_partial_history() {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::Arc,
        time::Duration,
    };
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let worker = std::thread::spawn(move || {
        for round in 0..4 {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut header = Vec::new();
            while !header.ends_with(b"\r\n\r\n") {
                let mut byte = [0];
                socket.read_exact(&mut byte).unwrap();
                header.push(byte[0]);
            }
            let header = String::from_utf8(header).unwrap();
            assert!(header.starts_with("POST /v1/chat/completions HTTP/1.1"));
            let length: usize = header
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|v| v.trim().parse().unwrap())
                })
                .unwrap();
            let mut bytes = vec![0; length];
            socket.read_exact(&mut bytes).unwrap();
            let request: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(request["model"], "synthetic");
            assert_eq!(request["stream"], true);
            assert_eq!(request["messages"].as_array().unwrap().len(), round * 2 + 1);
            let body = "data: {\"choices\":[{\"delta\":{\"content\":\"合成回复\"},\"finish_reason\":null}]}\n\ndata: [DONE]\n\n";
            if round == 3 {
                socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n").unwrap();
                socket
                    .write_all(b"data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n")
                    .unwrap();
                socket.flush().unwrap();
                std::thread::sleep(Duration::from_millis(300));
            } else {
                write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            }
        }
    });
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("state.db")).unwrap();
    let session = store.chat_new().unwrap();
    store
        .chat_configure(&format!("http://{address}/v1"), "synthetic", true, None)
        .unwrap();
    let config = store.chat_config().unwrap();
    for round in 0..4 {
        let request = store
            .chat_begin(session, &format!("question-{round}"))
            .unwrap();
        let cancel = Arc::new(tokio::sync::Notify::new());
        if round == 3 {
            let cancel = cancel.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(150)).await;
                cancel.notify_one();
            });
        }
        let mut output = String::new();
        let status = chat::stream_reply(
            &config,
            None,
            &request.messages,
            &cancel,
            &mut output,
            |_| Ok(()),
        )
        .await
        .unwrap();
        assert_eq!(status, if round == 3 { "stopped" } else { "completed" });
        assert_eq!(
            output,
            if round == 3 {
                "partial"
            } else {
                "合成回复"
            }
        );
        store
            .chat_finish(request.assistant_id, &output, status)
            .unwrap();
    }
    worker.join().unwrap();
    drop(store);
    let store = Store::open(&root.path().join("state.db")).unwrap();
    assert_eq!(store.chat_messages(session).unwrap().len(), 8);
}
