(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSProgramControl = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const TIMER_SLICE_MS = 40;

  function create(options = {}) {
    const stopMotion = typeof options.stopMotion === "function" ? options.stopMotion : () => {};
    const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
    const now = typeof options.now === "function"
      ? options.now
      : () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const schedule = typeof options.schedule === "function" ? options.schedule : setTimeout;

    let state = "stopped";
    let generation = 0;
    let reason = "ready";
    let pauseWaiters = [];

    function snapshot() {
      return Object.freeze({
        state,
        reason,
        running: state === "running",
        paused: state === "paused",
        stopped: state === "stopped",
      });
    }

    function notify() {
      onStateChange(snapshot());
    }

    function releasePauseWaiters() {
      const waiting = pauseWaiters;
      pauseWaiters = [];
      waiting.forEach(({ token, resolve }) => resolve(isActive(token)));
    }

    function run(nextReason = "running") {
      generation += 1;
      state = "running";
      reason = nextReason;
      releasePauseWaiters();
      notify();
      return generation;
    }

    function pause(nextReason = "paused") {
      if (state !== "running") return false;
      state = "paused";
      reason = nextReason;
      notify();
      return true;
    }

    function resume(nextReason = "running") {
      if (state !== "paused") return false;
      state = "running";
      reason = nextReason;
      releasePauseWaiters();
      notify();
      return true;
    }

    function stop(nextReason = "stopped") {
      generation += 1;
      state = "stopped";
      reason = nextReason;
      releasePauseWaiters();
      stopMotion();
      notify();
      return generation;
    }

    function complete(token, nextReason = "complete") {
      if (!isActive(token)) return false;
      stop(nextReason);
      return true;
    }

    function reset(resetHandler, nextReason = "ready") {
      stop(nextReason);
      if (typeof resetHandler === "function") resetHandler();
    }

    function isRunning() {
      return state === "running";
    }

    function isPaused() {
      return state === "paused";
    }

    function isStopped() {
      return state === "stopped";
    }

    function isActive(token) {
      return token === generation && state !== "stopped";
    }

    function waitWhilePaused(token) {
      if (!isActive(token) || state !== "paused") return Promise.resolve(isActive(token));
      return new Promise((resolve) => pauseWaiters.push({ token, resolve }));
    }

    async function yieldControl(token) {
      if (!(await waitWhilePaused(token))) return false;
      await new Promise((resolve) => schedule(resolve, 0));
      return isActive(token);
    }

    async function delay(milliseconds, token) {
      let remaining = Math.max(0, Number(milliseconds) || 0);

      if (remaining === 0) return yieldControl(token);

      while (isActive(token) && remaining > 0) {
        if (!(await waitWhilePaused(token))) return false;
        const slice = Math.min(remaining, TIMER_SLICE_MS);
        const startedAt = now();
        await new Promise((resolve) => schedule(resolve, slice));
        if (isActive(token) && state === "running") {
          remaining -= Math.max(0, now() - startedAt);
        }
      }

      return isActive(token);
    }

    async function waitUntil(predicate, token, intervalMs = 30) {
      while (isActive(token)) {
        if (!(await waitWhilePaused(token))) return false;
        if (Boolean(predicate())) return true;
        if (!(await delay(intervalMs, token))) return false;
      }
      return false;
    }

    notify();

    return Object.freeze({
      run,
      pause,
      resume,
      stop,
      complete,
      reset,
      isRunning,
      isPaused,
      isStopped,
      isActive,
      waitWhilePaused,
      yieldControl,
      delay,
      waitUntil,
      getState: snapshot,
    });
  }

  return Object.freeze({ create });
});
