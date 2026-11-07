use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

const GROUP: Ipv4Addr = Ipv4Addr::new(239, 255, 77, 42);
const PORT: u16 = 53319;
const QUERY: &[u8] = b"NINGMAO-DISCOVER-1";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Device {
    pub name: String,
    pub address: SocketAddrV4,
    pub fingerprint: String,
}

pub fn local_address() -> io::Result<SocketAddrV4> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))?;
    // UDP connect selects the route without transmitting a packet.
    socket.connect((GROUP, PORT))?;
    match socket.local_addr()? {
        SocketAddr::V4(address) if address.ip().is_private() => {
            Ok(SocketAddrV4::new(*address.ip(), 53317))
        }
        _ => Err(io::Error::other("没有可用的私有局域网 IPv4")),
    }
}

pub struct Advertisement {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}
impl Advertisement {
    pub fn start(device: Device) -> io::Result<Self> {
        let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, PORT))?;
        socket.join_multicast_v4(&GROUP, device.address.ip())?;
        Self::serve(socket, device)
    }
    fn serve(socket: UdpSocket, device: Device) -> io::Result<Self> {
        socket.set_read_timeout(Some(Duration::from_millis(150)))?;
        let payload = serde_json::to_vec(&device)?;
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let worker = thread::spawn(move || {
            let mut buffer = [0; 64];
            while !stopping.load(Ordering::Relaxed) {
                if let Ok((length, SocketAddr::V4(peer))) = socket.recv_from(&mut buffer)
                    && (peer.ip().is_private() || peer.ip().is_loopback())
                    && &buffer[..length] == QUERY
                {
                    let _ = socket.send_to(&payload, peer);
                }
            }
        });
        Ok(Self {
            stop,
            worker: Some(worker),
        })
    }
}
impl Drop for Advertisement {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub fn discover() -> io::Result<Vec<Device>> {
    discover_at(SocketAddrV4::new(GROUP, PORT), Duration::from_secs(2))
}
fn discover_at(target: SocketAddrV4, duration: Duration) -> io::Result<Vec<Device>> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))?;
    socket.set_multicast_ttl_v4(1)?;
    socket.set_read_timeout(Some(Duration::from_millis(150)))?;
    socket.send_to(QUERY, target)?;
    let until = Instant::now() + duration;
    let mut found = BTreeMap::new();
    let mut buffer = [0; 2048];
    while Instant::now() < until {
        let Ok((length, SocketAddr::V4(peer))) = socket.recv_from(&mut buffer) else {
            continue;
        };
        let Ok(mut device) = serde_json::from_slice::<Device>(&buffer[..length]) else {
            continue;
        };
        if (!peer.ip().is_private() && !peer.ip().is_loopback())
            || device.name.is_empty()
            || device.name.chars().count() > 64
            || device.fingerprint.len() != 64
            || !device.fingerprint.bytes().all(|b| b.is_ascii_hexdigit())
            || device.address.port() == 0
        {
            continue;
        }
        device.address.set_ip(*peer.ip());
        found.insert(device.fingerprint.clone(), device);
    }
    Ok(found.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires explicit private LAN discovery approval"]
    fn private_lan_multicast_discovery() {
        let address = local_address().unwrap();
        let server = Advertisement::start(Device {
            name: "柠猫合成发现测试".into(),
            address,
            fingerprint: "b".repeat(64),
        })
        .unwrap();
        let devices = discover().unwrap();
        assert!(
            devices
                .iter()
                .any(|device| device.name == "柠猫合成发现测试" && device.address == address)
        );
        drop(server);
        assert!(UdpSocket::bind((Ipv4Addr::UNSPECIFIED, PORT)).is_ok());
    }
    #[test]
    fn actual_udp_discovery_and_shutdown() {
        let socket = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let SocketAddr::V4(address) = socket.local_addr().unwrap() else {
            panic!()
        };
        let device = Device {
            name: "合成电脑".into(),
            address: SocketAddrV4::new(Ipv4Addr::LOCALHOST, 53317),
            fingerprint: "a".repeat(64),
        };
        let server = Advertisement::serve(socket, device).unwrap();
        let devices = discover_at(address, Duration::from_millis(300)).unwrap();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].name, "合成电脑");
        drop(server);
        assert!(UdpSocket::bind(address).is_ok());
    }
}
