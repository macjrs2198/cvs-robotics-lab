(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MeasureUpApp = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STORAGE_KEY = "cvs-measure-up-records-v1";
  const DURATION_SECONDS = 60;
  const TOOL_FALLBACK = {
    tape: { label: "Tape Measure / Ruler", summary: "Read inch fractions or metric millimeters on a shop ruler." },
    caliper: { label: "Dial Caliper", summary: "Combine the exposed beam tenth and dial thousandths." },
    framing: { label: "Framing Square", summary: "Check corners and lay out perpendicular lines and simple notches." },
    speed: { label: "Speed Square", summary: "Use the fence, pivot, degree scale, and 45-degree edge correctly." },
  };
  const UNIT_FALLBACK = {
    tape: [{ id: "inch", label: "Inches · 1/16" }, { id: "metric", label: "Metric · mm" }],
    caliper: [{ id: "inch", label: "Inches · 0.001" }],
    framing: [{ id: "inch", label: "Inches" }, { id: "metric", label: "Metric · mm" }],
    speed: [{ id: "degree", label: "Degrees / rise-run" }],
  };
  const JOBS = {
    tape: {
      title: "Robot cart cross-brace",
      description: "Measure stock, locate a fastener center, and confirm the cut length before the brace goes to the saw.",
      complete: "The cross-brace is measured and ready for a safe cut and drilling layout.",
      steps: ["Verify the stock reading", "Locate the fastener center", "Confirm the final cut mark"],
    },
    caliper: {
      title: "Drive-shaft inspection",
      description: "Read three dial-caliper setups to verify a robot drive shaft and spacer before assembly.",
      complete: "The shaft and spacer inspection record is complete.",
      steps: ["Read the shaft diameter", "Read the spacer thickness", "Confirm the finished dimension"],
    },
    framing: {
      title: "Weld-table bracket layout",
      description: "Establish a reference edge, check the stock corner, and finish a simple notch layout for a support bracket.",
      complete: "The bracket is square, marked, and ready for fabrication.",
      steps: ["Establish a square line", "Check the corner", "Lay out the notch"],
    },
    speed: {
      title: "Gusset plate layout",
      description: "Use the square fence and pivot to mark the edges of a small gusset for a shop cart.",
      complete: "The gusset plate has its square, 45-degree, and pivot-angle layout marks.",
      steps: ["Mark the square end", "Mark the 45-degree cut", "Set the pivot angle"],
    },
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  const JOB_PROFILES = deepFreeze({
    tape: {
      "inch-fraction": {
        apprentice: { stockLength: 8, finishedLength: 7.5, stockWidth: 1.5, fastenerCenter: 1.5 },
        journey: { stockLength: 14, finishedLength: 13.25, stockWidth: 1.5, fastenerCenter: 2.375 },
        master: { stockLength: 24, finishedLength: 22.8125, stockWidth: 2, fastenerCenter: 3.4375 },
      },
      millimeter: {
        apprentice: { stockLength: 240, finishedLength: 225, stockWidth: 38, fastenerCenter: 45 },
        journey: { stockLength: 360, finishedLength: 342, stockWidth: 45, fastenerCenter: 68 },
        master: { stockLength: 600, finishedLength: 573, stockWidth: 50, fastenerCenter: 92 },
      },
    },
    caliper: {
      apprentice: { stockDiameter: 0.75, stockLength: 6, finishedLength: 5.5, shaftDiameter: 0.625, spacerThickness: 0.125, shoulderDiameter: 0.5 },
      journey: { stockDiameter: 1, stockLength: 6, finishedLength: 5.25, shaftDiameter: 0.874, spacerThickness: 0.312, shoulderDiameter: 0.749 },
      master: { stockDiameter: 1.25, stockLength: 6, finishedLength: 4.875, shaftDiameter: 1.001, spacerThickness: 0.437, shoulderDiameter: 0.876 },
    },
    framing: {
      apprentice: { unit: "inch-fraction", stockWidth: 12, stockHeight: 6, finishedWidth: 11.5, finishedHeight: 5.5, squareLine: 4, cornerSquare: true, notchStart: 7, notchEnd: 8.5 },
      journey: { unit: "millimeter", stockWidth: 360, stockHeight: 180, finishedWidth: 340, finishedHeight: 165, squareLine: 120, cornerSquare: true, notchStart: 240, notchEnd: 290 },
      master: { unit: "inch-fraction", stockWidth: 18, stockHeight: 8, finishedWidth: 17.25, finishedHeight: 7.25, squareLine: 6.375, cornerSquare: true, notchStart: 11.5, notchEnd: 14.125 },
    },
    speed: {
      apprentice: { stockWidth: 10, stockHeight: 8, finishedWidth: 9, finishedHeight: 7, squareEnd: 2, fortyFiveStart: 4, pivotSetting: 20 },
      journey: { stockWidth: 12, stockHeight: 9, finishedWidth: 11, finishedHeight: 8, squareEnd: 2.5, fortyFiveStart: 5, pivotSetting: 32.5 },
      master: { stockWidth: 14, stockHeight: 10, finishedWidth: 13, finishedHeight: 9, squareEnd: 3, fortyFiveStart: 6, pivotSetting: 37.5 },
    },
  });

  function fractionText(value, denominator = 16) {
    const units = Math.round(Number(value) * denominator);
    const whole = Math.floor(units / denominator);
    let numerator = units % denominator;
    if (!numerator) return String(whole);
    let divisor = numerator;
    let remainder = denominator;
    while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
    numerator /= divisor;
    const reducedDenominator = denominator / divisor;
    return `${whole ? `${whole} ` : ""}${numerator}/${reducedDenominator}`;
  }

  function formatJobMeasurement(value, unit) {
    if (unit === "inch-fraction") return `${fractionText(value)} in`;
    if (unit === "millimeter") return `${Number(value)} mm`;
    if (unit === "inch-decimal") return `${Number(value).toFixed(3)} in`;
    if (unit === "degrees") return `${Number(Number(value).toFixed(1))}°`;
    return String(value);
  }

  function formatPositionValue(question, value) {
    const unit = question && question.answer && question.answer.unit || question && question.unit;
    return formatJobMeasurement(Number(value), unit);
  }

  function jobActionLabel(question) {
    return question && question.interaction === "position" ? "Check position" : "Check answer";
  }

  function jobTolerance(unit) {
    if (unit === "inch-fraction") return 1 / 32_000;
    if (unit === "inch-decimal") return 0.0005;
    if (unit === "degrees") return 0.11;
    return 0.001;
  }

  function makeJobQuestion({ tool, difficulty, unit, index, title, prompt, interaction = "read", value, setup, hint, range = null, choices = null, workpiece, step }) {
    const choice = Array.isArray(choices);
    const answer = choice
      ? { type: "choice", unit: "choice", value, accepted: [value], choices }
      : { type: "measurement", unit, value, tolerance: jobTolerance(unit) };
    return deepFreeze({
      id: `job-${tool}-${difficulty}-${index + 1}`,
      sourceId: `job-${tool}-${difficulty}-${index + 1}`,
      tool,
      difficulty,
      kind: `job-${tool}`,
      title,
      prompt,
      track: tool === "framing" ? "layout" : tool === "speed" ? "angles" : unit,
      unit: choice ? "choice" : unit,
      value,
      setup,
      answer,
      hint,
      interaction: choice ? "choice" : interaction,
      range,
      job: { workpiece, step },
    });
  }

  function buildJobOrder(tool, unit, difficulty) {
    const level = ["apprentice", "journey", "master"].includes(difficulty) ? difficulty : "apprentice";
    const metadata = JOBS[tool];
    if (!metadata) throw new RangeError(`Unknown Measure Up job tool: ${String(tool)}.`);
    let workpiece;
    let questions;
    if (tool === "tape") {
      const jobUnit = JOB_PROFILES.tape[unit] ? unit : "inch-fraction";
      const profile = JOB_PROFILES.tape[jobUnit][level];
      workpiece = deepFreeze({
        name: "cross-brace",
        unit: jobUnit,
        stock: { length: profile.stockLength, width: profile.stockWidth },
        finished: { length: profile.finishedLength, width: profile.stockWidth },
        referenceEdges: { measurement: "left reference end", alignment: "bottom edge" },
        features: { fastenerCenter: profile.fastenerCenter, cutMark: profile.finishedLength },
      });
      const range = { min: 0, max: workpiece.stock.length, step: jobUnit === "millimeter" ? 1 : 1 / 16 };
      const tapeSetup = (value) => ({
        scale: jobUnit === "millimeter" ? "metric" : "imperial",
        sixteenths: jobUnit === "inch-fraction" ? Math.round(value * 16) : null,
        millimeters: jobUnit === "millimeter" ? value : null,
        max: jobUnit === "millimeter" ? workpiece.stock.length : Math.round(workpiece.stock.length * 16),
      });
      questions = [
        makeJobQuestion({ tool, difficulty: level, unit: jobUnit, index: 0, title: "Verify the stock length", value: workpiece.stock.length, interaction: "read", range, workpiece,
          prompt: "The brace is seated at the LEFT REFERENCE END. Read the STOCK END on the ruler and enter the full stock length.",
          setup: tapeSetup(workpiece.stock.length), hint: "Start at the left reference end and read the right stock end.", step: { kind: "read", feature: "stockEnd", reference: "left reference end" } }),
        makeJobQuestion({ tool, difficulty: level, unit: jobUnit, index: 1, title: "Locate the fastener center", value: workpiece.features.fastenerCenter, interaction: "position", range, workpiece,
          prompt: `Position the FASTENER CENTER ${formatJobMeasurement(workpiece.features.fastenerCenter, jobUnit)} from the LEFT REFERENCE END.`,
          setup: tapeSetup(workpiece.features.fastenerCenter), hint: `The required center is ${formatJobMeasurement(workpiece.features.fastenerCenter, jobUnit)} from the left reference end.`, step: { kind: "position", feature: "fastenerCenter", reference: "left reference end" } }),
        makeJobQuestion({ tool, difficulty: level, unit: jobUnit, index: 2, title: "Confirm the final cut mark", value: workpiece.features.cutMark, interaction: "read", range, workpiece,
          prompt: "Read the FINAL CUT MARK from the same LEFT REFERENCE END and enter the finished brace length.",
          setup: tapeSetup(workpiece.features.cutMark), hint: "Use the same left reference end; the final cut mark is before the stock end.", step: { kind: "read", feature: "cutMark", reference: "left reference end" } }),
      ];
    } else if (tool === "caliper") {
      const profile = JOB_PROFILES.caliper[level];
      workpiece = deepFreeze({
        name: "drive-shaft and spacer set",
        unit: "inch-decimal",
        stock: { diameter: profile.stockDiameter, length: profile.stockLength },
        finished: { diameter: profile.shaftDiameter, length: profile.finishedLength },
        referenceEdges: { measurement: "fixed caliper jaw", axial: "left shaft end" },
        features: { shaftDiameter: profile.shaftDiameter, spacerThickness: profile.spacerThickness, shoulderDiameter: profile.shoulderDiameter },
      });
      const caliperStep = (value, feature) => ({ ...workpiece, feature, reading: value });
      questions = [
        makeJobQuestion({ tool, difficulty: level, unit: "inch-decimal", index: 0, title: "Read the shaft diameter", value: workpiece.features.shaftDiameter, workpiece,
          prompt: "The jaws contact the finished SHAFT DIAMETER. Enter the dial-caliper reading.", setup: { ...caliperStep(workpiece.features.shaftDiameter, "shaftDiameter") },
          hint: "Combine the exposed beam tenths with the dial thousandths.", step: { kind: "read", feature: "shaftDiameter", reference: "fixed caliper jaw" } }),
        makeJobQuestion({ tool, difficulty: level, unit: "inch-decimal", index: 1, title: "Read the spacer thickness", value: workpiece.features.spacerThickness, workpiece,
          prompt: "The spacer faces are between the jaws. Enter the SPACER THICKNESS shown.", setup: { ...caliperStep(workpiece.features.spacerThickness, "spacerThickness") },
          hint: "Read the beam first, then add the dial thousandths.", step: { kind: "read", feature: "spacerThickness", reference: "fixed caliper jaw" } }),
        makeJobQuestion({ tool, difficulty: level, unit: "inch-decimal", index: 2, title: "Confirm the shoulder diameter", value: workpiece.features.shoulderDiameter, workpiece,
          prompt: "The jaws contact the finished SHOULDER DIAMETER. Enter the final inspection reading.", setup: { ...caliperStep(workpiece.features.shoulderDiameter, "shoulderDiameter") },
          hint: "The shoulder is smaller than the main shaft and is still read from the fixed jaw.", step: { kind: "read", feature: "shoulderDiameter", reference: "fixed caliper jaw" } }),
      ];
    } else if (tool === "framing") {
      const profile = JOB_PROFILES.framing[level];
      const dimensionUnit = profile.unit;
      workpiece = deepFreeze({
        name: "weld-table support bracket",
        unit: dimensionUnit,
        stock: { width: profile.stockWidth, height: profile.stockHeight },
        finished: { width: profile.finishedWidth, height: profile.finishedHeight },
        referenceEdges: { measurement: "left reference edge", square: "bottom reference edge" },
        features: { squareLine: profile.squareLine, cornerSquare: profile.cornerSquare, notchStart: profile.notchStart, notchEnd: profile.notchEnd, notchDepth: profile.finishedHeight / 3 },
      });
      const range = { min: 0, max: workpiece.finished.width, step: dimensionUnit === "millimeter" ? 1 : 1 / 16 };
      const cornerValue = workpiece.features.cornerSquare ? "square" : "out-of-square";
      questions = [
        makeJobQuestion({ tool, difficulty: level, unit: dimensionUnit, index: 0, title: "Establish the square line", value: workpiece.features.squareLine, interaction: "position", range, workpiece,
          prompt: `Position a perpendicular line ${formatJobMeasurement(workpiece.features.squareLine, dimensionUnit)} from the LEFT REFERENCE EDGE.`,
          setup: { task: "job-square-line", offset: workpiece.features.squareLine, unit: dimensionUnit }, hint: "Keep the square seated on the bottom reference edge and measure from the left edge.", step: { kind: "position", feature: "squareLine", reference: "left reference edge" } }),
        makeJobQuestion({ tool, difficulty: level, unit: "choice", index: 1, title: "Check the stock corner", value: cornerValue, choices: ["square", "out-of-square"], workpiece,
          prompt: workpiece.features.cornerSquare ? "Both square legs contact the bracket corner with no gap. Classify the corner." : "The square contacts one edge but a visible gap remains on the other. Classify the corner.",
          setup: { task: "job-corner-check", square: workpiece.features.cornerSquare }, hint: "No gap means square; a consistent gap means out of square.", step: { kind: "read", feature: "cornerSquare", reference: "bottom and left reference edges" } }),
        makeJobQuestion({ tool, difficulty: level, unit: dimensionUnit, index: 2, title: "Lay out the notch", value: workpiece.features.notchEnd, interaction: "position", range, workpiece,
          prompt: `The first notch line is fixed at ${formatJobMeasurement(workpiece.features.notchStart, dimensionUnit)}. Position the SECOND NOTCH LINE at ${formatJobMeasurement(workpiece.features.notchEnd, dimensionUnit)} from the LEFT REFERENCE EDGE.`,
          setup: { task: "job-notch", start: workpiece.features.notchStart, end: workpiece.features.notchEnd, unit: dimensionUnit }, hint: `Keep the same left reference; the notch runs from ${formatJobMeasurement(workpiece.features.notchStart, dimensionUnit)} to ${formatJobMeasurement(workpiece.features.notchEnd, dimensionUnit)}.`, step: { kind: "position", feature: "notchEnd", reference: "left reference edge" } }),
      ];
    } else {
      const profile = JOB_PROFILES.speed[level];
      const pivotLineAngle = 90 - profile.pivotSetting;
      const pivotX = 1;
      const pivotRun = Math.min(profile.finishedWidth - pivotX, profile.finishedHeight / Math.tan(pivotLineAngle * Math.PI / 180));
      const fortyFiveRun = Math.min(profile.finishedWidth - profile.fortyFiveStart, profile.finishedHeight);
      workpiece = deepFreeze({
        name: "shop-cart gusset plate",
        unit: "inch-fraction",
        stock: { width: profile.stockWidth, height: profile.stockHeight },
        finished: { width: profile.finishedWidth, height: profile.finishedHeight },
        referenceEdges: { angle: "bottom reference edge", pivot: "left pivot point" },
        features: {
          squareEnd: { offset: profile.squareEnd, lineAngle: 90 },
          fortyFiveCut: { start: { x: profile.fortyFiveStart, y: 0 }, end: { x: profile.fortyFiveStart + fortyFiveRun, y: fortyFiveRun }, lineAngle: 45 },
          pivotLine: { start: { x: pivotX, y: 0 }, end: { x: pivotX + pivotRun, y: pivotRun * Math.tan(pivotLineAngle * Math.PI / 180) }, degreeSetting: profile.pivotSetting, lineAngle: pivotLineAngle },
        },
      });
      questions = [
        makeJobQuestion({ tool, difficulty: level, unit: "degrees", index: 0, title: "Read the square end line", value: workpiece.features.squareEnd.lineAngle, workpiece,
          prompt: "The end line is drawn with the fence seated on the BOTTOM REFERENCE EDGE. Enter the marked line angle from that edge.",
          setup: { task: "job-square-end", degreeSetting: 0, lineAngle: workpiece.features.squareEnd.lineAngle }, hint: "A square end line is 90° from the reference edge.", step: { kind: "read", feature: "squareEnd", quantity: "lineAngle", reference: "bottom reference edge" } }),
        makeJobQuestion({ tool, difficulty: level, unit: "degrees", index: 1, title: "Mark the 45-degree cut", value: workpiece.features.fortyFiveCut.lineAngle, interaction: "position", range: { min: 0, max: 90, step: 0.5 }, workpiece,
          prompt: "Position the MARKED LINE at 45° from the BOTTOM REFERENCE EDGE.",
          setup: { task: "job-forty-five", degreeSetting: 45, lineAngle: workpiece.features.fortyFiveCut.lineAngle }, hint: "Use the hypotenuse edge; both the setting and marked line angle are 45°.", step: { kind: "position", feature: "fortyFiveCut", quantity: "lineAngle", reference: "bottom reference edge" } }),
        makeJobQuestion({ tool, difficulty: level, unit: "degrees", index: 2, title: "Set the pivot angle", value: workpiece.features.pivotLine.degreeSetting, interaction: "position", range: { min: 0, max: 90, step: 0.5 }, workpiece,
          prompt: `Set the square to ${formatJobMeasurement(workpiece.features.pivotLine.degreeSetting, "degrees")} ROTATION AWAY FROM SQUARE at the LEFT PIVOT POINT.`,
          setup: { task: "job-pivot", degreeSetting: workpiece.features.pivotLine.degreeSetting, lineAngle: workpiece.features.pivotLine.lineAngle }, hint: `A ${formatJobMeasurement(workpiece.features.pivotLine.degreeSetting, "degrees")} square setting produces a ${formatJobMeasurement(workpiece.features.pivotLine.lineAngle, "degrees")} marked line from the reference edge.`, step: { kind: "position", feature: "pivotLine", quantity: "degreeSetting", reference: "left pivot point" } }),
      ];
    }
    return deepFreeze({ ...metadata, workpiece, steps: questions.map((question) => question.title), questions });
  }

  function recordKey(tool, unit, difficulty, duration = DURATION_SECONDS) {
    return [tool, unit, difficulty, Number(duration)].join("|");
  }

  function readRecords(storage) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
      return parsed && parsed.version === 1 && parsed.records && typeof parsed.records === "object" ? parsed : { version: 1, records: {} };
    } catch (_) { return { version: 1, records: {} }; }
  }

  function resolveStorage(host, suppliedStorage) {
    if (suppliedStorage && typeof suppliedStorage.getItem === "function" && typeof suppliedStorage.setItem === "function") return suppliedStorage;
    try {
      const candidate = host && host.localStorage;
      if (candidate && typeof candidate.getItem === "function" && typeof candidate.setItem === "function") return candidate;
    } catch (_) { /* privacy settings may block even reading localStorage */ }
    return {
      getItem: () => null,
      setItem: () => { throw new Error("Browser-local storage is unavailable."); },
    };
  }

  function isBetterRecord(next, previous) {
    if (!previous) return true;
    if (next.correct !== previous.correct) return next.correct > previous.correct;
    if (next.accuracy !== previous.accuracy) return next.accuracy > previous.accuracy;
    return next.bestStreak > previous.bestStreak;
  }

  function saveRecord(storage, result) {
    const database = readRecords(storage);
    const key = recordKey(result.tool, result.unit, result.difficulty, result.durationSeconds);
    const candidate = {
      correct: Number(result.correct) || 0,
      attempted: Number(result.attempted) || 0,
      accuracy: Number(result.accuracy) || 0,
      bestStreak: Number(result.bestStreak) || 0,
      completedAt: result.completedAt,
    };
    const previous = database.records[key];
    const improved = isBetterRecord(candidate, previous);
    let persisted = true;
    if (improved) {
      database.records[key] = candidate;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(database)); }
      catch (_) {
        persisted = false;
        if (previous) database.records[key] = previous;
        else delete database.records[key];
      }
    }
    return {
      improved: improved && persisted,
      persisted,
      storageFailed: improved && !persisted,
      record: database.records[key] || previous || candidate,
      key,
    };
  }

  function formatClock(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000) || 0);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function nextChallengeSeed(previousSeed, nowValue = Date.now()) {
    const rawPrevious = Number(previousSeed);
    const rawCandidate = Number(nowValue);
    const previous = Number.isFinite(rawPrevious) ? Math.trunc(rawPrevious) : -1;
    const candidate = Number.isFinite(rawCandidate) ? Math.trunc(rawCandidate) : 0;
    return candidate > previous ? candidate : previous + 1;
  }

  function keyboardIndex(key, current, length) {
    if (!Number.isInteger(length) || length < 1) return current;
    if (key === "Home") return 0;
    if (key === "End") return length - 1;
    if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % length;
    if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + length) % length;
    return current;
  }

  function focusFirstAnswer(container) {
    if (!container || typeof container.querySelector !== "function") return false;
    const control = container.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (!control || typeof control.focus !== "function") return false;
    control.focus();
    return true;
  }

  function normalizeVerdict(verdict, model, question) {
    const correct = verdict === true || !!(verdict && verdict.correct);
    const expected = verdict && verdict.expectedText != null
      ? verdict.expectedText
      : verdict && verdict.expected != null
        ? verdict.expected
        : (model && model.formatExpected ? model.formatExpected(question) : question.answer && question.answer.value);
    return { correct, expected: String(expected == null ? "" : expected), message: verdict && verdict.message ? String(verdict.message) : "" };
  }

  class ChallengeRuntime {
    constructor({ questions, evaluate, formatExpected, now = Date.now, durationMs = 60000, metadata = {} }) {
      if (!Array.isArray(questions) || !questions.length) throw new Error("Challenge requires prepared questions.");
      this.questions = questions.slice();
      this.evaluate = evaluate;
      this.formatExpected = formatExpected;
      this.now = now;
      this.durationMs = durationMs;
      this.metadata = { ...metadata };
      this.startedAt = null;
      this.finished = null;
      this.index = 0;
      this.correct = 0;
      this.attempted = 0;
      this.currentStreak = 0;
      this.bestStreak = 0;
      this.missed = [];
    }
    start() { if (this.startedAt == null) this.startedAt = this.now(); return this.getState(); }
    remainingMs() { return this.startedAt == null ? this.durationMs : Math.max(0, this.durationMs - (this.now() - this.startedAt)); }
    currentQuestion() { return this.finished ? null : this.questions[this.index % this.questions.length]; }
    submit(raw) {
      if (this.startedAt == null) this.start();
      if (this.remainingMs() <= 0) return { accepted: false, result: this.finish() };
      const question = this.currentQuestion();
      const verdict = normalizeVerdict(this.evaluate(question, raw), { formatExpected: this.formatExpected }, question);
      this.attempted += 1;
      if (verdict.correct) {
        this.correct += 1;
        this.currentStreak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
      } else {
        this.currentStreak = 0;
        this.missed.push({ prompt: question.prompt, given: String(raw == null ? "" : raw), expected: verdict.expected });
      }
      this.index += 1;
      return { accepted: true, correct: verdict.correct, expected: verdict.expected, state: this.getState() };
    }
    getState() {
      if (!this.finished && this.startedAt != null && this.remainingMs() <= 0) this.finish();
      return {
        status: this.finished ? "finished" : this.startedAt == null ? "ready" : "running",
        remainingMs: this.finished ? 0 : this.remainingMs(),
        correct: this.correct,
        attempted: this.attempted,
        currentStreak: this.currentStreak,
        bestStreak: this.bestStreak,
        index: this.index,
      };
    }
    finish(metadata = {}) {
      if (this.finished) return this.finished;
      const accuracy = this.attempted ? Math.round((this.correct / this.attempted) * 1000) / 10 : 0;
      this.finished = deepFreeze({
        ...this.metadata,
        ...metadata,
        durationSeconds: Math.round(this.durationMs / 1000),
        correct: this.correct,
        attempted: this.attempted,
        accuracy,
        bestStreak: this.bestStreak,
        perfect: this.attempted > 0 && this.correct === this.attempted,
        missedReview: this.missed.map((entry) => ({ ...entry })),
        completedAt: metadata.completedAt || new Date().toISOString(),
      });
      return this.finished;
    }
  }

  function unitOptions(model, tool) {
    const options = model && typeof model.getUnitsForTool === "function" ? model.getUnitsForTool(tool) : UNIT_FALLBACK[tool];
    return (options || UNIT_FALLBACK[tool] || []).map((entry) => typeof entry === "string" ? { id: entry, label: entry } : { id: entry.id || entry.value, label: entry.label || entry.name || entry.id || entry.value });
  }

  function measurementLabel(question) {
    const unit = question.answer && question.answer.unit || question.unit;
    if (unit === "inch" || unit === "inch-fraction" || unit === "inch-decimal") return "in";
    if (unit === "metric" || unit === "millimeter" || unit === "mm") return "mm";
    if (unit === "degree" || unit === "degrees" || unit === "angles") return "degrees";
    return unit || "";
  }

  function questionValue(question) {
    const value = question && question.answer && question.answer.value;
    return Number.isFinite(Number(value)) ? Number(value) : undefined;
  }

  function initialPositionValue(question) {
    const range = question && question.range || {};
    const min = Number(range.min);
    const max = Number(range.max);
    const step = Math.abs(Number(range.step)) || 1;
    const target = Number(questionValue(question));
    if (![min, max, target].every(Number.isFinite) || max <= min) return Number.isFinite(min) ? min : 0;
    const offset = Math.max(step, (max - min) * 0.1);
    const raw = target - offset >= min ? target - offset : target + offset;
    const snapped = min + Math.round((raw - min) / step) * step;
    return Math.max(min, Math.min(max, Number(snapped.toFixed(6))));
  }

  function tapeSvg(question, overlay) {
    const metric = question.unit === "metric" || question.unit === "millimeter" || question.answer && (question.answer.unit === "metric" || question.answer.unit === "millimeter");
    const max = Number(question.setup.max) || (metric ? 160 : 64);
    const raw = metric ? Number(question.setup.millimeters) : Number(question.setup.sixteenths);
    const target = Number.isFinite(raw) ? raw : 0;
    const x0 = 90, width = 780, y = 220;
    const markerValue = overlay && Number.isFinite(Number(overlay.value)) ? (metric ? Number(overlay.value) : Number(overlay.value) * 16) : target;
    // Show a readable local section of a longer tape. The absolute labels and
    // highlighted position still come from the same measurement model. During
    // positioning practice, the visible section follows the student's mark.
    const totalTicks = metric ? 200 : 96;
    const majorEvery = metric ? 10 : 16;
    const totalRange = Math.max(totalTicks, max);
    const desiredStart = Math.floor((markerValue - totalTicks * 0.55) / majorEvery) * majorEvery;
    const maxStart = Math.max(0, totalRange - totalTicks);
    const startTick = Math.max(0, Math.min(maxStart, desiredStart));
    const endTick = startTick + totalTicks;
    let ticks = "";
    for (let i = 0; i <= totalTicks; i += 1) {
      const absoluteTick = startTick + i;
      const x = x0 + (i / totalTicks) * width;
      const major = absoluteTick % majorEvery === 0;
      const medium = metric ? absoluteTick % 5 === 0 : absoluteTick % 8 === 0;
      const height = major ? 74 : medium ? 52 : (metric ? 30 : absoluteTick % 4 === 0 ? 42 : absoluteTick % 2 === 0 ? 32 : 23);
      ticks += `<line x1="${x.toFixed(2)}" y1="${y}" x2="${x.toFixed(2)}" y2="${y - height}" stroke="${major ? "#1b221f" : "#34413c"}" stroke-width="${major ? 3 : 1.4}"/>`;
      if (major) ticks += `<text x="${x.toFixed(2)}" y="${y - 82}" text-anchor="middle" class="svg-label">${metric ? absoluteTick : absoluteTick / 16}</text>`;
    }
    const markerOffset = Math.max(0, Math.min(totalTicks, markerValue - startTick));
    const markerX = x0 + markerOffset / totalTicks * width;
    const markerClass = overlay && overlay.correct ? "correct-mark" : overlay ? "answer-mark" : "target-mark";
    const sectionLabel = metric
      ? `showing ${startTick}–${endTick} mm`
      : `showing ${startTick / 16}–${endTick / 16} in`;
    return `<svg viewBox="0 0 960 340" role="img" aria-label="${metric ? "Metric ruler" : "Inch ruler marked in sixteenths"}" data-range-start="${startTick}" data-range-end="${endTick}" data-marker="${markerValue}">
      <rect x="48" y="102" width="864" height="160" rx="10" fill="#151d1a" opacity=".65"/>
      <rect x="70" y="128" width="820" height="112" rx="4" fill="#e9bd3e" stroke="#f5dd81" stroke-width="2"/>
      ${ticks}
      <line x1="${markerX.toFixed(2)}" y1="108" x2="${markerX.toFixed(2)}" y2="250" class="${markerClass}"/>
      <path d="M${markerX - 10},108 L${markerX + 10},108 L${markerX},124 Z" fill="#70e1f5"/>
      <text x="480" y="292" text-anchor="middle" class="tool-note">${metric ? "METRIC TRACK · smallest mark = 1 mm" : "INCH TRACK · smallest mark = 1/16 in"} · ${sectionLabel}</text>
    </svg>`;
  }

  function caliperSvg(question, overlay) {
    const setup = question.setup || {};
    const requestedReading = overlay && Number.isFinite(Number(overlay.value)) ? Number(overlay.value) : Number(setup.reading);
    const reading = Math.max(0, Math.min(6, Number.isFinite(requestedReading) ? requestedReading : 0));
    const totalThousandths = Math.round(reading * 1000);
    const beam = Math.floor(totalThousandths / 100);
    const dial = totalThousandths - beam * 100;
    const beamX = 205, beamWidth = 420;
    const jawX = beamX + reading / 6 * beamWidth;
    const pointer = (dial / 100) * 360 - 90;
    let beamTicks = "";
    for (let i = 0; i <= 60; i += 1) {
      const x = beamX + i / 60 * beamWidth;
      const tickBottom = i % 10 === 0 ? 194 : i % 5 === 0 ? 185 : 176;
      beamTicks += `<line x1="${x.toFixed(2)}" y1="156" x2="${x.toFixed(2)}" y2="${tickBottom}" stroke="#344047" stroke-width="${i % 10 === 0 ? 2.4 : 1.25}"/>`;
      if (i % 10 === 0) beamTicks += `<text x="${x.toFixed(2)}" y="212" text-anchor="middle" class="svg-small">${i / 10}</text>`;
    }
    let dialTicks = "";
    for (let i = 0; i < 100; i += 1) {
      const a = (i / 100) * Math.PI * 2 - Math.PI / 2;
      const inner = i % 10 === 0 ? 52 : i % 5 === 0 ? 57 : 62;
      dialTicks += `<line x1="${(760 + Math.cos(a) * 68).toFixed(1)}" y1="${(150 + Math.sin(a) * 68).toFixed(1)}" x2="${(760 + Math.cos(a) * inner).toFixed(1)}" y2="${(150 + Math.sin(a) * inner).toFixed(1)}" stroke="#18201d" stroke-width="${i % 10 === 0 ? 2.2 : 1}"/>`;
      if (i % 10 === 0) dialTicks += `<text x="${(760 + Math.cos(a) * 42).toFixed(1)}" y="${(154 + Math.sin(a) * 42).toFixed(1)}" text-anchor="middle" class="svg-small">${i}</text>`;
    }
    const rad = pointer * Math.PI / 180;
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Dial caliper with beam and dial" data-reading="${reading.toFixed(3)}" data-beam-tenths="${beam}" data-dial-thousandths="${dial}" data-beam-divisions="60" data-dial-divisions="100">
      <rect x="96" y="145" width="680" height="72" rx="8" fill="#b8c5ca" stroke="#e4ecef" stroke-width="3"/>
      ${beamTicks}
      <path d="M112 90 H205 V145 H170 V280 H112 Z" fill="#c7d2d6" stroke="#eff6f7" stroke-width="3"/>
      <path d="M${jawX} 103 H${jawX + 74} V145 H${jawX + 38} V270 H${jawX} Z" fill="#9aa9ae" stroke="#dce6e9" stroke-width="3"/>
      <line x1="${jawX.toFixed(2)}" y1="145" x2="${jawX.toFixed(2)}" y2="202" stroke="#d52e35" stroke-width="3"/>
      <circle cx="760" cy="150" r="78" fill="#e7eee9" stroke="#7d8c87" stroke-width="7"/>
      ${dialTicks}
      <line x1="760" y1="150" x2="${(760 + Math.cos(rad) * 50).toFixed(1)}" y2="${(150 + Math.sin(rad) * 50).toFixed(1)}" stroke="#d52e35" stroke-width="5" stroke-linecap="round"/>
      <circle cx="760" cy="150" r="8" fill="#26332f"/>
      <text x="760" y="245" text-anchor="middle" class="svg-small">DIAL · 100 × 0.001 in/div</text>
      <text x="450" y="310" text-anchor="middle" class="tool-note">0–6 in beam · 0.1 in divisions + dial thousandths · resolution 0.001 in</text>
    </svg>`;
  }

  function framingSvg(question, overlay) {
    const setup = question.setup || {};
    const offset = Number(setup.offset) || 8;
    const task = setup.task || "perpendicular";
    const cornerBad = setup.square === false || setup.square === "out";
    const entered = overlay && Number(overlay.value);
    const hasEntered = Number.isFinite(entered);
    const lineAngle = task === "perpendicular" && hasEntered ? Math.max(0, Math.min(90, entered)) : 90;
    const rotation = 90 - lineAngle;
    const notchValue = task === "notch" && hasEntered ? entered : Number(setup.width) || 1;
    let lineX = 240 + Math.min(500, Math.max(40, offset * 22));
    let notchX = lineX + 122;
    if (task === "notch") {
      const startValue = Math.max(0, Number(setup.start) || 0);
      const preparedEnd = Math.max(startValue, Number(setup.end) || startValue + notchValue);
      const rangeEnd = startValue + Math.max(notchValue, Number(question.range && question.range.max) || 0);
      const scaleEnd = Math.max(1, preparedEnd, rangeEnd);
      const layoutLeft = 150, layoutWidth = 640;
      lineX = layoutLeft + startValue / scaleEnd * layoutWidth - 25;
      notchX = layoutLeft + (startValue + Math.max(0, notchValue)) / scaleEnd * layoutWidth;
    }
    const reveal = !!(overlay && overlay.reveal);
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Framing square aligned to a lumber reference edge" data-position-value="${hasEntered ? entered : "prepared"}" data-line-angle="${lineAngle}" data-notch-start-x="${lineX + 25}" data-notch-x="${notchX}">
      <defs><pattern id="grain" width="48" height="18" patternUnits="userSpaceOnUse"><path d="M0 9 C12 2,35 16,48 8" fill="none" stroke="#8d552d" stroke-width="1.5" opacity=".5"/></pattern></defs>
      <rect x="74" y="82" width="812" height="184" rx="5" fill="#b9793f" stroke="#e0a267" stroke-width="3"/>
      <rect x="74" y="82" width="812" height="184" rx="5" fill="url(#grain)"/>
      <line x1="74" y1="266" x2="886" y2="266" stroke="#70e1f5" stroke-width="6"/>
      <text x="82" y="299" class="svg-label">REFERENCE EDGE</text>
      <g transform="${cornerBad && task === "corner-check" ? `rotate(3 ${lineX} 266)` : task === "perpendicular" ? `rotate(${rotation} ${lineX + 25} 266)` : ""}">
        <path d="M${lineX - 22} 104 H${lineX + 24} V242 H${lineX + 136} V267 H${lineX - 22} Z" fill="#c5cdd0" stroke="#f3f7f8" stroke-width="3" opacity=".96"/>
        <line x1="${lineX + 25}" y1="104" x2="${lineX + 25}" y2="266" stroke="${reveal ? "#45e07f" : "#ffc857"}" stroke-width="4" stroke-dasharray="${task === "notch" ? "9 6" : "none"}"/>
      </g>
      ${task === "notch" ? `<line x1="${notchX}" y1="104" x2="${notchX}" y2="266" stroke="${reveal ? "#45e07f" : "#ffc857"}" stroke-width="4" stroke-dasharray="9 6"/><text x="${(lineX + notchX) / 2}" y="126" text-anchor="middle" class="svg-small">NOTCH WIDTH</text>` : ""}
      <text x="710" y="54" class="tool-note">${task === "corner-check" ? "CORNER CHECK" : task === "notch" ? "SIMPLE NOTCH LAYOUT" : "PERPENDICULAR LINE"}</text>
    </svg>`;
  }

  function speedSvg(question, reveal, overlayValue) {
    const setup = question.setup || {};
    const task = setup.task || "square-line";
    const entered = Number(overlayValue);
    const asksSetting = /setting/i.test(question.prompt || "");
    const preparedDegree = Number(setup.degreeSetting);
    const preparedLineAngle = Number(setup.lineAngle);
    const degree = Number.isFinite(entered)
      ? (asksSetting ? entered : 90 - entered)
      : Number.isFinite(preparedDegree) ? preparedDegree : task === "forty-five" ? 45 : 0;
    const lineAngle = Number.isFinite(entered)
      ? (asksSetting ? 90 - entered : entered)
      : Number.isFinite(preparedLineAngle) ? preparedLineAngle : task === "square-line" ? 90 : 90 - degree;
    const rad = (180 - lineAngle) * Math.PI / 180;
    const x2 = 215 + Math.cos(rad) * 240, y2 = 258 - Math.sin(rad) * 240;
    const angleText = (value) => `${Number(Number(value).toFixed(1))}°`;
    let guidance;
    if (reveal) {
      guidance = [
        `SQUARE SETTING ${angleText(degree)}`,
        `MARKED LINE ${angleText(lineAngle)} TO REFERENCE`,
        task === "rise-run" ? `RISE / RUN ${setup.rise} : ${setup.run || 12}` : "SETTING + LINE ANGLE = 90°",
      ];
    } else if (task === "forty-five") {
      guidance = ["USE THE HYPOTENUSE EDGE", "IDENTIFY SETTING VS MARKED LINE"];
    } else if (question.answer && question.answer.type === "ratio") {
      guidance = [`SQUARE SETTING ${angleText(degree)}`, "FIND THE RISE : RUN RATIO"];
    } else if (task === "rise-run") {
      guidance = [`SOURCE RISE / RUN ${setup.rise} : ${setup.run || 12}`, asksSetting ? "FIND THE DEGREE SETTING" : "FIND THE MARKED-LINE ANGLE"];
    } else if (asksSetting) {
      guidance = [`MARKED LINE ${angleText(lineAngle)} TO REFERENCE`, "FIND THE SQUARE SETTING"];
    } else {
      guidance = [`SQUARE SETTING ${angleText(degree)}`, "FIND THE MARKED-LINE ANGLE"];
    }
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Speed square on a workpiece with pivot and reference edge identified" data-degree-setting="${degree}" data-line-angle="${lineAngle}">
      <rect x="68" y="76" width="824" height="214" rx="5" fill="#a86737" stroke="#d59a63" stroke-width="3"/>
      <line x1="68" y1="260" x2="892" y2="260" stroke="#70e1f5" stroke-width="6"/>
      <text x="78" y="312" class="svg-label">REFERENCE EDGE / FENCE</text>
      <path d="M190 259 L190 78 L420 259 Z" fill="#c9d1d3" stroke="#f2f6f7" stroke-width="4" opacity=".95"/>
      <path d="M225 238 L225 141 L348 238 Z" fill="#56635f" stroke="#899792" stroke-width="2"/>
      <circle cx="215" cy="258" r="9" fill="#ff8b4d" stroke="#fff" stroke-width="2"/>
      <text x="225" y="282" class="svg-small">PIVOT</text>
      <path d="M250 258 A35 35 0 0 0 ${(215 + Math.cos(rad) * 35).toFixed(1)} ${(258 - Math.sin(rad) * 35).toFixed(1)}" fill="none" stroke="#b9a6ff" stroke-width="3"/>
      <line x1="215" y1="258" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${reveal ? "#45e07f" : "#ffc857"}" stroke-width="5"/>
      <text x="610" y="115" class="svg-label">${guidance[0]}</text>
      <text x="610" y="145" class="svg-small">${guidance[1]}</text>
      ${guidance[2] ? `<text x="610" y="185" class="tool-note">${guidance[2]}</text>` : ""}
    </svg>`;
  }

  function jobTapeSvg(question, overlay) {
    const workpiece = question.job.workpiece;
    const step = question.job.step;
    const metric = workpiece.unit === "millimeter";
    const stockLength = Number(workpiece.stock.length);
    const finishedLength = Number(workpiece.finished.length);
    const fastenerCenter = Number(workpiece.features.fastenerCenter);
    const target = Number(question.answer.value);
    const learner = overlay && Number.isFinite(Number(overlay.value)) ? Number(overlay.value) : null;
    const marker = step.kind === "position" && learner != null ? learner : target;
    const correction = overlay && Number.isFinite(Number(overlay.correctValue)) ? Number(overlay.correctValue) : null;
    const x0 = 100, width = 760;
    const xFor = (value) => x0 + Math.max(0, Math.min(stockLength, Number(value))) / stockLength * width;
    const tickCount = metric ? Math.round(stockLength) : Math.round(stockLength * 16);
    const majorEvery = metric ? (stockLength > 400 ? 50 : 10) : 16;
    let ticks = "";
    for (let index = 0; index <= tickCount; index += 1) {
      const value = metric ? index : index / 16;
      const x = xFor(value);
      const major = index % majorEvery === 0;
      const middle = metric ? index % 5 === 0 : index % 8 === 0;
      const height = major ? 58 : middle ? 39 : metric ? 21 : index % 4 === 0 ? 31 : index % 2 === 0 ? 25 : 18;
      ticks += `<line x1="${x.toFixed(2)}" y1="274" x2="${x.toFixed(2)}" y2="${274 - height}" stroke="#26322e" stroke-width="${major ? 2.6 : 1.2}"/>`;
      if (major) ticks += `<text x="${x.toFixed(2)}" y="208" text-anchor="middle" class="svg-small">${metric ? index : fractionText(value)}</text>`;
    }
    const learnerLine = `<line x1="${xFor(marker).toFixed(2)}" y1="190" x2="${xFor(marker).toFixed(2)}" y2="286" class="${step.kind === "position" ? "answer-mark" : "target-mark"}" data-mark-kind="${step.kind === "position" ? "learner" : "fixed"}"/>`;
    const correctionLine = correction != null && Math.abs(correction - marker) > 1e-9
      ? `<line x1="${xFor(correction).toFixed(2)}" y1="190" x2="${xFor(correction).toFixed(2)}" y2="286" class="correct-mark" data-mark-kind="correct"/>`
      : "";
    const cutX = xFor(finishedLength), fastenerX = xFor(fastenerCenter), stockX = xFor(stockLength);
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Cross-brace on a ruler with left reference, fastener center, and cut mark" data-job-tool="tape" data-reference="${step.reference}" data-graded-value="${question.answer.value}" data-stock-length="${stockLength}" data-finished-length="${finishedLength}" data-fastener-center="${fastenerCenter}" data-cut-mark="${finishedLength}" data-marker-value="${marker}"${correction != null ? ` data-correct-value="${correction}"` : ""}>
      <rect x="${x0}" y="50" width="${width}" height="82" rx="5" fill="#a96b37" stroke="#dda56b" stroke-width="3"/>
      <line x1="${x0}" y1="38" x2="${x0}" y2="145" stroke="#70e1f5" stroke-width="6"/>
      <text x="${x0 + 8}" y="34" class="svg-label">LEFT REFERENCE END</text>
      <line x1="${cutX.toFixed(2)}" y1="45" x2="${cutX.toFixed(2)}" y2="138" stroke="#ffc857" stroke-width="4" stroke-dasharray="8 5"/>
      <text x="${cutX.toFixed(2)}" y="155" text-anchor="middle" class="svg-small">FINAL CUT MARK</text>
      <circle cx="${fastenerX.toFixed(2)}" cy="91" r="9" fill="none" stroke="#f2f7f4" stroke-width="3"/>
      <line x1="${fastenerX - 14}" y1="91" x2="${fastenerX + 14}" y2="91" stroke="#f2f7f4" stroke-width="2"/>
      <line x1="${fastenerX}" y1="77" x2="${fastenerX}" y2="105" stroke="#f2f7f4" stroke-width="2"/>
      <text x="${fastenerX.toFixed(2)}" y="68" text-anchor="middle" class="svg-small">FASTENER CENTER</text>
      <line x1="${stockX.toFixed(2)}" y1="45" x2="${stockX.toFixed(2)}" y2="138" stroke="#e7eee9" stroke-width="3"/>
      <text x="${stockX.toFixed(2)}" y="34" text-anchor="end" class="svg-small">STOCK END</text>
      <rect x="${x0 - 18}" y="190" width="${width + 36}" height="96" rx="5" fill="#e9bd3e" stroke="#f5dd81" stroke-width="2"/>
      ${ticks}${learnerLine}${correctionLine}
      <text x="480" y="320" text-anchor="middle" class="tool-note">${metric ? "METRIC TRACK · 1 mm divisions" : "INCH TRACK · 1/16 in divisions"} · same left reference throughout</text>
    </svg>`;
  }

  function jobCaliperSvg(question, overlay) {
    const workpiece = question.job.workpiece;
    const feature = question.job.step.feature;
    const base = caliperSvg(question, { ...(overlay || {}), value: question.setup.reading });
    const featureLabel = feature === "shaftDiameter" ? "FINISHED SHAFT Ø" : feature === "spacerThickness" ? "SPACER THICKNESS" : "SHOULDER Ø";
    const shape = feature === "spacerThickness"
      ? '<rect x="76" y="28" width="72" height="42" rx="4" fill="#7f8c91" stroke="#e4ecef" stroke-width="3"/><line x1="76" y1="20" x2="76" y2="78" stroke="#70e1f5" stroke-width="3"/><line x1="148" y1="20" x2="148" y2="78" stroke="#70e1f5" stroke-width="3"/>'
      : feature === "shoulderDiameter"
        ? '<path d="M64 42 H106 V28 H160 V70 H106 V58 H64 Z" fill="#7f8c91" stroke="#e4ecef" stroke-width="3"/>'
        : '<rect x="64" y="32" width="104" height="32" rx="16" fill="#7f8c91" stroke="#e4ecef" stroke-width="3"/>';
    return base
      .replace('<svg viewBox="0 0 960 340"', `<svg viewBox="0 0 960 340" data-job-tool="caliper" data-reference="${question.job.step.reference}" data-graded-value="${question.answer.value}" data-stock-diameter="${workpiece.stock.diameter}" data-finished-diameter="${workpiece.finished.diameter}" data-feature="${feature}" data-feature-value="${question.answer.value}"`)
      .replace("</svg>", `<g aria-label="${featureLabel.toLowerCase()} workpiece">${shape}<text x="184" y="56" class="svg-label">${featureLabel}</text><text x="184" y="76" class="svg-small">REFERENCE: FIXED CALIPER JAW</text></g></svg>`);
  }

  function jobFramingSvg(question, overlay) {
    const workpiece = question.job.workpiece;
    const step = question.job.step;
    const maximum = Number(workpiece.finished.width);
    const x0 = 104, width = 752;
    const xFor = (value) => x0 + Math.max(0, Math.min(maximum, Number(value))) / maximum * width;
    const learner = overlay && Number.isFinite(Number(overlay.value)) ? Number(overlay.value) : null;
    const correction = overlay && Number.isFinite(Number(overlay.correctValue)) ? Number(overlay.correctValue) : null;
    const featureValue = Number(question.answer.value);
    const activeValue = step.kind === "position" && learner != null ? learner : featureValue;
    const fixedStart = Number(workpiece.features.notchStart);
    const squareLine = Number(workpiece.features.squareLine);
    const cornerSquare = Boolean(workpiece.features.cornerSquare);
    const positionLine = step.feature === "notchEnd" || step.feature === "squareLine"
      ? `<line x1="${xFor(activeValue).toFixed(2)}" y1="84" x2="${xFor(activeValue).toFixed(2)}" y2="266" class="${step.kind === "position" ? "answer-mark" : "target-mark"}" data-mark-kind="${step.kind === "position" ? "learner" : "fixed"}"/>`
      : "";
    const correctionLine = correction != null && Math.abs(correction - activeValue) > 1e-9
      ? `<line x1="${xFor(correction).toFixed(2)}" y1="84" x2="${xFor(correction).toFixed(2)}" y2="266" class="correct-mark" data-mark-kind="correct"/>`
      : "";
    const cornerTop = cornerSquare ? 84 : 94;
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Weld-table bracket layout with fixed reference edges" data-job-tool="framing" data-reference="${step.reference}" data-graded-value="${question.answer.value}" data-stock-width="${workpiece.stock.width}" data-finished-width="${workpiece.finished.width}" data-square-line="${squareLine}" data-notch-start="${fixedStart}" data-notch-end="${workpiece.features.notchEnd}" data-marker-value="${Number.isFinite(activeValue) ? activeValue : "choice"}"${correction != null ? ` data-correct-value="${correction}"` : ""}>
      <path d="M${x0} 266 V84 H856 V266 Z" fill="#a96b37" stroke="#dda56b" stroke-width="3"/>
      <line x1="${x0}" y1="266" x2="856" y2="266" stroke="#70e1f5" stroke-width="6"/>
      <line x1="${x0}" y1="84" x2="${x0}" y2="270" stroke="#70e1f5" stroke-width="6"/>
      <text x="${x0 + 10}" y="300" class="svg-label">LEFT REFERENCE EDGE</text>
      <text x="620" y="300" class="svg-label">BOTTOM REFERENCE EDGE</text>
      <line x1="${xFor(squareLine).toFixed(2)}" y1="92" x2="${xFor(squareLine).toFixed(2)}" y2="260" stroke="#d7e0dc" stroke-width="3" stroke-dasharray="7 6"/>
      <text x="${xFor(squareLine).toFixed(2)}" y="75" text-anchor="middle" class="svg-small">SQUARE LINE</text>
      <line x1="${xFor(fixedStart).toFixed(2)}" y1="92" x2="${xFor(fixedStart).toFixed(2)}" y2="190" stroke="#ffc857" stroke-width="4" stroke-dasharray="8 5"/>
      <text x="${xFor(fixedStart).toFixed(2)}" y="212" text-anchor="middle" class="svg-small">NOTCH START</text>
      ${step.feature === "cornerSquare" ? `<path d="M690 226 H${cornerSquare ? 826 : 818} V${cornerTop}" fill="none" stroke="#c5cdd0" stroke-width="22"/><line x1="826" y1="84" x2="826" y2="226" stroke="${cornerSquare ? "#45e07f" : "#ff8b67"}" stroke-width="4"${cornerSquare ? "" : ' stroke-dasharray="8 5"'}/><text x="684" y="60" class="tool-note">${cornerSquare ? "NO GAP" : "VISIBLE GAP"}</text>` : ""}
      ${positionLine}${correctionLine}
      <text x="480" y="30" text-anchor="middle" class="tool-note">FINISHED BRACKET ${formatJobMeasurement(workpiece.finished.width, workpiece.unit)} WIDE · fixed references do not change</text>
    </svg>`;
  }

  function jobSpeedSvg(question, overlay) {
    const workpiece = question.job.workpiece;
    const step = question.job.step;
    const learner = overlay && Number.isFinite(Number(overlay.value)) ? Number(overlay.value) : null;
    const correction = overlay && Number.isFinite(Number(overlay.correctValue)) ? Number(overlay.correctValue) : null;
    const expected = Number(question.answer.value);
    const active = step.kind === "position" && learner != null ? learner : expected;
    const feature = workpiece.features[step.feature];
    const featureStart = step.feature === "squareEnd"
      ? { x: feature.offset, y: 0 }
      : feature.start;
    const featureEnd = step.feature === "squareEnd"
      ? { x: feature.offset, y: workpiece.finished.height }
      : feature.end;
    const featureLength = Math.hypot(featureEnd.x - featureStart.x, featureEnd.y - featureStart.y);
    const toLineAngle = (value) => step.quantity === "degreeSetting" ? 90 - value : value;
    const lineAngle = toLineAngle(active);
    const endpoint = (angle) => {
      const radians = angle * Math.PI / 180;
      return { x: featureStart.x + Math.cos(radians) * featureLength, y: featureStart.y + Math.sin(radians) * featureLength };
    };
    const activeEnd = endpoint(lineAngle);
    const correctLineAngle = correction != null ? toLineAngle(correction) : null;
    const correctEnd = correctLineAngle != null ? endpoint(correctLineAngle) : null;
    const plate = { x: 110, bottom: 265, width: 740, height: 190 };
    const xFor = (value) => plate.x + Number(value) / workpiece.finished.width * plate.width;
    const yFor = (value) => plate.bottom - Number(value) / workpiece.finished.height * plate.height;
    const x1 = xFor(featureStart.x), y1 = yFor(featureStart.y);
    const activeX2 = xFor(activeEnd.x), activeY2 = yFor(activeEnd.y);
    const correctX2 = correctEnd ? xFor(correctEnd.x) : null;
    const correctY2 = correctEnd ? yFor(correctEnd.y) : null;
    const pointLabel = step.feature === "pivotLine" ? "LEFT PIVOT" : step.feature === "fortyFiveCut" ? "45° START" : "SQUARE-END OFFSET";
    const readNote = step.kind === "read"
      ? "READ THE MARKED LINE FROM THE BOTTOM REFERENCE EDGE"
      : step.quantity === "degreeSetting"
        ? `CURRENT SQUARE SETTING ${formatJobMeasurement(active, "degrees")} · MARKED LINE ${formatJobMeasurement(lineAngle, "degrees")}`
        : `CURRENT MARKED LINE ${formatJobMeasurement(lineAngle, "degrees")} FROM REFERENCE`;
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Gusset plate layout with speed-square pivot and bottom reference edge" data-job-tool="speed" data-reference="${step.reference}" data-graded-value="${question.answer.value}" data-stock-width="${workpiece.stock.width}" data-finished-width="${workpiece.finished.width}" data-degree-setting="${step.quantity === "degreeSetting" ? active : 90 - lineAngle}" data-line-angle="${lineAngle}" data-feature-start-x="${featureStart.x}" data-feature-start-y="${featureStart.y}" data-feature-target-end-x="${featureEnd.x}" data-feature-target-end-y="${featureEnd.y}" data-active-end-x="${activeEnd.x}" data-active-end-y="${activeEnd.y}"${correction != null ? ` data-correct-value="${correction}"` : ""}>
      <rect x="82" y="48" width="796" height="230" rx="5" fill="#5d6670" stroke="#aeb8c0" stroke-width="3"/>
      <rect x="${plate.x}" y="${plate.bottom - plate.height}" width="${plate.width}" height="${plate.height}" rx="3" fill="#8f613d" stroke="#d59a63" stroke-width="3"/>
      <line x1="${plate.x}" y1="${plate.bottom}" x2="${plate.x + plate.width}" y2="${plate.bottom}" stroke="#70e1f5" stroke-width="6"/>
      <text x="540" y="302" class="svg-label">BOTTOM REFERENCE EDGE · ANGLES MEASURED HERE</text>
      <circle cx="${x1.toFixed(2)}" cy="${y1.toFixed(2)}" r="8" fill="#ffc857"/><text x="${(x1 - 12).toFixed(2)}" y="296" text-anchor="end" class="svg-label">${pointLabel}</text>
      <path d="M${x1.toFixed(2)} ${y1.toFixed(2)} L${(x1 + 170).toFixed(2)} ${y1.toFixed(2)} L${x1.toFixed(2)} ${(y1 - 145).toFixed(2)} Z" fill="rgba(214,224,220,.22)" stroke="#d7e0dc" stroke-width="4"/>
      <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${activeX2.toFixed(2)}" y2="${activeY2.toFixed(2)}" class="${step.kind === "position" ? "answer-mark" : "target-mark"}" data-mark-kind="${step.kind === "position" ? "learner" : "fixed"}"/>
      ${correctEnd && Math.abs(correction - active) > 1e-9 ? `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${correctX2.toFixed(2)}" y2="${correctY2.toFixed(2)}" class="correct-mark" data-mark-kind="correct"/>` : ""}
      <text x="480" y="30" text-anchor="middle" class="tool-note">${readNote}</text>
      <text x="520" y="103" class="tool-note">SETTING + MARKED-LINE ANGLE = 90°</text>
    </svg>`;
  }

  function renderJobInstrument(question, overlay) {
    if (question.tool === "tape") return jobTapeSvg(question, overlay);
    if (question.tool === "caliper") return jobCaliperSvg(question, overlay);
    if (question.tool === "framing") return jobFramingSvg(question, overlay);
    return jobSpeedSvg(question, overlay);
  }

  function renderInstrument(question, overlay) {
    if (!question) return '<p class="loading">Preparing the workpiece…</p>';
    if (question.job) return renderJobInstrument(question, overlay);
    if (question.tool === "tape") return tapeSvg(question, overlay);
    if (question.tool === "caliper") return caliperSvg(question, overlay);
    if (question.tool === "framing") return framingSvg(question, overlay);
    return speedSvg(question, !!(overlay && overlay.reveal), overlay && overlay.value);
  }

  function initialize(doc, host = root, supplied = {}) {
    const model = supplied.model || host.MeasureModel;
    const certificate = supplied.certificate || host.MeasureUpCertificate || host.CVSMeasureUpCertificate;
    if (!model) throw new Error("Measure Up model did not load.");
    const storage = resolveStorage(host, supplied.storage);
    const byId = (id) => doc.getElementById(id);
    let tool = "tape", unit = "inch", difficulty = "apprentice", mode = "practice";
    let practiceIndex = 0, practiceQuestion = null, practiceOverlay = null;
    let jobIndex = 0, jobOrder = null, jobQuestions = [];
    let challenge = null, challengeDeck = [], challengeSeed = 1, ticker = null, frozenRun = null;

    function toolMeta(id) {
      const candidate = model.TOOLS && (model.TOOLS[id] || (Array.isArray(model.TOOLS) && model.TOOLS.find((item) => item.id === id)));
      return { ...TOOL_FALLBACK[id], ...(candidate || {}) };
    }
    function setText(id, value) { const target = byId(id); if (target) target.textContent = String(value); }
    function setHidden(id, hidden) { const target = byId(id); if (target) target.hidden = hidden; }

    function currentOptions() { return { tool, unit, difficulty }; }
    function formatExpected(question) { return model.formatExpected ? model.formatExpected(question) : String(question.answer && question.answer.value); }
    function evaluate(question, raw) { return model.evaluateAnswer(question, raw); }

    function makePractice(index = practiceIndex) {
      practiceIndex = index;
      practiceQuestion = model.createPracticeQuestion({ ...currentOptions(), index });
      practiceOverlay = null;
      setText("practice-title", practiceQuestion.title || "Read the setup");
      setText("practice-prompt", practiceQuestion.interaction === "position" ? `Position the instrument at ${formatExpected(practiceQuestion)}.` : practiceQuestion.prompt);
      byId("practice-stage").innerHTML = renderInstrument(practiceQuestion);
      buildAnswerControl(byId("practice-answer"), practiceQuestion, "practice");
      const feedback = byId("practice-feedback");
      feedback.textContent = "Enter a reading or position, then check your work.";
      feedback.dataset.state = "";
    }

    function createTextInput(container, question, prefix) {
      const wrapper = doc.createElement("div");
      wrapper.className = "answer-field";
      const label = doc.createElement("label");
      label.htmlFor = `${prefix}-value`;
      label.textContent = question.interaction === "position" ? "Set the requested position" : "Your answer";
      const input = doc.createElement("input");
      input.id = `${prefix}-value`;
      input.name = "answer";
      input.type = "text";
      input.inputMode = question.answer && question.answer.type === "ratio" ? "text" : "decimal";
      input.autocomplete = "off";
      input.placeholder = question.answer && question.answer.type === "ratio" ? "rise/run, for example 4/12" : question.tool === "tape" && question.unit === "inch-fraction" ? "for example 2 3/8" : "Enter a value";
      input.required = true;
      label.append(input);
      wrapper.append(label);
      const unitNode = doc.createElement("span");
      unitNode.className = "answer-unit";
      unitNode.textContent = measurementLabel(question);
      wrapper.append(unitNode);
      container.append(wrapper);
      if (question.tool === "tape" && question.unit === "inch-fraction") {
        const pad = doc.createElement("div");
        pad.className = "fraction-pad";
        pad.setAttribute("aria-label", "Common fraction entry buttons");
        ["1/16", "1/8", "3/16", "1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "3/4", "7/8"].forEach((fraction) => {
          const button = doc.createElement("button");
          button.type = "button";
          button.textContent = fraction;
          button.addEventListener("click", () => {
            const whole = input.value.trim().match(/^\d+$/) ? `${input.value.trim()} ` : "";
            input.value = whole + fraction;
            input.focus();
          });
          pad.append(button);
        });
        container.append(pad);
      }
    }

    function buildAnswerControl(container, question, prefix) {
      container.replaceChildren();
      const spec = question.answer || {};
      if (spec.type === "choice" && Array.isArray(spec.choices || question.choices || spec.accepted)) {
        const choices = spec.choices || question.choices || spec.accepted;
        const fieldset = doc.createElement("fieldset");
        fieldset.className = "answer-field";
        const legend = doc.createElement("legend"); legend.textContent = "Choose an answer"; fieldset.append(legend);
        choices.forEach((choice, index) => {
          const value = typeof choice === "object" ? choice.value : choice;
          const labelText = typeof choice === "object" ? choice.label : choice;
          const label = doc.createElement("label");
          const input = doc.createElement("input"); input.type = "radio"; input.name = "answer"; input.value = value; input.required = true; if (index === 0) input.checked = true;
          label.append(input, doc.createTextNode(` ${labelText}`)); fieldset.append(label);
        });
        container.append(fieldset);
      } else if (question.interaction === "position" && question.range) {
        const wrapper = doc.createElement("label"); wrapper.className = "position-control"; wrapper.textContent = "Move the mark to the requested position";
        const output = doc.createElement("output"); output.htmlFor = `${prefix}-value`;
        const input = doc.createElement("input"); input.type = "range"; input.name = "answer"; input.id = `${prefix}-value`;
        input.min = question.range.min; input.max = question.range.max; input.step = question.range.step;
        input.value = question.range.start != null ? question.range.start : initialPositionValue(question);
        const update = () => { output.value = formatPositionValue(question, input.value); output.textContent = output.value; byId(`${prefix}-stage`).innerHTML = renderInstrument(question, { value: Number(input.value) }); };
        input.addEventListener("input", update); wrapper.append(input, output); container.append(wrapper); update();
      } else createTextInput(container, question, prefix);
    }

    function readAnswer(form) {
      const data = new host.FormData(form);
      return data.get("answer");
    }

    function showPracticeVerdict(raw) {
      const verdict = normalizeVerdict(evaluate(practiceQuestion, raw), model, practiceQuestion);
      const feedback = byId("practice-feedback");
      if (verdict.correct) {
        feedback.dataset.state = "correct";
        feedback.innerHTML = `<strong>Correct.</strong> ${escapeHtml(verdict.message || "The reading and instrument model agree.")}`;
        practiceOverlay = { value: Number(raw), correct: true, reveal: true };
      } else {
        feedback.dataset.state = "incorrect";
        const hints = byId("hints-enabled").checked;
        feedback.innerHTML = `<strong>Not yet.</strong> ${hints ? `${escapeHtml(practiceQuestion.hint || "Compare the smallest divisions and the reference edge.")} Correct answer: <strong>${escapeHtml(verdict.expected)}</strong>.` : "Try again, or turn hints on for a visual explanation."}`;
        practiceOverlay = hints ? { value: questionValue(practiceQuestion), reveal: true } : { value: Number(raw) };
      }
      byId("practice-stage").innerHTML = renderInstrument(practiceQuestion, practiceOverlay);
    }

    function renderUnits() {
      const select = byId("unit-select");
      const options = unitOptions(model, tool);
      if (!options.some((entry) => entry.id === unit)) unit = options[0] ? options[0].id : "inch";
      select.replaceChildren(...options.map((entry) => {
        const option = doc.createElement("option"); option.value = entry.id; option.textContent = entry.label; option.selected = entry.id === unit; return option;
      }));
      select.disabled = options.length < 2;
    }

    function selectMode(next) {
      mode = next;
      for (const name of ["practice", "challenge", "job"]) {
        const button = byId(`tab-${name}`), panel = byId(`panel-${name}`), selected = name === next;
        button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1; panel.hidden = !selected;
      }
      if (next === "practice") makePractice(practiceIndex + 1);
      if (next === "challenge") renderChallengeReady();
      if (next === "job") resetJob();
    }

    function selectTool(button, moveFocus = false) {
      if (!button) return;
      tool = button.dataset.tool;
      for (const item of doc.querySelectorAll("[data-tool]")) {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-checked", String(selected));
        item.tabIndex = selected ? 0 : -1;
      }
      if (moveFocus) button.focus();
      renderUnits();
      onConfigurationChange();
    }

    function recordForCurrent() {
      return readRecords(storage).records[recordKey(tool, unit, difficulty, DURATION_SECONDS)] || null;
    }
    function renderChallengeReady() {
      stopTicker(); challenge = null; frozenRun = null;
      setHidden("challenge-ready", false); setHidden("challenge-running", true); setHidden("challenge-results", true);
      const record = recordForCurrent();
      setText("record-summary", record ? `Current-browser record: ${record.correct} correct · ${record.accuracy}% accuracy · streak ${record.bestStreak}` : "No record saved for this tool, units, difficulty, and duration yet.");
    }
    function startChallenge(seed) {
      challengeSeed = seed === undefined
        ? nextChallengeSeed(challengeSeed, (supplied.seedNow || Date.now)())
        : seed;
      challengeDeck = model.createQuestionDeck({ ...currentOptions(), count: 120, seed: challengeSeed });
      challenge = new ChallengeRuntime({
        questions: challengeDeck,
        evaluate,
        formatExpected: (q) => formatExpected(q),
        now: supplied.now || Date.now,
        durationMs: 60000,
        metadata: {
          ...currentOptions(),
          toolLabel: toolMeta(tool).label,
          unitLabel: unitOptions(model, tool).find((item) => item.id === unit)?.label || unit,
          difficultyLabel: difficulty[0].toUpperCase() + difficulty.slice(1),
        },
      });
      challenge.start();
      setHidden("challenge-ready", true); setHidden("challenge-running", false); setHidden("challenge-results", true);
      setText("challenge-feedback", "");
      renderChallengeQuestion(); updateChallengeStatus();
      ticker = (supplied.setInterval || host.setInterval)(tickChallenge, 100);
    }
    function stopTicker() { if (ticker != null) { (supplied.clearInterval || host.clearInterval)(ticker); ticker = null; } }
    function tickChallenge() {
      if (!challenge) return;
      const state = challenge.getState(); updateChallengeStatus(state);
      if (state.status === "finished") finishChallenge();
    }
    function updateChallengeStatus(state = challenge.getState()) {
      setText("challenge-time", formatClock(state.remainingMs));
      setText("challenge-correct", state.correct); setText("challenge-attempted", state.attempted); setText("challenge-streak", state.currentStreak);
      setText("challenge-number", state.index + 1);
      byId("timer-fill").style.width = `${Math.max(0, Math.min(100, state.remainingMs / 600))}%`;
    }
    function renderChallengeQuestion() {
      const question = challenge.currentQuestion(); if (!question) return;
      setText("challenge-title", question.title || "Read the setup"); setText("challenge-prompt", question.prompt);
      byId("challenge-stage").innerHTML = renderInstrument(question);
      const answerContainer = byId("challenge-answer");
      buildAnswerControl(answerContainer, question, "challenge");
      focusFirstAnswer(answerContainer);
    }
    function submitChallenge(raw) {
      const response = challenge.submit(raw);
      if (!response.accepted) { finishChallenge(); return; }
      setText("challenge-feedback", response.correct ? "Correct · next setup" : `Missed · ${response.expected}`);
      updateChallengeStatus(response.state);
      renderChallengeQuestion();
    }
    function finishChallenge() {
      if (!challenge) return;
      stopTicker();
      frozenRun = challenge.finish({ ...currentOptions(), toolLabel: toolMeta(tool).label, unitLabel: unitOptions(model, tool).find((item) => item.id === unit)?.label || unit, difficultyLabel: difficulty[0].toUpperCase() + difficulty.slice(1), completedAt: new Date().toISOString() });
      const saved = saveRecord(storage, frozenRun);
      setHidden("challenge-running", true); setHidden("challenge-results", false);
      setText("result-correct", frozenRun.correct); setText("result-attempted", frozenRun.attempted); setText("result-accuracy", `${frozenRun.accuracy}%`); setText("result-streak", frozenRun.bestStreak);
      setText("missed-count", frozenRun.missedReview.length);
      const list = byId("missed-list"); list.replaceChildren(...frozenRun.missedReview.map((miss) => { const li = doc.createElement("li"); li.textContent = `${miss.prompt} — answered “${miss.given || "blank"}”; expected ${miss.expected}.`; return li; }));
      const banner = byId("achievement-banner"); banner.hidden = !frozenRun.perfect; banner.textContent = frozenRun.perfect ? "★ PERFECT RUN · Every attempted setup was correct" : "";
      setText("personal-best-message", saved.storageFailed
        ? "Run complete. This browser blocked local record storage, so the personal best was not saved."
        : saved.improved
          ? `New current-browser personal best for ${frozenRun.toolLabel} · ${frozenRun.unitLabel} · ${frozenRun.difficultyLabel}.`
          : `Personal best remains ${saved.record.correct} correct with ${saved.record.accuracy}% accuracy.`);
      setText("certificate-status", "Enter a name, then download a PDF or open the print view.");
      byId("challenge-results").focus();
    }

    function resetJob() {
      jobIndex = 0;
      jobOrder = buildJobOrder(tool, unit, difficulty);
      jobQuestions = jobOrder.questions;
      setText("job-title", jobOrder.title); setText("job-description", jobOrder.description); setText("job-complete-message", jobOrder.complete);
      const list = byId("job-step-list"); list.replaceChildren(...jobOrder.steps.map((label, index) => { const li = doc.createElement("li"); li.textContent = label; li.className = index === 0 ? "is-current" : ""; return li; }));
      setHidden("job-active", false); setHidden("job-complete", true); renderJobStep();
    }
    function renderJobStep() {
      const q = jobQuestions[jobIndex]; setText("job-progress", `Step ${jobIndex + 1} of ${jobQuestions.length}`); setText("job-prompt", q.prompt);
      byId("job-stage").innerHTML = renderInstrument(q); buildAnswerControl(byId("job-answer"), q, "job");
      const submit = byId("job-form").querySelector('button[type="submit"]');
      if (submit) submit.textContent = jobActionLabel(q);
      const feedback = byId("job-feedback"); feedback.textContent = "Complete this inspection before moving to the next operation."; feedback.dataset.state = "";
    }
    function submitJob(raw) {
      const q = jobQuestions[jobIndex]; const verdict = normalizeVerdict(evaluate(q, raw), model, q); const feedback = byId("job-feedback");
      if (!verdict.correct) {
        feedback.dataset.state = "incorrect";
        feedback.innerHTML = `<strong>${q.interaction === "position" ? "Position did not match." : "Answer did not match."}</strong> ${escapeHtml(q.hint || "Recheck the reference marks.")} Expected ${escapeHtml(verdict.expected)}.`;
        const learnerValue = Number(raw);
        byId("job-stage").innerHTML = renderInstrument(q, {
          reveal: true,
          value: q.interaction === "position" && Number.isFinite(learnerValue) ? learnerValue : undefined,
          correctValue: questionValue(q),
        });
        return;
      }
      feedback.dataset.state = "correct"; feedback.innerHTML = "<strong>Inspection passed.</strong> Advancing to the next shop operation.";
      const steps = [...byId("job-step-list").children]; steps[jobIndex].className = "is-complete"; jobIndex += 1;
      if (jobIndex >= jobQuestions.length) { setHidden("job-active", true); setHidden("job-complete", false); setText("job-progress", "Complete"); return; }
      steps[jobIndex].className = "is-current"; renderJobStep();
    }

    function onConfigurationChange() {
      setText("tool-summary", toolMeta(tool).summary || TOOL_FALLBACK[tool].summary);
      makePractice(practiceIndex + 1);
      if (mode === "challenge") renderChallengeReady();
      if (mode === "job") resetJob();
    }

    const toolButtons = [...doc.querySelectorAll("[data-tool]")];
    for (const button of toolButtons) {
      button.tabIndex = button.dataset.tool === tool ? 0 : -1;
      button.addEventListener("click", () => selectTool(button));
      button.addEventListener("keydown", (event) => {
        const current = toolButtons.indexOf(button);
        const next = keyboardIndex(event.key, current, toolButtons.length);
        if (next === current && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        selectTool(toolButtons[next], true);
      });
    }
    const modeButtons = [...doc.querySelectorAll("[data-mode]")];
    for (const button of modeButtons) {
      button.addEventListener("click", () => selectMode(button.dataset.mode));
      button.addEventListener("keydown", (event) => {
        const current = modeButtons.indexOf(button);
        const next = keyboardIndex(event.key, current, modeButtons.length);
        if (next === current && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        selectMode(modeButtons[next].dataset.mode);
        modeButtons[next].focus();
      });
    }
    byId("unit-select").addEventListener("change", (event) => { unit = event.target.value; onConfigurationChange(); });
    byId("difficulty-select").addEventListener("change", (event) => { difficulty = event.target.value; onConfigurationChange(); });
    byId("practice-form").addEventListener("submit", (event) => { event.preventDefault(); showPracticeVerdict(readAnswer(event.currentTarget)); });
    byId("practice-hint").addEventListener("click", () => { byId("hints-enabled").checked = true; const feedback = byId("practice-feedback"); feedback.dataset.state = "incorrect"; feedback.innerHTML = `<strong>Hint:</strong> ${escapeHtml(practiceQuestion.hint || "Start from the highlighted reference edge and count the smallest divisions.")} Expected ${escapeHtml(formatExpected(practiceQuestion))}.`; byId("practice-stage").innerHTML = renderInstrument(practiceQuestion, { reveal: true, value: questionValue(practiceQuestion) }); });
    byId("practice-new").addEventListener("click", () => makePractice(practiceIndex + 1));
    byId("challenge-start").addEventListener("click", () => startChallenge());
    byId("challenge-form").addEventListener("submit", (event) => { event.preventDefault(); submitChallenge(readAnswer(event.currentTarget)); });
    byId("challenge-replay").addEventListener("click", () => startChallenge());
    byId("challenge-done").addEventListener("click", renderChallengeReady);
    byId("job-form").addEventListener("submit", (event) => { event.preventDefault(); submitJob(readAnswer(event.currentTarget)); });
    byId("job-reset").addEventListener("click", resetJob);
    byId("certificate-download").addEventListener("click", async () => {
      if (!frozenRun || !certificate) return setText("certificate-status", "Certificate generator is unavailable.");
      try { await certificate.downloadPdf(certificate.createSnapshot(frozenRun, byId("student-name").value)); setText("certificate-status", "PDF certificate downloaded."); }
      catch (error) { setText("certificate-status", `Could not create the PDF: ${error.message}`); }
    });
    byId("certificate-print").addEventListener("click", () => {
      if (!frozenRun || !certificate) return setText("certificate-status", "Certificate generator is unavailable.");
      try { certificate.printCertificate(certificate.createSnapshot(frozenRun, byId("student-name").value), host); setText("certificate-status", "Print view opened."); }
      catch (error) { setText("certificate-status", `Could not open the print view: ${error.message}`); }
    });

    renderUnits(); onConfigurationChange(); selectMode("practice");
    return { getState: () => ({ tool, unit, difficulty, mode, frozenRun, challengeSeed }), startChallenge, finishChallenge, resetJob };
  }

  if (root.document) root.document.addEventListener("DOMContentLoaded", () => {
    try { initialize(root.document, root); }
    catch (error) { const target = root.document.querySelector("main"); if (target) target.insertAdjacentHTML("afterbegin", `<p class="feedback" data-state="incorrect">Measure Up could not start: ${escapeHtml(error.message)}</p>`); }
  });

  return { STORAGE_KEY, DURATION_SECONDS, JOBS, JOB_PROFILES, escapeHtml, deepFreeze, recordKey, readRecords, resolveStorage, isBetterRecord, saveRecord, formatClock, nextChallengeSeed, keyboardIndex, focusFirstAnswer, questionValue, initialPositionValue, formatJobMeasurement, formatPositionValue, jobActionLabel, normalizeVerdict, ChallengeRuntime, unitOptions, buildJobOrder, renderInstrument, initialize };
});
