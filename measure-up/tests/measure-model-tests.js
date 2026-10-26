"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const model = require("../measure-model.js");

function nearlyEqual(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

{
  assert.deepEqual(model.DIFFICULTIES, ["apprentice", "journey", "master"]);
  assert.deepEqual(model.TOOL_LIST.map((tool) => tool.id), ["tape", "caliper", "framing", "speed"]);
  assert.deepEqual(model.getUnitsForTool("tape").map((unit) => unit.id), ["inch-fraction", "millimeter"]);
  assert.deepEqual(model.getUnitsForTool("caliper").map((unit) => unit.id), ["inch-decimal"]);
  assert.deepEqual(model.getUnitsForTool("framing").map((unit) => unit.id), ["layout"]);
  assert.deepEqual(model.getUnitsForTool("speed").map((unit) => unit.id), ["angles"]);
  assert.ok(model.TOOLS.caliper.assumptions.join(" ").includes("0–6 inch"));
  assert.ok(model.TOOLS.caliper.assumptions.join(" ").includes("0.001 inch"));
  assert.ok(Object.isFrozen(model.TOOLS));
  console.log("PASS: tool, difficulty, unit, and documented-assumption metadata");
}

{
  assert.deepEqual(model.reduceFraction(6, 16), { numerator: 3, denominator: 8 });
  nearlyEqual(model.parseInchFraction("2 6/16 in"), 2.375);
  nearlyEqual(model.parseInchFraction("2-3/8\""), 2.375);
  nearlyEqual(model.parseInchFraction("19/8"), 2.375);
  nearlyEqual(model.parseInchFraction("2⅜"), 2.375);
  nearlyEqual(model.parseInchFraction("2.375 inches"), 2.375);
  assert.equal(model.parseInchFraction("3/0"), null);
  assert.equal(model.formatInchFraction(2.375), "2 3/8 in");
  assert.equal(model.formatInchFraction(0.0625), "1/16 in");
  assert.equal(model.formatInchFraction(3), "3 in");
  assert.equal(model.parseMillimeters("4.2 cm"), 42);
  assert.equal(model.parseMillimeters("42 mm"), 42);
  assert.equal(model.formatMeasurement(42, "millimeter"), "42 mm");
  console.log("PASS: equivalent inch fractions, 1/16 formatting, and metric millimeters");
}

{
  const setup = model.caliperComponents(2.347);
  assert.deepEqual(setup, {
    beamTenths: 23,
    beamInches: 2.3,
    dialThousandths: 47,
    dialInches: 0.047,
    reading: 2.347,
    rangeInches: 6,
    resolutionInches: 0.001,
  });
  assert.equal(model.combineCaliperReading(setup.beamTenths, setup.dialThousandths), setup.reading);
  assert.equal(model.combineCaliperReading(59, 99), 5.999);
  assert.deepEqual(model.caliperComponents(6), {
    beamTenths: 60,
    beamInches: 6,
    dialThousandths: 0,
    dialInches: 0,
    reading: 6,
    rangeInches: 6,
    resolutionInches: 0.001,
  });
  assert.throws(() => model.caliperComponents(6.001), RangeError);
  assert.throws(() => model.combineCaliperReading(12, 100), RangeError);

  const question = model.createQuestionDeck({ tool: "caliper", difficulty: "journey", count: 8 })
    .find((item) => item.setup.reading === 2.347);
  assert.ok(question);
  assert.equal(question.setup.beamTenths, 23);
  assert.equal(question.setup.dialThousandths, 47);
  assert.equal(question.value, model.combineCaliperReading(23, 47));
  assert.equal(model.evaluateAnswer(question, "2.347 in").correct, true);
  assert.equal(model.evaluateAnswer(question, "2.346").correct, false);
  console.log("PASS: one shared beam-plus-dial calculation drives the 0–6 in caliper model and questions");
}

{
  for (const difficulty of model.DIFFICULTIES) {
    const deck = model.createQuestionDeck({ tool: "framing", unit: "layout", difficulty });
    assert.ok(deck.some((question) => question.setup.task === "perpendicular"));
    assert.ok(deck.some((question) => question.setup.task === "corner-check"));
    assert.ok(deck.some((question) => question.setup.task === "notch"));
  }

  const framing = model.createQuestionDeck({ tool: "framing", unit: "layout", difficulty: "journey" });
  const perpendicular = framing.find((question) => question.setup.task === "perpendicular");
  const squareCorner = model.createQuestionDeck({ tool: "framing", unit: "layout", difficulty: "apprentice" })
    .find((question) => question.setup.task === "corner-check" && question.setup.square);
  const notch = framing.find((question) => question.setup.task === "notch");
  assert.equal(model.evaluateAnswer(perpendicular, "90 degrees").correct, true);
  assert.equal(model.evaluateAnswer(squareCorner, "square").correct, true);
  assert.equal(model.evaluateAnswer(squareCorner, "out of square").correct, false);
  assert.equal(model.evaluateAnswer(notch, model.formatExpected(notch)).correct, true);
  assert.equal(notch.setup.width, notch.setup.end - notch.setup.start);
  console.log("PASS: framing-square perpendicular, corner-check, and notch setups");
}

{
  assert.deepEqual(model.speedSquareSetup("square-line"), {
    task: "square-line", degreeSetting: 0, lineAngle: 90, rise: null, run: null,
  });
  assert.deepEqual(model.speedSquareSetup("forty-five"), {
    task: "forty-five", degreeSetting: 45, lineAngle: 45, rise: null, run: null,
  });
  const pivot = model.speedSquareSetup("pivot-angle", { degreeSetting: 30 });
  assert.equal(pivot.degreeSetting, 30);
  assert.equal(pivot.lineAngle, 60);
  const pitch = model.speedSquareSetup("rise-run", { rise: 6, run: 12 });
  nearlyEqual(pitch.degreeSetting, 26.56505117707799);
  nearlyEqual(pitch.lineAngle, 63.43494882292201);
  assert.equal(pitch.rise, 6);
  assert.equal(pitch.run, 12);

  for (const difficulty of model.DIFFICULTIES) {
    const deck = model.createQuestionDeck({ tool: "speed", unit: "angles", difficulty });
    assert.ok(deck.some((question) => question.setup.task === "pivot-angle"));
    assert.ok(deck.some((question) => question.setup.task === "rise-run"));
    deck.forEach((question) => {
      assert.ok("degreeSetting" in question.setup);
      assert.ok("lineAngle" in question.setup);
      assert.ok("rise" in question.setup);
      assert.ok("run" in question.setup);
    });
  }
  const speedDeck = model.createQuestionDeck({ tool: "speed", unit: "angles", difficulty: "apprentice" });
  const pivotLine = speedDeck.find((question) => question.setup.task === "pivot-angle" && question.prompt.includes("marked line"));
  assert.equal(model.evaluateAnswer(pivotLine, `${pivotLine.setup.lineAngle}°`).correct, true);
  assert.equal(model.evaluateAnswer(pivotLine, `${pivotLine.setup.degreeSetting}°`).correct, false);
  console.log("PASS: speed-square setting, line angle, and rise/run stay distinct");
}

{
  const imperial = model.createQuestionDeck({
    tool: "tape", unit: "inch-fraction", difficulty: "master", count: 120, seed: "run-17",
  });
  const replay = model.createQuestionDeck({
    tool: "tape", unit: "inch-fraction", difficulty: "master", count: 120, seed: "run-17",
  });
  const varied = model.createQuestionDeck({
    tool: "tape", unit: "inch-fraction", difficulty: "master", count: 120, seed: "run-18",
  });
  assert.equal(imperial.length, 120);
  assert.equal(new Set(imperial.map((question) => question.id)).size, 120);
  assert.deepEqual(imperial.map((question) => question.sourceId), replay.map((question) => question.sourceId));
  assert.notDeepEqual(imperial.slice(0, 8).map((question) => question.sourceId), varied.slice(0, 8).map((question) => question.sourceId));
  assert.ok(imperial.every((question) => question.difficulty === "master"));
  assert.ok(imperial.every((question) => question.track === "inch-fraction"));
  assert.ok(imperial.every((question) => question.interaction === "read"));
  assert.ok(Object.isFrozen(imperial));

  const metric = model.createPracticeQuestion({
    tool: "tape", unit: "millimeter", difficulty: "journey", index: 1,
  });
  assert.equal(metric.interaction, "position");
  assert.deepEqual(metric.range, { min: 0, max: metric.setup.max, step: 1 });
  const forcedRead = model.createPracticeQuestion({
    tool: "tape", unit: "millimeter", difficulty: "journey", index: 1, interaction: "read",
  });
  assert.equal(forcedRead.interaction, "read");
  console.log("PASS: seeded prepared decks replay deterministically, scale to 120, and practice supports positioning");
}

{
  const tapeQuestion = model.createQuestionDeck({
    tool: "tape", unit: "inch-fraction", difficulty: "apprentice", count: 1,
  })[0];
  assert.equal(model.evaluateAnswer(tapeQuestion, model.formatExpected(tapeQuestion)).correct, true);
  assert.equal(model.evaluateAnswer(tapeQuestion, "999 in").correct, false);
  const ratioQuestion = model.createQuestionDeck({
    tool: "speed", unit: "angles", difficulty: "master",
  }).find((question) => question.answer.type === "ratio");
  assert.equal(model.evaluateAnswer(ratioQuestion, "5:12").correct, true);
  assert.equal(model.evaluateAnswer(ratioQuestion, "10/24").correct, true);
  assert.equal(model.evaluateAnswer(ratioQuestion, "6:12").correct, false);
  console.log("PASS: shared answer evaluation handles measurement, choice, degree, and equivalent ratio inputs");
}

{
  const questions = model.createQuestionDeck({
    tool: "tape", unit: "inch-fraction", difficulty: "apprentice", count: 5,
  });
  let now = 1_000;
  const session = new model.ChallengeSession({ questions, durationMs: 60_000, now: () => now });
  let state = session.start();
  assert.equal(state.status, "running");
  assert.equal(state.remainingMs, 60_000);
  assert.strictEqual(session.getCurrentQuestion(), questions[0]);

  const first = session.submit(model.formatExpected(questions[0]));
  assert.equal(first.accepted, true);
  assert.equal(first.evaluation.correct, true);
  state = session.getState();
  assert.equal(state.correct, 1);
  assert.equal(state.attempted, 1);
  assert.equal(state.currentStreak, 1);
  assert.equal(state.bestStreak, 1);
  assert.strictEqual(state.currentQuestion, questions[1]);

  session.submit("wrong");
  session.submit(model.formatExpected(questions[2]));
  state = session.getState();
  assert.equal(state.correct, 2);
  assert.equal(state.firstAttemptCorrect, 2);
  assert.equal(state.attempted, 3);
  nearlyEqual(state.accuracy, 200 / 3);
  assert.equal(state.currentStreak, 1);
  assert.equal(state.bestStreak, 1);

  now = 61_000;
  state = session.getState();
  assert.equal(state.status, "expired");
  assert.equal(state.remainingMs, 0);
  const results = session.getResults();
  assert.equal(results.status, "expired");
  assert.equal(results.elapsedMs, 60_000);
  assert.equal(results.correct, 2);
  assert.equal(results.attempted, 3);
  nearlyEqual(results.accuracy, 200 / 3);
  assert.equal(results.bestStreak, 1);
  assert.equal(results.missedReview.length, 1);
  assert.equal(results.missedReview[0].id, questions[1].id);
  assert.ok(Object.isFrozen(results));
  assert.ok(Object.isFrozen(results.missedReview));
  assert.ok(Object.isFrozen(results.missedReview[0]));
  assert.strictEqual(session.finish(), results);

  const rejected = session.submit(model.formatExpected(questions[3]));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.expired, true);
  assert.strictEqual(session.getResults(), results);
  assert.equal(session.getResults().attempted, 3);
  console.log("PASS: 60-second challenge metrics, first-attempt scoring, streaks, review, expiration, and frozen results");
}

