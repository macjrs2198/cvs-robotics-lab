"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const app = require("../app.js");
const model = require("../measure-model.js");
const certificate = require("../certificate.js");

const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

function memoryStorage(initial = {}) {
  const state = new Map(Object.entries(initial));
  return {
    getItem: (key) => state.has(key) ? state.get(key) : null,
    setItem: (key, value) => state.set(key, String(value)),
    state,
  };
}

function numericAttribute(markup, name) {
  const match = markup.match(new RegExp(`${name}="([^"]+)"`));
  assert.ok(match, `expected ${name} in rendered markup`);
  return Number(match[1]);
}

function visibleSvgText(markup) {
  return [...markup.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join(" ");
}

test("personal-best keys isolate tool, units, difficulty, and duration", () => {
  const keys = new Set([
    app.recordKey("tape", "inch-fraction", "apprentice", 60),
    app.recordKey("tape", "millimeter", "apprentice", 60),
    app.recordKey("tape", "inch-fraction", "journey", 60),
    app.recordKey("caliper", "inch-decimal", "apprentice", 60),
    app.recordKey("tape", "inch-fraction", "apprentice", 90),
  ]);
  assert.equal(keys.size, 5);
});

test("personal best prefers correct, then accuracy, then streak", () => {
  const storage = memoryStorage();
  const base = { tool: "tape", unit: "inch-fraction", difficulty: "apprentice", durationSeconds: 60, completedAt: "2026-10-26T12:00:00Z" };
  assert.equal(app.saveRecord(storage, { ...base, correct: 8, attempted: 10, accuracy: 80, bestStreak: 4 }).improved, true);
  assert.equal(app.saveRecord(storage, { ...base, correct: 7, attempted: 7, accuracy: 100, bestStreak: 7 }).improved, false, "fewer correct cannot replace the record");
  assert.equal(app.saveRecord(storage, { ...base, correct: 8, attempted: 9, accuracy: 88.9, bestStreak: 3 }).improved, true, "accuracy breaks a correct-answer tie");
  assert.equal(app.saveRecord(storage, { ...base, correct: 8, attempted: 9, accuracy: 88.9, bestStreak: 5 }).improved, true, "streak breaks a remaining tie");
  assert.equal(app.readRecords(storage).records[app.recordKey("tape", "inch-fraction", "apprentice", 60)].bestStreak, 5);
});

test("blocked local storage never claims that a new record was saved", () => {
  const blocked = {
    getItem: () => null,
    setItem: () => { throw new Error("storage blocked"); },
  };
  const saved = app.saveRecord(blocked, {
    tool: "tape", unit: "inch-fraction", difficulty: "apprentice", durationSeconds: 60,
    correct: 4, attempted: 5, accuracy: 80, bestStreak: 3, completedAt: "2026-10-26T12:00:00Z",
  });
  assert.equal(saved.persisted, false);
  assert.equal(saved.storageFailed, true);
  assert.equal(saved.improved, false);
});

test("privacy-blocked localStorage access falls back without stopping the app", () => {
  const host = {};
  Object.defineProperty(host, "localStorage", {
    get() { throw new Error("SecurityError"); },
  });
  const storage = app.resolveStorage(host);
  assert.deepEqual(app.readRecords(storage), { version: 1, records: {} });
  const result = app.saveRecord(storage, {
    tool: "caliper", unit: "inch-decimal", difficulty: "master", durationSeconds: 60,
    correct: 1, attempted: 1, accuracy: 100, bestStreak: 1,
  });
  assert.equal(result.storageFailed, true);
  assert.equal(result.persisted, false);
});

test("timer display uses a conventional minute boundary", () => {
  assert.equal(app.formatClock(60_000), "1:00");
  assert.equal(app.formatClock(59_999), "1:00");
  assert.equal(app.formatClock(59_000), "0:59");
  assert.equal(app.formatClock(1), "0:01");
  assert.equal(app.formatClock(0), "0:00");
});

test("ordinary Play Again seeds are fresh while explicit seeds remain reproducible", () => {
  assert.equal(app.nextChallengeSeed(100, 101), 101);
  assert.equal(app.nextChallengeSeed(100, 100), 101, "same-tick replay advances instead of repeating the deck");
  assert.equal(app.nextChallengeSeed(101, 100), 102, "a constant clock cannot cycle back to an older deck seed");

  const source = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");
  const page = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
  assert.doesNotMatch(source, /startChallenge\(challengeSeed\)/);
  assert.match(source, /challenge-replay"\)\.addEventListener\("click", \(\) => startChallenge\(\)\)/);
  assert.match(page, /id="challenge-replay"[^>]*>Play Again<\/button>/);
});

test("roving keyboard navigation wraps and supports Home and End", () => {
  assert.equal(app.keyboardIndex("ArrowRight", 3, 4), 0);
  assert.equal(app.keyboardIndex("ArrowDown", 1, 4), 2);
  assert.equal(app.keyboardIndex("ArrowLeft", 0, 4), 3);
  assert.equal(app.keyboardIndex("ArrowUp", 2, 4), 1);
  assert.equal(app.keyboardIndex("Home", 2, 4), 0);
  assert.equal(app.keyboardIndex("End", 1, 4), 3);
  assert.equal(app.keyboardIndex("Enter", 2, 4), 2);
});

test("challenge answer replacement moves focus to the new control", () => {
  let focused = false;
  const control = { focus() { focused = true; } };
  const container = { querySelector() { return control; } };
  assert.equal(app.focusFirstAnswer(container), true);
  assert.equal(focused, true);
  assert.equal(app.focusFirstAnswer(null), false);
});

test("positioning activities start at a nearby but incorrect readable value", () => {
  const question = model.createPracticeQuestion({
    tool: "tape", unit: "inch-fraction", difficulty: "master", index: 3, interaction: "position",
  });
  const start = app.initialPositionValue(question);
  assert.notEqual(start, question.answer.value);
  assert.ok(start >= question.range.min && start <= question.range.max);
  assert.ok(Math.abs(start - question.answer.value) <= 6, "start stays within the six-inch displayed tape section");
});

test("ChallengeRuntime scores one first submission and expires exactly at 60 seconds", () => {
  let now = 1_000;
  const questions = model.createQuestionDeck({ tool: "tape", unit: "inch-fraction", difficulty: "apprentice", count: 4, seed: 42 });
  const runtime = new app.ChallengeRuntime({
    questions,
    evaluate: model.evaluateAnswer,
    formatExpected: model.formatExpected,
    now: () => now,
    durationMs: 60_000,
    metadata: { tool: "tape", unit: "inch-fraction", difficulty: "apprentice" },
  });
  runtime.start();
  const first = questions[0];
  assert.equal(runtime.submit(model.formatExpected(first)).correct, true);
  assert.equal(runtime.submit("wrong").correct, false);
  assert.equal(runtime.getState().attempted, 2);
  assert.equal(runtime.getState().correct, 1);
  assert.equal(runtime.getState().bestStreak, 1);
  now = 60_999;
  assert.equal(runtime.getState().status, "running");
  now = 61_000;
  assert.equal(runtime.getState().status, "finished");
  assert.equal(runtime.submit("0").accepted, false, "answers after the deadline are not counted");
  const result = runtime.finish({ tool: "tape", unit: "inch-fraction", difficulty: "apprentice" });
  assert.equal(result.durationSeconds, 60);
  assert.equal(result.attempted, 2);
  assert.equal(result.accuracy, 50);
  assert.equal(result.tool, "tape", "natural timer expiration retains the fixed run setup");
  assert.equal(result.missedReview.length, 1);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.missedReview));
});

