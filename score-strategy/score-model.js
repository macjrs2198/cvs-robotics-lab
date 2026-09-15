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
    return {locations, garden: {drone: false, irrigation: false, vegetables: false, fruit: false, cold: false, grain: false}, practiceCounts: {}};
  }

  function isCount(value) { return Number.isSafeInteger(value) && value >= 0; }
  function issue(issues, path, message) { issues.push({path, message}); }

  // Inputs may be briefly blank while a student edits them. Invalid text makes
  // only that box contribute zero; it must never erase other earned points.
  function countOrZero(value) {
    if (isCount(value)) return value;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return 0;
      if (/^\d+$/.test(text)) {
        const number = Number(text);
        if (isCount(number)) return number;
      }
    }
    return 0;
  }

  // New snapshots contain only the score-bearing data. This adapter also
  // accepts older rounds with DQ, suspension, and Buffet referee flags.
  function normalizeRound(round) {
    const clean = emptyRound();
    if (!round || typeof round !== 'object' || Array.isArray(round)) return clean;
    for (const location of LOCATION_IDS) {
      const row = round.locations && round.locations[location];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      for (const key of [...MEAL_IDS, 'attachedDrinks', 'standaloneDrinks']) clean.locations[location][key] = countOrZero(row[key]);
    }
    // This entry is not offered by the scorer and has no point schedule.
    clean.locations.dining.standaloneDrinks = 0;
    for (const key of Object.keys(GARDEN_POINTS)) clean.garden[key] = !!(round.garden && round.garden[key] === true);
    if (round.practiceCounts && typeof round.practiceCounts === 'object' && !Array.isArray(round.practiceCounts)) {
      for (const [key, value] of Object.entries(round.practiceCounts)) clean.practiceCounts[key] = countOrZero(value);
    }
    return clean;
  }

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
    if (round.locations !== undefined && (!round.locations || typeof round.locations !== 'object' || Array.isArray(round.locations))) issue(issues, 'locations', 'Scoring locations must be an object.');
    if (round.garden !== undefined && (!round.garden || typeof round.garden !== 'object' || Array.isArray(round.garden))) issue(issues, 'garden', 'Garden selections must be an object.');
    for (const key of Object.keys(round)) {
      if (!['locations', 'buffetQualified', 'garden', 'disqualified', 'suspensions', 'practiceCounts'].includes(key)) issue(issues, key, 'Unknown round field; imported data cannot be silently ignored.');
    }
    if (round.locations && typeof round.locations === 'object') {
      for (const key of Object.keys(round.locations)) if (!LOCATION_IDS.includes(key)) issue(issues, `locations.${key}`, 'Unknown final location; imported data cannot be silently ignored.');
    }
    // Obsolete referee fields are intentionally ignored, whatever their old
    // values. In particular, disqualified:true never zeroes a practice score.
    const clean = normalizeRound(round);

    const breakdown = {locations: {}, garden: {}, practice: {}, officialSubtotal: 0, practiceSubtotal: 0};
    let plates = 0, cups = 0;
    for (const location of LOCATION_IDS) {
      const sourceRow = round.locations && round.locations[location];
      if (sourceRow !== undefined && (!sourceRow || typeof sourceRow !== 'object' || Array.isArray(sourceRow))) issue(issues, `locations.${location}`, 'Location entries must be an object.');
      for (const key of Object.keys(sourceRow && typeof sourceRow === 'object' ? sourceRow : {})) {
        if (![...MEAL_IDS, 'attachedDrinks', 'standaloneDrinks'].includes(key)) issue(issues, `locations.${location}.${key}`, 'Unknown location field; imported counts cannot be silently ignored.');
      }
      const row = clean.locations[location];
      const meals = row.salad + row.pizza + row.sandwich;
      const units = meals + row.standaloneDrinks;
      if (customMode && (units || row.attachedDrinks)) issue(issues, `locations.${location}`, 'BEST location counts do not carry into a separate Custom Practice round.');
      if (location === 'dining' && countOrZero(sourceRow && sourceRow.standaloneDrinks)) issue(issues, 'locations.dining.standaloneDrinks', 'Dining Room standalone drinks are not a scoring category.');
      plates += meals;
      cups += row.attachedDrinks + row.standaloneDrinks;
      const mealPoints = MEAL_IDS.reduce((sum, key, index) => sum + row[key] * BASE_MEAL[location][index], 0);
      const drinkPoints = row.attachedDrinks * (location === 'qca' ? 6 : 12) + row.standaloneDrinks * (location === 'qca' ? 2 : 4);
      const locationPoints = units * LOCATION_BONUS[location];
      const subtotal = mealPoints + drinkPoints + locationPoints;
      breakdown.locations[location] = {meals, attachedDrinks: row.attachedDrinks, standaloneDrinks: row.standaloneDrinks, units, mealPoints, drinkPoints, locationPoints, subtotal};
      if (!customMode) breakdown.officialSubtotal += subtotal;
    }
    for (const [key, points] of Object.entries(GARDEN_POINTS)) {
      const selected = clean.garden[key];
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
        const count = clean.practiceCounts[item.id] || 0;
        const subtotal = count * item.points;
        breakdown.practice[item.id] = {name: item.name, count, points: item.points, subtotal};
        breakdown.practiceSubtotal += subtotal;
      }
    }
    const resources = {plates, cups, shelfUnits: breakdown.locations.shelf ? breakdown.locations.shelf.units : 0, buffetUnits: breakdown.locations.buffet ? breakdown.locations.buffet.units : 0, diningMeals: breakdown.locations.dining ? breakdown.locations.dining.meals : 0};
    const arithmeticTotal = breakdown.officialSubtotal + breakdown.practiceSubtotal;
    if (!Number.isSafeInteger(arithmeticTotal) || arithmeticTotal < 0) issue(issues, 'total', 'Practice total exceeds safe numeric precision.');
    const valid = issues.length === 0;
    const total = Number.isSafeInteger(arithmeticTotal) && arithmeticTotal >= 0 ? arithmeticTotal : null;
    return {valid, total, rawTotal: total, issues, breakdown, resources, rulesetId: customMode ? CUSTOM_RULESET_ID : RULESET_ID, rulesetVersion: customMode ? CUSTOM_RULESET_VERSION : RULESET_VERSION};
  }

  return {RULESET_ID, RULESET_VERSION, CUSTOM_RULESET_ID, CUSTOM_RULESET_VERSION, LOCATION_IDS, MEAL_IDS, GARDEN_POINTS, LOCATION_BONUS, BASE_MEAL, emptyRound, normalizeRound, scoreRound};
});
