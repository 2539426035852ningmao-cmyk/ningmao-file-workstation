export function formatBytes(bytes: number): string;
export function classifyFile(name: string): "image" | "video" | "audio" | "archive" | "document";
export function totalSize(files: {size: number}[]): number;
