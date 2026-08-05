"use client";

import type { NotifBucket } from "@/lib/notif-groups";

/**
 * Звуки сповіщень. Синтезуємо на місці через WebAudio, а не тягнемо mp3:
 * жодних зайвих запитів, і кожен тип чути по-своєму навіть краєм вуха.
 *
 * Кожен рядок — [частота Гц, коли почати (с), скільки тривати (с)].
 */
type Tone = [freq: number, at: number, dur: number];

const PATTERNS: Record<NotifBucket, { tones: Tone[]; wave: OscillatorType; gain: number }> = {
  // коментар — два коротких «тук-тук», нейтрально
  comment: { tones: [[660, 0, 0.09], [880, 0.11, 0.11]], wave: "sine", gain: 0.16 },
  // нова задача — висхідний сигнал «прийшла робота»
  created: { tones: [[520, 0, 0.1], [700, 0.1, 0.1], [880, 0.2, 0.16]], wave: "triangle", gain: 0.17 },
  // виконано — мажорна терція вгору, звучить як «готово»
  done: { tones: [[660, 0, 0.12], [990, 0.13, 0.26]], wave: "sine", gain: 0.16 },
  // доопрацювання — низький подвійний, тривожний
  rework: { tones: [[300, 0, 0.16], [240, 0.2, 0.3]], wave: "square", gain: 0.1 },
  // взяли в роботу — короткий підйом
  taken: { tones: [[440, 0, 0.09], [620, 0.1, 0.14]], wave: "triangle", gain: 0.14 },
  // файли — тихий подвійний клац
  files: { tones: [[780, 0, 0.06], [780, 0.09, 0.06]], wave: "sine", gain: 0.13 },
  // решта — один м'який сигнал
  other: { tones: [[560, 0, 0.14]], wave: "sine", gain: 0.13 },
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/**
 * Браузер не дає грати звук, поки користувач не торкнувся сторінки.
 * Тому «розбуджуємо» аудіо на першому ж кліку чи дотику.
 */
export function primeAudio(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

export function playNotifSound(bucket: NotifBucket): void {
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") {
    // ще не було жодної взаємодії — тиша замість помилки в консолі
    void c.resume();
    if (c.state === "suspended") return;
  }

  const { tones, wave, gain } = PATTERNS[bucket] ?? PATTERNS.other;
  const start = c.currentTime + 0.01;

  for (const [freq, at, dur] of tones) {
    const osc = c.createOscillator();
    const vol = c.createGain();
    osc.type = wave;
    osc.frequency.value = freq;

    // плавні краї: без них у динаміку чути клацання
    vol.gain.setValueAtTime(0.0001, start + at);
    vol.gain.exponentialRampToValueAtTime(gain, start + at + 0.015);
    vol.gain.exponentialRampToValueAtTime(0.0001, start + at + dur);

    osc.connect(vol).connect(c.destination);
    osc.start(start + at);
    osc.stop(start + at + dur + 0.02);
  }
}

const MUTE_KEY = "grain_sound_off";

export function soundMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setSoundMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}
