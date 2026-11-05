//! Owned local sender process. The caller supplies authorized source handles and a pinned program.
use crate::{
    browser_share_tasks::BrowserShareTask,
    store::{Result, Store},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

pub struct Source<'a> {
    pub name: &'a str,
    pub file: &'a mut File,
}
pub struct SenderProgram {
    pub path: PathBuf,
    pub sha256: [u8; 32],
}
pub struct Connection {
    pub relay: String,
    pub password: String,
    pub code: String,
}
#[derive(Serialize)]
struct Request<'a> {
    relay: &'a str,
    password: &'a str,
    code: &'a str,
    paths: Vec<PathBuf>,
}
#[derive(Serialize)]
pub struct Outcome {
    pub job_id: i64,
    pub status: String,
}

struct ActiveShare {
    job: Option<i64>,
    cancel: Arc<AtomicBool>,
}
#[derive(Default)]
pub struct ShareControl(Mutex<Option<ActiveShare>>);
pub struct ShareSession<'a>(&'a ShareControl, Arc<AtomicBool>);
impl ShareControl {
    pub fn current_job(&self) -> Result<Option<i64>> {
        Ok(self
            .0
            .lock()
            .map_err(|_| "分享状态不可用")?
            .as_ref()
            .and_then(|active| active.job))
    }
    pub fn begin(&self) -> Result<ShareSession<'_>> {
        let mut active = self.0.lock().map_err(|_| "分享状态不可用")?;
        if active.is_some() {
            return Err("请先完成或取消当前浏览器分享".into());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveShare {
            job: None,
            cancel: cancel.clone(),
        });
        Ok(ShareSession(self, cancel))
    }
    // The command boundary validates the job's shelf scope before calling this.
    pub fn cancel_job(&self, job: i64) -> Result<bool> {
        let active = self.0.lock().map_err(|_| "分享状态不可用")?;
        if let Some(active) = active.as_ref()
            && active.job == Some(job)
        {
            active.cancel.store(true, Ordering::Release);
            return Ok(true);
        }
        Ok(false)
    }
    pub fn prepare_exit(&self) -> Result<()> {
        if self.0.lock().map_err(|_| "分享状态不可用")?.is_some() {
            Err("浏览器分享仍在进行，请先完成或在任务中心取消".into())
        } else {
            Ok(())
        }
    }
}
impl ShareSession<'_> {
    pub fn run_items(
        self,
        store: &Mutex<Store>,
        shelf: i64,
        ids: &[i64],
        program: &SenderProgram,
        connection: &Connection,
        notify: impl Fn(&[u8]),
    ) -> Result<Outcome> {
        if !(1..=16).contains(&ids.len()) {
            return Err("请选择1–16个文件".into());
        }
        let paths = {
            let db = store.lock().map_err(|_| "文件记录不可用")?;
            db.validate_item_scope(Some(shelf), ids)?;
            ids.iter()
                .map(|id| db.opening_target(*id))
                .collect::<Result<Vec<_>>>()?
        };
        let names = paths
            .iter()
            .map(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(str::to_owned)
                    .ok_or("文件名无法发送".to_string())
            })
            .collect::<Result<Vec<_>>>()?;
        let mut files = paths
            .iter()
            .map(|path| {
                let mut options = File::options();
                options.read(true);
                #[cfg(windows)]
                {
                    use std::os::windows::fs::OpenOptionsExt;
                    options.share_mode(1).custom_flags(0x00200000);
                }
                options
                    .open(path)
                    .map_err(|_| "文件被占用或无法安全读取".to_string())
            })
            .collect::<Result<Vec<_>>>()?;
        let mut sources = names
            .iter()
            .zip(files.iter_mut())
            .map(|(name, file)| Source { name, file })
            .collect::<Vec<_>>();
        self.run(store, shelf, program, connection, &mut sources, notify)
    }
    pub fn run(
        self,
        store: &Mutex<Store>,
        shelf: i64,
        program: &SenderProgram,
        connection: &Connection,
        sources: &mut [Source<'_>],
        notify: impl Fn(&[u8]),
    ) -> Result<Outcome> {
        run(
            store,
            shelf,
            program,
            connection,
            sources,
            &self.1,
            |job, line| {
                if let Ok(mut active) = self.0.0.lock()
                    && let Some(active) = active.as_mut()
                {
                    active.job = Some(job);
                }
                notify(line);
            },
        )
    }
}
impl Drop for ShareSession<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.0.0.lock() {
            *active = None;
        }
    }
}

