// Explicitly opt-in synthetic fixture preparation, never executed by a normal app build.
use ningmao_desktop_lib::store::Store;
use std::{fs, path::PathBuf, sync::atomic::AtomicBool};
#[test]
#[ignore = "requires a new, explicitly named scratch directory"]
fn prepare_candidate_fixture() {
    let root =
        PathBuf::from(std::env::var_os("NINGMAO_TEST_FIXTURE_DIR").expect("explicit scratch path"));
    assert!(root.is_absolute());
    fs::create_dir(&root).expect("fixture root must not already exist");
    let source = root.join("source");
    let target = root.join("bound-target");
    let data = root.join("data");
    for path in [&source, &target, &data] {
        fs::create_dir(path).unwrap();
    }
    let plain = source.join("English.txt");
    fs::write(&plain, b"Ningmao synthetic source; keep this file.\n").unwrap();
    let chinese = source.join("中文 空格.txt");
    fs::write(&chinese, "柠猫合成测试素材；请保留来源。\n").unwrap();
    let image = source.join("合成图片.png");
    image::RgbImage::from_fn(640, 480, |x, y| {
        if (x / 80 + y / 80) % 2 == 0 {
            image::Rgb([31, 100, 170])
        } else {
            image::Rgb([130, 185, 225])
        }
    })
    .save(&image)
    .unwrap();
    let mut store = Store::open(&data.join("workstation.sqlite3")).unwrap();
    for file in [&plain, &chinese, &image] {
        store.add_reference(1, file).unwrap();
    }
    store.add_reference(2, &chinese).unwrap();
    let shelf = store.bind_directory(&target).unwrap();
    store
        .copy_one(shelf, &chinese, &AtomicBool::new(false), |_, _| {})
        .unwrap();
    store
        .copy_one(shelf, &chinese, &AtomicBool::new(false), |_, _| {})
        .unwrap();
    store.integrity_check().unwrap();
    assert_eq!(
        fs::read(&chinese).unwrap(),
        fs::read(target.join("中文 空格 (1).txt")).unwrap()
    );
    fs::write(
        root.join("SYNTHETIC-ONLY.txt"),
        b"Agent-created synthetic fixtures, not private user files.\n",
    )
    .unwrap();
}
