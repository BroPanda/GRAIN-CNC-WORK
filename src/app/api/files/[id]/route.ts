import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeTask, getTaskRaw } from "@/lib/queries";
import { queryOne } from "@/lib/db";
import { mimeForExt, taskDir } from "@/lib/storage";
import type { TaskFile } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Не авторизовано", { status: 401 });

  const { id } = await params;
  const file = queryOne<TaskFile>("SELECT * FROM task_files WHERE id = ?", Number(id));
  if (!file) return new NextResponse("Не знайдено", { status: 404 });

  const task = getTaskRaw(file.task_id);
  if (!task || !canSeeTask(user, task)) {
    return new NextResponse("Немає доступу", { status: 403 });
  }

  const full = path.join(taskDir(file.task_id), file.stored_name);
  if (!fs.existsSync(full)) return new NextResponse("Файл відсутній на диску", { status: 410 });

  const download = new URL(request.url).searchParams.has("download");
  const body = fs.readFileSync(full);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": mimeForExt(file.ext),
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(
        file.original_name
      )}`,
    },
  });
}
