"use client";

import { playNotifSound, primeAudio } from "./notifySound";
import { useSoundSettings } from "./useSoundSettings";
import { IconBell, IconBellOff } from "./Icons";

/**
 * Головний вимикач звуку. Окремі категорії глушаться дзвіночком на вкладці —
 * тут лише «геть усе». Налаштування живе в браузері: у цеху й удома в однієї
 * людини цілком різні побажання щодо звуку.
 */
export default function SoundToggle() {
  const sound = useSoundSettings();
  if (!sound.ready) return null; // не блимаємо неправильним станом до читання localStorage

  const toggle = () => {
    const willMute = !sound.master;
    sound.toggleMaster();
    if (!willMute) {
      primeAudio();
      playNotifSound("comment"); // одразу чути, що ввімкнулось
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-sm"
      title={sound.master ? "Звук сповіщень вимкнено" : "Звук сповіщень увімкнено"}
    >
      {sound.master ? (
        <>
          <IconBellOff className="h-4 w-4 text-danger" /> Звук вимк.
        </>
      ) : (
        <>
          <IconBell className="h-4 w-4" /> Звук увімк.
        </>
      )}
    </button>
  );
}
