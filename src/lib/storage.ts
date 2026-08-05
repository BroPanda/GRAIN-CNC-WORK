import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MAX_FILE_BYTES, extOf, kindForExt } from "./storage-shared";
import type { FileKind } from "./types";

export * from "./storage-shared";

export const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");

export function taskDir(taskId: number): string {
  return path.join(UPLOAD_ROOT, String(taskId));
}

export async function saveUploadedFile(
  taskId: number,
  file: File
): Promise<{ storedName: string; ext: string; size: number; kind: FileKind }> {
  const ext = extOf(file.name);
  const kind = kindForExt(ext);
  if (!kind) throw new Error(`Формат .${ext || "?"} не підтримується`);
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Файл «${file.name}» більший за 60 МБ`);
  }

  const dir = taskDir(taskId);
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, storedName), buf);
  return { storedName, ext, size: buf.byteLength, kind };
}

export function deleteStoredFile(taskId: number, storedName: string): void {
  // не даємо вилізти за межі каталогу задачі
  const root = path.resolve(taskDir(taskId));
  const target = path.resolve(root, storedName);
  if (!target.startsWith(root + path.sep)) return;
  fs.rmSync(target, { force: true });
}
