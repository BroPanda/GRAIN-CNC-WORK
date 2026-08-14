"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteUser, saveTeamMember, setUserActive, togglePermission } from "@/lib/actions";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type PermissionKey,
  type Role,
  type User,
} from "@/lib/types";
import { formatPhone } from "@/lib/phone";
import Dialog from "./Dialog";
import { useAction } from "./useAction";
import { IconPlus, IconTrash } from "./Icons";

const ROLES: Role[] = ["owner", "modeler", "miller"];

/** `null` — діалог закритий, `undefined`-поля — режим «новий співробітник». */
type Editing = User | "new" | null;

export default function TeamEditor({ users, meId }: { users: User[]; meId: number }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [editing, setEditing] = useState<Editing>(null);
  /** Кого саме питаємо видалити — видалення без підтвердження надто дешеве. */
  const [removing, setRemoving] = useState<User | null>(null);

  const refresh = () => router.refresh();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => saveTeamMember(fd), () => {
      setEditing(null);
      refresh();
    });
  };

  const member = editing && editing !== "new" ? editing : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">
          Права можна вмикати кожному окремо. Власник завжди має повний доступ.
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
          <IconPlus className="h-4 w-4" />
          Додати
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {users.some((u) => u.is_active === 1 && !u.phone) && (
        <p className="mb-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-ink-muted">
          <span className="font-semibold text-ink">Не в усіх вказано номер телефону.</span> Вхід у
          застосунок іде за номером — без нього людина не зайде. Впишіть номери всім, і собі теж.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {users.map((user) => {
          const isOwner = user.role === "owner";
          return (
            <div
              key={user.id}
              className={`card p-4 ${user.is_active ? "" : "opacity-55"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-500/20 font-bold text-gold-300">
                  {user.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{user.name}</span>
                    {user.id === meId && (
                      <span className="chip bg-white/8 text-ink-dim">це ви</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-ink-dim">
                    {ROLE_LABELS[user.role]}
                    {user.job_title ? ` · ${user.job_title}` : ""}
                    {user.telegram_username ? ` · @${user.telegram_username}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {user.phone ? (
                      <span className="text-ink-muted">{formatPhone(user.phone)}</span>
                    ) : (
                      <span className="text-warn">номер не вказано — вхід неможливий</span>
                    )}
                    {user.phone &&
                      (user.telegram_id ? (
                        <span className="chip bg-ok/15 text-ok">Telegram підтверджено</span>
                      ) : (
                        <span className="chip bg-white/8 text-ink-dim">чекає на вхід у бот</span>
                      ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => setEditing(user)}
                  >
                    Змінити
                  </button>
                  {user.id !== meId && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => run(() => setUserActive(user.id, user.is_active !== 1), refresh)}
                    >
                      {user.is_active ? "Деактивувати" : "Активувати"}
                    </button>
                  )}
                  {/* власника з інтерфейсу не видалити — лише через базу */}
                  {user.id !== meId && !isOwner && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm !px-2 text-danger"
                      aria-label={`Видалити ${user.name}`}
                      disabled={pending}
                      onClick={() => setRemoving(user)}
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-white/8 pt-3 sm:grid-cols-2">
                {PERMISSION_KEYS.map((key) => {
                  const on = isOwner || user[key] === 1;
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                        isOwner ? "opacity-60" : "cursor-pointer hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[#f2a825]"
                        checked={on}
                        disabled={isOwner || pending}
                        onChange={(e) =>
                          run(
                            () => togglePermission(user.id, key as PermissionKey, e.target.checked),
                            refresh
                          )
                        }
                      />
                      {PERMISSION_LABELS[key]}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={removing !== null}
        title={`Видалити ${removing?.name ?? ""}?`}
        onClose={() => setRemoving(null)}
      >
        <p className="mb-4 text-sm text-ink-muted">
          Людина зникне з команди назавжди і більше не зайде в застосунок. Її задачі
          нікуди не подінуться — лишаться без виконавця, історія й статистика цілі.
          Якщо потрібно просто закрити доступ на час, краще{" "}
          <span className="font-semibold text-ink">Деактивувати</span>.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-danger flex-1"
            disabled={pending}
            onClick={() =>
              removing &&
              run(() => deleteUser(removing.id), () => {
                setRemoving(null);
                refresh();
              })
            }
          >
            {pending ? "Видаляю…" : "Видалити"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
            Скасувати
          </button>
        </div>
      </Dialog>

      <Dialog
        open={editing !== null}
        title={member ? member.name : "Новий співробітник"}
        onClose={() => setEditing(null)}
      >
        <form key={member?.id ?? "new"} onSubmit={submit} className="flex flex-col gap-3">
          {member && <input type="hidden" name="id" value={member.id} />}
          {/* права міняються перемикачами на картці — тут просто переносимо їх як є */}
          {member &&
            PERMISSION_KEYS.filter((k) => member[k] === 1).map((k) => (
              <input key={k} type="hidden" name={k} value="on" />
            ))}

          <div>
            <label className="label" htmlFor="member-name">
              Імʼя *
            </label>
            <input
              id="member-name"
              name="name"
              className="field"
              required
              autoFocus
              defaultValue={member?.name ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="member-phone">
              Телефон *
            </label>
            <input
              id="member-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              className="field"
              placeholder="+380671234567"
              defaultValue={member?.phone ?? ""}
            />
            <p className="mt-1 text-xs text-ink-dim">
              За цим номером людина входить у застосунок: вона підтверджує його в нашому
              Telegram-боті. Номер має збігатися з номером її акаунта Telegram.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="member-role">
              Роль
            </label>
            <select
              id="member-role"
              name="role"
              className="field"
              defaultValue={member?.role ?? "miller"}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="member-job">
              Посада
            </label>
            <input
              id="member-job"
              name="job_title"
              className="field"
              placeholder="Фрезерування"
              defaultValue={member?.job_title ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="member-tg">
              Telegram
            </label>
            <input
              id="member-tg"
              name="telegram_username"
              className="field"
              placeholder="@nickname"
              defaultValue={member?.telegram_username ?? ""}
            />
            <p className="mt-1 text-xs text-ink-dim">
              Необовʼязково — заповниться саме, коли людина підтвердить номер у боті.
            </p>
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={member ? member.is_active === 1 : true}
              className="h-5 w-5 accent-[#f2a825]"
            />
            Активний
          </label>
          {!member && (
            <p className="text-xs text-ink-dim">
              Базові права проставляться за роллю — далі можна змінити перемикачами.
            </p>
          )}
          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Зберігаємо…" : member ? "Зберегти" : "Додати в команду"}
          </button>
        </form>
      </Dialog>
    </>
  );
}
