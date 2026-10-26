import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
export type Shelf = { id: number; name: string; kind: "persistent" | "session" | "bound"; root: string | null; available: boolean };
export type Item = { id: number; shelf_id: number; path: string; name: string; kind: string; bytes: number; modified: number; status: string; tags: string[] };
export type Job = { id: number; shelf_id: number; status: string; message: string; staging: string | null };
export type Snapshot = { shelves: Shelf[]; items: Item[]; jobs: Job[] };
export type Progress = { job_id: number; name: string; file_index: number; file_count: number; bytes: number; total: number };
export type ImportResult = { added: number; job_id: number | null; errors: string[] };
export type Events = { drop: (paths: string[]) => void; hover: (active: boolean) => void; progress: (p: Progress) => void; finished: (message: string) => void; drag: (message: string) => void };
export interface Backend {
  snapshot(): Promise<Snapshot>;
  chooseFiles(): Promise<string[]>;
  chooseFolder(): Promise<number | null>;
  importPaths(shelf: number, paths: string[]): Promise<ImportResult>;
  remove(id: number): Promise<void>;
  relocate(id: number, directory: boolean): Promise<boolean>;
  tags(id: number, tags: string[]): Promise<void>;
  reorder(shelf: number, ids: number[]): Promise<void>;
  thumbnail(id: number): Promise<string | null>;
  drag(ids: number[]): Promise<void>;
  open(id: number): Promise<boolean>;
  reveal(id: number): Promise<void>;
  cancel(id: number): Promise<void>;
  topmost(): Promise<boolean>;
  quit(): Promise<void>;
  subscribe(events: Events): Promise<() => void>;
}
export const nativeBackend: Backend = {
  snapshot: () => isTauri() ? invoke("snapshot") : Promise.reject("请启动 Windows 应用；浏览器预览不能读取本地文件。"),
  chooseFiles: () => invoke("choose_files"), chooseFolder: () => invoke("choose_folder"),
  importPaths: (shelfId, paths) => invoke("import_paths", { shelfId, paths }),
  remove: id => invoke("remove_reference", { id }), tags: (id,tags) => invoke("set_tags", { id,tags }),
  relocate: (id,directory) => invoke("relocate_reference", { id,directory }),
  reorder: (shelfId,ids) => invoke("reorder", { shelfId,ids }), thumbnail: id => invoke("thumbnail", { id }),
  drag: ids => invoke("start_native_drag", { ids }), reveal: id => invoke("reveal_item", { id }),
  open: id => invoke("open_item", { id }),
  cancel: jobId => invoke("cancel_copy", { jobId }), topmost: () => invoke("toggle_topmost"), quit: () => invoke("quit"),
  async subscribe(events) {
    if (!isTauri()) return () => {};
    const cleanups: (() => void)[] = [];
    try {
      cleanups.push(await getCurrentWebviewWindow().onDragDropEvent(event => {
        const payload=event.payload;
        events.hover(payload.type === "enter" || payload.type === "over");
        if (payload.type === "drop") events.drop(payload.paths);
      }));
      cleanups.push(await listen<Progress>("copy-progress", event => events.progress(event.payload)));
      cleanups.push(await listen<{message:string}>("copy-finished", event => events.finished(event.payload.message)));
      cleanups.push(await listen<string>("native-drag-result", event => events.drag(event.payload)));
      return () => cleanups.forEach(fn => fn());
    } catch (error) { cleanups.forEach(fn => fn()); throw error; }
  },
};
