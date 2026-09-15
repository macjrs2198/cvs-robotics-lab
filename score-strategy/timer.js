(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSScoreTimer = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const TIMER_VERSION = 1;
  const ROUND_MS = 180000;
  const STATUSES = new Set(["idle", "running", "paused", "finished"]);

  function finiteClock(value) {
    if (!Number.isFinite(value)) throw new Error("Timer clock must return a finite millisecond timestamp.");
    return value;
  }

  function clampRemaining(value) {
    if (!Number.isFinite(value) || value < 0 || value > ROUND_MS) {
      throw new Error("Timer remaining time is invalid.");
    }
    return value;
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== TIMER_VERSION || !STATUSES.has(snapshot.status)) {
      throw new Error("Timer snapshot format is invalid.");
    }
    const remainingMs = clampRemaining(snapshot.remainingMs);
    if (snapshot.status === "running" && !Number.isFinite(snapshot.deadlineAt)) {
      throw new Error("Running timer snapshot needs a deadline.");
    }
    if (snapshot.status !== "running" && snapshot.deadlineAt !== null) {
      throw new Error("Only a running timer may have a deadline.");
    }
    if (snapshot.status === "finished" && remainingMs !== 0) {
      throw new Error("A finished timer must show zero remaining.");
    }
    if (snapshot.status === "idle" && remainingMs !== ROUND_MS) {
      throw new Error("An idle timer must show the full match duration.");
    }
    if (typeof snapshot.soundEnabled !== "boolean" || typeof snapshot.finishEmitted !== "boolean") {
      throw new Error("Timer snapshot flags are invalid.");
    }
    return {
      version: TIMER_VERSION,
      status: snapshot.status,
      remainingMs,
      deadlineAt: snapshot.deadlineAt,
      soundEnabled: snapshot.soundEnabled,
      finishEmitted: snapshot.finishEmitted,
    };
  }

  function formatRemaining(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function create(options = {}) {
    const now = typeof options.now === "function" ? options.now : Date.now;
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    const onFinish = typeof options.onFinish === "function" ? options.onFinish : () => {};
    let state = options.initialState ? validateSnapshot(options.initialState) : {
      version: TIMER_VERSION,
      status: "idle",
      remainingMs: ROUND_MS,
      deadlineAt: null,
      soundEnabled: false,
      finishEmitted: false,
    };
    let interacted = false;

    function view() {
      return {
        status: state.status,
        remainingMs: state.remainingMs,
        display: formatRemaining(state.remainingMs),
        soundEnabled: state.soundEnabled,
        finished: state.status === "finished",
        canSound: state.soundEnabled && interacted,
      };
    }

    function changed() {
      onChange(view(), { ...state });
    }

    function finish() {
      state.status = "finished";
      state.remainingMs = 0;
      state.deadlineAt = null;
      if (!state.finishEmitted) {
        state.finishEmitted = true;
        changed();
        onFinish(view(), { ...state });
      } else {
        changed();
      }
    }

    function tick() {
      if (state.status !== "running") return view();
      const next = Math.max(0, Math.min(ROUND_MS, state.deadlineAt - finiteClock(now())));
      if (next === 0) {
        finish();
      } else if (next !== state.remainingMs) {
        state.remainingMs = next;
        changed();
      }
      return view();
    }

    function start() {
      interacted = true;
      tick();
      if (state.status !== "idle") return false;
      state.status = "running";
      state.deadlineAt = finiteClock(now()) + state.remainingMs;
      changed();
      return true;
    }

    function pause() {
      interacted = true;
      tick();
      if (state.status !== "running") return false;
      state.status = "paused";
      state.deadlineAt = null;
      changed();
      return true;
    }

    function resume() {
      interacted = true;
      if (state.status !== "paused") return false;
      state.status = "running";
      state.deadlineAt = finiteClock(now()) + state.remainingMs;
      changed();
      return true;
    }

    function reset() {
      interacted = true;
      const soundEnabled = state.soundEnabled;
      state = {
        version: TIMER_VERSION,
        status: "idle",
        remainingMs: ROUND_MS,
        deadlineAt: null,
        soundEnabled,
        finishEmitted: false,
      };
      changed();
      return view();
    }

    function setSoundEnabled(enabled) {
      interacted = true;
      state.soundEnabled = !!enabled;
      changed();
      return state.soundEnabled;
    }

    function markInteracted() {
      interacted = true;
    }

    function serialize() {
      tick();
      return { ...state };
    }

    function getState() {
      return tick();
    }

    return { start, pause, resume, reset, tick, getState, serialize, setSoundEnabled, markInteracted };
  }

  function playFinishSound(options = {}) {
    if (!options.enabled || !options.interacted) return false;
    const AudioContextClass = options.AudioContextClass || (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext));
    if (!AudioContextClass) return false;
    try {
      const context = new AudioContextClass();
      const start = context.currentTime;
      [0, 0.16].forEach((offset) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.12);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.13);
      });
      if (typeof context.close === "function") setTimeout(() => { context.close().catch(() => {}); }, 600);
      return true;
    } catch (_) {
      return false;
    }
  }

  return { create, validateSnapshot, formatRemaining, playFinishSound, ROUND_MS, TIMER_VERSION };
});
