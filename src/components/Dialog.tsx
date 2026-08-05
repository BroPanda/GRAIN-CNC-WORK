"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./Icons";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Dialog({ open, title, onClose, children }: Props) {
  // Портал у <body> обов'язковий: картки задачі мають backdrop-blur, а такий
  // фільтр робить елемент точкою відліку для position:fixed усередині нього —
  // діалог розтягувався б у межах картки й ліз би під сусідні блоки.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* На телефоні — «шухляда» знизу, на десктопі — вікно по центру */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-navy-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-5"
      >
        <div className="mb-3 flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="btn btn-ghost btn-sm !min-h-9 !px-2"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
