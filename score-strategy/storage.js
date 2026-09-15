(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSScoreStorage = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const APP_ID = "cvs-score-strategy";
  const SCHEMA_VERSION = 1;
  const HISTORY_LIMIT = 50;
  const PLANNING_PROFILE_LIMIT = 30;
  const DEFAULT_KEY = "cvs-score-strategy-v1";

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function plain(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function cleanJson(value, label) {
    let serialized;
    try {
      serialized = JSON.stringify(value, (_key, entry) => {
        if (typeof entry === "number" && !Number.isFinite(entry)) fail("INVALID_JSON", `${label} contains a non-finite number.`);
        if (typeof entry === "function" || typeof entry === "undefined" || typeof entry === "symbol" || typeof entry === "bigint") {
          fail("INVALID_JSON", `${label} contains a value that JSON cannot preserve.`);
        }
        return entry;
      });
    } catch (_) {
      fail("INVALID_JSON", `${label} cannot be saved as JSON.`);
    }
    if (typeof serialized !== "string") fail("INVALID_JSON", `${label} cannot be saved as JSON.`);
    return JSON.parse(serialized);
  }

  function shortText(value, label, max = 200) {
    if (typeof value !== "string" || value.length > max) fail("INVALID_TEXT", `${label} must be text of at most ${max} characters.`);
    return value;
  }

  function validateSavedRound(round, validateRound) {
    if (!plain(round)) fail("INVALID_ROUND", "A saved round must be a JSON object.");
    const saved = cleanJson(round, "Round");
    if (!plain(saved.rawInput) || !plain(saved.result)) fail("INVALID_ROUND", "Saved round needs raw input and an arithmetic result.");
    saved.rulesetId = shortText(saved.rulesetId, "Ruleset ID", 120);
    saved.rulesetVersion = shortText(saved.rulesetVersion, "Ruleset version", 120);
    if (!saved.rulesetId || !saved.rulesetVersion) fail("INVALID_ROUND", "Saved round needs source identity.");
    if (saved.id !== undefined) saved.id = shortText(saved.id, "Round ID", 120);
    if (saved.savedAt !== undefined && (typeof saved.savedAt !== "string" || !Number.isFinite(Date.parse(saved.savedAt)))) {
      fail("INVALID_ROUND", "Saved round date is invalid.");
    }
    if (saved.labels !== undefined) {
      if (!plain(saved.labels)) fail("INVALID_ROUND", "Round labels must be an object.");
      for (const key of ["team", "driver", "round"]) {
        if (saved.labels[key] !== undefined) shortText(saved.labels[key], `${key} label`);
      }
    }
    if (saved.note !== undefined) shortText(saved.note, "Round note", 10000);
    const total = saved.result.awardedTotal !== undefined ? saved.result.awardedTotal : saved.result.total;
    if (!Number.isFinite(total) || !Number.isInteger(total) || total < 0) fail("INVALID_ROUND", "Saved round awarded total must be a nonnegative integer.");
    if (saved.result.rawTotal !== undefined && (!Number.isFinite(saved.result.rawTotal) || !Number.isInteger(saved.result.rawTotal) || saved.result.rawTotal < 0)) {
      fail("INVALID_ROUND", "Saved round raw total must be a nonnegative integer.");
    }
    if (saved.result.valid !== true || saved.result.needsReview === true || saved.result.status === "needs-review") {
      fail("UNVERIFIED_ROUND", "An invalid or unresolved round cannot be saved as a verified result.");
    }
    if (typeof validateRound === "function") {
      let accepted;
      try { accepted = validateRound(saved); } catch (error) { fail("UNVERIFIED_ROUND", error && error.message ? error.message : "Round validation failed."); }
      if (accepted !== true) fail("UNVERIFIED_ROUND", "Round failed scoring-model validation.");
    }
    return saved;
  }

  function validateState(input, validators = {}) {
    if (!plain(input) || input.app !== APP_ID || input.schemaVersion !== SCHEMA_VERSION) fail("INVALID_STATE", "Stored Score & Strategy data has an unsupported format.");
    if (!Array.isArray(input.rounds) || input.rounds.length > HISTORY_LIMIT) fail("INVALID_STATE", "Round history exceeds the supported size.");
    const rounds = input.rounds.map((round) => validateSavedRound(round, validators.validateRound));
    const ids = new Set();
    for (const round of rounds) {
      if (!round.id || ids.has(round.id)) fail("INVALID_STATE", "Round IDs must be unique and nonempty.");
      ids.add(round.id);
    }
    if (input.customPreset !== null && !plain(input.customPreset)) fail("INVALID_STATE", "Custom practice setup is invalid.");
    if (!Array.isArray(input.planningProfiles) || input.planningProfiles.length > PLANNING_PROFILE_LIMIT) fail("INVALID_STATE", "Planning profiles are invalid or exceed the 30-profile limit; no profiles were truncated.");
    if (!plain(input.drafts)) fail("INVALID_STATE", "Drafts are invalid.");
    for (const [id, draft] of Object.entries(input.drafts)) {
      if (!id || id.length > 120 || !plain(draft) || !plain(draft.rawInput)) fail("INVALID_STATE", "A saved draft is invalid.");
    }
    if (input.timer !== null && !plain(input.timer)) fail("INVALID_STATE", "Stored timer is invalid.");
    if (typeof validators.validateCustomPreset === "function" && input.customPreset !== null && validators.validateCustomPreset(input.customPreset) !== true) {
      fail("INVALID_STATE", "Custom practice setup failed validation.");
    }
    if (typeof validators.validatePlanningProfile === "function") {
      for (const profile of input.planningProfiles) {
        if (validators.validatePlanningProfile(profile) !== true) fail("INVALID_STATE", "A planning profile failed validation.");
      }
    }
    if (typeof validators.validateTimer === "function" && input.timer !== null && validators.validateTimer(input.timer) !== true) {
      fail("INVALID_STATE", "Stored timer failed validation.");
    }
    return cleanJson(input, "Stored data");
  }

  function emptyState() {
    return { app: APP_ID, schemaVersion: SCHEMA_VERSION, rounds: [], customPreset: null, planningProfiles: [], drafts: {}, timer: null };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function safeSpreadsheetText(value) {
    const text = String(value == null ? "" : value);
    return /^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text) ? `'${text}` : text;
  }

  function csvCell(value, userText = false) {
    const text = userText ? safeSpreadsheetText(value) : String(value == null ? "" : value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportRoundsCsv(rounds) {
    if (!Array.isArray(rounds)) fail("INVALID_ROUNDS", "CSV export needs a round list.");
    const header = ["id", "saved_at", "ruleset_id", "ruleset_version", "team", "driver", "round", "awarded_total", "raw_total", "disqualified", "suspensions", "note", "raw_input_json", "breakdown_json"];
    const rows = [header.map((value) => csvCell(value)).join(",")];
    for (const round of rounds) {
      const saved = validateSavedRound(round);
      const values = [
        csvCell(saved.id || ""), csvCell(saved.savedAt || ""), csvCell(saved.rulesetId), csvCell(saved.rulesetVersion),
        csvCell(saved.labels && saved.labels.team || "", true), csvCell(saved.labels && saved.labels.driver || "", true),
        csvCell(saved.labels && saved.labels.round || "", true), csvCell(saved.result.awardedTotal !== undefined ? saved.result.awardedTotal : saved.result.total),
        csvCell(saved.result.rawTotal === undefined ? "" : saved.result.rawTotal), csvCell(!!saved.rawInput.disqualified),
        csvCell(saved.rawInput.suspensions === undefined ? "" : saved.rawInput.suspensions), csvCell(saved.note || "", true),
        csvCell(JSON.stringify(saved.rawInput)), csvCell(JSON.stringify(saved.result.breakdown || null)),
      ];
      rows.push(values.join(","));
    }
    return rows.join("\r\n") + "\r\n";
  }

  function validatePortable(input, validators) {
    if (!plain(input) || input.app !== APP_ID || input.schemaVersion !== SCHEMA_VERSION || input.fileType !== "portable-rounds") {
      fail("INVALID_IMPORT", "This is not a supported CVS Score & Strategy export.");
    }
    if (Array.isArray(input.planningProfiles) && input.planningProfiles.length > PLANNING_PROFILE_LIMIT) {
      fail("INVALID_IMPORT", "Import exceeds 30 planning profiles. No profiles were imported or truncated.");
    }
    if (!Array.isArray(input.rounds) || input.rounds.length > HISTORY_LIMIT || !Array.isArray(input.planningProfiles) || (input.customPreset !== null && !plain(input.customPreset))) {
      fail("INVALID_IMPORT", "The export has invalid round, preset, or planning data.");
    }
    return validateState({ ...emptyState(), rounds: input.rounds, customPreset: input.customPreset, planningProfiles: input.planningProfiles }, validators);
  }

  function create(options = {}) {
    const storage = options.storage !== undefined ? options.storage : (typeof window !== "undefined" ? window.localStorage : null);
    const key = options.key || DEFAULT_KEY;
    const validators = {
      validateRound: options.validateRound,
      validateCustomPreset: options.validateCustomPreset,
      validatePlanningProfile: options.validatePlanningProfile,
      validateTimer: options.validateTimer,
    };
    const onError = typeof options.onError === "function" ? options.onError : () => {};
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") fail("NO_STORAGE", "Browser-local storage is unavailable; use JSON export instead.");
    let state;
    try {
      const text = storage.getItem(key);
      state = text === null ? emptyState() : validateState(JSON.parse(text), validators);
    } catch (error) {
      onError(error);
      throw error;
    }

    function commit(next) {
      const valid = validateState(next, validators);
      try {
        storage.setItem(key, JSON.stringify(valid));
      } catch (error) {
        onError(error);
        fail("STORAGE_WRITE_FAILED", "Browser-local storage could not save this change. Export your work before closing the page.");
      }
      state = valid;
      return cleanJson(state, "State");
    }

    function getState() { return cleanJson(state, "State"); }
    function listRounds() { return cleanJson(state.rounds, "Rounds"); }

    function saveRound(round) {
      if (state.rounds.length >= HISTORY_LIMIT) fail("HISTORY_FULL", "History has 50 rounds. Export it and remove an older record explicitly before saving another.");
      const saved = validateSavedRound(round, validators.validateRound);
      saved.id = saved.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `round-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      saved.savedAt = saved.savedAt || new Date().toISOString();
      if (state.rounds.some((item) => item.id === saved.id)) fail("DUPLICATE_ROUND", "A round with this ID is already saved.");
      commit({ ...state, rounds: [saved, ...state.rounds] });
      return cleanJson(saved, "Round");
    }

    function removeRound(id, options = {}) {
      if (options.confirmed !== true) fail("CONFIRM_REQUIRED", "Removing a saved round requires an explicit confirmation in the UI.");
      const nextRounds = state.rounds.filter((round) => round.id !== id);
      if (nextRounds.length === state.rounds.length) return false;
      commit({ ...state, rounds: nextRounds });
      return true;
    }

    function setDraft(rulesetId, draft) {
      shortText(rulesetId, "Ruleset ID", 120);
      if (!rulesetId || !plain(draft) || !plain(draft.rawInput)) fail("INVALID_DRAFT", "Draft needs a ruleset ID and raw input.");
      const copy = cleanJson(draft, "Draft");
      copy.updatedAt = new Date().toISOString();
      commit({ ...state, drafts: { ...state.drafts, [rulesetId]: copy } });
      return copy;
    }

    function getDraft(rulesetId) { return state.drafts[rulesetId] ? cleanJson(state.drafts[rulesetId], "Draft") : null; }

    function clearDraft(rulesetId) {
      const next = { ...state.drafts };
      delete next[rulesetId];
      commit({ ...state, drafts: next });
    }

    function setCustomPreset(preset) {
      if (preset !== null && !plain(preset)) fail("INVALID_PRESET", "Custom practice setup must be an object or null.");
      commit({ ...state, customPreset: cleanJson(preset, "Custom preset") });
    }

    function setPlanningProfiles(profiles) {
      if (!Array.isArray(profiles)) fail("INVALID_PROFILES", "Planning profiles must be a list.");
      commit({ ...state, planningProfiles: cleanJson(profiles, "Planning profiles") });
    }

    function setTimer(snapshot) {
      if (snapshot !== null && !plain(snapshot)) fail("INVALID_TIMER", "Timer snapshot must be an object or null.");
      commit({ ...state, timer: cleanJson(snapshot, "Timer") });
    }

    function exportPortable() {
      return JSON.stringify({
        app: APP_ID,
        schemaVersion: SCHEMA_VERSION,
        fileType: "portable-rounds",
        exportedAt: new Date().toISOString(),
        rounds: state.rounds,
        customPreset: state.customPreset,
        planningProfiles: state.planningProfiles,
      }, null, 2);
    }

    function importPortable(json, options = {}) {
      let incoming;
      try { incoming = validatePortable(typeof json === "string" ? JSON.parse(json) : json, validators); }
      catch (error) { if (error instanceof SyntaxError) fail("INVALID_IMPORT", "The selected file is not valid JSON."); throw error; }
      let next;
      if (options.replace === true) {
        if (options.confirmed !== true) fail("CONFIRM_REQUIRED", "Replacing saved data requires an explicit confirmation in the UI.");
        next = { ...state, rounds: incoming.rounds, customPreset: incoming.customPreset, planningProfiles: incoming.planningProfiles };
      } else {
        const existingIds = new Set(state.rounds.map((round) => round.id));
        if (incoming.rounds.some((round) => existingIds.has(round.id))) fail("DUPLICATE_ROUND", "Import includes a round ID already in history; nothing was imported.");
        if (state.rounds.length + incoming.rounds.length > HISTORY_LIMIT) fail("HISTORY_FULL", "Import exceeds 50 saved rounds. Export/remove older records first.");
        if (state.customPreset !== null && incoming.customPreset !== null && JSON.stringify(state.customPreset) !== JSON.stringify(incoming.customPreset)) {
          fail("PRESET_CONFLICT", "Imported Custom Practice setup conflicts with the current one; choose a confirmed replacement.");
        }
        next = {
          ...state,
          rounds: [...incoming.rounds, ...state.rounds],
          customPreset: incoming.customPreset === null ? state.customPreset : incoming.customPreset,
          planningProfiles: [...state.planningProfiles, ...incoming.planningProfiles],
        };
      }
      commit(next);
      return { importedRounds: incoming.rounds.length, totalRounds: state.rounds.length, timerUnchanged: true };
    }

    return {
      getState, listRounds, saveRound, removeRound,
      setDraft, getDraft, clearDraft, setCustomPreset, setPlanningProfiles, setTimer,
      exportPortable, importPortable, exportRoundsCsv: () => exportRoundsCsv(state.rounds),
    };
  }

  return {
    create, emptyState, validateSavedRound, validatePortable, exportRoundsCsv,
    escapeHtml, safeSpreadsheetText, APP_ID, SCHEMA_VERSION, HISTORY_LIMIT, PLANNING_PROFILE_LIMIT, DEFAULT_KEY,
  };
});
