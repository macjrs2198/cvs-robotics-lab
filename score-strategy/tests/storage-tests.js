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
    scoreKind: "practice",
    rulesetId: "best-2026-v3.3-sep10",
    rulesetVersion: "v3.3 September 10, 2026",
    labels: { team, driver: "Driver", round: "Practice" },
    note: "End-state observation",
    rawInput: {
      locations: { field: { sandwich: 1, salad: 0, pizza: 0, attachedDrinks: 0, standaloneDrinks: 0 } },
      garden: {},
    },
    result: { total: 50, breakdown: { field: 50 } },
  };
}

function legacyRound(id = "legacy-dq") {
  const saved = round(id);
  delete saved.scoreKind;
  saved.rawInput = {
    ...saved.rawInput,
    locations: { field: { ...saved.rawInput.locations.field, sandwich: 2 } },
    buffetQualified: false,
    disqualified: true,
    suspensions: 1,
  };
  saved.result = { valid: true, total: 0, rawTotal: 100, issues: [], breakdown: { field: 100 }, disqualified: true };
  return saved;
}

function testSnapshotAndRoundTrip() {
  const memory = memoryStorage();
  const db = storageApi.create({ storage: memory, validateRound: (entry) => entry.result.total === entry.rawInput.locations.field.sandwich * 50 });
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
  const fresh = storageApi.create({ storage: memoryStorage(), validateRound: (entry) => entry.result.total === entry.rawInput.locations.field.sandwich * 50 });
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
  const db = storageApi.create({ storage: memory, validateRound: (entry) => entry.result.total === entry.rawInput.locations.field.sandwich * 50 });
  db.saveRound(round());
  const before = memory.read(storageApi.DEFAULT_KEY);
  const exportData = JSON.parse(db.exportPortable());
  exportData.rounds[0].result.total = 999;
  const checking = storageApi.create({ storage: memory, validateRound: (entry) => entry.result.total === entry.rawInput.locations.field.sandwich * 50 });
  assert.throws(() => checking.importPortable(JSON.stringify(exportData), { replace: true, confirmed: true }), /does not match its entries/);
  assert.equal(memory.read(storageApi.DEFAULT_KEY), before, "failed import must leave storage unchanged");
  assert.throws(() => db.importPortable("not json"), /valid JSON/);
  assert.throws(() => db.importPortable(db.exportPortable()), /already in history/);
  assert.equal(memory.read(storageApi.DEFAULT_KEY), before);
  const bad = round("bad");
  bad.result = { total: NaN };
  assert.throws(() => db.saveRound(bad), /cannot be saved as JSON|Practice score/);
  assert.equal(db.listRounds().length, 1);
  assert.throws(() => db.removeRound("one"), /confirmation/);
  assert.equal(db.removeRound("one", { confirmed: true }), true);
  assert.equal(db.listRounds().length, 0);
}

function testCsvAndCapacity() {
  const dangerous = round("one", "=SUM(1,2)");
  dangerous.id = "=unsafe-id";
  dangerous.rulesetId = "@unsafe-ruleset";
  dangerous.rulesetVersion = "+unsafe-version";
  dangerous.labels.driver = "  +CMD";
  dangerous.labels.round = "@formula";
  dangerous.note = "-2\nSecond line, \"quoted\"";
  const csv = storageApi.exportRoundsCsv([dangerous]);
  assert.match(csv, /"practice_score"/);
  assert.match(csv, /"50"/);
  assert.match(csv, /"historical_recorded_total"/);
  assert.doesNotMatch(csv, /"awarded_total"/);
  assert.match(csv, /"'=SUM\(1,2\)"/);
  assert.match(csv, /"'=unsafe-id"/);
  assert.match(csv, /"'@unsafe-ruleset"/);
  assert.match(csv, /"'\+unsafe-version"/);
  assert.match(csv, /"'  \+CMD"/);
  assert.match(csv, /"'@formula"/);
  assert.match(csv, /"'-2\nSecond line, ""quoted"""/);
  assert.equal(storageApi.escapeHtml("<img src=x onerror='bad'>&"), "&lt;img src=x onerror=&#39;bad&#39;&gt;&amp;");
  const db = storageApi.create({ storage: memoryStorage() });
  for (let i = 0; i < storageApi.HISTORY_LIMIT; i += 1) db.saveRound(round(`round-${i}`));
  assert.throws(() => db.saveRound(round("extra")), /Export it and remove/);
  assert.equal(db.listRounds().length, storageApi.HISTORY_LIMIT);
}

