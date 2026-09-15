"use strict";

const assert = require("node:assert/strict");
const app = require("../app.js");
const model = require("../score-model.js");
const timerApi = require("../timer.js");
const storageApi = require("../storage.js");
const optimizerApi = require("../optimizer.js");

function memoryStorage() {
  const state = new Map();
  return { getItem: (key) => state.has(key) ? state.get(key) : null, setItem: (key, value) => state.set(key, value) };
}

function testSourceRoundPersistence() {
  const round = model.emptyRound();
  round.locations.field.sandwich = 1;
  round.locations.field.attachedDrinks = 1;
  round.disqualified = true;
  round.suspensions = 1;
  const result = model.scoreRound(round, { mode: "best" });
  assert.equal(result.total, 62);
  const snapshot = app.makeSavedSnapshot({ round, result, mode: "best", model, labels: { team: "Test", driver: "", round: "" }, note: "After buzzer", planned: false });
  assert.equal(app.validateRoundSnapshot(snapshot, model), true);
  const memory = memoryStorage();
  const db = storageApi.create({ storage: memory, validateRound: (entry) => app.validateRoundSnapshot(entry, model) });
  db.saveRound(snapshot);
  const exportData = db.exportPortable();
  const imported = storageApi.create({ storage: memoryStorage(), validateRound: (entry) => app.validateRoundSnapshot(entry, model) });
  imported.importPortable(exportData);
  assert.equal(imported.listRounds()[0].result.total, 62);
  assert.equal(imported.listRounds()[0].scoreKind, "practice");
  assert.equal(imported.listRounds()[0].rawInput.disqualified, undefined, "new practice saves omit legacy referee flags");
  assert.equal(imported.listRounds()[0].rawInput.suspensions, undefined);
  assert.equal(imported.listRounds()[0].result.rawTotal, undefined, "new practice saves do not split raw and awarded totals");
  const changed = JSON.parse(exportData);
  changed.rounds[0].result.total = 61;
  assert.throws(() => imported.importPortable(changed, { replace: true, confirmed: true }), /does not match/);
  assert.equal(imported.listRounds()[0].result.total, 62, "failed import cannot rewrite history");
  const malformed = JSON.parse(exportData);
  malformed.rounds[0].rawInput.locations.field.sandwich = "not a count";
  assert.throws(() => imported.importPortable(malformed, { replace: true, confirmed: true }), /does not match/);
  assert.equal(imported.listRounds()[0].result.total, 62, "malformed new export cannot rewrite history");
}

function testCustomIsolationAndBuffetArithmetic() {
  const objectives = [{ id: "custom-marker", name: "Marker", points: 7, maxCount: 2 }];
  const round = model.emptyRound();
  round.practiceCounts["custom-marker"] = 2;
  const result = model.scoreRound(round, { mode: "custom", practiceObjectives: objectives });
  assert.equal(result.total, 14);
  const preset = { name: "Custom Practice", objectives };
  const snapshot = app.makeSavedSnapshot({ round, result, mode: "custom", model, labels: { team: "Practice", driver: "", round: "" }, note: "Custom", customPreset: preset });
  assert.equal(app.validateRoundSnapshot(snapshot, model), true);
  assert.equal(snapshot.rulesetId, model.CUSTOM_RULESET_ID);
  const illegal = model.emptyRound();
  illegal.practiceCounts["custom-marker"] = 2;
  illegal.locations.field.sandwich = 1;
  assert.equal(model.scoreRound(illegal, { mode: "custom", practiceObjectives: objectives }).valid, false, "hidden BEST points cannot leak into custom");
  const buffet = model.emptyRound();
  buffet.locations.buffet.sandwich = 1;
  const practice = model.scoreRound(buffet, { mode: "best" });
  assert.equal(practice.valid, true);
  assert.equal(practice.total, 65);
  assert.equal(app.validateRoundSnapshot(app.makeSavedSnapshot({ round: buffet, result: practice, mode: "best", model, labels: {}, note: "" }), model), true);
  assert.equal(app.parseCount(""), 0, "blank direct count contributes zero");
  assert.equal(app.parseCount("-1"), "-1");
  assert.equal(app.parseCount("0"), 0);
  const typed = model.emptyRound();
  typed.locations.field.sandwich = 1;
  typed.locations.field.pizza = "bad paste";
  assert.equal(model.scoreRound(typed, { mode: "best" }).total, 50, "one malformed field cannot erase another contribution");
  const clean = app.makeSavedSnapshot({ round: typed, result: model.scoreRound(typed, { mode: "best" }), mode: "best", model, labels: {}, note: "" });
  assert.equal(clean.rawInput.locations.field.pizza, 0, "new save normalizes malformed text to zero");
  assert.equal(app.validateRoundSnapshot(clean, model), true);
}

function testOptimizerScorerAgreementAndTimerIndependence() {
  let clock = 0;
  const timer = timerApi.create({ now: () => clock });
  timer.start();
  const deadline = timer.serialize().deadlineAt;
  const search = optimizerApi.solveSync({
    mode: "byte-to-bite", availableSeconds: 180, reserveSeconds: 0,
    budget: optimizerApi.CONSERVATIVE_BUDGET,
    profiles: [{ id: "field-sandwich", enabled: true, location: "field", mealType: "sandwich", attachedDrink: false, standaloneDrink: false, recipe: { fruit: 1, vegetables: 1, dairy: 1, protein: 1, grain: 2 }, timeSeconds: "30", maxRepeats: 2 }],
    gardenTasks: [], buffetQualified: false,
    scoreOptions: { mode: "best" }, scoreRound: model.scoreRound,
  });
  assert.equal(search.status, "optimal");
  assert.equal(search.best.score, 100);
  assert.equal(app.verifyOptimizationResult(search, model, { mode: "best" }), true);
  assert.equal(search.best.round.locations.field.sandwich, 2);
  assert.equal(timer.serialize().deadlineAt, deadline, "optimizer/previews must not reset or pause the match timer");
  clock = 60000;
  assert.equal(timer.getState().display, "2:00");
}

testSourceRoundPersistence();
testCustomIsolationAndBuffetArithmetic();
testOptimizerScorerAgreementAndTimerIndependence();
console.log("Score & Strategy app integration tests passed.");
