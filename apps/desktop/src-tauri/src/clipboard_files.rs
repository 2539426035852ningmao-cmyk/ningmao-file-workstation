use crate::store::Result;

pub fn save_image(root: &std::path::Path, bytes: &[u8]) -> Result<std::path::PathBuf> {
    let image = image::load_from_memory(bytes).map_err(|_| "剪贴板图片无法解码。")?;
    let directory = root.join("collected-images");
    std::fs::create_dir_all(&directory).map_err(crate::error)?;
    let mut file = tempfile::Builder::new()
        .prefix("粘贴图片-")
        .suffix(".png")
        .tempfile_in(directory)
        .map_err(crate::error)?;
    image
        .write_to(file.as_file_mut(), image::ImageFormat::Png)
        .map_err(crate::error)?;
    file.as_file().sync_all().map_err(crate::error)?;
    let (_, path) = file.keep().map_err(crate::error)?;
    Ok(path)
}

pub fn read_paths() -> Result<Vec<String>> {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::{
            System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard},
            UI::Shell::{DragQueryFileW, HDROP},
        };
        OpenClipboard(None).map_err(|_| "剪贴板正被占用，请稍后再粘贴。")?;
        let result = (|| {
            // CF_HDROP is the Windows file-list format used by Explorer Copy.
            let handle =
                GetClipboardData(15).map_err(|_| "请先在资源管理器复制文件，再回到文件架粘贴。")?;
            let drop = HDROP(handle.0);
            let count = DragQueryFileW(drop, u32::MAX, None);
            let mut paths = Vec::new();
            for index in 0..count {
                let length = DragQueryFileW(drop, index, None) as usize;
                let mut buffer = vec![0; length + 1];
                DragQueryFileW(drop, index, Some(&mut buffer));
                paths.push(
                    String::from_utf16(&buffer[..length])
                        .map_err(|_| "剪贴板文件路径编码不受支持。")?,
                );
            }
            Ok(paths)
        })();
        let _ = CloseClipboard();
        result
    }
    #[cfg(not(windows))]
    {
        Err("文件剪贴板当前仅支持 Windows。".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actual_image_is_saved_with_unique_names_and_invalid_input_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        let image = image::DynamicImage::new_rgb8(2, 2);
        let mut bytes = std::io::Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        let first = save_image(root.path(), bytes.get_ref()).unwrap();
        let second = save_image(root.path(), bytes.get_ref()).unwrap();
        assert_ne!(first, second);
        assert_eq!(image::open(first).unwrap().width(), 2);
        assert!(save_image(root.path(), b"invalid image").is_err());
        assert_eq!(
            std::fs::read_dir(root.path().join("collected-images"))
                .unwrap()
                .count(),
            2
        );
    }
}
