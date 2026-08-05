import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { can, getCurrentUser } from "@/lib/auth";
import { canSeeTask, getTaskRaw } from "@/lib/queries";
import { MAX_FILE_BYTES, extOf, kindForExt, mimeForExt } from "@/lib/storage-shared";

/**
 * Видає браузеру одноразовий токен, щоб він залив файл у Blob **напряму**.
 *
 * Через сервер вантажити не можна: Vercel рубає запити до функції на 4.5 МБ,
 * а моделі бувають десятки мегабайт. Права перевіряємо тут, до видачі токена,
 * і обмежуємо його одним конкретним шляхом та розміром.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Треба увійти");
        if (!can(user, "can_upload_files")) throw new Error("Немає права завантажувати файли");

        const ext = extOf(pathname);
        if (!kindForExt(ext)) throw new Error(`Формат .${ext || "?"} не підтримується`);

        // clientPayload — id задачі; порожній, коли файл чіпляють ще до її створення
        const taskId = Number(clientPayload) || null;
        if (taskId) {
          const task = await getTaskRaw(taskId);
          if (!task) throw new Error("Задачу не знайдено");
          if (!canSeeTask(user, task)) throw new Error("Немає доступу до задачі");
        } else if (!can(user, "can_create_tasks")) {
          throw new Error("Немає права створювати задачі");
        }

        return {
          allowedContentTypes: [mimeForExt(ext), "application/octet-stream"],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
      // Рядок у task_files створює вже сама сторінка (attachUploadedBlobs) —
      // так подія в історії й сповіщення йдуть від імені користувача.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не вдалося завантажити файл";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
