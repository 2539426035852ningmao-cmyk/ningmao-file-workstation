use ningmao_desktop_lib::desktop::{Rect, has_visible_title};
#[test]
fn monitor_disconnect_loses_title_but_existing_second_monitor_keeps_it() {
    let primary = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };
    let second = Rect {
        x: 1920,
        y: 0,
        width: 1920,
        height: 1040,
    };
    assert!(!has_visible_title(
        (2200, 100),
        (525, 650),
        1.25,
        &[primary]
    ));
    assert!(has_visible_title(
        (2200, 100),
        (525, 650),
        1.25,
        &[primary, second]
    ));
}
#[test]
fn negative_monitors_and_partially_visible_user_positions_are_not_rearranged() {
    let area = Rect {
        x: -1920,
        y: 40,
        width: 1920,
        height: 1040,
    };
    for scale in [1.0, 1.25, 1.5] {
        assert!(has_visible_title((-1880, 80), (525, 650), scale, &[area]));
        assert!(has_visible_title((-400, 80), (525, 650), scale, &[area]));
        assert!(!has_visible_title((-400, -100), (525, 650), scale, &[area]));
    }
}
#[test]
fn tiny_or_missing_visible_regions_do_not_count_as_recoverable_title() {
    let area = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };
    assert!(!has_visible_title((-500, 100), (525, 650), 1.25, &[area]));
    assert!(has_visible_title((-400, 100), (525, 650), 1.25, &[area]));
    assert!(!has_visible_title((0, 0), (0, 0), 1.0, &[area]));
    assert!(!has_visible_title((0, 0), (420, 520), 1.0, &[]));
}
