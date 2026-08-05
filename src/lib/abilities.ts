import type { PermissionKey, User } from "./types";

/** Набір дій, доступних користувачу над задачами. */
export interface Abilities {
  take: boolean;
  close: boolean;
  edit: boolean;
  reorder: boolean;
}

export function abilitiesFor(user: User): Abilities {
  const has = (key: PermissionKey) => user.role === "owner" || user[key] === 1;
  return {
    take: has("can_take_tasks"),
    close: has("can_close_tasks"),
    edit: has("can_edit_tasks"),
    reorder: has("can_reorder_queue"),
  };
}
