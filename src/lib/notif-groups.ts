/**
 * Розкладка сповіщень по вкладках. Свідомо без імпортів з db/notify —
 * цей файл потрібен і на сервері (SQL-фільтри), і в браузері (звуки, підписи).
 */

export const NOTIF_GROUPS = [
  "all",
  "comment",
  "created",
  "done",
  "rework",
  "taken",
  "files",
  "other",
] as const;

export type NotifGroup = (typeof NOTIF_GROUPS)[number];
/** Вкладка, у яку реально лягає сповіщення («всі» — це зріз, а не кошик). */
export type NotifBucket = Exclude<NotifGroup, "all">;

export const NOTIF_GROUP_LABELS: Record<NotifGroup, string> = {
  all: "Всі",
  comment: "Повідомлення",
  created: "Створені",
  done: "Виконано",
  rework: "Доопрацювання",
  taken: "Взято в роботу",
  files: "Файли",
  other: "Інше",
};

/** Значок категорії — однаковий у застосунку й у повідомленнях бота. */
export const NOTIF_GROUP_ICON: Record<NotifBucket, string> = {
  comment: "💬",
  created: "🆕",
  done: "✅",
  rework: "🔁",
  taken: "▶️",
  files: "📎",
  other: "🔔",
};

/** Короткі підписи для вузьких екранів. */
export const NOTIF_GROUP_SHORT: Record<NotifGroup, string> = {
  all: "Всі",
  comment: "Повідом.",
  created: "Створені",
  done: "Виконано",
  rework: "Доопрац.",
  taken: "В роботі",
  files: "Файли",
  other: "Інше",
};

const BUCKET_TYPES: Record<Exclude<NotifBucket, "other">, string[]> = {
  comment: ["comment"],
  created: ["created"],
  done: ["done"],
  rework: ["rework"],
  taken: ["taken"],
  files: ["files_added", "file_deleted"],
};

/** Усе, що не має власної вкладки (закріплення, скасування, повернення…). */
const NAMED_TYPES = Object.values(BUCKET_TYPES).flat();

export function bucketForType(type: string): NotifBucket {
  const hit = (Object.keys(BUCKET_TYPES) as (keyof typeof BUCKET_TYPES)[]).find((bucket) =>
    BUCKET_TYPES[bucket].includes(type)
  );
  return hit ?? "other";
}

/** Людина свідомо вимкнула всі категорії — не плутати з «ще не налаштовував». */
export const TG_NONE = "none";

/**
 * Категорії, які людина отримує в Telegram. У базі це рядок через кому.
 *
 * Порожньо або «all» — усе: новачок має отримувати сповіщення з першого дня,
 * не шукаючи, де їх увімкнути. Щоб «нічого» відрізнялося від «ще не чіпав»,
 * повне вимкнення пишеться окремим словом «none» — інакше ті, кому колонку
 * додала міграція, назавжди лишились би без сповіщень.
 *
 * Списком «усе» не записуємо свідомо: поява нової категорії оминула б тих,
 * хто налаштувався давно.
 */
export function tgBuckets(value: string | null | undefined): NotifBucket[] {
  const all = NOTIF_GROUPS.filter((g): g is NotifBucket => g !== "all");
  if (value === TG_NONE) return [];
  if (!value || value === "all") return all;
  const chosen = value.split(",").filter(Boolean);
  return all.filter((b) => chosen.includes(b));
}

export function isNotifGroup(value: string | undefined): value is NotifGroup {
  return !!value && (NOTIF_GROUPS as readonly string[]).includes(value);
}

/**
 * Умова для WHERE. Повертає готовий шматок SQL і його параметри —
 * «інше» описується через NOT IN, тому одним списком не обійтись.
 */
export function groupFilter(group: NotifGroup): { sql: string; params: string[] } {
  if (group === "all") return { sql: "", params: [] };

  if (group === "other") {
    const holes = NAMED_TYPES.map(() => "?").join(", ");
    return { sql: ` AND n.type NOT IN (${holes})`, params: NAMED_TYPES };
  }

  const types = BUCKET_TYPES[group];
  const holes = types.map(() => "?").join(", ");
  return { sql: ` AND n.type IN (${holes})`, params: types };
}
