/**
 * Номери телефонів зводимо до одного вигляду `+380671234567`, щоб «067 123 45 67»,
 * «+38 (067) 123-45-67» і те, що присилає Telegram, збігалися між собою.
 */

/** Формат зберігання: `+` і самі цифри. `null`, якщо номер не схожий на справжній. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 0671234567 → 380671234567 (український номер, записаний з нуля)
  const full = digits.length === 10 && digits.startsWith("0") ? `38${digits}` : digits;

  // коротше 8 цифр — це вже не номер; довше 15 — за межами міжнародного стандарту
  if (full.length < 8 || full.length > 15) return null;
  return `+${full}`;
}

/** Для показу: `+380671234567` → `+380 67 123 45 67`. Чужі формати лишаємо як є. */
export function formatPhone(phone: string): string {
  const m = /^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+380 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}
