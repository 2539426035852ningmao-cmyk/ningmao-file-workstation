use super::{Result, Store, is_link};
use rusqlite::params;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

#[derive(Clone, Serialize)]
pub struct SearchReference {
    pub item_id: i64,
    pub shelf_id: i64,
    pub shelf_name: String,
}
#[derive(Serialize)]
pub struct SearchHit {
    pub name: String,
    pub kind: String,
    pub status: String,
    pub match_kind: String,
    pub references: Vec<SearchReference>,
    #[serde(skip)]
    matched: Vec<i64>,
    #[serde(skip)]
    matched_tags: Vec<String>,
}
#[derive(Serialize)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    pub truncated: bool,
}
struct Row {
    reference: SearchReference,
    shelf_kind: String,
    path: String,
    name: String,
    tags: Vec<String>,
}
fn local_metadata_allowed(path: &Path) -> bool {
    let text = path.to_string_lossy();
    if text.starts_with(r"\\") && !text.starts_with(r"\\?\") {
        return false;
    }
    if text.to_ascii_lowercase().starts_with(r"\\?\unc\") {
        return false;
    }
    #[cfg(windows)]
    {
        use windows::{
            Win32::Storage::FileSystem::GetDriveTypeW,
            core::{HSTRING, PCWSTR},
        };
        let p = text.strip_prefix(r"\\?\").unwrap_or(&text);
        if p.as_bytes().get(1) == Some(&b':') {
            let root = HSTRING::from(format!("{}\\", &p[..2]));
            // Unknown, disconnected and network drives are not probed during metadata search.
            if [0, 1, 4].contains(&unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) }) {
                return false;
            }
        }
    }
    true
}
// Opaque and deliberately not serializable: raw paths must not cross IPC.
pub struct SearchCatalog(Vec<Row>);
fn identity(path: &Path) -> Option<String> {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::{
            Foundation::HANDLE,
            Storage::FileSystem::{BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle},
        };
        let file = fs::File::open(path).ok()?;
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        unsafe {
            GetFileInformationByHandle(HANDLE(file.as_raw_handle()), &mut info).ok()?;
        }
        Some(format!(
            "file:{}:{}:{}",
            info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow
        ))
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let m = fs::metadata(path).ok()?;
        Some(format!("file:{}:{}", m.dev(), m.ino()))
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = path;
        None
    }
}
impl SearchCatalog {
    pub fn search(self, query: &str, kind: &str) -> Result<SearchResponse> {
        self.search_filtered(query, kind, "all", "all")
    }
    pub fn search_filtered(
        self,
        query: &str,
        kind: &str,
        source: &str,
        state: &str,
    ) -> Result<SearchResponse> {
        self.search_filtered_cancelable(query, kind, source, state, &AtomicBool::new(false))
    }
    pub fn search_filtered_cancelable(
        self,
        query: &str,
        kind: &str,
        source: &str,
        state: &str,
        canceled: &AtomicBool,
    ) -> Result<SearchResponse> {
        if canceled.load(Ordering::Relaxed) {
            return Err("搜索已被更新的查询取代。".into());
        }
        if query.chars().count() > 160 || kind.len() > 24 {
            return Err("搜索内容过长，请缩短后重试。".into());
        }
        let terms: Vec<_> = query.split_whitespace().map(str::to_lowercase).collect();
        let kind = kind.trim().to_lowercase();
        if !["all", "persistent", "session", "bound"].contains(&source)
            || !["all", "normal", "missing", "offline", "unavailable"].contains(&state)
        {
            return Err("未知搜索筛选条件。".into());
        }
        if terms.is_empty()
            && (kind == "all" || kind.is_empty())
            && source == "all"
            && state == "all"
        {
            return Ok(SearchResponse {
                hits: vec![],
                truncated: false,
            });
        }
        // If no authorized name/tag can match, there is no reason to probe file metadata.
        // This preserves hard-link aggregation whenever at least one match exists.
        if !terms.is_empty()
            && !self.0.iter().any(|row| {
                let name = row.name.to_lowercase();
                let tags = row.tags.join(" ").to_lowercase();
                (source == "all" || row.shelf_kind == source)
                    && terms
                        .iter()
                        .all(|term| name.contains(term) || tags.contains(term))
            })
        {
            return Ok(SearchResponse {
                hits: vec![],
                truncated: false,
            });
        }
        let mut grouped: HashMap<String, SearchHit> = HashMap::new();
        // Metadata-only O(n) over registered references. Add an index only after measuring this ceiling.
        // Called outside the shared Store mutex by IPC, so offline metadata cannot block Copy cancellation.
        for row in self.0 {
            if canceled.load(Ordering::Relaxed) {
                return Err("搜索已被更新的查询取代。".into());
            }
            if source != "all" && row.shelf_kind != source {
                continue;
            }
            let path = Path::new(&row.path);
            let meta = if local_metadata_allowed(path) {
                Some(fs::symlink_metadata(path))
            } else {
                None
            };
            let status = match &meta {
                Some(Ok(m)) if is_link(m) => "unavailable",
                Some(Ok(_)) => "normal",
                Some(Err(e)) if cfg!(windows) && matches!(e.raw_os_error(), Some(21 | 1167)) => {
                    "offline"
                }
                Some(Err(e)) if e.kind() == std::io::ErrorKind::NotFound => "missing",
                Some(Err(_)) => "unavailable",
                None => "offline",
            };
            let extension = if meta
                .as_ref()
                .is_some_and(|m| m.as_ref().is_ok_and(|m| m.is_dir()))
            {
                "folder".into()
            } else {
                path.extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("file")
                    .to_lowercase()
            };
            let key = if status == "normal" {
                identity(path).unwrap_or_else(|| format!("path:{}", row.path))
            } else {
                format!("path:{}", row.path)
            };
            let name = row.name.to_lowercase();
            let tags = row.tags.join(" ").to_lowercase();
            let matches = matches_kind(&kind, &extension)
                && (state == "all" || state == status)
                && terms.iter().all(|t| name.contains(t) || tags.contains(t));
            let match_kind = if terms.iter().all(|t| name.contains(t)) {
                "name"
            } else {
                "tag"
            };
            let hit = grouped.entry(key).or_insert_with(|| SearchHit {
                name: row.name.clone(),
                kind: extension.clone(),
                status: status.into(),
                match_kind: match_kind.into(),
                references: vec![],
                matched: vec![],
                matched_tags: vec![],
            });
            if matches {
                if hit.matched.is_empty() {
                    hit.name = row.name;
                    hit.kind = extension;
                    hit.status = status.into();
                    hit.match_kind = match_kind.into();
                    hit.matched_tags = row.tags.clone();
                }
                hit.matched.push(row.reference.item_id);
            }
            hit.references.push(row.reference);
        }
        for hit in grouped.values_mut() {
            let matched: HashSet<_> = hit.matched.iter().copied().collect();
            hit.references
                .sort_by_key(|r| !matched.contains(&r.item_id));
        }
        let mut hits: Vec<_> = grouped
            .into_values()
            .filter(|h| !h.matched.is_empty())
            .collect();
        hits.sort_by(|a, b| {
            a.name
                .to_lowercase()
                .cmp(&b.name.to_lowercase())
                .then(a.references[0].item_id.cmp(&b.references[0].item_id))
        });
        let truncated = hits.len() > 50;
        hits.truncate(50);
        Ok(SearchResponse { hits, truncated })
    }
}
fn matches_kind(filter: &str, extension: &str) -> bool {
    match filter {
        "" | "all" => true,
        "image" => [
            "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "avif", "heic", "svg",
        ]
        .contains(&extension),
        "video" => ["mp4", "mov", "mkv", "avi", "webm", "m4v", "mpg", "mpeg"].contains(&extension),
        "audio" => ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus"].contains(&extension),
        "document" => [
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "rtf", "odt", "ods",
            "odp", "csv",
        ]
        .contains(&extension),
        other => other == extension,
    }
}
impl Store {
    pub fn search_filtered(
        &self,
        scope: Option<i64>,
        query: &str,
        kind: &str,
        source: &str,
        status: &str,
    ) -> Result<SearchResponse> {
        self.search_catalog(scope)?
            .search_filtered(query, kind, source, status)
    }
    pub fn search_catalog(&self, scope: Option<i64>) -> Result<SearchCatalog> {
        let mut q=self.db.prepare("SELECT i.id,i.shelf_id,s.name,i.path,i.name,i.tags,s.kind FROM items i JOIN shelves s ON s.id=i.shelf_id WHERE i.trashed_at IS NULL AND s.trashed_at IS NULL AND (?1 IS NULL OR i.shelf_id=?1) ORDER BY i.id").map_err(super::err)?;
        let rows = q
            .query_map([scope], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                ))
            })
            .map_err(super::err)?;
        let mut out = vec![];
        for row in rows {
            let (id, shelf_id, shelf_name, path, name, tags, shelf_kind) =
                row.map_err(super::err)?;
            out.push(Row {
                reference: SearchReference {
                    item_id: id,
                    shelf_id,
                    shelf_name,
                },
                shelf_kind,
                path,
                name,
                tags: serde_json::from_str(&tags).map_err(super::err)?,
            });
        }
        Ok(SearchCatalog(out))
    }
    pub fn search_metadata(
        &self,
        scope: Option<i64>,
        query: &str,
        kind: &str,
    ) -> Result<SearchResponse> {
        self.search_catalog(scope)?.search(query, kind)
    }
    pub fn revalidate_search(
        &self,
        scope: Option<i64>,
        response: &mut SearchResponse,
    ) -> Result<()> {
        let mut q=self.db.prepare("SELECT i.id FROM items i JOIN shelves s ON s.id=i.shelf_id WHERE i.trashed_at IS NULL AND s.trashed_at IS NULL AND (?1 IS NULL OR i.shelf_id=?1)").map_err(super::err)?;
        let active: HashSet<i64> = q
            .query_map([scope], |r| r.get(0))
            .map_err(super::err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(super::err)?;
        for h in &mut response.hits {
            h.references.retain(|r| active.contains(&r.item_id));
        }
        // The visible name and match label came from the first matching reference.
        // If that reference was revoked during the search, discard this stale hit;
        // a fresh query can safely rebuild it from any surviving alias.
        let mut current = self
            .db
            .prepare("SELECT name,tags FROM items WHERE id=?1")
            .map_err(super::err)?;
        let mut valid_hits = Vec::with_capacity(response.hits.len());
        for hit in response.hits.drain(..) {
            if let Some(id) = hit.matched.first().filter(|id| active.contains(id)) {
                let (name, tags): (String, String) = current
                    .query_row([id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(super::err)?;
                let tags: Vec<String> = serde_json::from_str(&tags).map_err(super::err)?;
                if !hit.references.is_empty() && hit.name == name && hit.matched_tags == tags {
                    valid_hits.push(hit);
                }
            }
        }
        response.hits = valid_hits;
        Ok(())
    }
    pub fn validate_search_location(
        &self,
        scope: Option<i64>,
        shelf: i64,
        item: i64,
    ) -> Result<()> {
        self.validate_item_scope(scope, &[item])?;
        let valid:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM items WHERE id=?1 AND shelf_id=?2 AND trashed_at IS NULL)",params![item,shelf],|r|r.get(0)).map_err(super::err)?;
        if !valid {
            return Err("搜索结果已变化，请重新搜索。".into());
        }
        Ok(())
    }
}