test("feedback prefers the model's formatted expected answer", () => {
  const question = model.createQuestionDeck({
    tool: "speed", unit: "angles", difficulty: "apprentice", count: 1, seed: 9,
  })[0];
  const verdict = model.evaluateAnswer(question, "not an answer");
  const normalized = app.normalizeVerdict(verdict, model, question);
  assert.equal(normalized.expected, verdict.expectedText);
  assert.equal(normalized.expected, model.formatExpected(question));
  assert.doesNotMatch(normalized.expected, /\d+\.\d{3,}/, "feedback should not expose raw floating-point values");
});

test("certificate accuracy and metrics match a frozen results screen", () => {
  const run = app.deepFreeze({
    tool: "speed", unit: "angles", difficulty: "journey", durationSeconds: 60,
    correct: 2, attempted: 3, accuracy: 66.7, bestStreak: 2, completedAt: "2026-10-26T16:00:00Z",
  });
  const snapshot = certificate.createSnapshot(run, "Alex Student");
  assert.equal(snapshot.correct, 2);
  assert.equal(snapshot.attempted, 3);
  assert.equal(snapshot.accuracyLabel, "66.7%");
  assert.equal(snapshot.bestStreak, 2);
  assert.equal(snapshot.durationLabel, "60 seconds");
  assert.equal(snapshot.studentName, "Alex Student");
});

