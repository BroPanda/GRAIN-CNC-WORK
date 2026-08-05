/**
 * Перезаписує команду на актуальний склад: Світлана (власник),
 * Тарас (моделювання), Володя (фрезерування).
 *
 * Запуск: node scripts/reset-team.mjs
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const db = new DatabaseSync(path.join(process.cwd(), "data", "grain.db"));

db.exec("PRAGMA foreign_keys = ON");
db.exec("DELETE FROM users");
db.exec("DELETE FROM sqlite_sequence WHERE name = 'users'");

const insert = db.prepare(`
  INSERT INTO users (name, telegram_username, role, position, can_create_tasks,
    can_edit_tasks, can_reorder_queue, can_upload_files, can_take_tasks,
    can_close_tasks, can_manage_team)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insert.run("Світлана", null, "owner", "Директор", 1, 1, 1, 1, 1, 1, 1);
insert.run("Тарас", null, "modeler", "Моделювання", 1, 1, 0, 1, 0, 0, 0);
insert.run("Володя", null, "miller", "Фрезерування", 0, 0, 0, 1, 1, 1, 0);

const users = db.prepare("SELECT id, name, role FROM users ORDER BY id").all();
console.log("Команда:", users.map((u) => `${u.id}=${u.name} (${u.role})`).join(", "));
