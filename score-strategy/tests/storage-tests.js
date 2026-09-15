"use strict";

const assert = require("node:assert/strict");
const storageApi = require("../storage.js");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { values.set(key, value); },
    read: (key) => values.get(key),
  };
}

function round(id = "one", team = "Team A") {
  return {
    id,
    rulesetId: "best-2026-v3.3-sep10",
    rulesetVersion: "v3.3 September 10, 2026",
    labels: { team, driver: "Driver", round: "Practice" },
    note: "End-state observation",
    rawInput: {
      locations: { field: { sandwich: 1, salad: 0, pizza: 0, attachedDrinks: 0, standaloneDrinks: 0 } },
      buffetQualified: false, garden: {}, disqualified: false, suspensions: 0,
    },
    result: { valid: true, total: 50, rawTotal: 50, issues: [], breakdown: { field: 50 } },
  };
}

function testSnapshotAndRoundTrip() {
  const memory = memoryStorage();
  const db = storageApi.create({ storage: memory, validateRound: (entry) => entry.result.valid === true });
  const original = round();
  db.saveRound(original);
  original.rawInput.locations.field.sandwich = 99;
  assert.equal(db.listRounds()[0].rawInput.locations.field.sandwich, 1, "saved snapshot is immutable from the caller");
  const listed = db.listRounds();
  listed[0].result.total = 999;
  assert.equal(db.listRounds()[0].result.total, 50, "history readers cannot mutate stored arithmetic");
  db.setDraft("best-2026-v3.3-sep10", { rawInput: { score: 3 } });
  db.setDraft("custom-practice", { rawInput: { score: 8 } });
  assert.equal(db.getDraft("best-2026-v3.3-sep10").rawInput.score, 3);
  assert.equal(db.getDraft("custom-practice").rawInput.score, 8, "ruleset drafts remain isolated");
  db.setTimer({ version: 1, status: "paused", remainingMs: 120000, deadlineAt: null, soundEnabled: false, finishEmitted: false });
  db.setCustomPreset({ name: "Practice", objectives: [{ name: "Marker", points: 2, max: 3 }] });
  db.setPlanningProfiles([{ id: "p1", seconds: 25 }]);
  const exportJson = db.exportPortable();
  assert.equal(JSON.parse(exportJson).timer, undefined, "portable import must not start or override the timer");
  const fresh = storageApi.create({ storage: memoryStorage(), validateRound: (entry) => entry.result.valid === true });
  fresh.importPortable(exportJson);
  assert.deepEqual(fresh.listRounds()[0].rawInput, db.listRounds()[0].rawInput);
  assert.deepEqual(fresh.listRounds()[0].result, db.listRounds()[0].result, "historical totals are not recomputed");
  assert.deepEqual(fresh.getState().customPreset, db.getState().customPreset);
  assert.deepEqual(fresh.getState().planningProfiles, db.getState().planningProfiles);
  assert.equal(fresh.getState().timer, null);
  const reloaded = storageApi.create({ storage: memory });
  assert.equal(reloaded.listRounds()[0].result.total, 50);
  assert.equal(reloaded.getState().timer.remainingMs, 120000);
}

function testTransactionalValidation() {
  const memory = memoryStorage();
  const db = storageApi.create({ storage: memory, validateRound: (entry) => entry.result.valid === true });
  db.saveRound(round());
  const before = memory.read(storageApi.DEFAULT_KEY);
  const exportData = JSON.parse(db.exportPortable());
  exportData.rounds[0].rawInput.locations.field.sandwich = -1;
  const checking = storageApi.create({ storage: memory, validateRound: (entry) => entry.rawInput.locations.field.sandwich >= 0 });
  assert.throws(() => checking.importPortable(JSON.stringify(exportData), { replace: true, confirmed: true }), /validation/);
  assert.equal(memory.read(storageApi.DEFAULT_KEY), before, "failed import must leave storage unchanged");
  assert.throws(() => db.importPortable("not json"), /valid JSON/);
  assert.throws(() => db.importPortable(db.exportPortable()), /already in history/);
  assert.equal(memory.read(storageApi.DEFAULT_KEY), before);
  const bad = round("bad");
  bad.result = { valid: false, total: null, rawTotal: 50, issues: ["Buffet unconfirmed"] };
  assert.throws(() => db.saveRound(bad), /awarded total|invalid or unresolved/);
  assert.equal(db.listRounds().length, 1);
  assert.throws(() => db.removeRound("one"), /confirmation/);
  assert.equal(db.removeRound("one", { confirmed: true }), true);
  assert.equal(db.listRounds().length, 0);
}

function testCsvAndCapacity() {
  const dangerous = round("one", "=SUM(1,2)");
  dangerous.labels.driver = "  +CMD";
  dangerous.labels.round = "@formula";
  dangerous.note = "-2\nSecond line, \"quoted\"";
  const csv = storageApi.exportRoundsCsv([dangerous]);
  assert.match(csv, /"'=SUM\(1,2\)"/);
  assert.match(csv, /"'  \+CMD"/);
  assert.match(csv, /"'@formula"/);
  assert.match(csv, /"'-2\nSecond line, ""quoted"""/);
  assert.equal(storageApi.escapeHtml("<img src=x onerror='bad'>&"), "&lt;img src=x onerror=&#39;bad&#39;&gt;&amp;");
  const db = storageApi.create({ storage: memoryStorage() });
  for (let i = 0; i < storageApi.HISTORY_LIMIT; i += 1) db.saveRound(round(`round-${i}`));
  assert.throws(() => db.saveRound(round("extra")), /Export it and remove/);
  assert.equal(db.listRounds().length, storageApi.HISTORY_LIMIT);
}

function testStorageFailure() {
  const memory = memoryStorage();
  let failures = 0;
  memory.setItem = () => { throw new Error("Quota exceeded"); };
  const db = storageApi.create({ storage: memory, onError: () => { failures += 1; } });
  assert.throws(() => db.saveRound(round()), /could not save/);
  assert.equal(failures, 1);
  assert.equal(db.listRounds().length, 0, "failed storage writes cannot look saved in memory");
}

function testPlanningProfileLimit() {
  const db = storageApi.create({ storage: memoryStorage() });
  const valid = Array.from({ length: storageApi.PLANNING_PROFILE_LIMIT }, (_, index) => ({ id: `p-${index}` }));
  db.setPlanningProfiles(valid);
  assert.equal(db.getState().planningProfiles.length, storageApi.PLANNING_PROFILE_LIMIT);
  assert.throws(() => db.setPlanningProfiles([...valid, { id: "extra" }]), /30-profile limit/);
  assert.equal(db.getState().planningProfiles.length, storageApi.PLANNING_PROFILE_LIMIT, "invalid update cannot truncate or mutate planning profiles");
  const portable = JSON.parse(db.exportPortable());
  portable.planningProfiles.push({ id: "extra" });
  assert.throws(() => db.importPortable(portable, { replace: true, confirmed: true }), /No profiles were imported or truncated/);
  assert.equal(db.getState().planningProfiles.length, storageApi.PLANNING_PROFILE_LIMIT);
}

testSnapshotAndRoundTrip();
testTransactionalValidation();
testCsvAndCapacity();
testStorageFailure();
testPlanningProfileLimit();
console.log("Score & Strategy storage tests passed.");