{
  let now = 0;
  const questions = model.createQuestionDeck({
    tool: "caliper", unit: "inch-decimal", difficulty: "apprentice", count: 2,
  });
  const session = new model.ChallengeSession({ questions, now: () => now });
  session.start();
  session.submit(model.formatExpected(questions[0]));
  now = 500;
  const completion = session.submit(model.formatExpected(questions[1])).results;
  assert.equal(completion.status, "completed");
  assert.equal(completion.correct, 2);
  assert.equal(completion.attempted, 2);
  assert.equal(completion.accuracy, 100);
  assert.equal(completion.bestStreak, 2);
  assert.equal(completion.elapsedMs, 500);
  assert.ok(Object.isFrozen(completion));
  console.log("PASS: deck exhaustion completes and freezes a challenge before the timer");
}

{
  const source = fs.readFileSync(path.join(__dirname, "..", "measure-model.js"), "utf8");
  const browserWindow = {};
  const context = vm.createContext({ window: browserWindow, globalThis: browserWindow });
  vm.runInContext(source, context, { filename: "measure-model.js" });
  assert.ok(browserWindow.MeasureModel);
  assert.deepEqual(
    Array.from(browserWindow.MeasureModel.TOOL_LIST, (tool) => tool.id),
    ["tape", "caliper", "framing", "speed"],
  );
  assert.equal(typeof browserWindow.MeasureModel.ChallengeSession, "function");
  console.log("PASS: the pure model loads through both CommonJS and the browser UMD global");
}
