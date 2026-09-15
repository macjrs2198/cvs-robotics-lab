"use strict";

const assert = require("assert");
const scorer = require("../score-model.js");
const optimizer = require("../optimizer.js");

const SALAD = { fruit: 1, vegetables: 1 };
const PIZZA = { grain: 1, vegetables: 1, dairy: 1, protein: 1 };
const SANDWICH = { grain: 2, fruit: 1, vegetables: 1, dairy: 1, protein: 1 };

function meal(id, location, type, timeSeconds, maxRepeats, extras = {}) {
  return {
    id, enabled: true, location, mealType: type, attachedDrink: false,
    standaloneDrink: false, timeSeconds, maxRepeats,
    recipe: type === "salad" ? SALAD : type === "pizza" ? PIZZA : SANDWICH,
    ...extras
  };
}

function planScore(result) {
  assert.ok(result.best, "expected a feasible empty or nonempty plan");
  const exact = scorer.scoreRound(result.best.round, result.scoreOptions || {});
  assert.equal(exact.valid, true);
  assert.equal(exact.total, result.best.score);
  return result.best.score;
}

function resourceUsage(profiles, counts) {
  const used = {
    plates: 0, cups: 0, fruit: 0, vegetables: 0, dairy: 0,
    protein: 0, grain: 0, water: 0, shelfUnits: 0, buffetUnits: 0, diningTables: 0
  };
  profiles.forEach((profile, index) => {
    const count = counts[index];
    if (profile.mealType) {
      used.plates += count;
      for (const key of ["fruit", "vegetables", "dairy", "protein", "grain"]) {
        used[key] += count * (profile.recipe[key] || 0);
      }
    }
    if (profile.attachedDrink || profile.standaloneDrink) {
      used.cups += count;
      used.water += count;
    }
    if (profile.location === "shelf") used.shelfUnits += count;
    if (profile.location === "buffet") used.buffetUnits += count;
    if (profile.location === "dining") used.diningTables += count;
  });
  return used;
}

// Independent tiny exhaustive oracle: builds the scorer input itself, and counts
// resources separately from the optimizer's search and planToRound helpers.
function bruteForce(input) {
  const profiles = input.profiles.filter((profile) => profile.enabled && profile.timeSeconds !== "");
  const budget = { ...optimizer.CONSERVATIVE_BUDGET, ...(input.budget || {}) };
  const limit = Number(input.availableSeconds || 180) - Number(input.reserveSeconds || 0);
  let best = { score: 0, time: 0 };
  const counts = profiles.map(() => 0);
  function visit(index) {
    if (index < profiles.length) {
      for (let count = 0; count <= profiles[index].maxRepeats; count += 1) {
        counts[index] = count;
        visit(index + 1);
      }
      return;
    }
    const used = resourceUsage(profiles, counts);
    if (Object.keys(used).some((key) => used[key] > budget[key])) return;
    const time = profiles.reduce((sum, profile, i) => sum + Number(profile.timeSeconds) * counts[i], 0);
    if (time > limit) return;
    const round = scorer.emptyRound();
    round.buffetQualified = input.buffetQualified === true;
    profiles.forEach((profile, i) => {
      const row = round.locations[profile.location];
      if (profile.mealType) row[profile.mealType] += counts[i];
      if (profile.attachedDrink) row.attachedDrinks += counts[i];
      if (profile.standaloneDrink) row.standaloneDrinks += counts[i];
    });
    const result = scorer.scoreRound(round);
    if (!result.valid) return;
    if (result.total > best.score || (result.total === best.score && time < best.time)) {
      best = { score: result.total, time };
    }
  }
  visit(0);
  return best;
}

