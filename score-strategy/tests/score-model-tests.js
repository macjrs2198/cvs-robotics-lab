const assert = require('node:assert/strict');
const model = require('../score-model.js');

function roundAt(location, changes, other) {
  const round = model.emptyRound();
  Object.assign(round.locations[location], changes);
  if (other) Object.assign(round, other);
  return round;
}
function total(location, changes, extra) {
  const result = model.scoreRound(roundAt(location, changes, extra));
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  return result.total;
}
function invalid(round, path) {
  const result = model.scoreRound(round);
  assert.equal(result.valid, false);
  assert.ok(result.total === null || Number.isSafeInteger(result.total));
  assert.ok(result.issues.some(issue => issue.path.includes(path)), JSON.stringify(result.issues));
}

for (const [location, plain, withDrink] of [
  ['field', 50, 62], ['shelf', 55, 67], ['buffet', 65, 77],
  ['dining', 100, 112], ['qca', 25, 31]
]) {
  assert.equal(total(location, {sandwich: 1}), plain, `${location} sandwich`);
  assert.equal(total(location, {sandwich: 1, attachedDrinks: 1}), withDrink, `${location} pair`);
}
for (const [location, rates, bonus, drinkRate] of [
  ['field', [10, 30, 50], 0, 12], ['shelf', [10, 30, 50], 5, 12],
  ['buffet', [10, 30, 50], 15, 12], ['dining', [10, 30, 50], 50, 12],
  ['qca', [5, 15, 25], 0, 6]
]) {
  for (const [index, meal] of ['salad', 'pizza', 'sandwich'].entries()) {
    assert.equal(total(location, {[meal]: 1}), rates[index] + bonus, `${location} ${meal}`);
    assert.equal(total(location, {[meal]: 1, attachedDrinks: 1}), rates[index] + bonus + drinkRate, `${location} ${meal} with drink`);
  }
}
assert.equal(model.scoreRound(model.emptyRound()).total, 0, 'zero round');
for (const [location, points] of [['field', 4], ['shelf', 9], ['buffet', 19], ['qca', 2]]) {
  assert.equal(total(location, {standaloneDrinks: 1}), points, `${location} standalone`);
}
assert.equal(total('field', {salad: 1, pizza: 1, sandwich: 1, attachedDrinks: 2, standaloneDrinks: 1}), 118);
const gardens = model.emptyRound();
for (const key of Object.keys(gardens.garden)) gardens.garden[key] = true;
assert.equal(model.scoreRound(gardens).total, 36);
gardens.suspensions = 2;
assert.equal(model.scoreRound(gardens).total, 36, 'suspension does not deduct points');
gardens.disqualified = true;
assert.equal(model.scoreRound(gardens).total, 36, 'legacy DQ cannot zero practice tally');
assert.equal(model.scoreRound(gardens).rawTotal, 36);

// A: old DQ-marked 96-point drafts still restore the arithmetic score.
const legacy96 = model.emptyRound();
legacy96.locations.field.sandwich = 1;
legacy96.locations.field.salad = 1;
for (const key of Object.keys(legacy96.garden)) legacy96.garden[key] = true;
legacy96.disqualified = true;
legacy96.buffetQualified = false;
assert.equal(model.scoreRound(legacy96).valid, true);
assert.equal(model.scoreRound(legacy96).total, 96);

// B-D: the location and attached-drink schedule remains unchanged.
assert.equal(total('field', {sandwich: 1}), 50);
assert.equal(total('field', {sandwich: 1, attachedDrinks: 1}), 62);
assert.equal(total('buffet', {sandwich: 1}), 65, 'no qualification flag required');
assert.equal(total('dining', {sandwich: 1, attachedDrinks: 1}), 112);
assert.equal(total('qca', {sandwich: 1, attachedDrinks: 1}), 31);

// E-F: entry order and competition capacities do not constrain manual scoring.
assert.equal(total('field', {attachedDrinks: 1}), 12, 'drink-first input');
assert.equal(total('field', {attachedDrinks: 1, sandwich: 1}), 62, 'meal added later');
assert.equal(total('field', {salad: 1, attachedDrinks: 2}), 34, 'no meal-subset gate');
assert.equal(total('field', {sandwich: 9}), 450, 'nine plates are allowed in practice tally');
assert.equal(total('shelf', {sandwich: 9}), 495, 'no shelf cap in manual tally');
assert.equal(total('buffet', {sandwich: 9}), 585, 'no Buffet cap or qualification gate');
const overCups = model.emptyRound();
overCups.locations.field.standaloneDrinks = 5;
overCups.locations.qca.standaloneDrinks = 4;
assert.equal(model.scoreRound(overCups).valid, true);
assert.equal(model.scoreRound(overCups).total, 28);
assert.equal(model.scoreRound(overCups).resources.cups, 9);

// G: blanks and malformed text contribute zero without erasing other entries.
const blank = roundAt('field', {sandwich: 1, pizza: '', salad: 'not a number', attachedDrinks: ' '});
assert.equal(model.scoreRound(blank).valid, true);
assert.equal(model.scoreRound(blank).total, 50);
assert.equal(total('field', {sandwich: '1', salad: -1}), 50);
assert.equal(total('field', {sandwich: 1, salad: Infinity}), 50);
const normalized = model.normalizeRound({...blank, disqualified: true, buffetQualified: false, suspensions: 4});
assert.equal(normalized.locations.field.sandwich, 1);
assert.equal(normalized.locations.field.salad, 0);
assert.equal(normalized.locations.field.pizza, 0);
assert.equal(normalized.disqualified, undefined);
assert.equal(normalized.buffetQualified, undefined);
assert.equal(normalized.suspensions, undefined);

// Unknown import fields and unsupported categories are technical safeguards,
// not a validation step for ordinary number entry.
invalid(roundAt('dining', {standaloneDrinks: 1}), 'dining.standaloneDrinks');
assert.equal(model.scoreRound(roundAt('dining', {standaloneDrinks: 1})).total, 0, 'unsupported Dining standalone gets no points');
const unknownLocation = model.emptyRound();
unknownLocation.locations.extra = {salad: 99};
invalid(unknownLocation, 'locations.extra');
const unknownField = model.emptyRound();
unknownField.locations.field.championshipBonus = 100;
invalid(unknownField, 'field.championshipBonus');

const practice = model.emptyRound();
practice.practiceCounts = {custom_task: 2};
const practiceResult = model.scoreRound(practice, {mode: 'custom', practiceObjectives: [{id: 'custom_task', name: 'Practice pickup', points: 7, maxCount: 3}]});
assert.equal(practiceResult.valid, true);
assert.equal(practiceResult.total, 14);
assert.equal(practiceResult.breakdown.officialSubtotal, 0);
assert.equal(practiceResult.rulesetId, model.CUSTOM_RULESET_ID);
practice.practiceCounts.custom_task = 9;
assert.equal(model.scoreRound(practice, {mode: 'custom', practiceObjectives: [{id: 'custom_task', name: 'Practice pickup', points: 7, maxCount: 3}]}).total, 63, 'planning maxCount cannot cap manual tally');
invalid(practice, 'practiceCounts');
const mixed = model.emptyRound();
mixed.locations.field.salad = 1;
mixed.practiceCounts = {custom_task: 1};
assert.equal(model.scoreRound(mixed, {mode: 'custom', practiceObjectives: [{id: 'custom_task', name: 'Practice pickup', points: 7, maxCount: 3}]}).valid, false);

console.log('score model: source schedule, arithmetic A-G, legacy flags, numeric safety, custom practice pass');
