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
