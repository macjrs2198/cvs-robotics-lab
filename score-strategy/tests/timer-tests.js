"use strict";

const assert = require("node:assert/strict");
const timer = require("../timer.js");

function testDeadlineAndPause() {
  let clock = 1000;
  let finishes = 0;
  const match = timer.create({ now: () => clock, onFinish: () => { finishes += 1; } });
  assert.equal(match.getState().display, "3:00");
  assert.equal(match.start(), true);
  clock += 21450;
  assert.equal(match.tick().display, "2:39", "late callbacks must calculate from the deadline");
  assert.equal(match.getState().remainingMs, 158550);
  assert.equal(match.pause(), true);
  clock += 60000;
  assert.equal(match.tick().remainingMs, 158550, "paused wall time must not consume match time");
  assert.equal(match.resume(), true);
  clock += 158549;
  assert.equal(match.tick().display, "0:01");
  clock += 1;
  assert.equal(match.tick().display, "0:00");
  assert.equal(match.getState().status, "finished");
  assert.equal(finishes, 1);
  clock += 90000;
  match.tick();
  assert.equal(finishes, 1, "finish event must occur once");
  assert.equal(match.start(), false, "a finished timer should not restart without reset");
  match.reset();
  assert.equal(match.getState().display, "3:00");
  assert.equal(match.getState().status, "idle");
  assert.equal(match.start(), true);
}

function testRefreshAndSoundGate() {
  let clock = 7000;
  let restoredFinishes = 0;
  const beforeRefresh = timer.create({ now: () => clock });
  beforeRefresh.setSoundEnabled(true);
  beforeRefresh.start();
  clock += 15000;
  const snapshot = beforeRefresh.serialize();
  assert.equal(snapshot.deadlineAt, 187000);
  const afterRefresh = timer.create({ now: () => clock, initialState: snapshot, onFinish: (state) => {
    restoredFinishes += 1;
    assert.equal(state.canSound, false, "refresh must not assume a fresh user gesture");
  } });
  assert.equal(afterRefresh.getState().display, "2:45");
  clock += 165000;
  assert.equal(afterRefresh.tick().status, "finished");
  assert.equal(restoredFinishes, 1);
  const finishedSnapshot = afterRefresh.serialize();
  timer.create({ now: () => clock + 5000, initialState: finishedSnapshot, onFinish: () => { restoredFinishes += 1; } }).tick();
  assert.equal(restoredFinishes, 1, "persisted finish flag prevents another event");
  assert.equal(timer.playFinishSound({ enabled: true, interacted: false }), false);
  assert.equal(timer.playFinishSound({ enabled: false, interacted: true }), false);
}

function testInvalidSnapshotsAndReset() {
  assert.throws(() => timer.create({ initialState: { version: 1, status: "running", remainingMs: 180000, deadlineAt: null, soundEnabled: false, finishEmitted: false } }), /deadline/);
  assert.throws(() => timer.create({ initialState: { version: 1, status: "idle", remainingMs: 999, deadlineAt: null, soundEnabled: false, finishEmitted: false } }), /idle timer/);
  let clock = 0;
  const match = timer.create({ now: () => clock });
  match.setSoundEnabled(true);
  match.start();
  clock += 30000;
  match.reset();
  assert.equal(match.getState().remainingMs, timer.ROUND_MS);
  assert.equal(match.getState().soundEnabled, true, "reset keeps sound preference");
}

testDeadlineAndPause();
testRefreshAndSoundGate();
testInvalidSnapshotsAndReset();
console.log("Score & Strategy timer tests passed.");
