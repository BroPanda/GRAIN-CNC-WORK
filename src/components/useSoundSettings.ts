"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotifBucket } from "@/lib/notif-groups";
import {
  SOUND_CHANGED,
  isBucketMuted,
  mutedBuckets,
  setBucketMuted,
  setSoundMuted,
  soundMuted,
} from "./notifySound";

interface SoundSettings {
  /** null, поки не прочитали localStorage — щоб не блимало неправильним станом. */
  ready: boolean;
  master: boolean;
  buckets: NotifBucket[];
  toggleMaster: () => void;
  toggleBucket: (bucket: NotifBucket) => void;
  isMuted: (bucket: NotifBucket) => boolean;
}

/**
 * Налаштування звуку, спільні для всіх компонентів на сторінці.
 * Живуть у localStorage; про зміни всі дізнаються через подію SOUND_CHANGED
 * (а про зміни в іншій вкладці браузера — через штатну подію storage).
 */
export function useSoundSettings(): SoundSettings {
  const [ready, setReady] = useState(false);
  const [master, setMaster] = useState(false);
  const [buckets, setBuckets] = useState<NotifBucket[]>([]);

  const sync = useCallback(() => {
    setMaster(soundMuted());
    setBuckets(mutedBuckets());
    setReady(true);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(SOUND_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SOUND_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  return {
    ready,
    master,
    buckets,
    toggleMaster: () => setSoundMuted(!soundMuted()),
    toggleBucket: (bucket) => setBucketMuted(bucket, !isBucketMuted(bucket)),
    isMuted: (bucket) => buckets.includes(bucket),
  };
}
