(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSScoreOptimizer = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const LOCATIONS = Object.freeze(["field", "shelf", "buffet", "dining", "qca"]);
  const MEALS = Object.freeze(["salad", "pizza", "sandwich"]);
  const GARDEN = Object.freeze(["drone", "irrigation", "vegetables", "fruit", "cold", "grain"]);
  const INGREDIENTS = Object.freeze(["fruit", "vegetables", "dairy", "protein", "grain", "water"]);
  const RESOURCE_KEYS = Object.freeze(["plates", "cups", ...INGREDIENTS, "shelfUnits", "buffetUnits", "diningTables"]);

  // Ingredient availability is a planning assumption. Owned dishware and location caps are hard limits.
  const CONSERVATIVE_BUDGET = Object.freeze({
    plates: 8, cups: 8, fruit: 6, vegetables: 6, dairy: 6, protein: 6,
    grain: 12, water: 8, shelfUnits: 7, buffetUnits: 3, diningTables: 8
  });
  const SHARED_HALF_BUDGET = Object.freeze({
    ...CONSERVATIVE_BUDGET, fruit: 12, vegetables: 12, dairy: 12,
    protein: 12, grain: 24, water: 16
  });

  function integer(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  // Task durations and reserve are rounded UP to a tenth. Available time is rounded DOWN.
  // Parsing decimal text avoids floating-point rounding admitting work that does not fit.
  function decimalTenths(value, direction) {
    const text = String(value).trim();
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const [whole, fraction = ""] = text.split(".");
    const first = fraction ? Number(fraction[0]) : 0;
    const extra = fraction.slice(1).replace(/0/g, "").length > 0;
    const tenths = BigInt(whole) * 10n + BigInt(first) + (direction === "up" && extra ? 1n : 0n);
    return tenths <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(tenths) : null;
  }

  function emptyRound(mode) {
    const locations = {};
    for (const location of LOCATIONS) {
      locations[location] = {
        salad: 0, pizza: 0, sandwich: 0, attachedDrinks: 0, standaloneDrinks: 0
      };
    }
    return {
      locations,
      garden: Object.fromEntries(GARDEN.map((id) => [id, false])),
      practiceCounts: {}
    };
  }

  function planToRound(profiles, counts, gardenTasks, gardenSelections, options = {}) {
    const mode = options.mode === "custom" ? "custom" : "byte-to-bite";
    const round = emptyRound(mode);
    profiles.forEach((profile, index) => {
      const count = counts[index] || 0;
      if (!count) return;
      if (mode === "custom") {
        const id = profile.practiceObjectiveId;
        round.practiceCounts[id] = (round.practiceCounts[id] || 0) + count;
        return;
      }
      const row = round.locations[profile.location];
      if (profile.mealType) row[profile.mealType] += count;
      if (profile.attachedDrink) row.attachedDrinks += count;
      if (profile.standaloneDrink) row.standaloneDrinks += count;
      for (const id of profile.includedGarden || []) round.garden[id] = true;
    });
    if (mode === "byte-to-bite") {
      gardenTasks.forEach((task, index) => {
        if (gardenSelections[index]) round.garden[task.id] = true;
      });
    }
    return round;
  }

  function validateRecipe(mealType, recipe) {
    if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return "select an eligible recipe";
    if (Object.keys(recipe).some((id) => !INGREDIENTS.includes(id))) {
      return "recipe contains an unknown ingredient type";
    }
    const values = {};
    for (const id of INGREDIENTS) {
      const count = integer(recipe[id] === undefined ? 0 : recipe[id]);
      if (count === null) return `recipe ${id} must be a nonnegative whole number`;
      values[id] = count;
    }
    if (values.water) return "water is consumed by drinks, not meal recipes";
    const foodTypes = ["fruit", "vegetables", "dairy", "protein", "grain"];
    const nonGrain = ["fruit", "vegetables", "dairy", "protein"];
    if (mealType === "salad" && foodTypes.filter((id) => values[id] > 0).length < 2) {
      return "a salad needs at least two different ingredient types";
    }
    if (mealType === "pizza" && (values.grain < 1 || nonGrain.filter((id) => values[id] > 0).length < 3)) {
      return "a pizza needs bottom grain and at least three different non-grain types";
    }
    if (mealType === "sandwich" && (values.grain < 2 || nonGrain.some((id) => values[id] < 1))) {
      return "a sandwich needs two grain and all four non-grain types";
    }
    return null;
  }

  function normalizedBudget(input, mode, issues) {
    if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) {
      issues.push("resource budget must be an object");
    }
    const defaults = mode === "byte-to-bite" ? CONSERVATIVE_BUDGET : Object.fromEntries(RESOURCE_KEYS.map((id) => [id, 0]));
    if (input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).some((key) => !RESOURCE_KEYS.includes(key))) {
      issues.push("resource budget contains an unknown field");
    }
    const budget = {};
    for (const key of RESOURCE_KEYS) {
      const value = integer(input && input[key] !== undefined ? input[key] : defaults[key]);
      if (value === null) issues.push(`${key} budget must be a nonnegative whole number`);
      budget[key] = value === null ? 0 : value;
    }
    if (mode === "byte-to-bite") {
      const sourceMaxima = SHARED_HALF_BUDGET;
      for (const key of RESOURCE_KEYS) {
        if (budget[key] > sourceMaxima[key]) {
          issues.push(`${key} exceeds the supplied source's maximum accessible or owned quantity`);
        }
      }
    }
    return budget;
  }

  function costForProfile(profile, mode, issues) {
    const cost = Object.fromEntries(RESOURCE_KEYS.map((id) => [id, 0]));
    if (mode === "custom") {
      const supplied = profile.cost || {};
      if (Object.keys(supplied).some((key) => !RESOURCE_KEYS.includes(key))) {
        issues.push(`${profile.id}: custom cost contains an unknown resource`);
      }
      for (const key of RESOURCE_KEYS) {
        if (supplied[key] === undefined) continue;
        const value = integer(supplied[key]);
        if (value === null) issues.push(`${profile.id}: ${key} cost must be a nonnegative whole number`);
        else cost[key] = value;
      }
      return cost;
    }
    if (profile.mealType) {
      cost.plates = 1;
      for (const id of INGREDIENTS) cost[id] = Number((profile.recipe || {})[id] || 0);
    }
    if (profile.attachedDrink || profile.standaloneDrink) {
      cost.cups = 1;
      cost.water = 1;
    }
    if (profile.location === "shelf") cost.shelfUnits = 1;
    if (profile.location === "buffet") cost.buffetUnits = 1;
    if (profile.location === "dining") cost.diningTables = 1;
    return cost;
  }

  function normalize(input) {
    const issues = [];
    const excluded = [];
    if (!input || typeof input !== "object" || Array.isArray(input)) issues.push("optimizer input must be an object");
    if (input && input.mode !== undefined && !["byte-to-bite", "best", "custom"].includes(input.mode)) {
      issues.push("unknown optimizer ruleset mode");
    }
    const mode = input && input.mode === "custom" ? "custom" : "byte-to-bite";
    const suppliedAvailable = input && input.availableSeconds !== undefined ? input.availableSeconds : 180;
    const availableTenths = decimalTenths(suppliedAvailable, "down");
    const availableCeiling = decimalTenths(suppliedAvailable, "up");
    const reserveTenths = decimalTenths(input && input.reserveSeconds !== undefined ? input.reserveSeconds : 0, "up");
    if (availableTenths === null || availableTenths <= 0) issues.push("available time must be finite and positive");
    if (mode === "byte-to-bite" && availableCeiling !== null && availableCeiling > 1800) {
      issues.push("the supplied Byte to Bite match is three minutes; available time cannot exceed 180 seconds");
    }
    if (reserveTenths === null || reserveTenths < 0 || (availableTenths !== null && reserveTenths > availableTenths)) {
      issues.push("reserve must be between zero and available time");
    }
    const budget = normalizedBudget(
      input && Object.prototype.hasOwnProperty.call(input, "budget") ? input.budget : undefined,
      mode, issues
    );
    const scoreOptions = { ...((input && input.scoreOptions) || {}), mode: mode === "custom" ? "custom" : "best" };
    const customObjectives = new Map(
      mode === "custom" && Array.isArray(scoreOptions.practiceObjectives)
        ? scoreOptions.practiceObjectives.filter((item) => item && typeof item.id === "string").map((item) => [item.id, item]) : []
    );
    if (input && input.profiles !== undefined && !Array.isArray(input.profiles)) issues.push("profiles must be a list");
    if (input && input.gardenTasks !== undefined && !Array.isArray(input.gardenTasks)) issues.push("Garden tasks must be a list");
    const profiles = [];
    const seenIds = new Set();
    for (const source of (input && Array.isArray(input.profiles) ? input.profiles : [])) {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        issues.push("each profile must be an object");
        continue;
      }
      const id = String(source.id || "").trim();
      if (!id || seenIds.has(id)) { issues.push("profile IDs must be nonempty and unique"); continue; }
      seenIds.add(id);
      if (source.enabled !== true && source.enabled !== false) {
        issues.push(`${id}: enabled must be a boolean`);
        continue;
      }
      if (source.enabled !== true) { excluded.push({ id, reason: "disabled" }); continue; }
      if (source.timeSeconds === "" || source.timeSeconds === null || source.timeSeconds === undefined) {
        excluded.push({ id, reason: "no measured full-cycle time entered" }); continue;
      }
      const timeTenths = decimalTenths(source.timeSeconds, "up");
      if (timeTenths === null || timeTenths <= 0) { issues.push(`${id}: cycle time must be finite and positive`); continue; }
      const maxRepeats = integer(source.maxRepeats);
      if (maxRepeats === null) { issues.push(`${id}: maximum repeats must be a nonnegative whole number`); continue; }
      if (maxRepeats === 0) { excluded.push({ id, reason: "maximum repeats is zero" }); continue; }
      const profile = { ...source, id, timeTenths, maxRepeats };
      if (mode === "custom") {
        profile.practiceObjectiveId = String(source.practiceObjectiveId || "").trim();
        if (!profile.practiceObjectiveId || !customObjectives.has(profile.practiceObjectiveId)) {
          issues.push(`${id}: select an objective from the active custom practice preset`);
        }
        profile.includedGarden = [];
      } else {
        profile.location = String(source.location || "");
        profile.mealType = source.mealType === undefined || source.mealType === null || source.mealType === "" ? null : source.mealType;
        if (source.attachedDrink !== undefined && typeof source.attachedDrink !== "boolean") issues.push(`${id}: attached drink must be a boolean`);
        if (source.standaloneDrink !== undefined && typeof source.standaloneDrink !== "boolean") issues.push(`${id}: standalone drink must be a boolean`);
        profile.attachedDrink = source.attachedDrink === true;
        profile.standaloneDrink = source.standaloneDrink === true;
        if (source.includedGarden !== undefined && !Array.isArray(source.includedGarden)) {
          issues.push(`${id}: included Garden objectives must be a list`);
        }
        profile.includedGarden = Array.isArray(source.includedGarden) ? [...new Set(source.includedGarden)] : [];
        if (!LOCATIONS.includes(profile.location)) issues.push(`${id}: select a final destination`);
        if (profile.mealType !== null && !MEALS.includes(profile.mealType)) issues.push(`${id}: invalid meal type`);
        if (!!profile.mealType === profile.standaloneDrink || (profile.attachedDrink && !profile.mealType)) {
          issues.push(`${id}: choose one meal outcome or one standalone drink`);
        }
        if (profile.location === "dining" && profile.standaloneDrink) issues.push(`${id}: standalone drinks cannot be in Dining`);
        if (profile.mealType) {
          const recipeIssue = validateRecipe(profile.mealType, profile.recipe);
          if (recipeIssue) issues.push(`${id}: ${recipeIssue}`);
        }
        if (profile.includedGarden.some((gardenId) => !GARDEN.includes(gardenId))) {
          issues.push(`${id}: included Garden objective is unknown`);
        }
      }
      profile.cost = costForProfile(profile, mode, issues);
      profiles.push(profile);
    }
    const gardenTasks = [];
    if (mode === "byte-to-bite") {
      const seenGarden = new Set();
      for (const task of (input && Array.isArray(input.gardenTasks) ? input.gardenTasks : [])) {
        if (!task || typeof task !== "object" || Array.isArray(task)) {
          issues.push("each Garden task must be an object");
          continue;
        }
        const id = String(task.id || "");
        if (!GARDEN.includes(id) || seenGarden.has(id)) { issues.push("Garden task IDs must be one of the six unique objectives"); continue; }
        seenGarden.add(id);
        if (task.enabled !== true && task.enabled !== false) { issues.push(`${id}: enabled must be a boolean`); continue; }
        if (task.enabled !== true) { excluded.push({ id, reason: "disabled" }); continue; }
        if (task.timeSeconds === "" || task.timeSeconds === null || task.timeSeconds === undefined) {
          excluded.push({ id, reason: "no additional, non-overlapping time entered" }); continue;
        }
        const timeTenths = decimalTenths(task.timeSeconds, "up");
        if (timeTenths === null || timeTenths <= 0) { issues.push(`${id}: additional Garden time must be finite and positive`); continue; }
        gardenTasks.push({ id, timeTenths });
      }
    }
    return {
      issues, excluded, mode, profiles, gardenTasks, budget,
      availableTenths: availableTenths || 0,
      reserveTenths: reserveTenths || 0,
      usableTenths: availableTenths !== null && reserveTenths !== null ? availableTenths - reserveTenths : 0,
      customObjectives,
      scoreOptions,
      scoreRound: input && input.scoreRound,
      maxStates: input && input.maxStates
    };
  }

  function resolveScorer(scorer) {
    if (typeof scorer === "function") return scorer;
    if (root.CVSScoreModel && typeof root.CVSScoreModel.scoreRound === "function") return root.CVSScoreModel.scoreRound;
    if (typeof require === "function") {
      try { return require("./score-model.js").scoreRound; } catch (_) { /* surfaced as invalid below */ }
    }
    return null;
  }

  function emptyUsage() { return Object.fromEntries(RESOURCE_KEYS.map((id) => [id, 0])); }

  function compareStable(a, b) {
    if (!b) return true;
    if (a.score !== b.score) return a.score > b.score;
    if (a.timeUsedTenths !== b.timeUsedTenths) return a.timeUsedTenths < b.timeUsedTenths;
    const aOrder = [...a.counts, ...a.gardenSelections];
    const bOrder = [...b.counts, ...b.gardenSelections];
    for (let i = 0; i < aOrder.length; i += 1) {
      if (aOrder[i] !== bOrder[i]) return aOrder[i] > bOrder[i];
    }
    return false;
  }

  function createSearch(input) {
    const config = normalize(input);
    const maxStates = integer(config.maxStates === undefined ? 500000 : config.maxStates);
    if (maxStates === null || maxStates <= 0) config.issues.push("search state budget must be a positive whole number");
    const scorer = resolveScorer(config.scoreRound);
    if (!scorer) config.issues.push("shared scoring function is unavailable");
    const variables = [
      ...config.profiles.map((profile, index) => {
        // Only quantities that could fit the declared time and resources are enumerated.
        // This changes no feasible plan and keeps oversized repeat fields from exhausting
        // the honest state budget before reaching count zero.
        let max = Math.min(profile.maxRepeats, Math.floor(config.usableTenths / profile.timeTenths));
        for (const key of RESOURCE_KEYS) {
          if (profile.cost[key]) max = Math.min(max, Math.floor(config.budget[key] / profile.cost[key]));
        }
        return { kind: "profile", index, max };
      }),
      ...config.gardenTasks.map((_, index) => ({ kind: "garden", index, max: 1 }))
    ];
    let status = config.issues.length ? "invalid" : "searching";
    let visitedStates = 0;
    let validCandidates = 0;
    let invalidCandidates = 0;
    let best = null;
    const initial = {
      counts: config.profiles.map(() => 0),
      gardenSelections: config.gardenTasks.map(() => 0),
      timeUsedTenths: 0,
      resourcesUsed: emptyUsage(), practiceCounts: {}
    };
    const stack = status === "searching" && variables.length ? [{ depth: 0, next: variables[0].max, state: initial }] : [];

    function scoreCandidate(state) {
      const round = planToRound(config.profiles, state.counts, config.gardenTasks, state.gardenSelections, config);
      let result;
      try { result = scorer(round, config.scoreOptions); } catch (_) { invalidCandidates += 1; return; }
      if (!result || result.valid !== true || !Number.isSafeInteger(result.total)) {
        invalidCandidates += 1;
        return;
      }
      validCandidates += 1;
      const candidate = {
        counts: [...state.counts], gardenSelections: [...state.gardenSelections],
        round, scoreResult: result, score: result.total,
        timeUsedTenths: state.timeUsedTenths,
        timeRemainingTenths: config.usableTenths - state.timeUsedTenths,
        resourcesUsed: { ...state.resourcesUsed }
      };
      if (compareStable(candidate, best)) best = candidate;
    }

    if (status === "searching") {
      scoreCandidate(initial);
      if (!best) {
        config.issues.push("the active shared scorer rejects the empty planning round or ruleset options");
        status = "invalid";
      } else if (!variables.length) status = "optimal";
    }

    function nextState(state, variable, quantity) {
      const next = {
        counts: [...state.counts], gardenSelections: [...state.gardenSelections],
        timeUsedTenths: state.timeUsedTenths,
        resourcesUsed: { ...state.resourcesUsed }, practiceCounts: { ...state.practiceCounts }
      };
      if (variable.kind === "garden") {
        const task = config.gardenTasks[variable.index];
        next.gardenSelections[variable.index] = quantity;
        next.timeUsedTenths += quantity * task.timeTenths;
      } else {
        const profile = config.profiles[variable.index];
        next.counts[variable.index] = quantity;
        next.timeUsedTenths += quantity * profile.timeTenths;
        if (config.mode === "custom") {
          const objective = config.customObjectives.get(profile.practiceObjectiveId);
          const total = (next.practiceCounts[profile.practiceObjectiveId] || 0) + quantity;
          if (objective && total > objective.maxCount) return null;
          next.practiceCounts[profile.practiceObjectiveId] = total;
        }
        for (const key of RESOURCE_KEYS) {
          next.resourcesUsed[key] += quantity * profile.cost[key];
          if (next.resourcesUsed[key] > config.budget[key]) return null;
        }
      }
      return next.timeUsedTenths <= config.usableTenths ? next : null;
    }

    function snapshot() {
      return {
        status, issues: [...config.issues], excluded: [...config.excluded],
        visitedStates, validCandidates, invalidCandidates,
        model: config.mode, timeAvailableTenths: config.availableTenths,
        reserveTenths: config.reserveTenths, usableTenths: config.usableTenths,
        scoreOptions: config.scoreOptions,
        budget: { ...config.budget },
        best: best && {
          ...best,
          taskMix: config.profiles.map((profile, index) => ({
            id: profile.id, count: best.counts[index], location: profile.location || null,
            mealType: profile.mealType || null, attachedDrink: !!profile.attachedDrink,
            standaloneDrink: !!profile.standaloneDrink,
            practiceObjectiveId: profile.practiceObjectiveId || null,
            recipe: profile.recipe || null,
            includedGarden: profile.includedGarden || []
          })).filter((item) => item.count > 0),
          additionalGardenTasks: config.gardenTasks.filter((_, index) => best.gardenSelections[index]).map((task) => task.id),
          assumptions: [
            "Measured sequential full-cycle times; no routes or parallel work modeled",
            "Ingredient availability is the user's planning budget, not guaranteed ownership",
            ...(best.resourcesUsed.diningTables ? ["Dining table availability is a user-entered optimistic assumption"] : [])
          ]
        }
      };
    }

    function step(nodeBudget = 1000) {
      if (status !== "searching") return snapshot();
      const limit = integer(nodeBudget);
      if (limit === null || limit <= 0) throw new Error("step budget must be positive");
      let processed = 0;
      while (stack.length && processed < limit && visitedStates < maxStates) {
        const frame = stack[stack.length - 1];
        if (frame.next < 0) { stack.pop(); continue; }
        const quantity = frame.next;
        frame.next -= 1;
        processed += 1;
        visitedStates += 1;
        const state = nextState(frame.state, variables[frame.depth], quantity);
        if (!state) continue;
        if (frame.depth === variables.length - 1) scoreCandidate(state);
        else stack.push({ depth: frame.depth + 1, next: variables[frame.depth + 1].max, state });
      }
      if (!stack.length) status = "optimal";
      else if (visitedStates >= maxStates) status = "incomplete";
      return snapshot();
    }

    function cancel() {
      if (status === "searching") status = "cancelled";
      return snapshot();
    }

    return { step, cancel, snapshot };
  }

  function solveSync(input) {
    const search = createSearch(input);
    let result = search.snapshot();
    while (result.status === "searching") result = search.step(1000);
    return result;
  }

  // The caller schedules these small chunks; Cancel and the match timer stay responsive.
  function runCooperatively(search, onProgress, chunkSize = 500) {
    return new Promise((resolve) => {
      function tick() {
        const result = search.step(chunkSize);
        if (typeof onProgress === "function") onProgress(result);
        if (result.status === "searching") setTimeout(tick, 0);
        else resolve(result);
      }
      setTimeout(tick, 0);
    });
  }

  return Object.freeze({
    CONSERVATIVE_BUDGET, SHARED_HALF_BUDGET, LOCATIONS, MEALS, GARDEN, INGREDIENTS,
    decimalTenths, validateRecipe, planToRound, createSearch, solveSync, runCooperatively
  });
});
