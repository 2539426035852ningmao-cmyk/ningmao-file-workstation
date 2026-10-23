use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub const FIXTURES: [(&str, &[u8]); 2] = [
    (
        "probe.txt",
        b"Ningmao M1-02 synthetic file probe. Keep the source unchanged.\n",
    ),
    (
        "中文 空格样本.txt",
        "柠猫 M1-02 合成素材，不包含私人内容。\n".as_bytes(),
    ),
];

pub fn prepare(root: &Path) -> Result<Vec<PathBuf>, String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    FIXTURES
        .iter()
        .map(|(name, bytes)| {
            let path = root.join(name);
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
            {
                Ok(mut file) => file.write_all(bytes).map_err(|e| e.to_string())?,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    if fs::read(&path).map_err(|e| e.to_string())? != *bytes {
                        return Err(format!("Refusing to overwrite an existing fixture: {name}"));
                    }
                }
                Err(e) => return Err(e.to_string()),
            }
            let resolved = path.canonicalize().map_err(|e| e.to_string())?;
            if !resolved.starts_with(&root) {
                return Err("Fixture escaped its root".into());
            }
            Ok(resolved)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preparing_twice_preserves_bytes_and_refuses_overwrite() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "ningmao-m102-fixture-test-{}-{stamp}",
            std::process::id()
        ));
        let first = prepare(&root).unwrap();
        assert_eq!(first, prepare(&root).unwrap());
        assert_eq!(fs::read(&first[1]).unwrap(), FIXTURES[1].1);
        fs::write(&first[0], b"Existing user data must survive").unwrap();
        assert!(
            prepare(&root)
                .unwrap_err()
                .contains("Refusing to overwrite")
        );
        assert_eq!(
            fs::read(&first[0]).unwrap(),
            b"Existing user data must survive"
        );
        let resolved = root.canonicalize().unwrap();
        assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        fs::remove_dir_all(resolved).unwrap();
    }
}
