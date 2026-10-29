#![cfg(windows)]

use std::{fs, path::PathBuf};
use windows::{
    Win32::{
        Foundation::ERROR_HOTKEY_ALREADY_REGISTERED,
        UI::Input::KeyboardAndMouse::{
            MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, RegisterHotKey, UnregisterHotKey,
        },
    },
    core::HRESULT,
};

const PROBE_ID: i32 = 0x4e4d;
struct OwnedKey(bool);
impl Drop for OwnedKey {
    fn drop(&mut self) {
        if self.0 {
            let _ = unsafe { UnregisterHotKey(None, PROBE_ID) };
        }
    }
}

#[test]
#[ignore = "explicit synthetic candidate and expected occupied/free Ctrl+Alt+G state required"]
fn candidate_hotkey_registration_matches_windows() {
    let root =
        PathBuf::from(std::env::var_os("NINGMAO_HOTKEY_PROBE_ROOT").expect("explicit fixture"));
    assert!(root.is_absolute());
    assert_eq!(
        fs::read(root.join("SYNTHETIC-ONLY.txt")).unwrap(),
        b"Agent-created synthetic fixtures, not private user files.\n"
    );
    let config: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("data/wake-shortcut-v1.json")).unwrap())
            .unwrap();
    assert_eq!(config["version"], 1);
    assert_eq!(config["enabled"], true);
    assert_eq!(config["accelerator"], "Ctrl+Alt+G");
    let expected = std::env::var("NINGMAO_HOTKEY_PROBE_EXPECTED").expect("occupied or free");
    assert!(matches!(expected.as_str(), "occupied" | "free"));

    // Thread-owned registration only; no message loop, input capture or injection
    let result = unsafe {
        RegisterHotKey(
            None,
            PROBE_ID,
            MOD_CONTROL | MOD_ALT | MOD_NOREPEAT,
            u32::from(b'G'),
        )
    };
    let mut owned = OwnedKey(result.is_ok());
    if expected == "occupied" {
        let error = result.expect_err("expected the running candidate to own Ctrl+Alt+G");
        assert_eq!(
            error.code(),
            HRESULT::from_win32(ERROR_HOTKEY_ALREADY_REGISTERED.0)
        );
        println!("NATIVE_HOTKEY_PROBE occupied: Windows rejected a competing registration");
    } else {
        result.expect("candidate exit must release Ctrl+Alt+G");
        unsafe { UnregisterHotKey(None, PROBE_ID) }
            .expect("probe must release its own registration");
        owned.0 = false;
        println!("NATIVE_HOTKEY_PROBE free: Windows accepted registration; probe released it");
    }
}
