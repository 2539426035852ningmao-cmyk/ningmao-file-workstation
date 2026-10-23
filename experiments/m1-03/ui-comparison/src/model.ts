export type Asset = { id: string; name: string; type: string; bytes: number; date: string; group: string; tags: string[]; thumb: string; unavailable: boolean };
const names = ["春日企划_封面", "品牌色彩_探索", "产品手册_v03", "访谈_片段", "环境音_林间", "界面组件_整理", "材质_青蓝", "版式_参考"];
const types = ["png", "jpg", "pdf", "mp4", "wav", "fig", "png", "pdf"];
const groups = ["待整理", "设计参考", "项目交付"];
const palettes = [["#d7e6ef", "#457b9d", "#192f40"], ["#e8dfd0", "#b5976b", "#544a3e"], ["#e2e5db", "#6e8064", "#29382d"], ["#eee1dd", "#bc7b6b", "#523b38"]];

export function thumbnail(seed: number): string {
  const [bg, color, ink] = palettes[seed % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect width="240" height="180" fill="${bg}"/><rect x="20" y="20" width="200" height="140" fill="${color}"/><circle cx="${seed % 2 ? 150 : 90}" cy="90" r="52" fill="${bg}"/><path d="M20 140 L115 44 L220 140Z" fill="${ink}" opacity=".7"/><path d="M20 160H220" stroke="${ink}" stroke-width="8"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const thumbs = Array.from({ length: 8 }, (_, i) => thumbnail(i));
export function createAssets(count: number): Asset[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `asset-${String(i + 1).padStart(4, "0")}`,
    name: `${names[i % names.length]}_${String(Math.floor(i / 8) + 1).padStart(3, "0")}.${types[i % types.length]}`,
    type: types[i % types.length], bytes: 128_000 + (i * 7919) % 9_000_000,
    date: `2026-10-${String(23 - i % 14).padStart(2, "0")}`,
    group: groups[i % 3], tags: i % 4 === 0 ? ["精选", "蓝色"] : i % 3 === 0 ? ["精选"] : ["待核对"],
    thumb: thumbs[i % 8], unavailable: i === 17,
  }));
}
export function filterAssets(files: Asset[], query: string, group: string, tag = "all") {
  const text = query.trim().toLocaleLowerCase();
  return files.filter(file => (!text || file.name.toLocaleLowerCase().includes(text)) && (group === "all" || file.group === group) && (tag === "all" || file.tags.includes(tag)));
}
export function reorder(ids: string[], active: string, over: string): string[] {
  const from = ids.indexOf(active), to = ids.indexOf(over);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
}
export function sizeLabel(bytes: number) { return `${(bytes / 1_000_000).toFixed(1)} MB`; }