function testPracticeSaveIsNotARefereeGate() {
  const db = storageApi.create({ storage: memoryStorage(), validateRound: (entry) => entry.result.total ===
    entry.rawInput.locations.field.sandwich * 50 + entry.rawInput.locations.field.attachedDrinks * 12 });
  const nine = round("nine");
  nine.rawInput.locations.field.sandwich = 9;
  nine.result.total = 450;
  delete nine.labels;
  delete nine.note;
  db.saveRound(nine);
  assert.equal(db.listRounds()[0].result.total, 450, "competition plate capacity cannot block a practice save");
  const drinkFirst = round("drink-first");
  drinkFirst.rawInput.locations.field.sandwich = 0;
  drinkFirst.rawInput.locations.field.attachedDrinks = 1;
  drinkFirst.result.total = 12;
  db.saveRound(drinkFirst);
  assert.equal(db.listRounds()[0].result.total, 12, "an attached drink may be entered before its meal");
  assert.equal(db.getState().timer, null, "saving does not need a finished timer");
  const portable = JSON.parse(db.exportPortable());
  assert.deepEqual(portable.rounds.map((item) => item.result.total), [12, 450], "new export stores the displayed practice scores");
  assert.ok(portable.rounds.every((item) => item.scoreKind === "practice"));
  assert.ok(portable.rounds.every((item) => !Object.prototype.hasOwnProperty.call(item.rawInput, "disqualified")));
}

function testLegacyHistoryAndExportAdapter() {
  const memory = memoryStorage();
  const legacy = legacyRound();
  const unresolved = legacyRound("legacy-unconfirmed");
  unresolved.rawInput.disqualified = false;
  unresolved.result = { valid: false, total: null, rawTotal: null, issues: ["Buffet unconfirmed"], breakdown: null, status: "needs-review" };
  const separateAward = legacyRound("legacy-awarded-total");
  delete separateAward.result.total;
  separateAward.result.awardedTotal = 0;
  separateAward.result.rawTotal = 96;
  const oldState = { ...storageApi.emptyState(), rounds: [legacy, unresolved, separateAward], drafts: {
    "best-2026-v3.3-sep10": { rawInput: legacy.rawInput, updatedAt: "2026-09-15T12:00:00Z" },
  } };
  memory.setItem(storageApi.DEFAULT_KEY, JSON.stringify(oldState));
  const originalBytes = memory.read(storageApi.DEFAULT_KEY);
  let validationCalls = 0;
  const validateRound = () => { validationCalls += 1; return false; };
  const db = storageApi.create({ storage: memory, validateRound });
  assert.equal(validationCalls, 0, "legacy history is not revalidated against new practice arithmetic");
  assert.deepEqual(db.listRounds(), oldState.rounds, "old awards and unresolved results remain recorded exactly");
  assert.equal(memory.read(storageApi.DEFAULT_KEY), originalBytes, "reading old records never rewrites local storage");
  assert.deepEqual(db.getDraft("best-2026-v3.3-sep10").rawInput, legacy.rawInput, "old DQ-marked draft remains available for the UI adapter");
  const oldPortable = JSON.parse(db.exportPortable());
  delete oldPortable.customPreset;
  delete oldPortable.planningProfiles;
  const imported = storageApi.create({ storage: memoryStorage(), validateRound });
  imported.importPortable(JSON.stringify(oldPortable));
  assert.equal(validationCalls, 0, "portable legacy history bypasses only obsolete scorer validation");
  assert.deepEqual(imported.listRounds(), oldState.rounds);
  const csv = imported.exportRoundsCsv();
  assert.match(csv, /"historical_recorded_total"/);
  assert.match(csv, /"100"/);
  assert.match(csv, /"true"/);
  const modern = round("new-96");
  modern.rawInput.locations.field.sandwich = 0;
  modern.result.total = 96;
  assert.throws(() => imported.saveRound(modern), /does not match its entries/, "current practice entries still require arithmetic consistency");
  assert.deepEqual(imported.listRounds(), oldState.rounds, "failed current save cannot rewrite old records");
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
testLegacyHistoryAndExportAdapter();
testPracticeSaveIsNotARefereeGate();
console.log("Score & Strategy storage tests passed.");
