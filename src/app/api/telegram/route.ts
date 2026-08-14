import { NextResponse } from "next/server";
import { createLoginToken } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import {
  ASK_CONTACT_KEYBOARD,
  REMOVE_KEYBOARD,
  appUrl,
  botToken,
  sendMessage,
  webhookSecret,
} from "@/lib/telegram";
import { ROLE_LABELS } from "@/lib/types";
import type { Role } from "@/lib/types";

/**
 * Вебхук Telegram-бота — єдиний спосіб потрапити в задачник на проді.
 *
 * Як це працює:
 *   1. Власник заздалегідь вписує людину в розділі «Команда»: імʼя, номер, роль.
 *   2. Людина відкриває бота і тисне «Поділитися номером». Номер підставляє сам
 *      Telegram зі свого акаунта — вписати чужий вручну не можна.
 *   3. Якщо номер є в команді — бот присилає одноразове посилання для входу.
 *      Якщо немає — просто відмова, жодних натяків, хто є в команді.
 */

interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TgUpdate {
  message?: {
    chat?: { id: number };
    from?: TgUser;
    text?: string;
    contact?: { phone_number?: string; user_id?: number };
  };
}

const HELP =
  "Це бот задачника <b>FREZALVIV</b>.\n\n" +
  "Щоб увійти, підтвердьте свій номер телефону — кнопкою нижче. " +
  "Номер бачить лише керівництво, воно ж заздалегідь додає вас у команду.";

export async function POST(request: Request) {
  // без токена бот не працює зовсім — не тримаємо відкритий ендпоінт
  if (!botToken()) return new NextResponse("Бот не налаштований", { status: 404 });

  // Telegram повертає наш секрет у заголовку — так відсікаємо сторонні запити
  const secret = webhookSecret();
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new NextResponse("Чужий запит", { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Telegram повторює доставку, поки не отримає 200, тому свої помилки ковтаємо
  try {
    await handle(update);
  } catch (e) {
    console.error("Telegram webhook:", e);
  }
  return NextResponse.json({ ok: true });
}

async function handle(update: TgUpdate): Promise<void> {
  const msg = update.message;
  const chatId = msg?.chat?.id;
  if (!msg || !chatId) return;

  if (msg.contact) {
    await handleContact(chatId, msg.contact, msg.from);
    return;
  }

  // будь-який текст (у тому числі /start) → пропозиція підтвердити номер
  if (msg.text) await sendMessage(chatId, HELP, ASK_CONTACT_KEYBOARD);
}

async function handleContact(
  chatId: number,
  contact: { phone_number?: string; user_id?: number },
  from: TgUser | undefined
): Promise<void> {
  // чужий контакт із записника не приймаємо — тільки свій власний номер
  if (!from || contact.user_id !== from.id) {
    await sendMessage(
      chatId,
      "Це чужий контакт. Натисніть кнопку «Поділитися номером» — Telegram надішле саме ваш номер.",
      ASK_CONTACT_KEYBOARD
    );
    return;
  }

  const phone = normalizePhone(contact.phone_number ?? "");
  if (!phone) {
    await sendMessage(chatId, "Не вдалося прочитати номер. Спробуйте ще раз.", ASK_CONTACT_KEYBOARD);
    return;
  }

  const member = await queryOne<{ id: number; name: string; role: Role }>(
    "SELECT id, name, role FROM users WHERE phone = ? AND is_active = 1",
    phone
  );

  if (!member) {
    await sendMessage(
      chatId,
      "Цього номера немає серед співробітників FREZALVIV.\n\n" +
        "Попросіть керівництво додати вас у розділі «Команда» — і натисніть кнопку ще раз.",
      REMOVE_KEYBOARD
    );
    return;
  }

  // запамʼятовуємо акаунт: далі бот зможе слати цій людині сповіщення про задачі
  await run(
    "UPDATE users SET telegram_id = ?, telegram_username = COALESCE(?, telegram_username) WHERE id = ?",
    from.id,
    from.username ?? null,
    member.id
  );

  const token = await createLoginToken(member.id);
  await sendMessage(
    chatId,
    `Вітаємо, <b>${escapeHtml(member.name)}</b>!\n` +
      `Роль: ${ROLE_LABELS[member.role]}\n\n` +
      "Посилання діє 15 хвилин і лише один раз.",
    REMOVE_KEYBOARD
  );
  await sendMessage(chatId, "Відкрийте задачник:", {
    inline_keyboard: [
      [{ text: "🔓 Увійти в задачник", url: `${appUrl()}/login/tg?token=${token}` }],
    ],
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