test("all four job orders contain three believable steps", () => {
  assert.deepEqual(Object.keys(app.JOBS).sort(), ["caliper", "framing", "speed", "tape"]);
  for (const job of Object.values(app.JOBS)) {
    assert.equal(job.steps.length, 3);
    assert.ok(job.title.length > 5);
    assert.ok(job.description.length > 20);
    assert.ok(job.complete.length > 20);
  }
});

test("all 15 supported job configurations use one immutable coherent workpiece", () => {
  const configurations = [];
  for (const difficulty of ["apprentice", "journey", "master"]) {
    configurations.push(
      ["tape", "inch-fraction", difficulty],
      ["tape", "millimeter", difficulty],
      ["caliper", "inch-decimal", difficulty],
      ["framing", "layout", difficulty],
      ["speed", "angles", difficulty],
    );
  }
  assert.equal(configurations.length, 15);
  for (const [tool, unit, difficulty] of configurations) {
    const order = app.buildJobOrder(tool, unit, difficulty);
    assert.equal(order.questions.length, 3, `${tool}/${unit}/${difficulty}`);
    assert.ok(Object.isFrozen(order));
    assert.ok(Object.isFrozen(order.workpiece));
    assert.ok(order.questions.every((question) => question.job.workpiece === order.workpiece), "every step shares the exact workpiece model");
    assert.ok(order.questions.every((question, index) => question.title === order.steps[index]));
    assert.ok(order.workpiece.stock && order.workpiece.finished && order.workpiece.referenceEdges && order.workpiece.features);

    const workpiece = order.workpiece;
    if (tool === "tape") {
      assert.ok(workpiece.features.fastenerCenter > 0);
      assert.ok(workpiece.features.fastenerCenter < workpiece.finished.length);
      assert.ok(workpiece.features.cutMark <= workpiece.finished.length);
      assert.ok(workpiece.finished.length <= workpiece.stock.length);
    } else if (tool === "caliper") {
      assert.ok(workpiece.finished.length <= workpiece.stock.length);
      assert.ok(workpiece.finished.diameter <= workpiece.stock.diameter);
      assert.ok(workpiece.features.shoulderDiameter < workpiece.features.shaftDiameter);
      for (const value of Object.values(workpiece.features)) assert.ok(value > 0 && value <= 6);
    } else if (tool === "framing") {
      assert.ok(workpiece.finished.width <= workpiece.stock.width);
      assert.ok(workpiece.finished.height <= workpiece.stock.height);
      assert.ok(workpiece.features.squareLine > 0 && workpiece.features.squareLine < workpiece.finished.width);
      assert.ok(workpiece.features.notchStart < workpiece.features.notchEnd);
      assert.ok(workpiece.features.notchEnd <= workpiece.finished.width);
      assert.ok(workpiece.features.notchDepth > 0 && workpiece.features.notchDepth < workpiece.finished.height);
    } else {
      assert.ok(workpiece.finished.width <= workpiece.stock.width);
      assert.ok(workpiece.finished.height <= workpiece.stock.height);
      for (const feature of [workpiece.features.fortyFiveCut, workpiece.features.pivotLine]) {
        for (const point of [feature.start, feature.end]) {
          assert.ok(point.x >= 0 && point.x <= workpiece.finished.width);
          assert.ok(point.y >= 0 && point.y <= workpiece.finished.height);
        }
      }
      assert.equal(workpiece.features.pivotLine.degreeSetting + workpiece.features.pivotLine.lineAngle, 90);
    }
  }
});

