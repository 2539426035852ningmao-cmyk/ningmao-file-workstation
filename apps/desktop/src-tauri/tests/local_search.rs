use ningmao_desktop_lib::store::Store;
use rusqlite::Connection;
use std::fs;

#[test]
fn read_only_search_groups_real_identity_and_hides_paths() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let path = root.join("workstation.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let third = store.create_shelf("素材参考", false).unwrap();
    let role = root.join("角色 Design.png");
    fs::write(&role, b"synthetic image metadata").unwrap();
    let a = store.add_reference(1, &role).unwrap();
    store.set_tags(a, vec!["收藏".into()]).unwrap();
    store.add_reference(third, &role).unwrap();
    let alias = root.join("alias.png");
    fs::hard_link(&role, &alias).unwrap();
    store.add_reference(third, &alias).unwrap();
    let copy = root.join("角色 Copy.png");
    fs::copy(&role, &copy).unwrap();
    store.add_reference(third, &copy).unwrap();
    let missing = root.join("角色 offline.txt");
    fs::write(&missing, b"synthetic").unwrap();
    let removed = store.add_reference(1, &missing).unwrap();
    fs::remove_file(&missing).unwrap();
    let db = Connection::open(&path).unwrap();
    let before: i64 = db
        .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
        .unwrap();
    let hits = store.search_metadata(None, "角色", "all").unwrap();
    assert_eq!(hits.hits.len(), 3);
    assert!(hits.hits.iter().any(|h| h.references.len() == 3));
    assert!(hits.hits.iter().any(|h| h.status == "missing"));
    let tagged = store.search_metadata(None, "收藏", "png").unwrap();
    assert_eq!(tagged.hits.len(), 1);
    assert_eq!(tagged.hits[0].references.len(), 3);
    assert_eq!(
        store
            .search_metadata(None, "DESIGN", "all")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert_eq!(
        store
            .search_metadata(Some(1), "角色", "png")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert!(
        store
            .search_metadata(None, "workstation.sqlite3", "all")
            .unwrap()
            .hits
            .is_empty()
    );
    let json = serde_json::to_string(&hits).unwrap();
    assert!(!json.contains(root.to_str().unwrap()));
    assert!(!json.contains("\"path\""));
    assert!(!json.contains("\"tags\""));
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM items", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        before
    );
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert!(store.validate_search_location(Some(third), 1, a).is_err());
    store.validate_search_location(None, 1, removed).unwrap(); // missing refs can still be located
    store.remove_reference(removed).unwrap();
    assert!(store.validate_search_location(None, 1, removed).is_err());
    assert_eq!(
        store
            .search_metadata(None, "offline", "all")
            .unwrap()
            .hits
            .len(),
        0
    );
    let catalog = store.search_catalog(None).unwrap();
    store.remove_reference(a).unwrap();
    let mut stale = catalog.search("收藏", "all").unwrap();
    assert_eq!(stale.hits.len(), 1);
    store.revalidate_search(None, &mut stale).unwrap();
    // A match from a removed tagged reference cannot survive via another untagged ref.
    assert!(stale.hits.is_empty());
}

#[test]
fn searching_bound_metadata_does_not_scan_or_register_new_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let bound = root.join("bound");
    fs::create_dir(&bound).unwrap();
    fs::write(bound.join("known.txt"), b"known").unwrap();
    let mut store = Store::open(&root.join("db")).unwrap();
    store.bind_directory(&bound).unwrap();
    store.snapshot().unwrap(); // prepare the already-registered baseline, before the search
    fs::write(bound.join("unregistered.txt"), b"must not index").unwrap();
    assert!(
        store
            .search_metadata(None, "unregistered", "all")
            .unwrap()
            .hits
            .is_empty()
    );
    assert_eq!(
        store
            .search_metadata(None, "KNOWN", "txt")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert!(
        store
            .search_metadata(None, &"a".repeat(161), "all")
            .is_err()
    );
}

#[test]
fn category_source_and_availability_filters_preserve_scope_and_real_identities() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let bound = root.join("bound");
    fs::create_dir(&bound).unwrap();
    let image = root.join("素材.PNG");
    fs::write(&image, b"synthetic image").unwrap();
    fs::hard_link(&image, bound.join("同一实体.png")).unwrap();
    let jpeg = root.join("图片.jpeg");
    let video = root.join("演示.MP4");
    let audio = root.join("声音.wav");
    let doc = root.join("说明.docx");
    let missing = root.join("丢失.JPG");
    for file in [&jpeg, &video, &audio, &doc, &missing] {
        fs::write(file, b"synthetic").unwrap();
    }
    let mut store = Store::open(&root.join("db.sqlite3")).unwrap();
    let source_id = store.add_reference(1, &image).unwrap();
    for file in [&jpeg, &video, &audio, &doc, &missing] {
        store.add_reference(1, file).unwrap();
    }
    let bound_id = store.bind_directory(&bound).unwrap();
    store.snapshot().unwrap();
    fs::remove_file(&missing).unwrap();

    let images = store
        .search_filtered(None, "", "image", "all", "all")
        .unwrap();
    assert_eq!(images.hits.len(), 3);
    assert!(images.hits.iter().any(|h| h.references.len() == 2));
    assert_eq!(
        store
            .search_filtered(None, "", "video", "all", "all")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert_eq!(
        store
            .search_filtered(None, "", "audio", "all", "all")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert_eq!(
        store
            .search_filtered(None, "", "document", "all", "all")
            .unwrap()
            .hits
            .len(),
        1
    );
    let missing = store
        .search_filtered(None, "", "all", "all", "missing")
        .unwrap();
    assert_eq!(missing.hits.len(), 1);
    assert_eq!(missing.hits[0].status, "missing");
    let bound_only = store
        .search_filtered(None, "", "image", "bound", "normal")
        .unwrap();
    assert_eq!(bound_only.hits.len(), 1);
    assert_eq!(bound_only.hits[0].references.len(), 1);
    assert_eq!(bound_only.hits[0].references[0].shelf_id, bound_id);
    assert_ne!(bound_only.hits[0].references[0].item_id, source_id);
    assert!(
        store
            .search_filtered(Some(1), "", "image", "bound", "all")
            .unwrap()
            .hits
            .is_empty()
    );
    assert!(
        store
            .search_filtered(None, "", "all", "invalid", "all")
            .is_err()
    );
    assert!(
        store
            .search_filtered(None, "", "all", "all", "invalid")
            .is_err()
    );
    let json = serde_json::to_string(&images).unwrap();
    assert!(!json.contains(root.to_str().unwrap()));
    assert!(!json.contains("\"path\""));
    store.integrity_check().unwrap();
}

#[test]
fn revoked_display_reference_never_leaks_its_old_name_through_a_live_alias() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let original = dir.path().join("项目 secret-name.txt");
    let alias = dir.path().join("项目 public-name.txt");
    fs::write(&original, b"synthetic").unwrap();
    fs::hard_link(&original, &alias).unwrap();
    let removed = store.add_reference(1, &original).unwrap();
    let kept = store.add_reference(1, &alias).unwrap();
    let catalog = store.search_catalog(None).unwrap();
    let mut result = catalog.search("项目", "all").unwrap();
    assert_eq!(result.hits.len(), 1);
    assert!(result.hits[0].name.contains("secret-name"));
    store.remove_reference(removed).unwrap();
    store.revalidate_search(None, &mut result).unwrap();
    let rendered = serde_json::to_string(&result).unwrap();
    assert!(!rendered.contains("secret-name"));
    assert!(
        result.hits.is_empty(),
        "stale displayed identity must be discarded"
    );
    assert_eq!(
        store.search_metadata(None, "项目", "all").unwrap().hits[0].name,
        "项目 public-name.txt"
    );
    assert!(
        result
            .hits
            .iter()
            .all(|h| h.references.iter().all(|r| r.item_id != removed))
    );
    assert!(store.validate_search_location(None, 1, kept).is_ok());
}

#[cfg(windows)]
#[test]
fn disconnected_drive_is_offline_without_probing_its_contents() {
    use windows::{
        Win32::Storage::FileSystem::GetDriveTypeW,
        core::{HSTRING, PCWSTR},
    };
    let letter = (b'D'..=b'Z')
        .find(|letter| {
            let root = HSTRING::from(format!("{}:\\", char::from(*letter)));
            unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) == 1 }
        })
        .expect("test needs an unused drive letter");
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite3");
    let store = Store::open(&path).unwrap();
    let db = Connection::open(&path).unwrap();
    db.execute("INSERT INTO items(shelf_id,path,name,position,tags) VALUES(1,?1,'离线设备素材.txt',0,'[]')", [format!("{}:\\synthetic-only\\离线设备素材.txt",char::from(letter))]).unwrap();
    let result = store
        .search_filtered(None, "离线设备", "all", "all", "offline")
        .unwrap();
    assert_eq!(result.hits.len(), 1);
    assert_eq!(result.hits[0].status, "offline");
    assert!(
        store
            .search_filtered(None, "离线设备", "all", "all", "missing")
            .unwrap()
            .hits
            .is_empty()
    );
}

