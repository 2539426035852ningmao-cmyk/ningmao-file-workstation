//! Bounded, streaming PCM peaks. Decoder dependency is unmodified Symphonia 0.5.5 (MPL-2.0).
use crate::{Runtime, error, preview, shelf_windows, store::Result};
use serde::Serialize;
use std::{
    collections::VecDeque,
    fs::File,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};
use symphonia::core::{
    audio::SampleBuffer, codecs::DecoderOptions, errors::Error, formats::FormatOptions,
    io::MediaSourceStream, meta::MetadataOptions, probe::Hint,
};
use tauri::Manager;

#[derive(Clone, Serialize)]
pub struct Waveform {
    pub peaks: Vec<f32>,
    pub duration: f64,
}
type CacheKey = (std::path::PathBuf, u64, Option<SystemTime>);
pub struct Analysis {
    gate: Arc<tokio::sync::Semaphore>,
    cache: Mutex<VecDeque<(CacheKey, Waveform)>>,
}
impl Default for Analysis {
    fn default() -> Self {
        Self {
            gate: Arc::new(tokio::sync::Semaphore::new(1)),
            cache: Mutex::new(VecDeque::new()),
        }
    }
}

fn decode(file: File, extension: &str) -> Result<Waveform> {
    if file.metadata().map_err(error)?.len() > 512 * 1024 * 1024 {
        return Err("音频过大，暂不生成波形；仍可试听。".into());
    }
    let start = Instant::now();
    let mut hint = Hint::new();
    hint.with_extension(extension);
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let probe = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| "此音频暂不支持波形解析")?;
    let mut format = probe.format;
    let track = format.default_track().ok_or("没有可解析的音轨")?;
    let id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| "此音频编码暂不支持波形")?;
    let mut peaks = Vec::<f32>::new();
    let mut bucket = 256usize;
    let mut used = 0usize;
    let mut peak = 0.0f32;
    let mut frames = 0u64;
    let mut rate = 0u32;
    let mut samples: Option<SampleBuffer<f32>> = None;
    loop {
        if start.elapsed() > Duration::from_secs(12) {
            return Err("波形解析超时，仍可试听。".into());
        }
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(Error::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(_) => return Err("音频数据不完整，无法生成波形".into()),
        };
        if packet.track_id() != id {
            continue;
        }
        let decoded = decoder.decode(&packet).map_err(|_| "音频数据无法解码")?;
        let spec = *decoded.spec();
        let channels = spec.channels.count();
        if channels == 0
            || channels > 32
            || spec.rate == 0
            || decoded.capacity().saturating_mul(channels) > 1_048_576
        {
            return Err("音频参数超出波形解析范围".into());
        }
        if rate != 0 && rate != spec.rate {
            return Err("音频采样率变化，暂不生成波形".into());
        }
        rate = spec.rate;
        let capacity = decoded.capacity().saturating_mul(channels);
        if samples
            .as_ref()
            .is_none_or(|buffer| buffer.capacity() < capacity)
        {
            samples = Some(SampleBuffer::<f32>::new(decoded.capacity() as u64, spec));
        }
        let samples = samples.as_mut().ok_or("音频没有有效采样")?;
        samples.copy_interleaved_ref(decoded);
        for frame in samples.samples().chunks_exact(channels) {
            frames += 1;
            if frames > u64::from(rate) * 7200 {
                return Err("音频时长超出波形解析范围，仍可试听。".into());
            }
            for value in frame {
                if value.is_finite() {
                    peak = peak.max(value.abs().min(1.0));
                }
            }
            used += 1;
            if used == bucket {
                peaks.push(peak);
                peak = 0.0;
                used = 0;
                if peaks.len() == 2048 {
                    peaks = peaks
                        .as_chunks::<2>()
                        .0
                        .iter()
                        .map(|v| v[0].max(v[1]))
                        .collect();
                    bucket *= 2;
                }
            }
        }
    }
    if used > 0 {
        peaks.push(peak);
    }
    if frames == 0 || rate == 0 {
        return Err("音频没有有效采样".into());
    }
    Ok(Waveform {
        peaks,
        duration: frames as f64 / f64::from(rate),
    })
}

#[tauri::command]
pub async fn waveform_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: i64,
) -> Result<Waveform> {
    crate::trusted_native_origin(&window)?;
    let gate = app.state::<Runtime>().waveforms.gate.clone();
    let permit = gate.acquire_owned().await.map_err(error)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        if !window.is_visible().map_err(error)? {
            return Err("窗口已隐藏，波形请求取消".into());
        }
        let scope = shelf_windows::scope(&window)?;
        let runtime = app.state::<Runtime>();
        let path = {
            let s = runtime.store.lock().map_err(error)?;
            s.validate_item_scope(scope, &[id])?;
            s.opening_target(id)?
        };
        let file = preview::open(&path)?;
        let meta = file.metadata().map_err(error)?;
        let key = (path.clone(), meta.len(), meta.modified().ok());
        let verification = file.try_clone().map_err(error)?;
        if let Some((_, value)) = runtime
            .waveforms
            .cache
            .lock()
            .map_err(error)?
            .iter()
            .find(|(k, _)| k == &key)
        {
            return Ok(value.clone());
        }
        let value = decode(
            file,
            path.extension().and_then(|s| s.to_str()).unwrap_or(""),
        )?;
        let after = verification.metadata().map_err(error)?;
        if after.len() != key.1 || after.modified().ok() != key.2 {
            return Err("音频在解析期间已变化，请重新打开。".into());
        }
        let s = runtime.store.lock().map_err(error)?;
        s.validate_item_scope(scope, &[id])?;
        s.validate_opening_target(id, &path)?;
        drop(s);
        let mut cache = runtime.waveforms.cache.lock().map_err(error)?;
        if cache.len() >= 32 {
            cache.pop_front();
        }
        cache.push_back((key, value.clone()));
        Ok(value)
    })
    .await
    .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_pcm_peaks_distinguish_silence_and_signal_without_changing_source() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("signal.wav");
        let samples: Vec<i16> = (0..8192)
            .map(|i| if i < 4096 { 0 } else { 16384 })
            .collect();
        let mut bytes = b"RIFF".to_vec();
        bytes.extend((36 + samples.len() as u32 * 2).to_le_bytes());
        bytes.extend(b"WAVEfmt ");
        bytes.extend(16u32.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(1u16.to_le_bytes());
        bytes.extend(8192u32.to_le_bytes());
        bytes.extend(16384u32.to_le_bytes());
        bytes.extend(2u16.to_le_bytes());
        bytes.extend(16u16.to_le_bytes());
        bytes.extend(b"data");
        bytes.extend((samples.len() as u32 * 2).to_le_bytes());
        for s in samples {
            bytes.extend(s.to_le_bytes());
        }
        std::fs::write(&path, &bytes).unwrap();
        let wave = decode(File::open(&path).unwrap(), "wav").unwrap();
        assert_eq!(wave.duration, 1.0);
        assert!(wave.peaks[..16].iter().all(|p| *p == 0.0));
        assert!(wave.peaks[16..].iter().all(|p| (*p - 0.5).abs() < 0.001));
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }
}
