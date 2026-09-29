// First-load boot loader (the #boot element lives in index.html). Tracks the work the
// above-the-fold content needs, drives the progress line, and removes the overlay once ready.
const MAX_MS = 5000;
const SHOW_DELAY = 150;
const MIN_VISIBLE = 400;
const EXIT_HOLD = 250;
const FADE_MS = 200;

const start = performance.now();
const tasks: Promise<unknown>[] = [];
let settled = 0;
let progress = 0;
let finished = false;

let resolveMounted!: () => void;
const appMounted = new Promise<void>((r) => (resolveMounted = r));
let resolveDone!: () => void;
export const bootDone = new Promise<void>((r) => (resolveDone = r));

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function setProgress(p: number) {
  progress = Math.min(1, Math.max(progress, p)); // never moves backwards
  const el = document.getElementById('boot');
  el?.style.setProperty('--p', String(progress));
  el?.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}

const trickle = window.setInterval(() => {
  if (progress < 0.9) setProgress(progress + (0.9 - progress) * 0.08);
}, 200);

export const isBootFinished = () => finished;

/** Register work the first screen needs. Ignored after the boot has finished. */
export function addBootTask(task: Promise<unknown>): void {
  if (finished) return;
  const safe = task.catch(() => undefined);
  tasks.push(safe);
  void safe.then(() => setProgress((++settled / tasks.length) * 0.9));
}

/** Resolves (never rejects) once the image is decoded, or has failed. */
export function preloadImage(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  if (typeof img.decode !== 'function') return Promise.resolve();
  return img.decode().catch(() => undefined);
}

/** Call once from App after its first commit (useEffect with []). */
export const markAppMounted = () => resolveMounted();

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function finishBoot(): Promise<void> {
  // Child useLayoutEffects (page task registration) run before App's useEffect.
  await Promise.race([appMounted, wait(MAX_MS)]);
  // `document.fonts.ready` resolves instantly if awaited before anything requested a font, so
  // re-check after the first commit + a frame, when layout has kicked off the font loads.
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.race([
      nextFrame().then(() => document.fonts.ready),
      wait(MAX_MS),
    ]).catch(() => undefined);
  }
  const remaining = Math.max(0, MAX_MS - (performance.now() - start));
  await Promise.race([Promise.allSettled([...tasks]), wait(remaining)]);

  const elapsed = performance.now() - start;
  if (elapsed > SHOW_DELAY) await wait(Math.max(0, SHOW_DELAY + MIN_VISIBLE - elapsed));

  finished = true;
  window.clearInterval(trickle);
  setProgress(1);
  await wait(EXIT_HOLD);

  const el = document.getElementById('boot');
  el?.classList.add('done');
  window.setTimeout(() => el?.remove(), FADE_MS);
  resolveDone();
}
