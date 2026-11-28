import { File, FileArchive, FileAudio, FileImage, FileVideo, UserRound } from "lucide-react";
import { useState } from "react";
import { classifyFile } from "./file-utils.mjs";

const icons = { image: FileImage, video: FileVideo, audio: FileAudio, archive: FileArchive, document: File };

export function RoomAvatar({ id }: { id?: string }) {
  const hue = id && /^[a-f0-9]{24}$/.test(id) ? parseInt(id.slice(0, 4), 16) % 360 : 225;
  return <span className="room-avatar" aria-hidden="true"
    style={{ backgroundColor: `hsl(${hue} 72% 87%)`, color: `hsl(${hue} 68% 25%)` }}>
    <UserRound size={15} fill="currentColor" />
  </span>;
}

export function RoomFileIcon({ name, thumbnail }: { name: string; thumbnail?: string | null }) {
  const [failed, setFailed] = useState(false);
  const Icon = icons[classifyFile(name)];
  return <span className="room-file-icon">
    {thumbnail && !failed ? <img src={thumbnail} alt="所选文件的缩略图" onError={() => setFailed(true)} />
      : <Icon size={19} aria-hidden="true" />}
  </span>;
}

type Recipient = { id: string; name: string };

export function RoomRecipients({ members, recipients, select, enabled, disabled }: {
  members: Recipient[];
  recipients: string[] | null;
  select: (value: string[] | null) => void;
  enabled: boolean;
  disabled: boolean;
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
          <RoomAvatar id={member.id} /><span>{member.name}</span>
        </label>)}
      </div>
      {!enabled ? <p>当前站点暂不支持指定收件人。</p>
        : chosen.length !== recipients.length ? <button type="button" onClick={() => select([])}>有成员已离群，重新选择</button>
        : chosen.length > 0 ? <p>发给 {chosen.map(member => member.name).join("、")}</p>
        : <p>请至少选择一位收件人。</p>}
    </>}
  </fieldset>;
}
