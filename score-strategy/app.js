(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.CVSScoreApp = api;
    if (root.document) {
      const boot = () => api.initialize(root.document, root);
      if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot, { once: true });
      else boot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const SOURCE_MODE = "best";
  const CUSTOM_MODE = "custom";
  const CUSTOM_ID = "custom-practice-v1";
  const CUSTOM_VERSION = "Custom Practice, user-defined objective values";
  const COUNT_KEYS = ["salad", "pizza", "sandwich", "attachedDrinks", "standaloneDrinks"];
  const GARDEN_KEYS = ["drone", "irrigation", "vegetables", "fruit", "cold", "grain"];
  const RESOURCE_KEYS = ["plates", "cups", "fruit", "vegetables", "dairy", "protein", "grain", "water", "shelfUnits", "buffetUnits", "diningTables"];
  const RECIPE_KEYS = ["fruit", "vegetables", "dairy", "protein", "grain"];
  const DEFAULT_RECIPES = {
    salad: { fruit: 1, vegetables: 1, dairy: 0, protein: 0, grain: 0 },
    pizza: { fruit: 0, vegetables: 1, dairy: 1, protein: 1, grain: 1 },
    sandwich: { fruit: 1, vegetables: 1, dairy: 1, protein: 1, grain: 2 },
  };

  function valueToMode(value, model) { return value === CUSTOM_ID || value === CUSTOM_MODE ? CUSTOM_MODE : value === model.RULESET_ID || value === SOURCE_MODE ? SOURCE_MODE : null; }
  function modeToValue(mode, model) { return mode === CUSTOM_MODE ? CUSTOM_ID : model.RULESET_ID; }

  function parseCount(value) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return value;
    const number = Number(text);
    return Number.isSafeInteger(number) ? number : value;
  }

  function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  }

  function getDependencies(host, supplied = {}) {
    const model = supplied.model || host.CVSScoreModel || (typeof require === "function" ? require("./score-model.js") : null);
    const timerApi = supplied.timerApi || host.CVSScoreTimer || (typeof require === "function" ? require("./timer.js") : null);
    const storageApi = supplied.storageApi || host.CVSScoreStorage || (typeof require === "function" ? require("./storage.js") : null);
    const optimizerApi = supplied.optimizerApi || host.CVSScoreOptimizer || (typeof require === "function" ? require("./optimizer.js") : null);
    if (!model || !timerApi || !storageApi || !optimizerApi) throw new Error("Score & Strategy modules are unavailable.");
    return { model, timerApi, storageApi, optimizerApi };
  }

  function scoreOptions(mode, objectives) { return mode === CUSTOM_MODE ? { mode: CUSTOM_MODE, practiceObjectives: objectives } : { mode: SOURCE_MODE }; }

  function validateRoundSnapshot(snapshot, model) {
    if (!snapshot || !snapshot.result || snapshot.result.valid !== true || !Number.isSafeInteger(snapshot.result.total)) return false;
    let options;
    if (snapshot.rulesetId === model.RULESET_ID && snapshot.rulesetVersion === model.RULESET_VERSION) options = { mode: SOURCE_MODE };
    else if (snapshot.rulesetId === CUSTOM_ID && snapshot.rulesetVersion === CUSTOM_VERSION && snapshot.customPreset && Array.isArray(snapshot.customPreset.objectives)) {
      options = { mode: CUSTOM_MODE, practiceObjectives: snapshot.customPreset.objectives };
    } else return false;
    const recalculated = model.scoreRound(snapshot.rawInput, options);
    return recalculated.valid === true && recalculated.total === snapshot.result.total && recalculated.rawTotal === snapshot.result.rawTotal &&
      JSON.stringify(canonical(recalculated.breakdown)) === JSON.stringify(canonical(snapshot.result.breakdown));
  }

  function makeSavedSnapshot({ round, result, mode, model, labels, note, customPreset, planned = false }) {
    if (!result || result.valid !== true || !Number.isSafeInteger(result.total)) throw new Error("Correct validation warnings before saving this round.");
    return {
      rulesetId: mode === CUSTOM_MODE ? CUSTOM_ID : model.RULESET_ID,
      rulesetVersion: mode === CUSTOM_MODE ? CUSTOM_VERSION : model.RULESET_VERSION,
      rawInput: cloneJson(round),
      result: cloneJson(result),
      labels: cloneJson(labels),
      note: String(note || ""),
      planned: !!planned,
      ...(mode === CUSTOM_MODE ? { customPreset: cloneJson(customPreset) } : {}),
    };
  }

  function verifyOptimizationResult(result, model, options) {
    if (!result || !result.best || !result.best.round || !result.best.scoreResult) return false;
    const scored = model.scoreRound(result.best.round, options);
    return scored.valid === true && scored.total === result.best.score && scored.total === result.best.scoreResult.total;
  }

  function initialize(doc, host = root, supplied = {}) {
    const { model, timerApi, storageApi, optimizerApi } = getDependencies(host, supplied);
    const element = (id) => doc.getElementById(id);
    const write = (id, value) => { const target = element(id); if (target && target.textContent !== String(value)) target.textContent = String(value); };
    const read = (id) => element(id) ? element(id).value : "";
    const checkbox = (id) => !!(element(id) && element(id).checked);
    let mode = valueToMode(element("ruleset-select") && element("ruleset-select").value, model) || SOURCE_MODE;
    let dirty = false;
    let planned = false;
    let scoreResult = null;
    let optimizerResult = null;
    let activeSearch = null;
    let strategyVersion = 0;
    let profileCounter = 0;
    let objectiveCounter = 0;
    const volatileProfiles = { [model.RULESET_ID]: [], [CUSTOM_ID]: [] };
    const volatileDrafts = { [model.RULESET_ID]: null, [CUSTOM_ID]: null };
    let storage = null;
    let persistenceAvailable = true;
    let customPreset = { name: "Custom Practice", objectives: [] };

    function status(message, bad = false) {
      const target = element("status-message");
      if (!target) return;
      target.textContent = message;
      target.dataset.level = bad ? "error" : "info";
    }

    function storageCall(action) {
      if (!storage) throw new Error("Browser-local storage is unavailable. Round history cannot be saved on this device.");
      try { return action(); }
      catch (error) { status(error.message || "Browser-local storage failed.", true); throw error; }
    }

    function currentId() { return mode === CUSTOM_MODE ? CUSTOM_ID : model.RULESET_ID; }
    function objectives() { return customPreset && Array.isArray(customPreset.objectives) ? customPreset.objectives : []; }

    function collectRound() {
      const round = model.emptyRound();
      if (mode === SOURCE_MODE) {
        for (const location of model.LOCATION_IDS) {
          for (const key of COUNT_KEYS) {
            if (location === "dining" && key === "standaloneDrinks") continue;
            const input = element(`count-${location}-${key}`);
            if (input) round.locations[location][key] = parseCount(input.value);
          }
        }
        for (const key of GARDEN_KEYS) round.garden[key] = checkbox(`garden-${key}`);
        round.buffetQualified = checkbox("buffet-qualified");
      } else {
        round.practiceCounts = {};
        const list = element("custom-count-list");
        if (list) for (const input of list.querySelectorAll("[data-practice-count]")) round.practiceCounts[input.dataset.practiceCount] = parseCount(input.value);
      }
      round.disqualified = checkbox("disqualified");
      round.suspensions = parseCount(read("suspensions"));
      return round;
    }

    function collectLabels() { return { team: read("team-label"), driver: read("driver-label"), round: read("round-label") }; }

    function draftPayload() {
      return { rawInput: collectRound(), labels: collectLabels(), note: read("round-note"), planned };
    }

    function saveDraft() {
      const draft = draftPayload();
      volatileDrafts[currentId()] = draft;
      if (!storage || !persistenceAvailable) return;
      try { storage.setDraft(currentId(), draft); }
      catch (error) { persistenceAvailable = false; status(`Local draft could not be saved: ${error.message}`, true); }
    }

    function renderScore() {
      const round = collectRound();
      scoreResult = model.scoreRound(round, scoreOptions(mode, objectives()));
      write("score-total", scoreResult.valid ? scoreResult.total : "—");
      write("score-raw", scoreResult.valid ? scoreResult.rawTotal : "—");
      write("score-status", scoreResult.valid ? (planned ? "PLANNED practice projection — not a completed round" : "Practice score — human qualification still required") : `Needs review: ${scoreResult.issues.map((issue) => issue.message).join("; ")}`);
      write("plates-used", scoreResult.resources ? scoreResult.resources.plates : "—");
      write("cups-used", scoreResult.resources ? scoreResult.resources.cups : "—");
      const breakdown = element("score-breakdown");
      if (breakdown) {
        if (!scoreResult.valid) breakdown.textContent = "Correct warnings to see a verified breakdown.";
        else if (mode === CUSTOM_MODE) breakdown.textContent = `Custom objectives: ${scoreResult.breakdown.practiceSubtotal} points. No BEST game points are included.`;
        else {
          const parts = model.LOCATION_IDS.map((id) => `${id}: ${scoreResult.breakdown.locations[id].subtotal}`).join(" · ");
          const garden = Object.values(scoreResult.breakdown.garden).reduce((sum, item) => sum + item.subtotal, 0);
          breakdown.textContent = `${parts} · Garden: ${garden} · Raw: ${scoreResult.rawTotal}`;
        }
      }
      const save = element("save-round");
      if (save) save.disabled = !scoreResult.valid || !storage;
      return scoreResult;
    }

    function markDirty() {
      dirty = true;
      renderScore();
      saveDraft();
    }

    function protectUnsaved(action) {
      if (!dirty) return true;
      return typeof host.confirm === "function" ? host.confirm(`${action} will replace unsaved round entries. Continue?`) : false;
    }

    function fillRound(round, labels = {}, note = "", isPlanned = false) {
      const empty = model.emptyRound();
      const safeRound = round || empty;
      for (const location of model.LOCATION_IDS) for (const key of COUNT_KEYS) {
        const input = element(`count-${location}-${key}`);
        if (input) input.value = safeRound.locations && safeRound.locations[location] && safeRound.locations[location][key] !== undefined ? safeRound.locations[location][key] : 0;
      }
      for (const key of GARDEN_KEYS) if (element(`garden-${key}`)) element(`garden-${key}`).checked = !!(safeRound.garden && safeRound.garden[key]);
      if (element("buffet-qualified")) element("buffet-qualified").checked = !!safeRound.buffetQualified;
      if (element("disqualified")) element("disqualified").checked = !!safeRound.disqualified;
      if (element("suspensions")) element("suspensions").value = safeRound.suspensions === undefined ? 0 : safeRound.suspensions;
      for (const key of ["team", "driver", "round"]) if (element(`${key}-label`)) element(`${key}-label`).value = labels[key] || "";
      if (element("round-note")) element("round-note").value = note || "";
      renderCustomCountRows(safeRound.practiceCounts || {});
      planned = !!isPlanned;
      dirty = false;
      renderScore();
    }

    function selectTab(next) {
      const scorer = next !== "optimizer";
      for (const [id, active] of [["panel-scorer", scorer], ["panel-optimizer", !scorer]]) {
        const panel = element(id);
        if (panel) panel.hidden = !active;
      }
      for (const [id, active] of [["tab-scorer", scorer], ["tab-optimizer", !scorer]]) {
        const button = element(id);
        if (button) { button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1; }
      }
    }

    function selectMode(next, { restoreDraft = true } = {}) {
      next = valueToMode(next, model);
      if (next !== CUSTOM_MODE && next !== SOURCE_MODE) return false;
      if (next === mode) return true;
      if (dirty && (!storage || !persistenceAvailable) && !protectUnsaved("Ruleset switch")) {
        if (element("ruleset-select")) element("ruleset-select").value = modeToValue(mode, model);
        return false;
      }
      saveDraft();
      persistProfiles();
      invalidateOptimization();
      mode = next;
      if (element("ruleset-select")) element("ruleset-select").value = modeToValue(next, model);
      if (element("official-scoring")) element("official-scoring").hidden = next === CUSTOM_MODE;
      if (element("resource-usage")) element("resource-usage").hidden = next === CUSTOM_MODE;
      if (element("raw-line")) element("raw-line").hidden = next === CUSTOM_MODE;
      if (element("practice-settings")) element("practice-settings").hidden = next !== CUSTOM_MODE;
      if (element("custom-counts")) element("custom-counts").hidden = next !== CUSTOM_MODE;
      if (element("resource-budget")) element("resource-budget").hidden = next === CUSTOM_MODE;
      if (element("garden-times")) element("garden-times").hidden = next === CUSTOM_MODE;
      for (const field of doc.querySelectorAll(".best-optimizer-field")) field.hidden = next === CUSTOM_MODE;
      write("ruleset-source", next === CUSTOM_MODE ? "Custom Practice v1 · user-entered objectives, not BEST game points" : model.RULESET_VERSION);
      renderProfilesForMode();
      if (restoreDraft) {
        const draft = storage && persistenceAvailable ? storage.getDraft(currentId()) : volatileDrafts[currentId()];
        if (draft) { fillRound(draft.rawInput, draft.labels, draft.note, draft.planned); dirty = true; }
        else fillRound(model.emptyRound());
      } else fillRound(model.emptyRound());
      status(next === CUSTOM_MODE ? "Custom Practice uses only your objective points; BEST game rates are not applied." : "2026 BEST v3.3 practice scorer selected.");
      return true;
    }

    function createObjectiveRow(item) {
      const list = element("practice-objectives");
      if (!list) return;
      const template = element("practice-objective-template");
      const row = template && template.content.firstElementChild ? template.content.firstElementChild.cloneNode(true) : doc.createElement("fieldset");
      row.dataset.objective = "";
      row.dataset.objectiveId = item.id;
      const field = (key) => row.querySelector(`[data-objective-field="${key}"]`);
      if (field("name")) field("name").value = item.name;
      if (field("points")) field("points").value = item.points;
      if (field("maxCount")) field("maxCount").value = item.maxCount;
      list.append(row);
    }

    function readObjectives() {
      const list = element("practice-objectives");
      if (!list) return objectives();
      return [...list.querySelectorAll("[data-objective]")].map((row) => {
        const field = (name) => row.querySelector(`[data-objective-field="${name}"]`);
        return { id: row.dataset.objectiveId, name: field("name") ? field("name").value : "", points: parseCount(field("points") ? field("points").value : ""), maxCount: parseCount(field("maxCount") ? field("maxCount").value : "") };
      });
    }

    function renderCustomCountRows(values = {}) {
      const list = element("custom-count-list");
      if (!list) return;
      list.replaceChildren();
      for (const item of objectives()) {
        const row = doc.createElement("div");
        const label = doc.createElement("label");
        label.textContent = `${item.name} — ${item.points} points each, max ${item.maxCount}`;
        const input = doc.createElement("input");
        input.type = "number"; input.min = "0"; input.step = "1"; input.value = values[item.id] === undefined ? 0 : values[item.id];
        input.dataset.practiceCount = item.id; input.id = `practice-count-${item.id}`;
        const minus = doc.createElement("button"); minus.type = "button"; minus.textContent = "−"; minus.dataset.step = "-1"; minus.dataset.target = input.id; minus.setAttribute("aria-label", `Decrease ${item.name}`);
        const plus = doc.createElement("button"); plus.type = "button"; plus.textContent = "+"; plus.dataset.step = "1"; plus.dataset.target = input.id; plus.setAttribute("aria-label", `Increase ${item.name}`);
        label.htmlFor = input.id;
        row.append(label, minus, input, plus);
        list.append(row);
      }
    }

    function updateCustomPreset() {
      const before = collectRound().practiceCounts;
      const updated = { name: "Custom Practice", objectives: readObjectives() };
      const check = model.scoreRound(model.emptyRound(), scoreOptions(CUSTOM_MODE, updated.objectives));
      if (!check.valid) { status(`Custom setup needs review: ${check.issues.map((item) => item.message).join("; ")}`, true); return false; }
      customPreset = updated;
      if (storage) try { storage.setCustomPreset(updated); } catch (error) { status(error.message, true); }
      renderCustomCountRows(before);
      markDirty();
      renderProfileObjectiveChoices();
      invalidateOptimization();
      return true;
    }

    function renderProfileObjectiveChoices() {
      const list = element("profiles-list");
      if (!list) return;
      for (const select of list.querySelectorAll('[data-profile-field="practiceObjectiveId"]')) {
        const prior = select.value;
        select.replaceChildren();
        const blank = doc.createElement("option"); blank.value = ""; blank.textContent = "Choose objective"; select.append(blank);
        for (const item of objectives()) {
          const option = doc.createElement("option"); option.value = item.id; option.textContent = item.name;
          select.append(option);
        }
        if ([...select.options].some((option) => option.value === prior)) select.value = prior;
      }
    }

    function createProfileRow(profile = {}) {
      const list = element("profiles-list");
      const template = element("profile-template");
      if (!list || !template) return null;
      const fragment = template.content.cloneNode(true);
      const row = fragment.querySelector("[data-profile]");
      if (!row) return null;
      row.dataset.profileId = profile.id || `profile-${Date.now().toString(36)}-${++profileCounter}`;
      for (const control of row.querySelectorAll("[data-profile-field]")) {
        const key = control.dataset.profileField;
        if (control.type === "checkbox") control.checked = !!profile[key];
        else if (profile[key] !== undefined && profile[key] !== null) control.value = profile[key];
      }
      const recipe = profile.recipe || DEFAULT_RECIPES[profile.mealType || "salad"];
      for (const control of row.querySelectorAll("[data-recipe]")) control.value = recipe[control.dataset.recipe] === undefined ? 0 : recipe[control.dataset.recipe];
      for (const control of row.querySelectorAll("[data-included-garden]")) control.checked = !!(profile.includedGarden || []).includes(control.dataset.includedGarden);
      list.append(fragment);
      renderProfileObjectiveChoices();
      const objectiveSelect = row.querySelector('[data-profile-field="practiceObjectiveId"]');
      if (objectiveSelect && profile.practiceObjectiveId && [...objectiveSelect.options].some((option) => option.value === profile.practiceObjectiveId)) {
        objectiveSelect.value = profile.practiceObjectiveId;
      }
      toggleProfileMode(row);
      return row;
    }

    function toggleProfileMode(row) {
      for (const field of row.querySelectorAll(".custom-profile-field")) field.hidden = mode !== CUSTOM_MODE;
      for (const field of row.querySelectorAll(".best-profile-field")) field.hidden = mode === CUSTOM_MODE;
      const advanced = row.querySelector(".profile-advanced"); if (advanced) advanced.hidden = mode === CUSTOM_MODE;
    }

    function renderProfilesForMode() {
      const list = element("profiles-list");
      if (!list) return;
      list.replaceChildren();
      const all = storage ? storage.getState().planningProfiles : volatileProfiles[currentId()];
      const selected = all.filter((profile) => profile.rulesetId === currentId());
      if (selected.length) selected.forEach(createProfileRow);
      else createProfileRow({ enabled: false, mealType: "salad", location: "field", maxRepeats: 1, timeSeconds: "" });
    }

    function collectProfiles() {
      const list = element("profiles-list");
      if (!list) return [];
      return [...list.querySelectorAll("[data-profile]")].map((row) => {
        const field = (key) => row.querySelector(`[data-profile-field="${key}"]`);
        const readField = (key) => field(key) ? field(key).value : "";
        const recipe = {};
        for (const key of RECIPE_KEYS) {
          const input = row.querySelector(`[data-recipe="${key}"]`);
          recipe[key] = parseCount(input ? input.value : 0);
        }
        return {
          id: row.dataset.profileId, rulesetId: currentId(),
          enabled: !!(field("enabled") && field("enabled").checked),
          name: readField("name"), location: readField("location"), mealType: readField("mealType") || null,
          attachedDrink: !!(field("attachedDrink") && field("attachedDrink").checked),
          standaloneDrink: !!(field("standaloneDrink") && field("standaloneDrink").checked),
          timeSeconds: readField("timeSeconds"), maxRepeats: parseCount(readField("maxRepeats")),
          practiceObjectiveId: readField("practiceObjectiveId"),
          recipe,
          includedGarden: [...row.querySelectorAll("[data-included-garden]:checked")].map((input) => input.dataset.includedGarden),
        };
      });
    }

    function collectBudget() {
      const budget = {};
      const defaults = optimizerApi.CONSERVATIVE_BUDGET;
      for (const key of RESOURCE_KEYS) budget[key] = element(`resource-${key}`) ? parseCount(read(`resource-${key}`)) : defaults[key];
      return budget;
    }

    function optimizationInput() {
      return {
        mode: mode === CUSTOM_MODE ? CUSTOM_MODE : "byte-to-bite",
        availableSeconds: element("available-seconds") ? read("available-seconds") : "180",
        reserveSeconds: element("reserve-seconds") ? read("reserve-seconds") : "0",
        profiles: collectProfiles(),
        budget: collectBudget(),
        buffetQualified: checkbox("buffet-expected-qualified"),
        gardenTasks: mode === CUSTOM_MODE ? [] : GARDEN_KEYS.map((id) => ({ id, enabled: checkbox(`garden-opt-${id}`), timeSeconds: read(`garden-time-${id}`) })),
        scoreOptions: scoreOptions(mode, objectives()),
        scoreRound: model.scoreRound,
      };
    }

    function renderOptimization(result) {
      optimizerResult = result;
      const output = element("optimize-results");
      if (!output) return;
      if (!result) { output.textContent = "No strategy calculated yet."; return; }
      if (result.status === "invalid") output.textContent = `Cannot optimize: ${result.issues.join("; ")}`;
      else if (!result.best || !verifyOptimizationResult(result, model, scoreOptions(mode, objectives()))) output.textContent = "A valid score agreement could not be verified. No plan will be previewed.";
      else {
        const heading = result.status === "optimal" ? "Optimal for this model" : result.status === "incomplete" ? "Best found; search incomplete" : result.status === "cancelled" ? "Search cancelled; feasible best found" : "Searching; best found so far";
        const profiles = new Map(collectProfiles().map((profile) => [profile.id, profile]));
        const mix = result.best.taskMix.map((item) => {
          const profile = profiles.get(item.id);
          const custom = objectives().find((objective) => objective.id === item.practiceObjectiveId);
          const outcome = mode === CUSTOM_MODE ? (custom ? custom.name : item.practiceObjectiveId) : item.standaloneDrink ? "standalone drink" : `${item.mealType}${item.attachedDrink ? " + attached drink" : ""} → ${item.location}`;
          return `${item.count} × ${profile && profile.name ? profile.name + " (" + outcome + ")" : outcome}`;
        }).join(", ") || "No completed task fits";
        const garden = result.best.additionalGardenTasks.length ? ` Additional Garden: ${result.best.additionalGardenTasks.join(", ")}.` : "";
        const seconds = (result.best.timeUsedTenths / 10).toFixed(1);
        const remaining = (result.best.timeRemainingTenths / 10).toFixed(1);
        const reserve = (result.reserveTenths / 10).toFixed(1);
        const resources = Object.entries(result.best.resourcesUsed).filter(([, count]) => count > 0).map(([key, count]) => `${key} ${count}/${result.budget[key]}`).join(", ") || "none";
        const excluded = result.excluded.length ? ` Excluded: ${result.excluded.map((item) => `${item.id} (${item.reason})`).join(", ")}.` : "";
        output.textContent = `${heading}. Projected practice score ${result.best.score}. ${seconds}s used; ${remaining}s usable remaining after ${reserve}s reserved. Task mix: ${mix}.${garden} Resource use: ${resources}. Assumptions: ${result.best.assumptions.join("; ")}.${excluded}`;
      }
      const preview = element("preview-plan");
      if (preview) preview.disabled = !result.best || !verifyOptimizationResult(result, model, scoreOptions(mode, objectives()));
    }

    function invalidateOptimization() {
      strategyVersion += 1;
      if (activeSearch) activeSearch.cancel();
      optimizerResult = null;
      renderOptimization(null);
      const preview = element("preview-plan"); if (preview) preview.disabled = true;
    }

    function persistProfiles() {
      volatileProfiles[currentId()] = collectProfiles();
      if (!storage) return;
      try {
        const others = storage.getState().planningProfiles.filter((profile) => profile.rulesetId !== currentId());
        storage.setPlanningProfiles([...others, ...collectProfiles()]);
      }
      catch (error) { status(`Planning profiles could not be saved: ${error.message}`, true); }
    }

    function download(name, type, text) {
      if (!host.Blob || !host.URL || typeof host.URL.createObjectURL !== "function") throw new Error("File download is unavailable in this browser.");
      const blob = new host.Blob([text], { type });
      const url = host.URL.createObjectURL(blob);
      const anchor = doc.createElement("a"); anchor.href = url; anchor.download = name;
      doc.body.append(anchor); anchor.click(); anchor.remove();
      host.setTimeout(() => host.URL.revokeObjectURL(url), 1000);
    }

    function renderHistory() {
      const list = element("history-list");
      if (!list || !storage) return;
      list.replaceChildren();
      for (const round of storage.listRounds()) {
        const row = doc.createElement("li");
        const title = doc.createElement("span");
        const saved = Number.isFinite(Date.parse(round.savedAt)) ? new Date(round.savedAt).toLocaleString() : "Saved round";
        title.textContent = `${saved} · ${round.labels && round.labels.team || "Team"} · ${round.result.total} points${round.planned ? " · PLANNED" : ""}`;
        const load = doc.createElement("button"); load.type = "button"; load.textContent = "Load"; load.dataset.loadRound = round.id;
        const remove = doc.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.dataset.removeRound = round.id;
        row.append(title, load, remove);
        list.append(row);
      }
      if (!storage.listRounds().length) list.textContent = "No rounds saved on this device.";
    }

    function updateTimer(view) {
      write("timer-display", view.display);
      write("timer-state", view.status === "finished" ? "Match finished — score remains editable" : view.status === "running" ? "Running" : view.status === "paused" ? "Paused" : "Ready");
      const start = element("timer-start"), pause = element("timer-pause");
      if (start) start.disabled = view.status !== "idle";
      if (pause) { pause.disabled = view.status !== "running" && view.status !== "paused"; pause.textContent = view.status === "paused" ? "Resume" : "Pause"; }
      if (element("timer-sound")) element("timer-sound").checked = view.soundEnabled;
    }

    try {
      storage = storageApi.create({
        storage: supplied.storage !== undefined ? supplied.storage : host.localStorage,
        validateRound: (snapshot) => validateRoundSnapshot(snapshot, model),
        validateCustomPreset: (preset) => !!preset && Array.isArray(preset.objectives) && model.scoreRound(model.emptyRound(), scoreOptions(CUSTOM_MODE, preset.objectives)).valid === true,
        validateTimer: (snapshot) => { try { timerApi.validateSnapshot(snapshot); return true; } catch (_) { return false; } },
        onError: (error) => status(`Local storage problem: ${error.message}`, true),
      });
      if (storage.getState().customPreset) customPreset = storage.getState().customPreset;
    } catch (error) {
      persistenceAvailable = false;
      status(`Local storage unavailable: ${error.message}. Scoring remains usable, but saved history is disabled.`, true);
    }

    let timer;
    let lastTimerPersistKey = "";
    try {
      timer = timerApi.create({
        now: supplied.now,
        initialState: storage && storage.getState().timer,
        onChange: (view, snapshot) => {
          updateTimer(view);
          const persistenceKey = JSON.stringify({ status: snapshot.status, deadlineAt: snapshot.deadlineAt, soundEnabled: snapshot.soundEnabled, finishEmitted: snapshot.finishEmitted, pausedRemainingMs: snapshot.status === "paused" ? snapshot.remainingMs : null });
          if (storage && persistenceAvailable && persistenceKey !== lastTimerPersistKey) try { storage.setTimer(snapshot); lastTimerPersistKey = persistenceKey; }
          catch (error) { persistenceAvailable = false; status(`Timer state could not be saved: ${error.message}`, true); }
        },
        onFinish: (view) => {
          status("Three-minute match finished. You may still correct and save the final score.");
          timerApi.playFinishSound({ enabled: view.soundEnabled, interacted: view.canSound });
        },
      });
    } catch (error) {
      timer = timerApi.create({ now: supplied.now, onChange: updateTimer });
      status(`Stored timer could not be restored: ${error.message}; timer restarted at 3:00.`, true);
    }
    updateTimer(timer.getState());

    const savedState = storage ? storage.getState() : null;
    renderProfilesForMode();
    objectives().forEach(createObjectiveRow);
    renderCustomCountRows();
    if (element("ruleset-select")) element("ruleset-select").value = modeToValue(mode, model);
    if (element("official-scoring")) element("official-scoring").hidden = mode === CUSTOM_MODE;
    if (element("resource-usage")) element("resource-usage").hidden = mode === CUSTOM_MODE;
    if (element("raw-line")) element("raw-line").hidden = mode === CUSTOM_MODE;
    if (element("practice-settings")) element("practice-settings").hidden = mode !== CUSTOM_MODE;
    if (element("custom-counts")) element("custom-counts").hidden = mode !== CUSTOM_MODE;
    if (element("resource-budget")) element("resource-budget").hidden = mode === CUSTOM_MODE;
    if (element("garden-times")) element("garden-times").hidden = mode === CUSTOM_MODE;
    for (const field of doc.querySelectorAll(".best-optimizer-field")) field.hidden = mode === CUSTOM_MODE;
    write("ruleset-source", mode === CUSTOM_MODE ? "Custom Practice v1 · user-entered objectives, not BEST game points" : model.RULESET_VERSION);
    const initialDraft = storage && storage.getDraft(currentId());
    if (initialDraft) { fillRound(initialDraft.rawInput, initialDraft.labels, initialDraft.note, initialDraft.planned); dirty = true; }
    else fillRound(model.emptyRound());
    selectTab("scorer");
    renderHistory();

    doc.addEventListener("click", (event) => {
      const button = event.target.closest("[data-step][data-target]");
      if (button) {
        const input = element(button.dataset.target);
        if (input) {
          const current = parseCount(input.value);
          input.value = Math.max(0, (Number.isSafeInteger(current) ? current : 0) + Number(button.dataset.step));
          markDirty();
        }
      }
    });
    const scorerForm = element("scorer-form");
    if (scorerForm) for (const type of ["input", "change"]) scorerForm.addEventListener(type, (event) => {
      if (event.target.matches('[data-count], [data-garden], #buffet-qualified, #disqualified, #suspensions')) markDirty();
    });
    for (const id of ["team-label", "driver-label", "round-label", "round-note"]) if (element(id)) element(id).addEventListener("input", markDirty);

    if (element("ruleset-select")) element("ruleset-select").addEventListener("change", (event) => selectMode(event.target.value));
    if (element("tab-scorer")) element("tab-scorer").addEventListener("click", () => selectTab("scorer"));
    if (element("tab-optimizer")) element("tab-optimizer").addEventListener("click", () => selectTab("optimizer"));
    for (const id of ["tab-scorer", "tab-optimizer"]) if (element(id)) element(id).addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "scorer" : event.key === "End" ? "optimizer" : event.currentTarget.id === "tab-scorer" ? "optimizer" : "scorer";
      selectTab(next);
      element(next === "scorer" ? "tab-scorer" : "tab-optimizer")?.focus();
    });

    if (element("timer-start")) element("timer-start").addEventListener("click", () => timer.start());
    if (element("timer-pause")) element("timer-pause").addEventListener("click", () => timer.getState().status === "paused" ? timer.resume() : timer.pause());
    if (element("timer-reset")) element("timer-reset").addEventListener("click", () => timer.reset());
    if (element("timer-sound")) element("timer-sound").addEventListener("change", (event) => timer.setSoundEnabled(event.target.checked));
    if (host.setInterval) host.setInterval(() => timer.tick(), 250);
    doc.addEventListener("visibilitychange", () => timer.tick());

    if (element("save-round")) element("save-round").addEventListener("click", () => {
      const result = renderScore();
      if (!result.valid) { status("Correct score warnings before saving a verified practice round.", true); return; }
      try {
        const snapshot = makeSavedSnapshot({ round: collectRound(), result, mode, model, labels: collectLabels(), note: read("round-note"), customPreset, planned });
        storageCall(() => storage.saveRound(snapshot));
        dirty = false;
        if (storage) try { storage.clearDraft(currentId()); } catch (error) { status(`Round saved, but its draft could not be cleared: ${error.message}`, true); }
        renderHistory();
        status(planned ? "Planned practice round saved with its projection label." : "Practice round saved locally with its source version and score breakdown.");
      } catch (_) { /* status emitted by storageCall or validation */ }
    });
    if (element("new-round")) element("new-round").addEventListener("click", () => {
      if (!protectUnsaved("New Round")) return;
      fillRound(model.emptyRound());
      timer.reset();
      if (storage) try { storage.clearDraft(currentId()); } catch (error) { status(error.message, true); }
      status("New round started; history, ruleset, and planning times are unchanged.");
    });
    if (element("export-json")) element("export-json").addEventListener("click", () => {
      try {
        if (storage) download("cvs-score-strategy.json", "application/json", storage.exportPortable());
        else {
          const draft = { app: storageApi.APP_ID, schemaVersion: storageApi.SCHEMA_VERSION, fileType: "unsaved-draft", rulesetId: currentId(), rawInput: collectRound(), labels: collectLabels(), note: read("round-note"), customPreset: mode === CUSTOM_MODE ? customPreset : null, planningProfiles: collectProfiles() };
          download("cvs-score-unsaved-draft.json", "application/json", JSON.stringify(draft, null, 2));
          status("Unsaved draft exported as a local backup. It is not a verified saved-round history entry.");
        }
      }
      catch (error) { status(error.message, true); }
    });
    if (element("export-csv")) element("export-csv").addEventListener("click", () => {
      try { download("cvs-score-rounds.csv", "text/csv;charset=utf-8", storageCall(() => storage.exportRoundsCsv())); }
      catch (error) { status(error.message, true); }
    });
    if (element("import-json-button")) element("import-json-button").addEventListener("click", () => element("import-json")?.click());
    if (element("import-json")) element("import-json").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        if (!protectUnsaved("Import")) return;
        if (file.size > 2000000) throw new Error("JSON import exceeds the 2 MB local-file limit; no data was changed.");
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.fileType === "unsaved-draft") {
          if (parsed.app !== storageApi.APP_ID || parsed.schemaVersion !== storageApi.SCHEMA_VERSION || !parsed.rawInput || typeof parsed.rawInput !== "object" || ![model.RULESET_ID, CUSTOM_ID].includes(parsed.rulesetId)) throw new Error("Unsaved draft format is invalid.");
          if (parsed.rulesetId === CUSTOM_ID) {
            if (!parsed.customPreset || !Array.isArray(parsed.customPreset.objectives)) throw new Error("Custom draft needs its objective setup.");
            customPreset = parsed.customPreset;
            const list = element("practice-objectives"); if (list) list.replaceChildren();
            objectives().forEach(createObjectiveRow);
          }
          selectMode(parsed.rulesetId, { restoreDraft: false });
          fillRound(parsed.rawInput, parsed.labels || {}, parsed.note || "");
          dirty = true;
          status("Unsaved draft restored for editing. Its score must pass current validation before saving.");
          return;
        }
        if (!storage) throw new Error("Browser-local storage is unavailable; only an unsaved draft can be restored in this session.");
        storageApi.validatePortable(parsed, {
          validateRound: (snapshot) => validateRoundSnapshot(snapshot, model),
          validateCustomPreset: (preset) => !!preset && Array.isArray(preset.objectives) && model.scoreRound(model.emptyRound(), scoreOptions(CUSTOM_MODE, preset.objectives)).valid === true,
        });
        if (typeof host.confirm !== "function" || !host.confirm("Replace local saved rounds, Custom Practice setup, and planning profiles with this validated JSON export? The current timer will not start or change.")) return;
        storageCall(() => storage.importPortable(text, { replace: true, confirmed: true }));
        customPreset = storage.getState().customPreset || { name: "Custom Practice", objectives: [] };
        const objectiveList = element("practice-objectives");
        if (objectiveList) objectiveList.replaceChildren();
        objectives().forEach(createObjectiveRow);
        renderCustomCountRows();
        const profileList = element("profiles-list");
        if (profileList) profileList.replaceChildren();
        renderProfilesForMode();
        renderHistory();
        renderScore();
        status("Validated round history, custom setup, and planning profiles imported. Timer state was not imported.");
      } catch (error) { status(`Import failed without changing saved data: ${error.message}`, true); }
      finally { event.target.value = ""; }
    });
    if (element("history-list")) element("history-list").addEventListener("click", (event) => {
      const load = event.target.closest("[data-load-round]");
      const remove = event.target.closest("[data-remove-round]");
      if (load) {
        const saved = storage.listRounds().find((item) => item.id === load.dataset.loadRound);
        if (!saved || !protectUnsaved("Load")) return;
        if (saved.rulesetId === CUSTOM_ID && saved.customPreset) {
          customPreset = saved.customPreset;
          try { storage.setCustomPreset(saved.customPreset); } catch (error) { status(`Custom setup could not be stored: ${error.message}`, true); }
          const list = element("practice-objectives"); if (list) list.replaceChildren();
          objectives().forEach(createObjectiveRow);
          if (mode !== CUSTOM_MODE) selectMode(CUSTOM_MODE, { restoreDraft: false });
        } else if (mode !== SOURCE_MODE) selectMode(SOURCE_MODE, { restoreDraft: false });
        fillRound(saved.rawInput, saved.labels, saved.note, saved.planned);
        status(`Loaded saved ${saved.planned ? "PLANNED " : ""}round. Its recorded result remains in history; edits are a new draft.`);
      }
      if (remove) {
        if (typeof host.confirm !== "function" || !host.confirm("Remove this local round? Export JSON first if you need a backup; this action cannot be undone on this device.")) return;
        try { storage.removeRound(remove.dataset.removeRound, { confirmed: true }); renderHistory(); status("Saved round removed from this device."); }
        catch (error) { status(error.message, true); }
      }
    });

    if (element("add-practice-objective")) element("add-practice-objective").addEventListener("click", () => {
      const item = { id: `custom-${Date.now().toString(36)}-${++objectiveCounter}`, name: `Objective ${objectiveCounter}`, points: 0, maxCount: 1 };
      createObjectiveRow(item);
      updateCustomPreset();
    });
    if (element("practice-objectives")) {
      element("practice-objectives").addEventListener("input", updateCustomPreset);
      element("practice-objectives").addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-objective]");
        if (remove) {
          const row = remove.closest("[data-objective]");
          const count = row && element(`practice-count-${row.dataset.objectiveId}`);
          if (count && String(count.value) !== "0" && (typeof host.confirm !== "function" || !host.confirm(`Removing this objective also discards its unsaved count (${count.value || "blank"}). Continue?`))) return;
          row?.remove(); updateCustomPreset();
        }
      });
    }
    if (element("custom-count-list")) element("custom-count-list").addEventListener("input", markDirty);
    if (element("add-profile")) element("add-profile").addEventListener("click", () => {
      persistProfiles();
      const total = storage && persistenceAvailable ? storage.getState().planningProfiles.length : Object.values(volatileProfiles).reduce((sum, profiles) => sum + profiles.length, 0);
      if (total >= storageApi.PLANNING_PROFILE_LIMIT) { status(`At most ${storageApi.PLANNING_PROFILE_LIMIT} planning profiles are supported. Remove one before adding another.`, true); return; }
      createProfileRow({ enabled: false, mealType: "salad", location: "field", maxRepeats: 1, timeSeconds: "" });
      persistProfiles();
      invalidateOptimization();
    });
    if (element("resource-preset")) element("resource-preset").addEventListener("change", (event) => {
      const preset = event.target.value === "shared-half" ? optimizerApi.SHARED_HALF_BUDGET : event.target.value === "conservative" ? optimizerApi.CONSERVATIVE_BUDGET : null;
      if (!preset) return;
      for (const key of RESOURCE_KEYS) if (element(`resource-${key}`)) element(`resource-${key}`).value = preset[key];
      status(event.target.value === "shared-half" ? "Shared-half ingredients are available to two teams and are not guaranteed to yours; owned plates/cups remain eight." : "Conservative one-area ingredient planning budget restored.");
    });
    if (element("resource-budget")) element("resource-budget").addEventListener("input", (event) => {
      if (event.target.dataset.resource && element("resource-preset")) element("resource-preset").value = "custom";
    });
    if (element("profiles-list")) {
      element("profiles-list").addEventListener("input", (event) => {
        invalidateOptimization();
        const row = event.target.closest("[data-profile]");
        const timingChanged = event.target.dataset.recipe || event.target.dataset.includedGarden || ["location", "mealType", "attachedDrink", "standaloneDrink"].includes(event.target.dataset.profileField);
        if (row && timingChanged) {
          const time = row.querySelector('[data-profile-field="timeSeconds"]');
          if (time && time.value) { time.value = ""; status("Task definition changed. Review and re-enter its measured full-cycle time."); }
        }
        persistProfiles();
      });
      element("profiles-list").addEventListener("change", (event) => {
        invalidateOptimization();
        const row = event.target.closest("[data-profile]");
        const timingChanged = event.target.dataset.recipe || event.target.dataset.includedGarden || ["location", "mealType", "attachedDrink", "standaloneDrink"].includes(event.target.dataset.profileField);
        if (row && timingChanged) {
          const time = row.querySelector('[data-profile-field="timeSeconds"]');
          if (time && time.value) { time.value = ""; status("Task definition changed. Review and re-enter its measured full-cycle time."); }
        }
        if (row && event.target.dataset.profileField === "mealType") {
          const recipe = DEFAULT_RECIPES[event.target.value];
          if (recipe) for (const input of row.querySelectorAll("[data-recipe]")) input.value = recipe[input.dataset.recipe];
        }
        persistProfiles();
      });
      element("profiles-list").addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-profile]");
        if (remove) { remove.closest("[data-profile]")?.remove(); persistProfiles(); invalidateOptimization(); }
      });
    }
    if (element("optimize-form")) for (const type of ["input", "change"]) element("optimize-form").addEventListener(type, (event) => {
      if (!event.target.closest("[data-profile]")) invalidateOptimization();
    });
    if (element("optimize-run")) element("optimize-run").addEventListener("click", async () => {
      if (activeSearch) return;
      persistProfiles();
      const thisRun = ++strategyVersion;
      activeSearch = optimizerApi.createSearch(optimizationInput());
      renderOptimization(activeSearch.snapshot());
      if (element("optimize-cancel")) element("optimize-cancel").disabled = false;
      try {
        const result = await optimizerApi.runCooperatively(activeSearch, (progress) => { if (thisRun === strategyVersion) renderOptimization(progress); }, 500);
        if (thisRun !== strategyVersion) return;
        renderOptimization(result);
        if (result.status === "invalid") status(`Optimizer input needs review: ${result.issues.join("; ")}`, true);
        else if (result.best && !verifyOptimizationResult(result, model, scoreOptions(mode, objectives()))) status("Optimizer/scorer agreement failed; plan is not verified.", true);
        else status(result.status === "optimal" ? "Strategy search completed for this declared model." : "Strategy search stopped; any displayed result is a feasible best found, not a proven optimum.");
      } catch (error) { status(`Optimizer failed: ${error.message}`, true); }
      finally { activeSearch = null; if (element("optimize-cancel")) element("optimize-cancel").disabled = true; }
    });
    if (element("optimize-cancel")) element("optimize-cancel").addEventListener("click", () => activeSearch?.cancel());
    if (element("preview-plan")) element("preview-plan").addEventListener("click", () => {
      if (!optimizerResult || !optimizerResult.best || !verifyOptimizationResult(optimizerResult, model, scoreOptions(mode, objectives()))) return;
      if (!protectUnsaved("Preview plan")) return;
      const timerBefore = timer.serialize();
      fillRound(optimizerResult.best.round, collectLabels(), read("round-note"), true);
      dirty = true;
      saveDraft();
      selectTab("scorer");
      if (timer.serialize().deadlineAt !== timerBefore.deadlineAt || timer.getState().status !== timerBefore.status) status("Timer changed unexpectedly during preview; check the round clock.", true);
      else status("PLANNED projection previewed in the scorer; timer and saved actual-round history are unchanged.");
    });

    return {
      collectRound, renderScore, fillRound, selectMode, selectTab,
      optimizationInput, renderOptimization, getTimer: () => timer,
      getStorage: () => storage, getMode: () => mode,
    };
  }

  return { initialize, parseCount, makeSavedSnapshot, validateRoundSnapshot, verifyOptimizationResult, SOURCE_MODE, CUSTOM_MODE, CUSTOM_ID, CUSTOM_VERSION };
});
