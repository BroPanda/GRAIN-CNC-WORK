import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listArchive, purgePreview } from "@/lib/queries";
import { PURGE_MONTHS } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import ArchiveCleanup from "@/components/ArchiveCleanup";
import { IconChart } from "@/components/Icons";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await requireUser();
  const { q } = await searchParams;
  const search = q ?? "";
  const tasks = await listArchive(me, search);

  // скільки місця звільнить кожен період — рахуємо лише власнику,
  // решті цей блок і не показується
  const previews =
    me.role === "owner"
      ? Object.fromEntries(
          await Promise.all(
            PURGE_MONTHS.map(async (m) => [m, await purgePreview(m)] as const)
          )
        )
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1 text-2xl font-bold">Архів</h1>
          <p className="text-sm text-ink-muted">Виконані та скасовані задачі</p>
        </div>
        {previews && <ArchiveCleanup preview={previews} />}
        {/* на телефоні таб-бар уже заповнений — сюди й ведемо до статистики */}
        <Link href="/stats" className="btn btn-ghost btn-sm shrink-0">
          <IconChart className="h-4 w-4" />
          Статистика
        </Link>
      </div>

      <form className="mb-5 flex gap-2">
        <input
          name="q"
          className="field"
          defaultValue={search}
          placeholder="Пошук: назва, замовник, № замовлення, код"
          aria-label="Пошук в архіві"
        />
        <button type="submit" className="btn btn-ghost">
          Знайти
        </button>
      </form>

      {!tasks.length ? (
        <p className="card p-6 text-center text-sm text-ink-muted">
          {search ? "За цим запитом нічого не знайдено." : "Архів поки порожній."}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
