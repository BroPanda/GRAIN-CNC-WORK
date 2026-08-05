"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveTeamMember, setUserActive, togglePermission } from "@/lib/actions";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type PermissionKey,
  type Role,
  type User,
} from "@/lib/types";
import Dialog from "./Dialog";
import { useAction } from "./useAction";
import { IconPlus } from "./Icons";

const ROLES: Role[] = ["owner", "modeler", "miller"];

export default function TeamEditor({ users, meId }: { users: User[]; meId: number }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = () => router.refresh();

  const addMember = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => saveTeamMember(fd), () => {
      setDialogOpen(false);
      refresh();
    });
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">
          Права можна вмикати кожному окремо. Власник завжди має повний доступ.
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialogOpen(true)}>
          <IconPlus className="h-4 w-4" />
          Додати
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
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
                </div>
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

      <Dialog open={dialogOpen} title="Новий співробітник" onClose={() => setDialogOpen(false)}>
        <form onSubmit={addMember} className="flex flex-col gap-3">
          <div>
            <label className="label" htmlFor="member-name">
              Імʼя *
            </label>
            <input id="member-name" name="name" className="field" required autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="member-role">
              Роль
            </label>
            <select id="member-role" name="role" className="field" defaultValue="miller">
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
            />
          </div>
          <div>
            <label className="label" htmlFor="member-tg">
              Telegram
            </label>
            <input id="member-tg" name="telegram_username" className="field" placeholder="@nickname" />
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="is_active" defaultChecked className="h-5 w-5 accent-[#f2a825]" />
            Активний
          </label>
          <p className="text-xs text-ink-dim">
            Базові права проставляться за роллю — далі можна змінити перемикачами.
          </p>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Зберігаємо…" : "Додати в команду"}
          </button>
        </form>
      </Dialog>
    </>
  );
}
