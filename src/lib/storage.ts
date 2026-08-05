import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MAX_FILE_BYTES, extOf, kindForExt, mimeForExt } from "./storage-shared";
import type { FileKind } from "./types";

export * from "./storage-shared";

/**
 * Два режими зберігання:
 *  • є BLOB_READ_WRITE_TOKEN (Vercel) — файли летять у Vercel Blob, у БД
 *    зберігається їх URL;
 *  • немає (локальна розробка) — файли лежать у data/uploads/<id задачі>/,
 *    у БД зберігається імʼя файлу.
 * У обох випадках назовні файл віддає лише /api/files/[id] після перевірки
 * прав, тому пряме посилання на сховище клієнту не потрапляє.
 */
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");

export function taskDir(taskId: number): string {
  return path.join(UPLOAD_ROOT, String(taskId));
}

export interface SavedFile {
  storedName: string;
  ext: string;
  size: number;
  kind: FileKind;
}

export async function saveUploadedFile(taskId: number, file: File): Promise<SavedFile> {
  const ext = extOf(file.name);
  const kind = kindForExt(ext);
  if (!kind) throw new Error(`Формат .${ext || "?"} не підтримується`);
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Файл «${file.name}» більший за 60 МБ`);
  }

  const buf = Buffer.from(await file.arrayBuffer());

  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`tasks/${taskId}/${crypto.randomUUID()}.${ext}`, buf, {
      access: "public", // URL не публікується — файл віддає наш роут з перевіркою прав
      addRandomSuffix: true,
      contentType: mimeForExt(ext),
    });
    return { storedName: blob.url, ext, size: buf.byteLength, kind };
  }

  const dir = taskDir(taskId);
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, storedName), buf);
  return { storedName, ext, size: buf.byteLength, kind };
}

export async function deleteStoredFile(taskId: number, storedName: string): Promise<void> {
  if (storedName.startsWith("http")) {
    const { del } = await import("@vercel/blob");
    await del(storedName).catch(() => {});
    return;
  }
  // не даємо вилізти за межі каталогу задачі
  const root = path.resolve(taskDir(taskId));
  const target = path.resolve(root, storedName);
  if (!target.startsWith(root + path.sep)) return;
  fs.rmSync(target, { force: true });
}

/** Вміст файлу для віддачі клієнту; null — якщо файл зник зі сховища. */
export async function readStoredFile(
  taskId: number,
  storedName: string
): Promise<ArrayBuffer | null> {
  if (storedName.startsWith("http")) {
    const res = await fetch(storedName);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  }
  const full = path.join(taskDir(taskId), storedName);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