#[test]
#[ignore = "explicit local 1k/10k synthetic performance measurement"]
fn registered_metadata_search_scale_probe() {
    use std::time::Instant;
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let path = root.join("scale.sqlite3");
    let store = Store::open(&path).unwrap();
    let mut setup = Connection::open(&path).unwrap();
    for (start, end) in [(0, 1_000), (1_000, 10_000)] {
        let tx = setup.transaction().unwrap();
        for n in start..end {
            let name = if n == 999 || n == 9_999 {
                format!("needle-{n}.txt")
            } else {
                format!("标本-{n:05}.txt")
            };
            let file = root.join(&name);
            fs::write(&file, b"synthetic").unwrap();
            tx.execute(
                "INSERT INTO items(shelf_id,path,name,position,tags) VALUES(1,?1,?2,?3,'[]')",
                rusqlite::params![file.to_str().unwrap(), name, n],
            )
            .unwrap();
        }
        tx.commit().unwrap();
        for query in ["needle", "标本", "不存在的素材"] {
            let mut samples = Vec::new();
            for _ in 0..3 {
                let now = Instant::now();
                let mut response = store
                    .search_catalog(None)
                    .unwrap()
                    .search(query, "all")
                    .unwrap();
                store.revalidate_search(None, &mut response).unwrap();
                samples.push(now.elapsed().as_millis());
                if query == "不存在的素材" {
                    assert!(response.hits.is_empty());
                } else if query == "needle" {
                    assert_eq!(response.hits.len(), if end == 1_000 { 1 } else { 2 });
                } else {
                    assert_eq!(response.hits.len(), 50);
                    assert!(response.truncated);
                }
            }
            println!("registered_search files={end} query={query} milliseconds={samples:?}");
        }
    }
    store.integrity_check().unwrap();
    assert_eq!(
        setup
            .query_row("SELECT COUNT(*) FROM items", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        10_000
    );
}

#[test]
fn changed_tags_invalidate_an_in_flight_match() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let file = dir.path().join("普通素材.txt");
    fs::write(&file, b"synthetic").unwrap();
    let item = store.add_reference(1, &file).unwrap();
    store.set_tags(item, vec!["待撤销标签".into()]).unwrap();
    let catalog = store.search_catalog(None).unwrap();
    store.set_tags(item, vec![]).unwrap();
    let mut result = catalog.search("待撤销标签", "all").unwrap();
    assert_eq!(result.hits.len(), 1);
    store.revalidate_search(None, &mut result).unwrap();
    assert!(
        result.hits.is_empty(),
        "revoked tag must not remain searchable"
    );
}

#[test]
fn changed_name_invalidate_an_in_flight_match() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let file = dir.path().join("旧名称.txt");
    fs::write(&file, b"synthetic").unwrap();
    let item = store.add_reference(1, &file).unwrap();
    let catalog = store.search_catalog(None).unwrap();
    let db = Connection::open(&path).unwrap();
    db.execute(
        "UPDATE items SET name=?1 WHERE id=?2",
        rusqlite::params!["新名称.txt", item],
    )
    .unwrap();
    let mut result = catalog.search("旧名称", "all").unwrap();
    store.revalidate_search(None, &mut result).unwrap();
    assert!(result.hits.is_empty());
}
