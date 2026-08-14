"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskListItem, User } from "@/lib/types";
import { reorderQueue } from "@/lib/actions";
import TaskCard from "./TaskCard";
import TaskActions from "./TaskActions";
import type { Abilities } from "@/lib/abilities";
import { IconGrip } from "./Icons";
import { useAction } from "./useAction";

interface Props {
  tasks: TaskListItem[];
  me: User;
  abilities: Abilities;
  /** Кому можна віддати доопрацювання — далі в TaskActions. */
  modelers: Pick<User, "id" | "name" | "job_title">[];
  millers: Pick<User, "id" | "name" | "job_title">[];
}

function Row({
  task,
  index,
  me,
  abilities,
  modelers,
  millers,
  draggable,
  first,
  last,
}: {
  task: TaskListItem;
  index: number;
  me: User;
  abilities: Abilities;
  modelers: Pick<User, "id" | "name" | "job_title">[];
  millers: Pick<User, "id" | "name" | "job_title">[];
  draggable: boolean;
  first: boolean;
  last: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "relative z-20 opacity-90" : ""}
    >
      <div className="flex items-stretch gap-2">
        {draggable && (
          <button
            type="button"
            aria-label={`Перетягнути «${task.title}»`}
            className="shrink-0 cursor-grab touch-none rounded-xl border border-white/8 bg-white/[0.03] px-1.5 text-ink-dim transition hover:text-gold-400 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <IconGrip className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <TaskCard
            task={task}
            index={index}
            actions={
              <TaskActions
                task={task}
                me={me}
                abilities={abilities}
                modelers={modelers}
                millers={millers}
                compact
                showNudge
                nudgeUpDisabled={first}
                nudgeDownDisabled={last}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

export default function QueueList({ tasks, me, abilities, modelers, millers }: Props) {
  const router = useRouter();
  const { run, error } = useAction();
  const [items, setItems] = useState(tasks);

  // Дані з сервера — джерело правди; локальний стан лише для плавного перетягування
  useEffect(() => setItems(tasks), [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((t) => t.id === active.id);
    const to = items.findIndex((t) => t.id === over.id);
    if (from === -1 || to === -1) return;

    const next = arrayMove(items, from, to);
    setItems(next);
    run(
      () => reorderQueue(next.map((t) => t.id)),
      () => router.refresh()
    );
  };

  if (!items.length) {
    return (
      <p className="card p-6 text-center text-sm text-ink-muted">
        У черзі порожньо. Усі роботи розібрані.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <DndContext
        // стабільний id — інакше dnd-kit генерує різні aria-describedby
        // на сервері й клієнті, і React скаржиться на розбіжність розмітки
        id="freza-queue"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
          disabled={!abilities.reorder}
        >
          <div className="flex flex-col gap-2.5">
            {items.map((task, i) => (
              <Row
                key={task.id}
                task={task}
                index={i}
                me={me}
                abilities={abilities}
                modelers={modelers}
                millers={millers}
                draggable={abilities.reorder}
                first={i === 0}
                last={i === items.length - 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
