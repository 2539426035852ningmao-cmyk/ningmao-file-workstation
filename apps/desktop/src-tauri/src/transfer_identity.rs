use crate::{chat, error, store::Result};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};

#[derive(Serialize, Deserialize)]
pub struct Identity {
    pub certificate: Vec<u8>,
    pub key: Vec<u8>,
}

fn save(path: &Path, value: &impl Serialize) -> Result<()> {
    let ciphertext = chat::protect(&serde_json::to_vec(value).map_err(error)?)?;
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("数据目录无效")?).map_err(error)?;
    file.write_all(&ciphertext).map_err(error)?;
    file.as_file().sync_all().map_err(error)?;
    file.persist(path).map_err(error)?;
    Ok(())
}
fn read<T: serde::de::DeserializeOwned>(path: &Path) -> Result<Option<T>> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&chat::unprotect(&bytes)?)
            .map(Some)
            .map_err(|_| "设备身份记录无法读取，请恢复数据备份。".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(error(e)),
    }
}
pub fn load(root: &Path) -> Result<Identity> {
    let path = root.join("transfer-identity.bin");
    if let Some(identity) = read(&path)? {
        return Ok(identity);
    }
    let certificate =
        rcgen::generate_simple_self_signed(vec!["localhost".into()]).map_err(error)?;
    let identity = Identity {
        certificate: certificate.cert.der().to_vec(),
        key: certificate.signing_key.serialize_der(),
    };
    save(&path, &identity)?;
    Ok(identity)
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Peer {
    pub name: String,
    pub fingerprint: String,
}
pub fn peers(root: &Path) -> Result<Vec<Peer>> {
    Ok(read(&root.join("transfer-peers.bin"))?.unwrap_or_default())
}
pub fn remember(root: &Path, peer: Peer) -> Result<()> {
    let mut known = peers(root)?;
    known.retain(|value| value.fingerprint != peer.fingerprint);
    known.push(peer);
    save(&root.join("transfer-peers.bin"), &known)
}
pub fn remember_verified(
    root: &Path,
    peer: Peer,
    client: ningmao_transfer_client::LoopbackClient,
) -> Result<()> {
    client
        .verify_peer()
        .map_err(|_| "设备身份核验失败，请确认对方已开启接收并重新核对设备码。")?;
    remember(root, peer)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn real_tls_accepts_persisted_identity_and_rejects_wrong_fingerprint() {
        use sha2::{Digest, Sha256};
        use std::{
            net::{Ipv4Addr, SocketAddr, TcpListener},
            sync::Arc,
        };
        let _ = rustls::crypto::ring::default_provider().install_default();
        let root = tempfile::tempdir().unwrap();
        let identity = load(root.path()).unwrap();
        let fingerprint = format!("{:x}", Sha256::digest(&identity.certificate));
        let config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(
                vec![rustls::pki_types::CertificateDer::from(
                    identity.certificate,
                )],
                rustls::pki_types::PrivatePkcs8KeyDer::from(identity.key).into(),
            )
            .unwrap();
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let SocketAddr::V4(address) = listener.local_addr().unwrap() else {
            panic!()
        };
        let worker = std::thread::spawn(move || {
            let config = Arc::new(config);
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                    .unwrap();
                let mut connection = rustls::ServerConnection::new(config.clone()).unwrap();
                while connection.is_handshaking() {
                    if connection.complete_io(&mut socket).is_err() {
                        break;
                    }
                }
            }
        });
        remember_verified(
            root.path(),
            Peer {
                name: "合成设备".into(),
                fingerprint: fingerprint.clone(),
            },
            ningmao_transfer_client::LoopbackClient::pinned(address, &fingerprint).unwrap(),
        )
        .unwrap();
        assert!(
            remember_verified(
                root.path(),
                Peer {
                    name: "错误设备".into(),
                    fingerprint: "0".repeat(64)
                },
                ningmao_transfer_client::LoopbackClient::pinned(address, &"0".repeat(64)).unwrap()
            )
            .is_err()
        );
        worker.join().unwrap();
        let remembered = peers(root.path()).unwrap();
        assert_eq!(remembered.len(), 1);
        assert_eq!(remembered[0].fingerprint, fingerprint);
    }
    #[test]
    fn device_identity_and_confirmed_peers_survive_reopening() {
        let root = tempfile::tempdir().unwrap();
        let first = load(root.path()).unwrap();
        let second = load(root.path()).unwrap();
        assert_eq!(first.certificate, second.certificate);
        assert_eq!(first.key, second.key);
        let encrypted = fs::read(root.path().join("transfer-identity.bin")).unwrap();
        assert!(
            !encrypted
                .windows(first.key.len())
                .any(|value| value == first.key)
        );
        remember(
            root.path(),
            Peer {
                name: "合成设备".into(),
                fingerprint: "a".repeat(64),
            },
        )
        .unwrap();
        remember(
            root.path(),
            Peer {
                name: "更新名称".into(),
                fingerprint: "a".repeat(64),
            },
        )
        .unwrap();
        let reopened = peers(root.path()).unwrap();
        assert_eq!(reopened.len(), 1);
        assert_eq!(reopened[0].name, "更新名称");
    }
}
