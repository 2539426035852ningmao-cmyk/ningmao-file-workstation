//! Portable launchers and direct launches share one remembered workspace pointer.
use crate::store::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
struct Connection {
    version: u32,
    root: PathBuf,
    package: Option<PathBuf>,
}
pub fn resolve(registry: &Path) -> Result<PathBuf> {
    if !registry.exists() {
        return Ok(registry
            .parent()
            .ok_or("工作区连接位置无效")?
            .join("Workspace/data"));
    }
    if std::fs::metadata(registry).map_err(crate::error)?.len() > 4096 {
        return Err("工作区连接无法读取，原连接已保留".into());
    }
    let saved: Connection = serde_json::from_slice(&std::fs::read(registry).map_err(crate::error)?)
        .map_err(|_| "工作区连接无法读取，原连接已保留")?;
    if saved.version != 1 || !saved.root.is_absolute() {
        return Err("工作区连接版本不兼容，原连接已保留".into());
    }
    let data = saved.root.join("data");
    if !data.join("workstation.sqlite3").is_file() {
        return Err("工作区暂不可用，请重新定位，原连接已保留".into());
    }
    Ok(data)
}
pub fn remember(registry: &Path, data: &Path, package: Option<PathBuf>) -> Result<()> {
    let root = data.parent().ok_or("工作区位置无效")?;
    if !data.join("workstation.sqlite3").is_file() || !root.is_absolute() {
        return Err("工作区尚未就绪，未更新连接".into());
    }
    std::fs::create_dir_all(registry.parent().ok_or("工作区连接位置无效")?)
        .map_err(crate::error)?;
    let value = serde_json::to_vec(&Connection {
        version: 1,
        root: root.into(),
        package,
    })
    .map_err(crate::error)?;
    let mut temp =
        tempfile::NamedTempFile::new_in(registry.parent().unwrap()).map_err(crate::error)?;
    use std::io::Write;
    temp.write_all(&value).map_err(crate::error)?;
    temp.as_file().sync_all().map_err(crate::error)?;
    temp.persist(registry).map_err(crate::error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remembers_without_moving_data_and_missing_root_never_falls_back() {
        let dir = tempfile::tempdir().unwrap();
        let registry = dir.path().join("registry/workspace.json");
        let data = dir.path().join("old/data");
        std::fs::create_dir_all(&data).unwrap();
        assert_eq!(
            resolve(&registry).unwrap(),
            dir.path().join("registry/Workspace/data")
        );
        std::fs::write(data.join("workstation.sqlite3"), b"synthetic").unwrap();
        remember(&registry, &data, None).unwrap();
        assert_eq!(resolve(&registry).unwrap(), data);
        remember(&registry, &data, None).unwrap();
        std::fs::rename(data.parent().unwrap(), dir.path().join("moved")).unwrap();
        let before = std::fs::read(&registry).unwrap();
        assert!(resolve(&registry).unwrap_err().contains("暂不可用"));
        assert_eq!(before, std::fs::read(&registry).unwrap());
    }
}
