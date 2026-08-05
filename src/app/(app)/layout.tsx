import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/queries";
import { ROLE_LABELS } from "@/lib/types";
import { logout } from "@/lib/actions";
import NavLink from "@/components/NavLink";
import NotificationWatcher from "@/components/NotificationWatcher";
import {
  IconArchive,
  IconBell,
  IconPlus,
  IconQueue,
  IconTeam,
} from "@/components/Icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const unread = await unreadCount(user.id);
  const showTeam = can(user, "can_manage_team");
  const showCreate = can(user, "can_create_tasks");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1600px]">
      <NotificationWatcher userId={user.id} />
      {/* ── Сайдбар (десктоп) ───────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-2 border-r border-white/8 p-4 lg:flex">
        <Link href="/queue" className="mb-4 flex items-center gap-3 px-1">
          <Image
            src="/grain-logo.jpg"
            alt="GRAIN"
            width={44}
            height={44}
            className="rounded-xl"
            priority
          />
          <div className="leading-tight">
            <div className="font-bold tracking-wide text-gold-400">GRAIN</div>
            <div className="text-xs text-ink-dim">задачник ЧПУ</div>
          </div>
        </Link>

        <nav className="flex flex-col gap-1">
          <NavLink href="/queue" label="Черга робіт" variant="side">
            <IconQueue />
          </NavLink>
          {showCreate && (
            <NavLink href="/tasks/new" label="Нова задача" variant="side">
              <IconPlus />
            </NavLink>
          )}
          <NavLink href="/notifications" label="Сповіщення" badge={unread} variant="side">
            <IconBell />
          </NavLink>
          <NavLink href="/archive" label="Архів" variant="side">
            <IconArchive />
          </NavLink>
          {showTeam && (
            <NavLink href="/team" label="Команда" variant="side">
              <IconTeam />
            </NavLink>
          )}
        </nav>

        <div className="mt-auto card p-3">
          <div className="truncate font-semibold">{user.name}</div>
          <div className="text-xs text-ink-dim">
            {ROLE_LABELS[user.role]}
            {user.telegram_username ? ` · @${user.telegram_username}` : ""}
          </div>
          <form action={logout}>
            <button type="submit" className="btn btn-ghost btn-sm mt-3 w-full">
              Вийти
            </button>
          </form>
        </div>
      </aside>

      {/* ── Контент ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Шапка (мобільна) */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-navy-950/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <Link href="/queue" className="flex items-center gap-2.5">
            <Image src="/grain-logo.jpg" alt="GRAIN" width={34} height={34} className="rounded-lg" />
            <span className="font-bold tracking-wide text-gold-400">GRAIN</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="max-w-[9rem] truncate text-xs text-ink-muted">{user.name}</span>
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Вийти
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 pt-4 pb-28 sm:px-5 lg:px-8 lg:pb-10">{children}</main>

        {/* Таб-бар (мобільний) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-navy-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          <NavLink href="/queue" label="Черга" variant="tab">
            <IconQueue className="h-6 w-6" />
          </NavLink>
          {showCreate && (
            <NavLink href="/tasks/new" label="Нова" variant="tab">
              <IconPlus className="h-6 w-6" />
            </NavLink>
          )}
          <NavLink href="/notifications" label="Події" badge={unread} variant="tab">
            <IconBell className="h-6 w-6" />
          </NavLink>
          <NavLink href="/archive" label="Архів" variant="tab">
            <IconArchive className="h-6 w-6" />
          </NavLink>
          {showTeam && (
            <NavLink href="/team" label="Команда" variant="tab">
              <IconTeam className="h-6 w-6" />
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  );
}
