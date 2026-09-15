/* 2026 BEST Robotics Classic Competition Rules, v3.3 (Sep 10, 2026),
 * sections 3.7.1-3.7.3 and Table 3.7, pages 34-38. This is a practice
 * translation, not a referee decision or official BEST interpretation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CVSScoreModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RULESET_ID = 'best-2026-v3.3-sep10';
  const RULESET_VERSION = '2026 BEST Robotics Classic Competition Rules v3.3, Sep 10, 2026';
  const CUSTOM_RULESET_ID = 'custom-practice-v1';
  const CUSTOM_RULESET_VERSION = 'Custom Practice, user-defined objective values';
  const LOCATION_IDS = Object.freeze(['field', 'shelf', 'buffet', 'dining', 'qca']);
  const MEAL_IDS = Object.freeze(['salad', 'pizza', 'sandwich']);
  const GARDEN_POINTS = Object.freeze({drone: 8, irrigation: 4, vegetables: 4, fruit: 4, cold: 8, grain: 8});
  const LOCATION_BONUS = Object.freeze({field: 0, shelf: 5, buffet: 15, dining: 50, qca: 0});
  const BASE_MEAL = Object.freeze({field: [10, 30, 50], shelf: [10, 30, 50], buffet: [10, 30, 50], dining: [10, 30, 50], qca: [5, 15, 25]});

  function emptyRound() {
    const locations = {};
    for (const id of LOCATION_IDS) locations[id] = {salad: 0, pizza: 0, sandwich: 0, attachedDrinks: 0, standaloneDrinks: 0};
    return {locations, buffetQualified: false, garden: {drone: false, irrigation: false, vegetables: false, fruit: false, cold: false, grain: false}, disqualified: false, suspensions: 0, practiceCounts: {}};
  }

  function isCount(value) { return Number.isSafeInteger(value) && value >= 0; }
  function issue(issues, path, message) { issues.push({path, message}); }

  function validatePracticeObjectives(value, issues) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > 30) {
      issue(issues, 'practiceObjectives', 'Use at most 30 custom practice objectives.');
      return [];
    }
    const seen = new Set();
    const objectives = [];
    value.forEach((item, index) => {
      const path = `practiceObjectives.${index}`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) { issue(issues, path, 'Objective must be an object.'); return; }
      if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(item.id) || seen.has(item.id)) issue(issues, `${path}.id`, 'Use a unique ID of letters, numbers, underscores, or hyphens.');
      else seen.add(item.id);
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80) issue(issues, `${path}.name`, 'Name must be 1–80 characters.');
      if (!Number.isSafeInteger(item.points) || item.points < 0 || item.points > 10000) issue(issues, `${path}.points`, 'Points must be an integer from 0 to 10,000.');
      if (!isCount(item.maxCount) || item.maxCount > 1000) issue(issues, `${path}.maxCount`, 'Maximum count must be an integer from 0 to 1,000.');
      objectives.push(item);
    });
    return objectives;
  }

  function scoreRound(round, options) {
    const issues = [];
    const opts = options || {};
    const customMode = opts.mode === 'custom';
    if (opts.mode !== undefined && opts.mode !== 'custom' && opts.mode !== 'best') issue(issues, 'mode', 'Unknown practice ruleset.');
    const objectives = validatePracticeObjectives(opts.practiceObjectives, issues);
    if (!customMode && objectives.length) issue(issues, 'practiceObjectives', 'Custom objective points belong to the separate Custom Practice ruleset.');
    if (!round || typeof round !== 'object' || Array.isArray(round)) {
      issue(issues, 'round', 'Round input must be an object.');
      return {valid: false, total: null, rawTotal: null, issues, breakdown: null, resources: null};
    }
    if (!round.locations || typeof round.locations !== 'object') issue(issues, 'locations', 'Five final scoring locations are required.');
    if (!round.garden || typeof round.garden !== 'object') issue(issues, 'garden', 'Six garden flags are required.');
    for (const key of Object.keys(round)) {
      if (!['locations', 'buffetQualified', 'garden', 'disqualified', 'suspensions', 'practiceCounts'].includes(key)) issue(issues, key, 'Unknown round field; imported data cannot be silently ignored.');
    }
    if (round.locations && typeof round.locations === 'object') {
      for (const key of Object.keys(round.locations)) if (!LOCATION_IDS.includes(key)) issue(issues, `locations.${key}`, 'Unknown final location; imported data cannot be silently ignored.');
    }
    if (typeof round.buffetQualified !== 'boolean') issue(issues, 'buffetQualified', 'Buffet qualification must be explicitly confirmed or unconfirmed.');
    if (typeof round.disqualified !== 'boolean') issue(issues, 'disqualified', 'Disqualification must be a boolean.');
    if (!isCount(round.suspensions)) issue(issues, 'suspensions', 'Suspension count must be a nonnegative integer; it does not change points.');
    if (customMode && round.buffetQualified === true) issue(issues, 'buffetQualified', 'BEST Buffet qualification does not carry into Custom Practice.');
    if (customMode && round.disqualified === true) issue(issues, 'disqualified', 'BEST disqualification does not carry into Custom Practice.');
    if (customMode && isCount(round.suspensions) && round.suspensions > 0) issue(issues, 'suspensions', 'BEST suspension log does not carry into Custom Practice.');

    const breakdown = {locations: {}, garden: {}, practice: {}, officialSubtotal: 0, practiceSubtotal: 0};
    let plates = 0, cups = 0;
    for (const location of LOCATION_IDS) {
      const row = round.locations && round.locations[location];
      if (!row || typeof row !== 'object') { issue(issues, `locations.${location}`, 'This location is required.'); continue; }
      for (const key of Object.keys(row)) {
        if (![...MEAL_IDS, 'attachedDrinks', 'standaloneDrinks'].includes(key)) issue(issues, `locations.${location}.${key}`, 'Unknown location field; imported counts cannot be silently ignored.');
      }
      for (const key of [...MEAL_IDS, 'attachedDrinks', 'standaloneDrinks']) {
        if (!isCount(row[key])) issue(issues, `locations.${location}.${key}`, 'Enter a nonnegative whole count.');
      }
      if ([...MEAL_IDS, 'attachedDrinks', 'standaloneDrinks'].some(key => !isCount(row[key]))) continue;
      const meals = row.salad + row.pizza + row.sandwich;
      const units = meals + row.standaloneDrinks;
      if (customMode && (units || row.attachedDrinks)) issue(issues, `locations.${location}`, 'BEST location counts do not carry into a separate Custom Practice round.');
      if (row.attachedDrinks > meals) issue(issues, `locations.${location}.attachedDrinks`, 'Attached drinks are a subset of meals: at most one per meal.');
      if (location === 'dining' && row.standaloneDrinks) issue(issues, 'locations.dining.standaloneDrinks', 'Standalone drinks cannot score in the Dining Room.');
      if (location === 'shelf' && units > 7) issue(issues, 'locations.shelf', 'Warming Shelf has at most seven scored units per team.');
      if (location === 'buffet' && units > 3) issue(issues, 'locations.buffet', 'Balance Buffet has at most three scored units per team.');
      if (location === 'dining' && meals > 8) issue(issues, 'locations.dining', 'At most eight team-owned plated meals can be scored at distinct Dining Room tables.');
      if (location === 'buffet' && units && round.buffetQualified !== true) issue(issues, 'buffetQualified', 'Buffet entries need human confirmation of designated side, balance, and pivot-only support; reclassify any different final position yourself.');
      plates += meals;
      cups += row.attachedDrinks + row.standaloneDrinks;
      const mealPoints = MEAL_IDS.reduce((sum, key, index) => sum + row[key] * BASE_MEAL[location][index], 0);
      const drinkPoints = row.attachedDrinks * (location === 'qca' ? 6 : 12) + row.standaloneDrinks * (location === 'qca' ? 2 : 4);
      const locationPoints = units * LOCATION_BONUS[location];
      const subtotal = mealPoints + drinkPoints + locationPoints;
      breakdown.locations[location] = {meals, attachedDrinks: row.attachedDrinks, standaloneDrinks: row.standaloneDrinks, units, mealPoints, drinkPoints, locationPoints, subtotal};
      if (!customMode) breakdown.officialSubtotal += subtotal;
    }
    if (plates > 8) issue(issues, 'locations', `Team-owned plates exceeded: ${plates} used, eight available across all locations.`);
    if (cups > 8) issue(issues, 'locations', `Team-owned cups exceeded: ${cups} used, eight available across all locations.`);
    for (const [key, points] of Object.entries(GARDEN_POINTS)) {
      const selected = round.garden && round.garden[key];
      if (typeof selected !== 'boolean') issue(issues, `garden.${key}`, 'Garden task must be a boolean.');
      if (customMode && selected === true) issue(issues, `garden.${key}`, 'BEST Garden flags do not carry into a separate Custom Practice round.');
      const subtotal = selected === true ? points : 0;
      breakdown.garden[key] = {selected: selected === true, points, subtotal};
      if (!customMode) breakdown.officialSubtotal += subtotal;
    }
    if (round.garden && typeof round.garden === 'object') {
      for (const key of Object.keys(round.garden)) if (!(key in GARDEN_POINTS)) issue(issues, `garden.${key}`, 'Unknown Garden flag; imported data cannot be silently ignored.');
    }
    const counts = round.practiceCounts === undefined ? {} : round.practiceCounts;
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) issue(issues, 'practiceCounts', 'Custom practice counts must be an object.');
    else {
      const allowed = new Set(objectives.map(item => item.id));
      for (const key of Object.keys(counts)) if (!allowed.has(key)) issue(issues, `practiceCounts.${key}`, 'Unknown custom objective; no hidden points awarded.');
      for (const item of objectives) {
        const count = counts[item.id] === undefined ? 0 : counts[item.id];
        if (!isCount(count) || count > item.maxCount) issue(issues, `practiceCounts.${item.id}`, `Count must be a whole number from 0 to ${item.maxCount}.`);
        else {
          const subtotal = count * item.points;
          breakdown.practice[item.id] = {name: item.name, count, points: item.points, subtotal};
          breakdown.practiceSubtotal += subtotal;
        }
      }
    }
    const resources = {plates, cups, shelfUnits: breakdown.locations.shelf ? breakdown.locations.shelf.units : 0, buffetUnits: breakdown.locations.buffet ? breakdown.locations.buffet.units : 0, diningMeals: breakdown.locations.dining ? breakdown.locations.dining.meals : 0};
    const valid = issues.length === 0;
    const rawTotal = valid ? breakdown.officialSubtotal + breakdown.practiceSubtotal : null;
    return {valid, total: valid ? (round.disqualified ? 0 : rawTotal) : null, rawTotal, issues, breakdown, resources, disqualified: round.disqualified === true, rulesetId: customMode ? CUSTOM_RULESET_ID : RULESET_ID, rulesetVersion: customMode ? CUSTOM_RULESET_VERSION : RULESET_VERSION};
  }

  return {RULESET_ID, RULESET_VERSION, CUSTOM_RULESET_ID, CUSTOM_RULESET_VERSION, LOCATION_IDS, MEAL_IDS, GARDEN_POINTS, LOCATION_BONUS, BASE_MEAL, emptyRound, scoreRound};
});