test("job instructions, controls, geometry, and grading share the same target and reference", () => {
  const configurations = [];
  for (const difficulty of ["apprentice", "journey", "master"]) {
    configurations.push(
      ["tape", "inch-fraction", difficulty],
      ["tape", "millimeter", difficulty],
      ["caliper", "inch-decimal", difficulty],
      ["framing", "layout", difficulty],
      ["speed", "angles", difficulty],
    );
  }
  for (const configuration of configurations) {
    const order = app.buildJobOrder(...configuration);
    for (const question of order.questions) {
      const expected = model.formatExpected(question);
      assert.equal(model.evaluateAnswer(question, expected).correct, true, `${question.id} rejects its displayed expected answer`);
      if (question.answer.type === "choice") {
        const wrong = question.answer.choices.find((choice) => choice !== question.answer.value);
        assert.equal(model.evaluateAnswer(question, wrong).correct, false, `${question.id} accepts the opposite classification`);
      }
      const svg = app.renderInstrument(question);
      assert.match(svg, new RegExp(`data-job-tool="${question.tool}"`));
      assert.match(svg, new RegExp(`data-graded-value="${String(question.answer.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
      assert.match(svg.toLowerCase(), new RegExp(`data-reference="${question.job.step.reference.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
      if (question.interaction === "position") {
        assert.match(question.prompt, new RegExp(app.formatPositionValue(question, question.answer.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.ok(question.prompt.toLowerCase().includes(question.job.step.reference.toLowerCase()));
        assert.equal(app.jobActionLabel(question), "Check position");
      } else {
        assert.equal(app.jobActionLabel(question), "Check answer");
      }
    }
  }
});

test("positioning jobs keep fraction output and show learner and correction marks together", () => {
  assert.equal(app.formatPositionValue({ answer: { unit: "inch-fraction" } }, 5.125), "5 1/8 in");
  const orders = [
    app.buildJobOrder("tape", "inch-fraction", "apprentice"),
    app.buildJobOrder("framing", "layout", "master"),
    app.buildJobOrder("speed", "angles", "journey"),
  ];
  for (const order of orders) {
    for (const question of order.questions.filter((entry) => entry.interaction === "position")) {
      const learner = app.initialPositionValue(question);
      assert.notEqual(learner, question.answer.value);
      const svg = app.renderInstrument(question, { value: learner, correctValue: question.answer.value, reveal: true });
      assert.match(svg, /data-mark-kind="learner"/);
      assert.match(svg, /class="answer-mark"/);
      assert.match(svg, /data-mark-kind="correct"/);
      assert.match(svg, /class="correct-mark"/);
      assert.equal(numericAttribute(svg, "data-correct-value"), question.answer.value);
    }
  }
});

test("job drawings expose the required workpiece features without duplicate ruler gradient ids", () => {
  const tapeOrder = app.buildJobOrder("tape", "inch-fraction", "apprentice");
  const tapeSvg = app.renderInstrument(tapeOrder.questions[1], { value: 1.25 });
  assert.match(tapeSvg, /LEFT REFERENCE END/);
  assert.match(tapeSvg, /FASTENER CENTER/);
  assert.match(tapeSvg, /FINAL CUT MARK/);
  assert.doesNotMatch(tapeSvg, /id="blade"|url\(#blade\)/);

  const standardTape = model.createQuestionDeck({ tool: "tape", unit: "inch-fraction", difficulty: "apprentice", count: 1 })[0];
  const before = app.renderInstrument(standardTape);
  const after = app.renderInstrument(standardTape);
  assert.match(before, /smallest mark = 1\/16 in/);
  assert.match(after, /smallest mark = 1\/16 in/);
  assert.doesNotMatch(before + after, /id="blade"|url\(#blade\)/);

  assert.match(app.renderInstrument(app.buildJobOrder("caliper", "inch-decimal", "apprentice").questions[1]), /SPACER THICKNESS/);
  assert.match(app.renderInstrument(app.buildJobOrder("framing", "layout", "journey").questions[2]), /NOTCH START/);
  assert.match(app.renderInstrument(app.buildJobOrder("speed", "angles", "master").questions[2]), /LEFT PIVOT/);
});

test("wrong caliper feedback retains the prepared reading instead of redrawing the target", () => {
  const question = app.buildJobOrder("caliper", "inch-decimal", "apprentice").questions[0];
  const svg = app.renderInstrument(question, { value: 0.7, correctValue: question.answer.value, reveal: true });
  assert.equal(numericAttribute(svg, "data-reading"), question.setup.reading);
  assert.equal(numericAttribute(svg, "data-feature-value"), question.answer.value);
});

test("speed-square job drawings derive each marked line from the modeled feature coordinates", () => {
  for (const difficulty of ["apprentice", "journey", "master"]) {
    const order = app.buildJobOrder("speed", "angles", difficulty);
    for (const question of order.questions) {
      const feature = order.workpiece.features[question.job.step.feature];
      const start = question.job.step.feature === "squareEnd" ? { x: feature.offset, y: 0 } : feature.start;
      const end = question.job.step.feature === "squareEnd"
        ? { x: feature.offset, y: order.workpiece.finished.height }
        : feature.end;
      const svg = app.renderInstrument(question);
      assert.equal(numericAttribute(svg, "data-feature-start-x"), start.x);
      assert.equal(numericAttribute(svg, "data-feature-start-y"), start.y);
      assert.equal(numericAttribute(svg, "data-feature-target-end-x"), end.x);
      assert.equal(numericAttribute(svg, "data-feature-target-end-y"), end.y);
      assert.ok(Math.abs(numericAttribute(svg, "data-active-end-x") - end.x) < 1e-9);
      assert.ok(Math.abs(numericAttribute(svg, "data-active-end-y") - end.y) < 1e-9);
    }
  }
});

test("instrument renderers expose each tool's critical visual reference", () => {
  const cases = [
    ["tape", "inch-fraction", /smallest mark = 1\/16 in/],
    ["caliper", "inch-decimal", /0\.001 in\/div/],
    ["framing", "layout", /REFERENCE EDGE/],
    ["speed", "angles", /PIVOT/],
  ];
  for (const [tool, unit, pattern] of cases) {
    const question = model.createQuestionDeck({ tool, unit, difficulty: "apprentice", count: 1 })[0];
    const svg = app.renderInstrument(question);
    assert.match(svg, /^<svg/);
    assert.match(svg, pattern);
    assert.match(svg, /role="img"/);
  }
});

test("tape renderer keeps the largest prepared readings inside an absolute local scale", () => {
  const imperial = model.createQuestionDeck({ tool: "tape", unit: "inch-fraction", difficulty: "master", count: 20 })
    .find((question) => question.setup.sixteenths === 497);
  const metric = model.createQuestionDeck({ tool: "tape", unit: "millimeter", difficulty: "master", count: 20 })
    .find((question) => question.setup.millimeters === 1197);
  assert.ok(imperial && metric);
  const inchSvg = app.renderInstrument(imperial);
  const metricSvg = app.renderInstrument(metric);
  assert.ok(numericAttribute(inchSvg, "data-range-start") <= 497);
  assert.ok(numericAttribute(inchSvg, "data-range-end") >= 497);
  assert.equal(numericAttribute(inchSvg, "data-marker"), 497);
  assert.equal(numericAttribute(inchSvg, "data-range-end") - numericAttribute(inchSvg, "data-range-start"), 96);
  const positionedSvg = app.renderInstrument(imperial, { value: 16 });
  assert.ok(numericAttribute(positionedSvg, "data-range-start") <= 256);
  assert.ok(numericAttribute(positionedSvg, "data-range-end") >= 256, "positioning scale follows the student's mark");
  assert.ok(numericAttribute(metricSvg, "data-range-start") <= 1197);
  assert.ok(numericAttribute(metricSvg, "data-range-end") >= 1197);
  assert.equal(numericAttribute(metricSvg, "data-marker"), 1197);
  assert.match(metricSvg, />1190<\/text>/, "metric labels use absolute millimeters");
});

test("caliper renderer exposes the full beam and every thousandth dial division", () => {
  const deck = model.createQuestionDeck({ tool: "caliper", unit: "inch-decimal", difficulty: "master", count: 20 });
  const full = deck.find((question) => question.setup.reading === 6);
  const almostFull = deck.find((question) => question.setup.reading === 5.999);
  const smallest = deck.find((question) => question.setup.reading === 0.001);
  const fullSvg = app.renderInstrument(full);
  const almostSvg = app.renderInstrument(almostFull);
  const smallSvg = app.renderInstrument(smallest);
  assert.equal(numericAttribute(fullSvg, "data-beam-divisions"), 60);
  assert.equal(numericAttribute(fullSvg, "data-dial-divisions"), 100);
  assert.equal(numericAttribute(fullSvg, "data-beam-tenths"), 60);
  assert.equal(numericAttribute(fullSvg, "data-dial-thousandths"), 0);
  assert.equal(numericAttribute(almostSvg, "data-beam-tenths"), 59);
  assert.equal(numericAttribute(almostSvg, "data-dial-thousandths"), 99);
  assert.equal(numericAttribute(smallSvg, "data-beam-tenths"), 0);
  assert.equal(numericAttribute(smallSvg, "data-dial-thousandths"), 1);
  assert.match(fullSvg, />6<\/text>/, "beam is labeled through 6 inches");
});

test("framing-square positioning changes the instrument drawing", () => {
  const notch = model.createQuestionDeck({ tool: "framing", unit: "layout", difficulty: "journey", count: 20 })
    .find((question) => question.setup.task === "notch");
  const perpendicular = model.createQuestionDeck({ tool: "framing", unit: "layout", difficulty: "apprentice", count: 20 })
    .find((question) => question.setup.task === "perpendicular");
  assert.ok(notch && perpendicular);
  const narrow = app.renderInstrument(notch, { value: 1 });
  const wide = app.renderInstrument(notch, { value: 2 });
  assert.ok(numericAttribute(wide, "data-notch-x") > numericAttribute(narrow, "data-notch-x"));
  const angled = app.renderInstrument(perpendicular, { value: 30 });
  const square = app.renderInstrument(perpendicular, { value: 90 });
  assert.equal(numericAttribute(angled, "data-line-angle"), 30);
  assert.equal(numericAttribute(square, "data-line-angle"), 90);
  assert.notEqual(angled, square);

  const metricMaster = model.createQuestionDeck({ tool: "framing", unit: "layout", difficulty: "master", count: 20 })
    .find((question) => question.setup.task === "notch" && question.answer.unit === "millimeter");
  const metricSvg = app.renderInstrument(metricMaster, { value: metricMaster.answer.value });
  assert.ok(numericAttribute(metricSvg, "data-notch-start-x") >= 74);
  assert.ok(numericAttribute(metricSvg, "data-notch-x") <= 886, "the 113–287 mm notch stays on the workpiece");
  assert.ok(numericAttribute(metricSvg, "data-notch-x") > numericAttribute(metricSvg, "data-notch-start-x"));
});

test("visual corrections use the graded answer rather than a different setup parameter", () => {
  const framingDeck = model.createQuestionDeck({ tool: "framing", unit: "layout", difficulty: "apprentice", count: 12 });
  const perpendicular = framingDeck.find((question) => question.setup.task === "perpendicular");
  const notch = framingDeck.find((question) => question.setup.task === "notch" && question.answer.unit === "inch-fraction");
  assert.equal(app.questionValue(perpendicular), 90);
  assert.equal(app.questionValue(notch), notch.answer.value);
  assert.notEqual(app.questionValue(notch), notch.setup.offset);
  const perpendicularReveal = app.renderInstrument(perpendicular, { reveal: true, value: app.questionValue(perpendicular) });
  assert.equal(numericAttribute(perpendicularReveal, "data-line-angle"), 90);

  const speedDeck = model.createQuestionDeck({ tool: "speed", unit: "angles", difficulty: "apprentice", count: 12 });
  const lineQuestion = speedDeck.find((question) => question.setup.degreeSetting === 15 && question.answer.value === 75);
  assert.ok(lineQuestion);
  assert.equal(app.questionValue(lineQuestion), 75);
  const speedReveal = app.renderInstrument(lineQuestion, { reveal: true, value: app.questionValue(lineQuestion) });
  assert.equal(numericAttribute(speedReveal, "data-degree-setting"), 15);
  assert.equal(numericAttribute(speedReveal, "data-line-angle"), 75);
  const ratioQuestion = model.createQuestionDeck({ tool: "speed", unit: "angles", difficulty: "master", count: 12 })
    .find((question) => question.answer.type === "ratio");
  assert.equal(app.questionValue(ratioQuestion), undefined, "ratio feedback retains the prepared setup instead of inventing a numeric mark");
});

test("unrevealed speed-square drawings provide source quantities without printing the graded answer", () => {
  for (const difficulty of ["apprentice", "journey", "master"]) {
    const deck = model.createQuestionDeck({ tool: "speed", unit: "angles", difficulty, count: 12 });
    for (const question of deck) {
      const visibleText = visibleSvgText(app.renderInstrument(question));
      const expected = model.formatExpected(question);
      const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const exposed = new RegExp(`(^|[^0-9.])${escaped}($|[^0-9.])`).test(visibleText);
      assert.equal(exposed, false, `${question.id} exposed ${expected} in ${visibleText}`);
    }
  }
  const squareLine = model.createQuestionDeck({ tool: "speed", unit: "angles", difficulty: "apprentice", count: 6 })
    .find((question) => question.setup.task === "square-line");
  const svg = app.renderInstrument(squareLine);
  assert.equal(numericAttribute(svg, "data-degree-setting"), 0);
  assert.equal(numericAttribute(svg, "data-line-angle"), 90);
  assert.match(visibleSvgText(svg), /SQUARE SETTING 0°/);
});

test("hub and app use GitHub-Pages-safe relative navigation and accessible controls", () => {
  const rootDir = path.resolve(__dirname, "..", "..");
  const hub = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  const page = fs.readFileSync(path.join(rootDir, "measure-up", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(rootDir, "measure-up", "styles.css"), "utf8");
  assert.match(hub, /href="\.\/measure-up\/"/);
  assert.match(page, /href="\.\.\/"/);
  assert.match(page, /src="\.\.\/assets\/stormy\.png"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /id="challenge-results"[^>]*tabindex="-1"/);
  assert.match(page, /Download Certificate \(PDF\)/);
  assert.match(css, /@media \(max-width: 660px\)/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /min-height: 48px/);
  assert.match(fs.readFileSync(path.join(rootDir, "measure-up", "app.js"), "utf8"), /addEventListener\("keydown"/);
});

let failures = 0;
for (const item of tests) {
  try { item.callback(); console.log(`✓ ${item.name}`); }
  catch (error) { failures += 1; console.error(`✗ ${item.name}`); console.error(error.stack || error); }
}
if (failures) {
  console.error(`\n${failures} app test${failures === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else console.log(`\n${tests.length} app tests passed.`);
