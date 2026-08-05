import type { FileKind } from "./types";

/** Розширення, які показуються у вбудованому 3D-вьювері. */
export const VIEWABLE_MODEL_EXT = ["stl", "obj", "3mf", "glb", "gltf", "ply"] as const;

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"];

const DOC_EXT = [
  // CAD/CAM та вектор — без перегляду, тільки завантаження
  "step", "stp", "iges", "igs", "sldprt", "sldasm", "ipt", "f3d", "f3z", "3dm",
  "dxf", "dwg", "ai", "cdr", "eps", "svg", "pdf", "nc", "gcode", "tap", "mpf",
  "zip", "rar", "7z", "txt", "csv", "xlsx", "docx",
];

export const ACCEPT_ATTR = [...IMAGE_EXT, ...VIEWABLE_MODEL_EXT, ...DOC_EXT]
  .map((e) => `.${e}`)
  .join(",");

export const MAX_FILE_BYTES = 60 * 1024 * 1024;

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function kindForExt(ext: string): FileKind | null {
  if (IMAGE_EXT.includes(ext)) return "image";
  if ((VIEWABLE_MODEL_EXT as readonly string[]).includes(ext)) return "model";
  if (DOC_EXT.includes(ext)) return "doc";
  return null;
}

export function isViewableModel(ext: string): boolean {
  return (VIEWABLE_MODEL_EXT as readonly string[]).includes(ext.toLowerCase());
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  stl: "model/stl",
  obj: "text/plain",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  "3mf": "model/3mf",
  ply: "application/octet-stream",
};

export function mimeForExt(ext: string): string {
  return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
