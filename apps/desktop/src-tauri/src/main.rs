#![cfg_attr(
    any(not(debug_assertions), feature = "custom-protocol"),
    windows_subsystem = "windows"
)]
fn main() {
    ningmao_desktop_lib::run();
}
