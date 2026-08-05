import { requireUser } from "@/lib/auth";
import { listArchive } from "@/lib/queries";
import TaskCard from "@/components/TaskCard";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await requireUser();
  const { q } = await searchParams;
  const search = q ?? "";
  const tasks = listArchive(me, search);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold">Архів</h1>
      <p className="mb-4 text-sm text-ink-muted">Виконані та скасовані задачі</p>

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
