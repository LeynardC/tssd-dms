import { onMounted, onUnmounted } from "vue";

interface Options {
  /**
   * Ignore a focus/visibility event if the previous refresh ran more
   * recently than this. Stops a quick alt-tab out and back from firing a
   * fetch, and keeps repeated window focus/blur cheap. Default 15s.
   */
  minIntervalMs?: number;
  /**
   * Return false to skip a refresh for now — e.g. an upload is in progress
   * or a menu/dialog that captured a row is open, and swapping the data
   * underneath it would be disruptive.
   */
  canRun?: () => boolean;
}

/**
 * Runs `refresh` when the tab or window regains focus after being hidden or
 * blurred. A lightweight stand-in for real-time updates: a list view picks
 * up another user's changes the moment you come back to it, without a
 * manual reload and without polling while you're away.
 *
 * `refresh` should fetch quietly — update the data in place on success, and
 * on failure keep showing the last-known data rather than an error state.
 */
export function useVisibilityRefresh(
  refresh: () => unknown | Promise<unknown>,
  options: Options = {},
): void {
  const minInterval = options.minIntervalMs ?? 15_000;
  // Seed with "now" so the initial page load counts as a refresh and an
  // immediate focus event doesn't double-fetch.
  let lastRun = Date.now();
  let running = false;

  async function maybeRefresh(): Promise<void> {
    if (document.visibilityState !== "visible") return;
    if (running) return;
    if (Date.now() - lastRun < minInterval) return;
    if (options.canRun && !options.canRun()) return;

    running = true;
    try {
      await refresh();
      lastRun = Date.now();
    } finally {
      running = false;
    }
  }

  function handle(): void {
    void maybeRefresh();
  }

  onMounted(() => {
    // Browsers differ on which of these fires for a tab switch vs. an
    // app-level window focus — listen to both; the guards above dedupe.
    document.addEventListener("visibilitychange", handle);
    window.addEventListener("focus", handle);
  });

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", handle);
    window.removeEventListener("focus", handle);
  });
}
