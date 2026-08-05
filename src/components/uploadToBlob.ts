"use client";

import type { UploadedBlob } from "@/lib/actions";
import { MAX_FILE_BYTES, humanSize } from "@/lib/storage-shared";

/** Понад цей розмір файл ріжеться на частини й вантажиться паралельно. */
const MULTIPART_FROM = 8 * 1024 * 1024;

/**
 * Вантажить файли з браузера **напряму** у Blob-сховище.
 *
 * Через сервер не можна: Vercel обмежує тіло запиту до функції 4.5 МБ, а
 * STL-моделі бувають у рази більші. Дозвіл на запис видає /api/blob-upload
 * після перевірки прав, тож повз права так само нічого не пройде.
 */
export async function uploadToBlob(
  files: File[],
  taskId: number | null,
  onProgress?: (done: number, total: number) => void
): Promise<UploadedBlob[]> {
  const { upload } = await import("@vercel/blob/client");
  const uploaded: UploadedBlob[] = [];

  for (const [i, file] of files.entries()) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`Файл «${file.name}» більший за ${humanSize(MAX_FILE_BYTES)}`);
    }
    onProgress?.(i, files.length);

    const blob = await upload(`tasks/${taskId ?? "new"}/${file.name}`, file, {
      access: "private",
      handleUploadUrl: "/api/blob-upload",
      clientPayload: taskId ? String(taskId) : "",
      multipart: file.size > MULTIPART_FROM,
    });
    uploaded.push({ url: blob.url, name: file.name });
  }

  onProgress?.(files.length, files.length);
  return uploaded;
}
