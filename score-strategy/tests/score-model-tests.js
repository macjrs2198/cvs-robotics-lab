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
  assert.equal(result.total, null);
  assert.ok(result.issues.some(issue => issue.path.includes(path)), JSON.stringify(result.issues));
}

for (const [location, plain, withDrink] of [
  ['field', 50, 62], ['shelf', 55, 67], ['buffet', 65, 77],
  ['dining', 100, 112], ['qca', 25, 31]
]) {
  const extra = location === 'buffet' ? {buffetQualified: true} : undefined;
  assert.equal(total(location, {sandwich: 1}, extra), plain, `${location} sandwich`);
  assert.equal(total(location, {sandwich: 1, attachedDrinks: 1}, extra), withDrink, `${location} pair`);
}
for (const [location, rates, bonus, drinkRate] of [
  ['field', [10, 30, 50], 0, 12], ['shelf', [10, 30, 50], 5, 12],
  ['buffet', [10, 30, 50], 15, 12], ['dining', [10, 30, 50], 50, 12],
  ['qca', [5, 15, 25], 0, 6]
]) {
  const extra = location === 'buffet' ? {buffetQualified: true} : undefined;
  for (const [index, meal] of ['salad', 'pizza', 'sandwich'].entries()) {
    assert.equal(total(location, {[meal]: 1}, extra), rates[index] + bonus, `${location} ${meal}`);
    assert.equal(total(location, {[meal]: 1, attachedDrinks: 1}, extra), rates[index] + bonus + drinkRate, `${location} ${meal} with drink`);
  }
}
assert.equal(model.scoreRound(model.emptyRound()).total, 0, 'zero round');
for (const [location, points] of [['field', 4], ['shelf', 9], ['buffet', 19], ['qca', 2]]) {
  const extra = location === 'buffet' ? {buffetQualified: true} : undefined;
  assert.equal(total(location, {standaloneDrinks: 1}, extra), points, `${location} standalone`);
}
assert.equal(total('field', {salad: 1, pizza: 1, sandwich: 1, attachedDrinks: 2, standaloneDrinks: 1}), 118);
const gardens = model.emptyRound();
for (const key of Object.keys(gardens.garden)) gardens.garden[key] = true;
assert.equal(model.scoreRound(gardens).total, 36);
gardens.suspensions = 2;
assert.equal(model.scoreRound(gardens).total, 36, 'suspension does not deduct points');
gardens.disqualified = true;
assert.equal(model.scoreRound(gardens).total, 0);
assert.equal(model.scoreRound(gardens).rawTotal, 36);

invalid(roundAt('field', {salad: 1, attachedDrinks: 2}), 'attachedDrinks');
invalid(roundAt('dining', {standaloneDrinks: 1}), 'dining.standaloneDrinks');
invalid(roundAt('shelf', {standaloneDrinks: 8}), 'shelf');
invalid(roundAt('buffet', {salad: 4}, {buffetQualified: true}), 'buffet');
invalid(roundAt('buffet', {salad: 1}), 'buffetQualified');
invalid(roundAt('dining', {salad: 9}), 'dining');
const overPlates = model.emptyRound();
overPlates.locations.field.salad = 5;
overPlates.locations.qca.pizza = 4;
invalid(overPlates, 'locations');
const overCups = model.emptyRound();
overCups.locations.field.standaloneDrinks = 5;
overCups.locations.qca.standaloneDrinks = 4;
invalid(overCups, 'locations');
const badValue = model.emptyRound();
badValue.locations.field.salad = '1';
invalid(badValue, 'field.salad');
const badNegative = model.emptyRound();
badNegative.locations.field.salad = -1;
invalid(badNegative, 'field.salad');
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
invalid(practice, 'practiceCounts');
const mixed = model.emptyRound();
mixed.locations.field.salad = 1;
mixed.practiceCounts = {custom_task: 1};
assert.equal(model.scoreRound(mixed, {mode: 'custom', practiceObjectives: [{id: 'custom_task', name: 'Practice pickup', points: 7, maxCount: 3}]}).valid, false);

console.log('score model: source examples, caps, DQ, garden, validation, custom practice pass');
