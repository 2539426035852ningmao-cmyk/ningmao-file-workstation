import { File, FileArchive, FileAudio, FileImage, FileVideo, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { classifyFile } from "./file-utils.mjs";
import { isAnimalAvatar, photoAvatarId } from "./animal-avatars.mjs";
import { AnimalAvatar } from "./AnimalAvatar";

const icons = { image: FileImage, video: FileVideo, audio: FileAudio, archive: FileArchive, document: File };
const roomHues = [220, 22, 158, 280, 54];

export function RoomAvatar({ id, slot, avatar, room }: { id?: string; slot?: number; avatar?: string | null; room?: string }) {
  const [failedPhoto, setFailedPhoto] = useState("");
  const fallbackHue = id && /^[a-f0-9]{24}$/.test(id) ? parseInt(id.slice(0, 4), 16) % 360 : 225;
  const hue = slot === undefined ? fallbackHue : roomHues[slot % roomHues.length];
  const photo = avatar && photoAvatarId.test(avatar)
    ? `${room ? "/api/rooms/" + encodeURIComponent(room) : "/api/account"}/avatar/${avatar}` : "";
  return <span className="room-avatar" aria-hidden="true"
    style={{ backgroundColor: `hsl(${hue} 72% 87%)`, color: `hsl(${hue} 68% 25%)` }}>
    {isAnimalAvatar(avatar) ? <AnimalAvatar animal={avatar} />
      : photo && failedPhoto !== photo ? <img src={photo} alt="" onError={() => setFailedPhoto(photo)} />
      : <UserRound size={15} fill="currentColor" />}
  </span>;
}

export function RoomFileIcon({ name, file, alt = "" }: { name: string; file?: File | null; alt?: string }) {
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  const [failedUrl, setFailedUrl] = useState("");
  useEffect(() => {
    if (!file || file.size > 12 * 1024 ** 2 || !/\.(png|jpe?g|webp|gif|avif)$/i.test(name)) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file, name]);
  const thumbnail = preview && preview.file === file ? preview.url : undefined;
  const Icon = icons[classifyFile(name)];
  return <span className="room-file-icon">
    {thumbnail && thumbnail !== failedUrl ? <img src={thumbnail} alt={alt} onError={() => setFailedUrl(thumbnail)} />
      : <Icon size={19} aria-hidden="true" />}
  </span>;
}

type Recipient = { id: string; name: string; avatarSlot: number; avatar?: string };

export function RoomRecipients({ members, recipients, select, enabled, disabled, room }: {
  members: Recipient[];
  recipients: string[] | null;
  select: (value: string[] | null) => void;
  enabled: boolean;
  disabled: boolean;
  room: string;
}) {
  const chosen = members.filter(member => recipients?.includes(member.id));
  return <fieldset className="room-recipient-scope" disabled={disabled}>
    <label>发送范围<select value={recipients === null ? "all" : "selected"}
      onChange={event => select(event.target.value === "all" ? null : [])}>
      <option value="all">发给全区</option>
      <option value="selected" disabled={!enabled || members.length === 0}>选择成员</option>
    </select></label>
    {recipients !== null && <>
      <div className="room-recipient-list" role="group" aria-label="选择收件人">
        {members.map(member => <label key={member.id}>
          <input type="checkbox" checked={recipients.includes(member.id)}
            onChange={event => select(event.target.checked
              ? [...recipients, member.id] : recipients.filter(id => id !== member.id))} />
          <RoomAvatar id={member.id} slot={member.avatarSlot} avatar={member.avatar} room={room} /><span>{member.name}</span>
        </label>)}
      </div>
      {!enabled ? <p>当前站点暂不支持指定收件人。</p>
        : chosen.length !== recipients.length ? <button type="button" onClick={() => select([])}>有成员已离群，重新选择</button>
        : chosen.length > 0 ? <p>发给 {chosen.map(member => member.name).join("、")}</p>
        : <p>请至少选择一位收件人。</p>}
    </>}
  </fieldset>;
}
