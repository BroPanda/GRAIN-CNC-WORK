"use client";

import { useEffect, useState } from "react";
import { playNotifSound, primeAudio, setSoundMuted, soundMuted } from "./notifySound";

/**
 * Вимикач звуку сповіщень. Налаштування живе в браузері (localStorage):
 * у цеху й удома в однієї людини цілком різні побажання щодо звуку.
 */
export default function SoundToggle() {
  const [muted, setMuted] = useState<boolean | null>(null); // null — ще не прочитали

  useEffect(() => setMuted(soundMuted()), []);

  if (muted === null) return null;

  const toggle = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) {
      primeAudio();
      playNotifSound("comment"); // одразу чути, що ввімкнулось і як звучить
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-sm"
      title={muted ? "Звук сповіщень вимкнено" : "Звук сповіщень увімкнено"}
    >
      {muted ? "🔇 Звук вимк." : "🔔 Звук увімк."}
    </button>
  );
}
