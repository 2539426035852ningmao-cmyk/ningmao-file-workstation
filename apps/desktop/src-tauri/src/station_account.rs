use crate::{
    Runtime, error, main_only, prepare_clean_exit, store::Result, temporary_room,
    transfer_identity, trusted_native_origin,
};
use reqwest::{Url, header};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Clone, Deserialize, Serialize)]
struct Identity {
    id: String,
    username: String,
}

#[derive(Deserialize, Serialize)]
struct Login {
    origin: String,
    identity: Identity,
    session: String,
}

#[derive(Default, Deserialize, Serialize)]
pub(crate) struct AccountWorkspaces {
    current: Option<Login>,
    original_owner: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct View {
    username: Option<String>,
    station: Option<String>,
    can_associate: bool,
}

fn key(origin: &str, id: &str) -> String {
    format!("{:x}", Sha256::digest(format!("{origin}/{id}")))
}

impl AccountWorkspaces {
    fn path(root: &Path) -> PathBuf {
        root.join("station-account-workspaces.bin")
    }

    pub(crate) fn load(root: &Path) -> Result<Self> {
        Ok(transfer_identity::read(&Self::path(root))?.unwrap_or_default())
    }

    fn save(&self, root: &Path) -> Result<()> {
        transfer_identity::save(&Self::path(root), self)
    }

    pub(crate) fn data_root(&self, original: &Path) -> PathBuf {
        match &self.current {
            Some(login) => {
                let owner = key(&login.origin, &login.identity.id);
                if self.original_owner.as_deref() == Some(&owner) {
                    original.to_owned()
                } else {
                    original.join("station-workspaces").join(owner)
                }
            }
            None if self.original_owner.is_some() => {
                original.join("station-workspaces").join("guest")
            }
            None => original.to_owned(),
        }
    }

    pub(crate) fn check_isolation(original: &Path, selected: &Path) -> Result<()> {
        if original == selected {
            return Ok(());
        }
        for path in [
            original.join("station-workspaces"),
            selected.to_owned(),
            selected.join("webview"),
        ] {
            match std::fs::symlink_metadata(&path) {
                Ok(metadata) => {
                    #[cfg(windows)]
                    let linked = {
                        use std::os::windows::fs::MetadataExt;
                        metadata.file_attributes() & 0x400 != 0
                    };
                    #[cfg(not(windows))]
                    let linked = metadata.file_type().is_symlink();
                    if linked || !metadata.is_dir() {
                        return Err("账号工作区路径不可用，原数据已保留。".into());
                    }
                }
                Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => {}
                Err(failure) => return Err(error(failure)),
            }
        }
        Ok(())
    }

    fn view(&self) -> View {
        View {
            username: self
                .current
                .as_ref()
                .map(|login| login.identity.username.clone()),
            station: self.current.as_ref().map(|login| login.origin.clone()),
            can_associate: self.current.is_none() && self.original_owner.is_none(),
        }
    }

