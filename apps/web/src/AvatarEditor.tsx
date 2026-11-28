import { Check, ImageUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimalAvatar } from "./AnimalAvatar";
import { animals, avatarSize, defaultAnimalAvatar } from "./animal-avatars.mjs";
import { RoomAvatar } from "./RoomVisuals";
import "./avatars.css";

type Photo = { preview: string; pixels: ArrayBuffer };
export type AvatarInput = { preset: string | null } | ArrayBuffer;
const imageTypes = ["image/jpeg", "image/png", "image/webp"];

async function preparePhoto(file: File): Promise<Photo> {
  if (!imageTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error("请选择不超过 10 MB 的 JPG、PNG 或 WebP 图片。");
  }
  const source = await createImageBitmap(file).catch(() => { throw new Error("无法读取这张图片，请更换一张。"); });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = avatarSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理头像图片。");
    const edge = Math.min(source.width, source.height);
    context.drawImage(source, (source.width - edge) / 2, (source.height - edge) / 2, edge, edge,
      0, 0, avatarSize, avatarSize);
    return { preview: canvas.toDataURL("image/png"), pixels: new Uint8Array(context.getImageData(0, 0, avatarSize, avatarSize).data).buffer };
  } finally {
    source.close();
  }
}

export function AvatarEditor({ id, avatar, save, close }: {
  id: string; avatar?: string; save: (value: AvatarInput) => Promise<void>; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(avatar ?? null);
  const [photo, setPhoto] = useState<Photo>();
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const shown = selected ?? defaultAnimalAvatar(id);
  const changed = photo || selected !== (avatar ?? null);

  useEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal(); }, []);

  function choose(preset: string | null) {
    setSelected(preset);
    setPhoto(undefined);
    setError("");
  }

  async function upload(file: File) {
    setReading(true);
    setError("");
    try { setPhoto(await preparePhoto(file)); }
    catch (failure) { setError((failure as Error).message); }
    finally { setReading(false); }
  }

  async function apply() {
    if (!changed || reading || saving) return;
    setSaving(true);
    setError("");
    try {
      await save(photo?.pixels ?? { preset: selected });
      dialog.current?.close();
    } catch (failure) {
      setError(failure instanceof TypeError ? "暂时无法连接站点，请重试。" : (failure as Error).message);
    } finally { setSaving(false); }
  }

  return <dialog className="avatar-editor" aria-labelledby="avatar-editor-title" ref={dialog}
    onClose={close} onCancel={event => { if (saving) event.preventDefault(); }}>
    <div className="avatar-editor-head">
      <h2 id="avatar-editor-title">更改头像</h2>
      <button type="button" className="avatar-close" aria-label="关闭" autoFocus disabled={saving}
        onClick={() => dialog.current?.close()}><X size={19} aria-hidden /></button>
    </div>
    <div className="avatar-editor-preview">
      {photo ? <img src={photo.preview} alt="待保存的头像" /> : <RoomAvatar avatar={shown} />}
      <div className="avatar-editor-upload">
        <label><ImageUp size={17} aria-hidden /><span>上传图片</span>
          <input type="file" accept={imageTypes.join(",")} disabled={reading || saving} onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }} /></label>
        <p className="room-note">{reading ? "正在准备预览…" : "JPG、PNG 或 WebP。图片将居中裁成方形。"}</p>
      </div>
    </div>
    {error && <p className="room-feedback" role="alert">{error}</p>}
    <div className="avatar-grid" role="group" aria-label="内置动物头像">
      {animals.map(([animal, name]) => {
        const active = !photo && shown === animal;
        return <button key={animal} type="button" aria-pressed={active} disabled={reading || saving} onClick={() => choose(animal)}>
          <span className="avatar-tile"><AnimalAvatar animal={animal} />
            {active && <span className="avatar-chosen"><Check size={11} aria-hidden /></span>}</span>
          <span>{name}</span>
        </button>;
      })}
    </div>
    <div className="avatar-editor-actions">
      <button type="button" disabled={reading || saving || (!avatar && !selected && !photo)} onClick={() => choose(null)}>恢复默认头像</button>
      <button type="button" className="room-primary" disabled={!changed || reading || saving} onClick={() => void apply()}>
        {saving ? "正在保存…" : "保存头像"}
      </button>
    </div>
  </dialog>;
}