async function run() {
  // Synthetic time cases: the source provides points, but no measured cycle times.
  const greedyFails = optimizer.solveSync({
    profiles: [meal("A", "dining", "sandwich", 80, 1), meal("B", "shelf", "sandwich", 50, 2)],
    availableSeconds: 100
  });
  assert.equal(greedyFails.status, "optimal");
  assert.equal(planScore(greedyFails), 110);
  assert.deepEqual(greedyFails.best.counts, [0, 2]);

  const noFit = optimizer.solveSync({profiles: [meal("slow", "field", "sandwich", 200, 1)]});
  assert.equal(noFit.status, "optimal");
  assert.equal(planScore(noFit), 0);
  assert.deepEqual(noFit.best.taskMix, []);

  for (const time of [0, -1, "NaN", "Infinity"]) {
    const invalid = optimizer.solveSync({profiles: [meal("bad", "field", "salad", time, 1)]});
    assert.equal(invalid.status, "invalid", `time ${time} should be rejected`);
  }
  const untimed = optimizer.solveSync({profiles: [meal("untimed", "field", "salad", "", 1)]});
  assert.equal(untimed.status, "optimal");
  assert.equal(planScore(untimed), 0);
  assert.match(untimed.excluded[0].reason, /no measured/);

  const repeats = optimizer.solveSync({profiles: [meal("repeat", "field", "salad", 1, 2)]});
  assert.equal(repeats.best.counts[0], 2);
  assert.equal(planScore(repeats), 20);
  const oversizedRepeats = optimizer.solveSync({profiles: [meal("oversized", "field", "salad", 1, 1000000000)]});
  assert.equal(oversizedRepeats.status, "optimal", "infeasible repeat counts are safely omitted");
  assert.equal(oversizedRepeats.best.counts[0], 6);

  const fractional = optimizer.solveSync({
    profiles: [meal("fraction", "field", "salad", "60.01", 2)],
    availableSeconds: "120.02"
  });
  assert.equal(fractional.best.counts[0], 1);
  assert.equal(fractional.best.timeUsedTenths, 601);
  assert.equal(fractional.usableTenths, 1200);

  const conservative = optimizer.solveSync({profiles: [meal("sandwich", "field", "sandwich", 1, 8)]});
  assert.equal(conservative.best.counts[0], 6, "one-area ingredients limit eight sandwiches");
  assert.equal(conservative.best.resourcesUsed.plates, 6);
  const shared = optimizer.solveSync({
    profiles: [meal("sandwich", "field", "sandwich", 1, 8)],
    budget: optimizer.SHARED_HALF_BUDGET
  });
  assert.equal(shared.best.counts[0], 8, "shared ingredients do not double owned plates");
  assert.equal(shared.best.resourcesUsed.plates, 8);
  assert.equal(shared.budget.plates, 8);
  const cupSharing = optimizer.solveSync({
    profiles: [
      meal("paired", "field", "salad", 1, 8, {attachedDrink: true}),
      {id: "water-only", enabled: true, location: "field", mealType: null,
        attachedDrink: false, standaloneDrink: true, timeSeconds: 1, maxRepeats: 8}
    ],
    budget: {...optimizer.SHARED_HALF_BUDGET, cups: 3}
  });
  assert.ok(cupSharing.best.resourcesUsed.cups <= 3);
  assert.equal(cupSharing.best.resourcesUsed.water, cupSharing.best.resourcesUsed.cups);
  assert.equal(cupSharing.best.round.locations.field.attachedDrinks +
    cupSharing.best.round.locations.field.standaloneDrinks, cupSharing.best.resourcesUsed.cups);

  const unavailableDining = optimizer.solveSync({
    profiles: [meal("dining", "dining", "salad", 1, 2)],
    budget: {...optimizer.CONSERVATIVE_BUDGET, diningTables: 0}
  });
  assert.equal(planScore(unavailableDining), 0);
  const shelfCap = optimizer.solveSync({
    profiles: [meal("shelf", "shelf", "salad", 1, 8)],
    budget: optimizer.SHARED_HALF_BUDGET
  });
  assert.equal(shelfCap.best.counts[0], 7);

  const buffetOff = optimizer.solveSync({profiles: [meal("buffet", "buffet", "salad", 1, 1)]});
  assert.equal(planScore(buffetOff), 0);
  assert.match(buffetOff.excluded[0].reason, /qualification|qualified/);
  const buffetOn = optimizer.solveSync({
    profiles: [meal("buffet", "buffet", "salad", 1, 8)],
    buffetQualified: true
  });
  assert.equal(buffetOn.best.counts[0], 3);
  assert.equal(buffetOn.best.score, 75);
  assert.ok(buffetOn.best.assumptions.some((item) => /Buffet/.test(item)));

  const gardenOnce = optimizer.solveSync({
    profiles: [meal("meal-and-drone", "field", "salad", 20, 2, {includedGarden: ["drone"]})],
    gardenTasks: [{id: "drone", enabled: true, timeSeconds: 5}],
    availableSeconds: 40
  });
  assert.equal(gardenOnce.best.score, 28, "drone credited once despite two cycles");
  assert.deepEqual(gardenOnce.best.gardenSelections, [0], "do not waste extra overlapping time");
  assert.equal(gardenOnce.best.round.garden.drone, true);

  const custom = optimizer.solveSync({
    mode: "custom", profiles: [{
      id: "custom-cycle", enabled: true, practiceObjectiveId: "task-a",
      timeSeconds: 10, maxRepeats: 3
    }],
    scoreOptions: {practiceObjectives: [{id: "task-a", name: "User task", points: 7, maxCount: 3}]}
  });
  assert.equal(custom.status, "optimal");
  assert.equal(custom.best.score, 21);
  assert.equal(custom.best.round.practiceCounts["task-a"], 3);
  assert.equal(scorer.scoreRound(custom.best.round, custom.scoreOptions).total, 21);
  const sharedCustomCap = optimizer.solveSync({
    mode: "custom", profiles: [
      {id: "fast", enabled: true, practiceObjectiveId: "task-a", timeSeconds: 1, maxRepeats: 3},
      {id: "slow", enabled: true, practiceObjectiveId: "task-a", timeSeconds: 2, maxRepeats: 3}
    ],
    scoreOptions: {practiceObjectives: [{id: "task-a", name: "User task", points: 7, maxCount: 3}]}
  });
  assert.equal(sharedCustomCap.best.round.practiceCounts["task-a"], 3);
  assert.equal(sharedCustomCap.best.timeUsedTenths, 30);

  assert.equal(optimizer.solveSync({profiles: [meal("bad-recipe", "field", "sandwich", 1, 1, {recipe: SALAD})]}).status, "invalid");
  assert.equal(optimizer.solveSync({profiles: [meal("unknown-ingredient", "field", "salad", 1, 1, {recipe: {fruit: 1, vegetables: 1, mystery: 2}})]}).status, "invalid");
  assert.equal(optimizer.solveSync({budget: {...optimizer.CONSERVATIVE_BUDGET, plates: 16}}).status, "invalid");
  assert.equal(optimizer.solveSync({reserveSeconds: 181}).status, "invalid");
  assert.equal(optimizer.solveSync({availableSeconds: 181}).status, "invalid");
  assert.equal(optimizer.solveSync({availableSeconds: "180.01"}).status, "invalid");
  assert.equal(optimizer.solveSync({mode: "custom", availableSeconds: 181}).status, "optimal");
  assert.equal(optimizer.solveSync({profiles: [null]}).status, "invalid");
  assert.equal(optimizer.solveSync({profiles: {not: "a list"}}).status, "invalid");
  assert.equal(optimizer.solveSync({budget: null}).status, "invalid");
  assert.equal(optimizer.solveSync({budget: {...optimizer.CONSERVATIVE_BUDGET, plates: null}}).status, "invalid");
  assert.equal(optimizer.solveSync({budget: {...optimizer.CONSERVATIVE_BUDGET, plates: true}}).status, "invalid");
  assert.equal(optimizer.solveSync({mode: "typo"}).status, "invalid");
  assert.equal(optimizer.solveSync({buffetQualified: "true"}).status, "invalid");
  assert.equal(optimizer.solveSync({profiles: [meal("bad-attached", "field", "salad", 1, 1, {attachedDrink: "true"})]}).status, "invalid");
  assert.equal(optimizer.solveSync({profiles: [meal("bad-enabled", "field", "salad", 1, 1, {enabled: "true"})]}).status, "invalid");
  assert.equal(optimizer.solveSync({budget: {...optimizer.CONSERVATIVE_BUDGET, extra: 1}}).status, "invalid");

  const bounded = optimizer.solveSync({
    profiles: [
      meal("one", "field", "salad", 1, 8),
      meal("two", "shelf", "salad", 1, 8),
      meal("three", "qca", "salad", 1, 8)
    ],
    maxStates: 4
  });
  assert.equal(bounded.status, "incomplete");
  assert.equal(scorer.scoreRound(bounded.best.round).valid, true);
  const sixProfilesAndGardens = optimizer.solveSync({
    profiles: Array.from({length: 6}, (_, index) => meal(`cycle-${index}`, "field", "salad", 1, 8)),
    gardenTasks: optimizer.GARDEN.map((id) => ({id, enabled: true, timeSeconds: 1})),
    budget: optimizer.SHARED_HALF_BUDGET
  });
  assert.equal(sixProfilesAndGardens.status, "optimal", "a plausible small profile set should complete at the default bounded budget");
  assert.equal(sixProfilesAndGardens.best.score, 116);

  // Many deterministic, independently enumerated small combinations.
  let seed = 83451;
  function random(max) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  }
  const destinations = ["field", "shelf", "dining", "qca"];
  const types = ["salad", "pizza", "sandwich"];
  for (let caseIndex = 0; caseIndex < 100; caseIndex += 1) {
    const count = 1 + random(3);
    const profiles = Array.from({length: count}, (_, index) =>
      meal(`case-${caseIndex}-${index}`, destinations[random(destinations.length)], types[random(types.length)], 10 + random(41), 1 + random(3)));
    const input = {
      profiles, availableSeconds: 30 + random(101),
      budget: {...optimizer.CONSERVATIVE_BUDGET, plates: 1 + random(4),
        cups: 2 + random(3), fruit: 1 + random(6), vegetables: 1 + random(6),
        dairy: 1 + random(6), protein: 1 + random(6), grain: 2 + random(11),
        diningTables: random(5)}
    };
    const oracle = bruteForce(input);
    const actual = optimizer.solveSync(input);
    assert.equal(actual.status, "optimal", `small case ${caseIndex} should finish`);
    assert.equal(actual.best.score, oracle.score, `score mismatch for small case ${caseIndex}`);
    assert.equal(actual.best.timeUsedTenths / 10, oracle.time, `time tie mismatch for small case ${caseIndex}`);
    planScore(actual);
    for (const key of Object.keys(actual.best.resourcesUsed)) {
      assert.ok(actual.best.resourcesUsed[key] <= actual.budget[key], `resource ${key} exceeded in small case ${caseIndex}`);
    }
  }

  let callbackBeforeFinish = false;
  const cooperative = optimizer.createSearch({
    profiles: [meal("a", "field", "salad", 1, 8), meal("b", "shelf", "salad", 1, 8)]
  });
  setTimeout(() => { callbackBeforeFinish = true; }, 0);
  const cooperativeResult = await optimizer.runCooperatively(cooperative, null, 1);
  assert.equal(cooperativeResult.status, "optimal");
  assert.equal(callbackBeforeFinish, true, "small chunks yield to the browser event loop");
  const cancelled = optimizer.createSearch({profiles: [meal("a", "field", "salad", 1, 8)]});
  assert.equal(cancelled.cancel().status, "cancelled");
  assert.equal(cancelled.step().status, "cancelled");

  console.log("CVS Score & Strategy optimizer tests passed: synthetic cases, 100 independent exhaustive cases, shared rescoring, and cooperative/cancel behavior.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
