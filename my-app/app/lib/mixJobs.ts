import type { Job } from "@/app/lib/jobs/types";

type Rng = () => number;

function seededRng(seed: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function lightShuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  const swaps = Math.min(arr.length, Math.max(1, Math.floor(arr.length * 0.3)));
  for (let i = 0; i < swaps; i++) {
    const a = Math.floor(rng() * arr.length);
    const b = Math.floor(rng() * arr.length);
    [arr[a], arr[b]] = [arr[b], arr[a]];
  }
  return arr;
}

export function mixJobFeeds(
  greenhouseJobs: Job[],
  adzunaJobs: Job[],
  seed?: string,
): Job[] {
  const rng = seed ? seededRng(seed) : Math.random;
  const greenhouse = shuffle(greenhouseJobs, rng);
  const adzuna = shuffle(adzunaJobs, rng);

  const mixed: Job[] = [];
  const maxLength = Math.max(greenhouse.length, adzuna.length);

  for (let i = 0; i < maxLength; i++) {
    if (greenhouse[i]) mixed.push(greenhouse[i]);
    if (adzuna[i]) mixed.push(adzuna[i]);
  }

  if (greenhouse.length !== adzuna.length) {
    const longerRemainder =
      greenhouse.length > adzuna.length
        ? greenhouse.slice(adzuna.length)
        : adzuna.slice(greenhouse.length);

    if (longerRemainder.length > 0) {
      mixed.push(...lightShuffle(longerRemainder, rng));
    }
  }

  return lightShuffle(mixed, rng);
}