    fn activate(&mut self, original: &Path, login: Login, associate: bool) -> Result<()> {
        let owner = key(&login.origin, &login.identity.id);
        if associate {
            if !self.view().can_associate
                || original.join("station-workspaces").join(&owner).exists()
            {
                return Err(
                    "此账号已有工作区，或现有工作区已关联。请选择自己的独立工作区。".into(),
                );
            }
            self.original_owner = Some(owner);
        }
        self.current = Some(login);
        Ok(())
    }
}

// All WebView windows need the same profile, including dynamically created child shelves.
#[cfg(windows)]
pub(crate) fn set_webview_profile(original: &Path, data: &Path) {
    const WEBVIEW: &str = "WEBVIEW2_USER_DATA_FOLDER";
    const OVERRIDE: &str = "NINGMAO_ACCOUNT_WEBVIEW_OVERRIDE";
    const ORIGINAL: &str = "NINGMAO_ACCOUNT_WEBVIEW_ORIGINAL";
    let isolated = original != data;
    let had_override = std::env::var_os(OVERRIDE).is_some();
    // On Windows, environment reads and writes are synchronized by the platform.
    unsafe {
        if isolated {
            if !had_override {
                if let Some(value) = std::env::var_os(WEBVIEW) {
                    std::env::set_var(ORIGINAL, value);
                } else {
                    std::env::remove_var(ORIGINAL);
                }
                std::env::set_var(OVERRIDE, "1");
            }
            std::env::set_var(WEBVIEW, data.join("webview"));
        } else if had_override {
            if let Some(value) = std::env::var_os(ORIGINAL) {
                std::env::set_var(WEBVIEW, value);
            } else {
                std::env::remove_var(WEBVIEW);
            }
            std::env::remove_var(OVERRIDE);
            std::env::remove_var(ORIGINAL);
        }
    }
}

fn permitted(window: &tauri::WebviewWindow) -> Result<()> {
    trusted_native_origin(window)?;
    main_only(window)
}

fn cookie_name(origin: &Url) -> &'static str {
    if origin.scheme() == "https" {
        "__Host-ningmao_account"
    } else {
        "ningmao_account"
    }
}

pub(crate) fn header_for(origin: &Url, state: &Runtime) -> Result<Option<String>> {
    let settings = AccountWorkspaces::load(&state.workspace_root)?;
    Ok(settings
        .current
        .filter(|login| {
            login.origin == origin.origin().ascii_serialization()
                && temporary_room::hex(&login.session, 64)
        })
        .map(|login| format!("{}={}", cookie_name(origin), login.session)))
}

#[tauri::command]
pub(crate) async fn station_social_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    action: String,
    room: Option<String>,
    input: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    permitted(&window)?;
    let settings = AccountWorkspaces::load(&app.state::<Runtime>().workspace_root)?;
    let login = settings.current.ok_or("请先登录账号。")?;
    let origin = temporary_room::station_url(&login.origin)?;
    if !temporary_room::hex(&login.session, 64) {
        return Err("登录已失效，请重新登录。".into());
    }
    let client = temporary_room::client()?;
    let mut endpoint = origin.join("api/social").map_err(error)?;
    let request = match (action.as_str(), input) {
        ("", None) => client.get(endpoint),
        ("messages", None) => {
            let code = room
                .as_deref()
                .filter(|code| temporary_room::hex(code, 32))
                .ok_or("文件群编号无效。")?;
            endpoint.set_path("/api/social/messages");
            endpoint.query_pairs_mut().append_pair("room", code);
            client.get(endpoint)
        }
        ("request" | "accept" | "remove" | "rooms" | "messages", Some(input)) => {
            endpoint.set_path(&format!("/api/social/{action}"));
            client.post(endpoint).json(&input)
        }
        ("hosting" | "promote", Some(input)) => {
            let code = room
                .as_deref()
                .filter(|code| temporary_room::hex(code, 32))
                .ok_or("文件群编号无效。")?;
            endpoint.set_path(&format!("/api/rooms/{code}/{action}"));
            client.post(endpoint).json(&input)
        }
        _ => return Err("未知的好友或消息操作。".into()),
    };
    temporary_room::reply(
        temporary_room::send(request.header(
            header::COOKIE,
            format!("{}={}", cookie_name(&origin), login.session),
        ))
        .await?,
    )
    .await
}

#[tauri::command]
pub(crate) fn station_account_view(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Runtime>,
) -> Result<View> {
    permitted(&window)?;
    Ok(AccountWorkspaces::load(&state.workspace_root)?.view())
}

