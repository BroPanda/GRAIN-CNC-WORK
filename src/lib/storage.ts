import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MAX_FILE_BYTES, extOf, kindForExt, mimeForExt } from "./storage-shared";
import type { FileKind } from "./types";

export * from "./storage-shared";

/**
 * Два режими зберігання:
 *  • хмара — файли летять у Vercel Blob, у БД зберігається їх URL;
 *  • локальна розробка — файли лежать у data/uploads/<id задачі>/,
 *    у БД зберігається імʼя файлу.
 * У обох випадках назовні файл віддає лише /api/files/[id] після перевірки
 * прав, тому пряме посилання на сховище клієнту не потрапляє.
 *
 * Vercel авторизує сховище двома способами, і трапляються обидва:
 *  • BLOB_READ_WRITE_TOKEN — класичний токен;
 *  • BLOB_STORE_ID + VERCEL_OIDC_TOKEN — нова інтеграція, токен у змінних
 *    проєкту не показується взагалі.
 */
const useBlob = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/**
 * Чи може браузер вантажити файли напряму у сховище (в обхід ліміту Vercel
 * на 4.5 МБ). Потрібен саме read-write токен: лише ним бібліотека вміє
 * підписати одноразовий дозвіл для браузера, OIDC для цього не годиться.
 * Без нього все одно працює — але через сервер і з лімітом 4.5 МБ.
 */
export const directUploadEnabled = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

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
      // private: пряме посилання на сховище нічого не віддасть навіть якщо
      // витече — файл доступний лише через /api/files/[id] з перевіркою прав
      access: "private",
      addRandomSuffix: true,
      contentType: mimeForExt(ext),
    });
    return { storedName: blob.url, ext, size: buf.byteLength, kind };
  }

  // У хмарі писати на диск нема куди — файлова система там тимчасова й
  // доступна лише на читання. Краще сказати це прямо, ніж ENOENT з надр fs.
  if (process.env.VERCEL) {
    throw new Error(
      "Сховище файлів не підключене: у проєкті немає ні BLOB_READ_WRITE_TOKEN, " +
        "ні BLOB_STORE_ID. Підключіть Blob-сховище у Vercel → Storage і передеплойте."
    );
  }

  const dir = taskDir(taskId);
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, storedName), buf);
  return { storedName, ext, size: buf.byteLength, kind };
}

/**
 * Перевіряє, що URL справді вказує на файл у нашому сховищі, і повертає
 * його розмір. Потрібно тому, що після завантаження напряму з браузера
 * сервер бачить лише URL — на слово йому вірити не можна.
 */
export async function statBlob(url: string): Promise<{ size: number } | null> {
  if (!useBlob()) return null;
  const { head } = await import("@vercel/blob");
  try {
    const info = await head(url);
    return { size: info.size };
  } catch {
    return null;
  }
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
    const { get } = await import("@vercel/blob");
    // приватний файл — звичайний fetch по URL його не віддасть, потрібен токен
    const res = await get(storedName, { access: "private" }).catch(() => null);
    if (!res || res.statusCode !== 200) return null;
    return await new Response(res.stream).arrayBuffer();
  }
  const full = path.join(taskDir(taskId), storedName);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
