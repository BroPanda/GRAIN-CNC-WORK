import { NextResponse } from "next/server";
import { consumeLoginToken, startSession } from "@/lib/auth";

/**
 * Перехід за посиланням із бота: гасимо одноразовий токен і відкриваємо сесію.
 * Route handler, а не сторінка, бо cookie можна ставити лише тут.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const userId = await consumeLoginToken(token);

  if (userId === null) {
    // посилання протухло або вже використане — назад до бота по нове
    return NextResponse.redirect(new URL("/login?error=token", request.url));
  }

  await startSession(userId);
  return NextResponse.redirect(new URL("/queue", request.url));
}