#[tauri::command]
pub(crate) async fn station_account_login(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    station: String,
    username: String,
    password: String,
    associate: bool,
) -> Result<()> {
    permitted(&window)?;
    let address = temporary_room::station_url(&station)?;
    if address.query().is_some() || username.len() > 256 || password.len() > 512 {
        return Err("请检查站点地址、账号名和密码。".into());
    }
    let origin = Url::parse(&address.origin().ascii_serialization()).map_err(error)?;
    let state = app.state::<Runtime>();
    let _guard = state.account_switch.lock().await;
    let mut settings = AccountWorkspaces::load(&state.workspace_root)?;
    if settings.current.is_some() {
        return Err("请先退出当前账号。".into());
    }
    let response = temporary_room::send(
        temporary_room::client()?
            .post(origin.join("api/account/login").map_err(error)?)
            .json(&json!({ "username": username, "password": password })),
    )
    .await?;
    let prefix = format!("{}=", cookie_name(&origin));
    let session = response
        .headers()
        .get(header::SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .and_then(|value| value.strip_prefix(&prefix))
        .filter(|value| temporary_room::hex(value, 64))
        .map(str::to_owned);
    let body = temporary_room::reply(response).await?;
    let identity: Identity =
        serde_json::from_value(body["account"].clone()).map_err(|_| "站点未返回有效账号。")?;
    if !temporary_room::hex(&identity.id, 32)
        || identity.username.is_empty()
        || identity.username.len() > 128
    {
        return Err("站点未返回有效账号。".into());
    }
    settings.activate(
        &state.workspace_root,
        Login {
            origin: origin.origin().ascii_serialization(),
            identity,
            session: session.ok_or("站点未返回有效会话。")?,
        },
        associate,
    )?;
    AccountWorkspaces::check_isolation(
        &state.workspace_root,
        &settings.data_root(&state.workspace_root),
    )?;
    prepare_clean_exit(&app)?;
    settings.save(&state.workspace_root)?;
    state._process_lock.unlock().map_err(error)?;
    app.request_restart();
    Ok(())
}

#[tauri::command]
pub(crate) async fn station_account_logout(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<()> {
    permitted(&window)?;
    let state = app.state::<Runtime>();
    let _guard = state.account_switch.lock().await;
    let mut settings = AccountWorkspaces::load(&state.workspace_root)?;
    if let Some(login) = &settings.current {
        crate::lifecycle_idle(&app)?;
        let origin = temporary_room::station_url(&login.origin)?;
        if temporary_room::hex(&login.session, 64) {
            let _ = temporary_room::client()?
                .post(origin.join("api/account/logout").map_err(error)?)
                .timeout(std::time::Duration::from_secs(2))
                .header(
                    header::COOKIE,
                    format!("{}={}", cookie_name(&origin), login.session),
                )
                .json(&json!({}))
                .send()
                .await;
        }
    } else {
        return Ok(());
    }
    prepare_clean_exit(&app)?;
    settings.current = None;
    AccountWorkspaces::check_isolation(
        &state.workspace_root,
        &settings.data_root(&state.workspace_root),
    )?;
    settings.save(&state.workspace_root)?;
    state._process_lock.unlock().map_err(error)?;
    app.request_restart();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn login(origin: &str, id: &str) -> Login {
        Login {
            origin: origin.into(),
            identity: Identity {
                id: id.into(),
                username: id.into(),
            },
            session: "synthetic".into(),
        }
    }

    #[test]
    fn original_workspace_cannot_be_seen_by_guest_or_second_account_after_association() {
        let test = tempfile::tempdir().unwrap();
        let original = test.path();
        let mut settings = AccountWorkspaces::default();
        assert_eq!(settings.data_root(original), original);
        settings
            .activate(original, login("https://test.invalid", "alice"), true)
            .unwrap();
        assert_eq!(settings.data_root(original), original);
        settings.current = None;
        assert_eq!(
            settings.data_root(original),
            original.join("station-workspaces/guest")
        );
        assert!(
            settings
                .activate(original, login("https://test.invalid", "bob"), true)
                .is_err()
        );
        settings
            .activate(original, login("https://test.invalid", "bob"), false)
            .unwrap();
        let bob = settings.data_root(original);
        settings
            .activate(original, login("https://other.invalid", "bob"), false)
            .unwrap();
        assert_ne!(settings.data_root(original), bob);
        settings
            .activate(original, login("https://test.invalid", "alice"), false)
            .unwrap();
        assert_eq!(settings.data_root(original), original);
    }
}