pub fn run(
    store: &Mutex<Store>,
    shelf: i64,
    program: &SenderProgram,
    connection: &Connection,
    sources: &mut [Source<'_>],
    cancel: &AtomicBool,
    notify: impl Fn(i64, &[u8]),
) -> Result<Outcome> {
    let mut executable = File::open(&program.path).map_err(|_| "分享组件不存在")?;
    let mut hash = Sha256::new();
    std::io::copy(&mut executable, &mut hash).map_err(|_| "无法校验分享组件")?;
    if <[u8; 32]>::from(hash.finalize()) != program.sha256 {
        return Err("分享组件校验失败".into());
    }
    if !(1..=16).contains(&sources.len()) {
        return Err("请选择1–16个文件".into());
    }
    let snapshot = tempfile::tempdir().map_err(|_| "无法准备分享副本")?;
    let mut paths = Vec::new();
    for source in sources {
        let mut components = Path::new(source.name).components();
        if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
            return Err("分享文件名称无效".into());
        }
        if cancel.load(Ordering::Acquire) {
            return Err("分享已取消".into());
        }
        let path = snapshot.path().join(source.name);
        let mut target = File::options()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| "无法创建分享副本，请检查重名文件")?;
        source
            .file
            .seek(SeekFrom::Start(0))
            .map_err(|_| "无法读取分享文件")?;
        let bytes = std::io::copy(
            &mut (&mut *source.file).take(512 * 1024 * 1024 + 1),
            &mut target,
        )
        .map_err(|_| "无法读取分享文件")?;
        if bytes > 512 * 1024 * 1024 {
            return Err("单个文件暂不支持超过512MB".into());
        }
        paths.push(path);
    }
    let mut command = Command::new(&program.path);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|_| "无法启动分享组件")?;
    let result = (|| {
        let mut input = child.stdin.take().ok_or("分享组件输入不可用")?;
        serde_json::to_writer(
            &mut input,
            &Request {
                relay: &connection.relay,
                password: &connection.password,
                code: &connection.code,
                paths,
            },
        )
        .map_err(|_| "无法发送分享请求")?;
        input.write_all(b"\n").map_err(|_| "分享组件已退出")?;
        let output = child.stdout.take().ok_or("分享组件输出不可用")?;
        let (send, receive) = mpsc::sync_channel(2);
        let reader = std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = Vec::new();
                let read = Read::by_ref(&mut reader)
                    .take(1025)
                    .read_until(b'\n', &mut line);
                let item = match read {
                    Ok(0) => break,
                    Ok(_) if line.len() <= 1024 => Ok(line),
                    _ => Err(()),
                };
                if send.send(item).is_err() {
                    break;
                }
            }
        });
        let mut task = BrowserShareTask::default();
        let mut job = None;
        let mut stopping = None;
        let events: Result<()> = (|| {
            loop {
                if cancel.load(Ordering::Acquire) && stopping.is_none() {
                    input
                        .write_all(b"{\"cancel\":true}\n")
                        .map_err(|_| "分享组件已退出")?;
                    stopping = Some(Instant::now());
                }
                if stopping.is_some_and(|at: Instant| at.elapsed() > Duration::from_secs(5)) {
                    return Err("停止超时，分享组件将关闭".into());
                }
                match receive.recv_timeout(Duration::from_millis(50)) {
                    Ok(Ok(line)) => {
                        let accepted = task.accept(
                            &mut *store.lock().map_err(|_| "任务状态不可用")?,
                            shelf,
                            &line,
                        )?;
                        job = Some(accepted);
                        notify(accepted, &line);
                    }
                    Ok(Err(())) => return Err("分享组件事件无效".into()),
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
            }
            Ok(())
        })();
        drop(receive);
        if events.is_err() {
            let _ = child.kill();
        }
        let _ = child.wait();
        let _ = reader.join();
        task.exited(&mut *store.lock().map_err(|_| "任务状态不可用")?)?;
        events?;
        let id = job.ok_or("分享组件没有建立任务")?;
        let db = store.lock().map_err(|_| "任务状态不可用")?;
        let status = db
            .management_snapshot()?
            .jobs
            .into_iter()
            .find(|row| row.id == id)
            .ok_or("分享任务不存在")?
            .status;
        Ok(Outcome { job_id: id, status })
    })();
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}
