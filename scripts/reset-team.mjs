/**
 * Перезаписує команду на актуальний склад: Світлана (власник),
 * Тарас (моделювання), Володя (фрезерування).
 *
 * Запуск: node scripts/reset-team.mjs
 */
import { connect } from "./db.mjs";

const client = await connect();

await client.query("DELETE FROM users");
await client.query("ALTER SEQUENCE users_id_seq RESTART WITH 1");

const insert = `
  INSERT INTO users (name, telegram_username, role, job_title, can_create_tasks,
    can_edit_tasks, can_reorder_queue, can_upload_files, can_take_tasks,
    can_close_tasks, can_manage_team)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`;

await client.query(insert, ["Світлана", null, "owner", "Директор", 1, 1, 1, 1, 1, 1, 1]);
await client.query(insert, ["Тарас", null, "modeler", "Моделювання", 1, 1, 0, 1, 0, 0, 0]);
await client.query(insert, ["Володя", null, "miller", "Фрезерування", 0, 0, 0, 1, 1, 1, 0]);

const { rows } = await client.query("SELECT id, name, role FROM users ORDER BY id");
console.log("Команда:", rows.map((u) => `${u.id}=${u.name} (${u.role})`).join(", "));

await client.end();
