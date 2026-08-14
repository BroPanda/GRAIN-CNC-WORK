/**
 * Наш Telegram-бот: приймає від людини підтверджений номер телефону і у
 * відповідь дає одноразове посилання для входу в задачник.
 *
 * Змінні оточення (див. README, розділ «Вхід через Telegram»):
 *   TELEGRAM_BOT_TOKEN     — токен від @BotFather
 *   TELEGRAM_BOT_USERNAME  — імʼя бота без @ (для кнопки на /login)
 *   TELEGRAM_WEBHOOK_SECRET— свій рядок; Telegram повертає його у заголовку
 *   APP_URL                — адреса сайту (на Vercel підставиться сама)
 */

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function botUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null;
}

/** Бот вважається підключеним, лише коли є і токен, і імʼя для кнопки. */
export function botConfigured(): boolean {
  return Boolean(botToken() && botUsername());
}

export function webhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET || null;
}

/** Адреса сайту без косої риски в кінці. */
export function appUrl(): string {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

type Json = Record<string, unknown>;

/** Виклик Bot API. Помилку не кидаємо назовні — вебхук має відповісти 200. */
export async function tgApi(method: string, payload: Json): Promise<boolean> {
  const token = botToken();
  if (!token) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) console.error(`Telegram ${method}: ${data.description ?? res.status}`);
    return Boolean(data.ok);
  } catch (e) {
    console.error(`Telegram ${method}:`, e);
    return false;
  }
}

export function sendMessage(chatId: number, text: string, replyMarkup?: Json): Promise<boolean> {
  return tgApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

/** Клавіатура з єдиною кнопкою «поділитися номером» — номер бере сам Telegram. */
export const ASK_CONTACT_KEYBOARD: Json = {
  keyboard: [[{ text: "📱 Поділитися номером", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

/** Прибрати клавіатуру після того, як номер уже отримано. */
export const REMOVE_KEYBOARD: Json = { remove_keyboard: true };
