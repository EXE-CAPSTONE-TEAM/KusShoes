import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Boot = typeof import('./boot');

async function load(): Promise<Boot> {
  vi.resetModules();
  return import('./boot');
}

const bootEl = () => document.getElementById('boot');
const bar = () => Number(bootEl()?.style.getPropertyValue('--p') || 0);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="boot" aria-valuenow="0"></div>';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('boot', () => {
  it('progress is monotonic and never exceeds 0.9 before finishing', async () => {
    await load();
    let last = 0;
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(200);
      expect(bar()).toBeGreaterThanOrEqual(last);
      last = bar();
    }
    expect(last).toBeGreaterThan(0.5);
    expect(last).toBeLessThanOrEqual(0.9);
  });

  it('advances as tasks resolve and never goes backwards', async () => {
    const boot = await load();
    let resolveSlow!: () => void;
    boot.addBootTask(Promise.resolve());
    boot.addBootTask(new Promise<void>((r) => (resolveSlow = r)));
    await vi.advanceTimersByTimeAsync(0);
    expect(bar()).toBeCloseTo(0.45, 5);
    boot.addBootTask(new Promise(() => {})); // 1 of 3 settled -> would be 0.3
    await vi.advanceTimersByTimeAsync(0);
    expect(bar()).toBeGreaterThanOrEqual(0.45);
    resolveSlow();
    await vi.advanceTimersByTimeAsync(0);
    expect(bar()).toBeGreaterThanOrEqual(0.6);
  });

  it('sets aria-valuenow', async () => {
    const boot = await load();
    boot.addBootTask(Promise.resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(bootEl()?.getAttribute('aria-valuenow')).toBe('90');
  });

  it('a rejected task does not block finishing', async () => {
    const boot = await load();
    boot.addBootTask(Promise.reject(new Error('404')));
    boot.markAppMounted();
    const done = boot.finishBoot();
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(boot.isBootFinished()).toBe(true);
  });

  it('finishBoot resolves by the 5 s cap when a task never settles', async () => {
    const boot = await load();
    boot.addBootTask(new Promise(() => {}));
    boot.markAppMounted();
    let resolved = false;
    void boot.finishBoot().then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(4900);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(true);
  });

  it('caps the wait even if the app never mounts', async () => {
    const boot = await load();
    let resolved = false;
    void boot.finishBoot().then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(6000);
    expect(resolved).toBe(true);
  });

  it('marks #boot done, then removes it, and resolves bootDone', async () => {
    const boot = await load();
    boot.markAppMounted();
    let done = false;
    void boot.bootDone.then(() => (done = true));
    void boot.finishBoot();
    await vi.advanceTimersByTimeAsync(100); // ready immediately -> bar completes
    expect(bar()).toBe(1);
    expect(bootEl()?.classList.contains('done')).toBe(false);
    await vi.advanceTimersByTimeAsync(200); // 250 ms hold
    expect(bootEl()?.classList.contains('done')).toBe(true);
    expect(done).toBe(true);
    await vi.advanceTimersByTimeAsync(200); // 200 ms fade
    expect(bootEl()).toBeNull();
  });

  it('skips the min-visible wait when everything is ready before 150 ms', async () => {
    const boot = await load();
    boot.markAppMounted();
    void boot.finishBoot();
    await vi.advanceTimersByTimeAsync(50); // ready at ~0 ms, well under 150
    expect(bar()).toBe(1);
  });

  it('holds until 550 ms once the loader would have been visible', async () => {
    const boot = await load();
    boot.markAppMounted();
    let resolveTask!: () => void;
    boot.addBootTask(new Promise<void>((r) => (resolveTask = r)));
    void boot.finishBoot();
    await vi.advanceTimersByTimeAsync(300);
    resolveTask();
    await vi.advanceTimersByTimeAsync(200); // t=500 < 550
    expect(boot.isBootFinished()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(boot.isBootFinished()).toBe(true);
  });

  it('ignores addBootTask after the boot finished', async () => {
    const boot = await load();
    boot.markAppMounted();
    void boot.finishBoot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(boot.isBootFinished()).toBe(true);
    document.body.innerHTML = '<div id="boot"></div>'; // fresh element to observe writes
    boot.addBootTask(Promise.resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(bar()).toBe(0);
  });
});
