"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { create: createProgramControl } = require("../../shared/runtime/program-control.js");

const appRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(appRoot, "app.js"), "utf8");
const diagnosticProgram = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "else-if-diagnostic-program.json"), "utf8"),
);
const rightOnlyLineProgram = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "line-sensor-else-if-right-only-program.json"), "utf8"),
);

function classListStub() {
  return {
    add() {},
    remove() {},
    toggle() {},
    contains() { return false; },
  };
}

function elementStub() {
  const element = {
    children: [],
    classList: classListStub(),
    dataset: {},
    disabled: false,
    hidden: false,
    open: false,
    scrollHeight: 0,
    scrollTop: 0,
    textContent: "",
    value: "",
    addEventListener() {},
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    click() {},
    getContext() { return {}; },
    querySelector() { return elementStub(); },
    querySelectorAll() { return []; },
    remove() {},
    replaceChildren(...nodes) { this.children = [...nodes]; },
    setAttribute() {},
  };
  Object.defineProperty(element, "innerHTML", {
    get() { return this._innerHTML || ""; },
    set(value) {
      this._innerHTML = value;
      if (value === "") this.children = [];
    },
  });
  return element;
}

function makeRuntime() {
  const elements = new Map();
  const localValues = new Map();
  const createdBlobs = [];
  const document = {
    body: elementStub(),
    createElement() { return elementStub(); },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, elementStub());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
  };
  const localStorage = {
    getItem(key) { return localValues.has(key) ? localValues.get(key) : null; },
    removeItem(key) { localValues.delete(key); },
    setItem(key, value) { localValues.set(key, String(value)); },
  };
  const context = vm.createContext({
    Blob,
    console,
    document,
    localStorage,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    setTimeout,
    clearTimeout,
    structuredClone,
    URL: {
      createObjectURL(blob) { createdBlobs.push(blob); return "blob:digital-runtime-test"; },
      revokeObjectURL() {},
    },
  });
  context.window = {
    addEventListener() {},
    clearTimeout,
    setTimeout(callback) { callback(); },
    DigitalFeedbackBlocks: {
      loadStarter() {},
      updateToolbox() {},
    },
  };

  for (const file of [
    "track.js",
    "robot.js",
    "sensors.js",
    path.join("activities", "lineFollower.js"),
    path.join("activities", "contactSwitch.js"),
  ]) {
    vm.runInContext(fs.readFileSync(path.join(appRoot, file), "utf8"), context, { filename: file });
  }

  const instrumentedSource = appSource.replace(
    /\s*initialize\(\);\s*\}\)\(\);\s*$/,
    `
  window.__digitalRuntimeTest = {
    evaluateValue,
    executeChain,
    stopProgram,
    resetSimulation,
    validateProgramFile,
    portableSettings,
    exportProgram,
    importProgram,
    saveProgram,
    loadProgram,
    setProgramControlForTest(nextProgramControl) { programControl = nextProgramControl; },
    setWorkspaceForTest(nextWorkspace) { workspace = nextWorkspace; },
    useActivityForTest(activityId) {
      currentActivityId = activityId;
      currentActivity = activities[activityId];
    },
    beginRunForTest() {
      outputLines = [];
      elements.outputConsole = document.querySelector("#test-output-console");
      elements.outputConsole.innerHTML = "";
    },
    clearVariablesForTest() { variables.clear(); },
    getActivityForTest(activityId) { return activities[activityId]; },
    getOutputLinesForTest() { return [...outputLines]; },
    getRobotForTest() { return robot; }
  };
})();`,
  );
  assert.notEqual(instrumentedSource, appSource, "app.js test instrumentation must replace initialize()");
  vm.runInContext(instrumentedSource, context, { filename: "app.js" });

  return {
    context,
    createdBlobs,
    localStorage,
    runtime: context.window.__digitalRuntimeTest,
  };
}

function statementBlock(type, options = {}) {
  return {
    type,
    getFieldValue(name) { return options.fields?.[name] ?? null; },
    getInput(name) {
      return Object.prototype.hasOwnProperty.call(options.inputs || {}, name) ? { name } : null;
    },
    getInputTargetBlock(name) { return options.inputs?.[name] || null; },
    getNextBlock() { return options.next || null; },
  };
}

function booleanBlock(value, onEvaluate = null) {
  return statementBlock("logic_boolean", {
    fields: {
      get BOOL() {
        if (onEvaluate) onEvaluate();
        return value ? "TRUE" : "FALSE";
      },
    },
  });
}

function numberBlock(value) {
  return statementBlock("math_number", { fields: { NUM: value } });
}

function variableBlock(name) {
  return statementBlock("variables_get", { fields: { VAR: name } });
}

function comparisonBlock(left, operation, right) {
  return statementBlock("logic_compare", {
    fields: { OP: operation },
    inputs: { A: left, B: right },
  });
}

function logicalBlock(operation, left, right) {
  return statementBlock("logic_operation", {
    fields: { OP: operation },
    inputs: { A: left, B: right },
  });
}

function notBlock(value) {
  return statementBlock("logic_negate", { inputs: { BOOL: value } });
}

function printBlock(text, next = null) {
  return statementBlock("core_print_text", { fields: { TEXT: text }, next });
}

function controlsIfBlock(branches, options = {}) {
  const inputs = {};
  branches.forEach((branch, index) => {
    inputs[`IF${index}`] = branch.condition;
    inputs[`DO${index}`] = branch.body;
  });
  if (Object.prototype.hasOwnProperty.call(options, "elseBranch")) inputs.ELSE = options.elseBranch;
  return statementBlock("controls_if", { inputs, next: options.next || null });
}

function blockFromSerializedState(blockState) {
  if (!blockState) return null;
  const fields = { ...(blockState.fields || {}) };
  if (fields.VAR && typeof fields.VAR === "object") fields.VAR = fields.VAR.id;
  const inputs = Object.fromEntries(
    Object.entries(blockState.inputs || {}).map(([name, input]) => [
      name,
      blockFromSerializedState(input.block || input.shadow),
    ]),
  );
  return statementBlock(blockState.type, {
    fields,
    inputs,
    next: blockFromSerializedState(blockState.next?.block),
  });
}

function activeControl(runtime, options = {}) {
  let active = true;
  const control = {
    complete() { active = false; runtime.getRobotForTest().drive.stop(); },
    delay: options.delay || (async () => active),
    isActive: () => active,
    isPaused: () => false,
    run: () => 1,
    stop(reason) {
      active = false;
      runtime.getRobotForTest().drive.stop();
      if (options.onStop) options.onStop(reason);
    },
    waitUntil: async (predicate) => active && Boolean(predicate()),
    waitWhilePaused: async () => active,
    yieldControl: async () => active,
  };
  return control;
}

async function execute(runtime, block, control = activeControl(runtime), token = 1) {
  runtime.beginRunForTest();
  runtime.clearVariablesForTest();
  runtime.setProgramControlForTest(control);
  await runtime.executeChain(block, token);
  return Array.from(runtime.getOutputLinesForTest());
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function testDiagnosticMatrixAndSerializedFixture() {
  const cases = [
    [100, "LEFT"],
    [140, "CENTER"],
    [160, "CENTER"],
    [180, "CENTER"],
    [250, "RIGHT"],
  ];

  for (const [testX, expected] of cases) {
    const { runtime } = makeRuntime();
    const conditional = controlsIfBlock([
      {
        condition: comparisonBlock(variableBlock("testX"), "LT", numberBlock(140)),
        body: printBlock("LEFT"),
      },
      {
        condition: comparisonBlock(variableBlock("testX"), "GT", numberBlock(180)),
        body: printBlock("RIGHT"),
      },
    ], { elseBranch: printBlock("CENTER") });
    const program = statementBlock("variables_set", {
      fields: { VAR: "testX" },
      inputs: { VALUE: numberBlock(testX) },
      next: conditional,
    });
    assert.deepEqual(
      await execute(runtime, program),
      [expected],
      `Digital Feedback's actual executeChain interpreter must route testX=${testX} to ${expected}`,
    );
  }

  const { runtime } = makeRuntime();
  runtime.validateProgramFile(diagnosticProgram);
  const serializedStart = blockFromSerializedState(diagnosticProgram.workspace.blocks.blocks[0]);
  assert.deepEqual(
    await execute(runtime, serializedStart.getNextBlock()),
    ["RIGHT"],
    "the import-compatible Digital Feedback fixture must execute IF1 through executeChain",
  );
}

async function testConditionalBranchSemantics() {
  let laterEvaluations = 0;
  let runtime = makeRuntime().runtime;
  const firstMatch = controlsIfBlock([
    { condition: booleanBlock(true), body: printBlock("FIRST") },
    {
      condition: booleanBlock(true, () => { laterEvaluations += 1; }),
      body: printBlock("LATER"),
    },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("AFTER") });
  assert.deepEqual(await execute(runtime, firstMatch), ["FIRST", "AFTER"]);
  assert.equal(laterEvaluations, 0, "conditions after the first true branch must not be evaluated");

  runtime = makeRuntime().runtime;
  const firstElseIf = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: printBlock("IF1") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual(await execute(runtime, firstElseIf), ["IF1"]);

  runtime = makeRuntime().runtime;
  const laterElseIf = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: null, body: printBlock("UNCONNECTED") },
    { condition: booleanBlock(true), body: printBlock("IF2") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual(
    await execute(runtime, laterElseIf),
    ["IF2"],
    "a configured but unconnected condition must not hide later configured branches",
  );

  runtime = makeRuntime().runtime;
  const allFalse = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(false), body: printBlock("IF1") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual(await execute(runtime, allFalse), ["ELSE"]);

  runtime = makeRuntime().runtime;
  const noElse = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(false), body: printBlock("IF1") },
  ], { next: printBlock("CONTINUED") });
  assert.deepEqual(await execute(runtime, noElse), ["CONTINUED"]);

  runtime = makeRuntime().runtime;
  const emptyTrueBody = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: null },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("AFTER") });
  assert.deepEqual(
    await execute(runtime, emptyTrueBody),
    ["AFTER"],
    "a true condition with an empty DO input must count as the matching branch",
  );

  runtime = makeRuntime().runtime;
  const nested = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("OUTER IF0") },
    {
      condition: booleanBlock(true),
      body: controlsIfBlock([
        { condition: booleanBlock(false), body: printBlock("INNER IF0") },
        { condition: booleanBlock(true), body: printBlock("INNER IF1") },
      ], { elseBranch: printBlock("INNER ELSE") }),
    },
  ], { elseBranch: printBlock("OUTER ELSE"), next: printBlock("AFTER") });
  assert.deepEqual(await execute(runtime, nested), ["INNER IF1", "AFTER"]);

  runtime = makeRuntime().runtime;
  const legacyIf = statementBlock("feedback_if", {
    inputs: { IF0: booleanBlock(true), DO0: printBlock("LEGACY IF") },
    next: printBlock("AFTER"),
  });
  assert.deepEqual(await execute(runtime, legacyIf), ["LEGACY IF", "AFTER"]);

  runtime = makeRuntime().runtime;
  const legacyIfElse = statementBlock("feedback_if_else", {
    inputs: {
      IF0: booleanBlock(false),
      DO0: printBlock("LEGACY IF"),
      ELSE: printBlock("LEGACY ELSE"),
    },
  });
  assert.deepEqual(await execute(runtime, legacyIfElse), ["LEGACY ELSE"]);
}

async function testWaitOrdering() {
  const { runtime } = makeRuntime();
  const trace = [];
  let releaseDelay;
  const control = activeControl(runtime, {
    delay: async (milliseconds) => {
      trace.push(["start", milliseconds]);
      await new Promise((resolve) => { releaseDelay = resolve; });
      trace.push(["finish", milliseconds]);
      return true;
    },
  });
  const wait = statementBlock("core_wait_seconds", {
    inputs: { SECONDS: numberBlock(0.025) },
    next: printBlock("BRANCH FINISHED"),
  });
  const conditional = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: wait },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("AFTER") });

  runtime.beginRunForTest();
  runtime.setProgramControlForTest(control);
  const execution = runtime.executeChain(conditional, 1);
  await nextTurn();
  assert.deepEqual(trace, [["start", 25]]);
  assert.deepEqual(Array.from(runtime.getOutputLinesForTest()), []);
  releaseDelay();
  await execution;
  assert.deepEqual(trace, [["start", 25], ["finish", 25]]);
  assert.deepEqual(Array.from(runtime.getOutputLinesForTest()), ["BRANCH FINISHED", "AFTER"]);
}

function sharedControlHarness(runtime) {
  let clock = 0;
  const scheduled = [];
  const control = createProgramControl({
    now: () => clock,
    schedule(resolve, milliseconds) { scheduled.push({ milliseconds, resolve }); },
    stopMotion: () => runtime.getRobotForTest().drive.stop(),
  });
  return {
    control,
    flushOne() {
      const task = scheduled.shift();
      assert.ok(task, "a ProgramControl timer slice must be scheduled");
      clock += task.milliseconds;
      task.resolve();
    },
    get scheduledCount() { return scheduled.length; },
  };
}

async function testPauseResumeInsideElseIf() {
  const { runtime } = makeRuntime();
  const harness = sharedControlHarness(runtime);
  runtime.beginRunForTest();
  runtime.setProgramControlForTest(harness.control);
  const token = harness.control.run();
  const wait = statementBlock("core_wait_seconds", {
    inputs: { SECONDS: numberBlock(0.08) },
    next: printBlock("BRANCH RESUMED"),
  });
  const branch = printBlock("BRANCH START", wait);
  const conditional = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: branch },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("AFTER") });

  const execution = runtime.executeChain(conditional, token);
  await nextTurn();
  assert.deepEqual(Array.from(runtime.getOutputLinesForTest()), ["BRANCH START"]);
  assert.equal(harness.scheduledCount, 1);
  assert.equal(harness.control.pause(), true);
  harness.flushOne();
  await nextTurn();
  assert.deepEqual(Array.from(runtime.getOutputLinesForTest()), ["BRANCH START"]);
  assert.equal(harness.scheduledCount, 0, "paused delay must not advance to a new timer slice");
  assert.equal(harness.control.resume(), true);
  await nextTurn();
  assert.equal(harness.scheduledCount, 1);
  harness.flushOne();
  await nextTurn();
  assert.equal(harness.scheduledCount, 1);
  harness.flushOne();
  await execution;
  assert.deepEqual(Array.from(runtime.getOutputLinesForTest()), ["BRANCH START", "BRANCH RESUMED", "AFTER"]);
}

async function testStopProgramInsideBranch() {
  const { runtime } = makeRuntime();
  const reasons = [];
  const control = activeControl(runtime, { onStop: (reason) => reasons.push(reason) });
  const selected = printBlock(
    "SELECTED",
    statementBlock("drive_forward", {
      next: statementBlock("core_stop_program", { next: printBlock("STALE BRANCH TAIL") }),
    }),
  );
  const conditional = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: selected },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("STALE OUTER TAIL") });

  assert.deepEqual(await execute(runtime, conditional, control), ["SELECTED"]);
  assert.deepEqual(reasons, ["stopped"]);
  assert.deepEqual(
    {
      left: runtime.getRobotForTest().drive.state.leftOutput,
      right: runtime.getRobotForTest().drive.state.rightOutput,
    },
    { left: 0, right: 0 },
  );
}

async function testStopOrResetDuringWaitPreventsStaleDrive() {
  for (const action of ["STOP", "RESET"]) {
    const { runtime } = makeRuntime();
    const harness = sharedControlHarness(runtime);
    runtime.beginRunForTest();
    runtime.setProgramControlForTest(harness.control);
    const token = harness.control.run();
    const staleDrive = statementBlock("drive_reverse", { next: printBlock("STALE") });
    const wait = statementBlock("core_wait_seconds", {
      inputs: { SECONDS: numberBlock(0.08) },
      next: staleDrive,
    });
    const conditional = controlsIfBlock([
      { condition: booleanBlock(false), body: printBlock("IF0") },
      { condition: booleanBlock(true), body: wait },
    ], { elseBranch: printBlock("ELSE"), next: printBlock("OUTER STALE") });

    runtime.getRobotForTest().drive.forward();
    const execution = runtime.executeChain(conditional, token);
    await nextTurn();
    assert.equal(harness.scheduledCount, 1);
    if (action === "STOP") runtime.stopProgram("STOPPED");
    else runtime.resetSimulation();
    assert.deepEqual(
      {
        left: runtime.getRobotForTest().drive.state.leftOutput,
        right: runtime.getRobotForTest().drive.state.rightOutput,
      },
      { left: 0, right: 0 },
      `${action} must stop both drive sides immediately`,
    );
    harness.flushOne();
    await execution;
    assert.deepEqual(
      {
        left: runtime.getRobotForTest().drive.state.leftOutput,
        right: runtime.getRobotForTest().drive.state.rightOutput,
      },
      { left: 0, right: 0 },
      `${action} must invalidate the waiting run before its stale drive block`,
    );
    assert.equal(runtime.getOutputLinesForTest().includes("STALE"), false);
    assert.equal(runtime.getOutputLinesForTest().includes("OUTER STALE"), false);
  }
}

function lineSensorProgram() {
  const left = statementBlock("sensor_left_line");
  const right = statementBlock("sensor_right_line");
  return controlsIfBlock([
    {
      condition: logicalBlock("AND", left, notBlock(right)),
      body: statementBlock("drive_turn_left"),
    },
    {
      condition: logicalBlock(
        "AND",
        statementBlock("sensor_right_line"),
        notBlock(statementBlock("sensor_left_line")),
      ),
      body: statementBlock("drive_turn_right"),
    },
  ], { elseBranch: statementBlock("drive_stop") });
}

async function testLineSensorMotorIntegration() {
  const cases = [
    {
      left: true,
      right: false,
      action: "turnLeft",
      outputs: { left: 10.5, right: 30 },
      trackPoints: [{ x: 100, y: 350 }, { x: 140, y: 240 }, { x: 220, y: 520 }, { x: 500, y: 100 }],
    },
    {
      left: false,
      right: true,
      action: "turnRight",
      outputs: { left: 30, right: 10.5 },
      trackPoints: [{ x: 100, y: 350 }, { x: 140, y: 280 }, { x: 220, y: 200 }, { x: 500, y: 100 }],
    },
    {
      left: false,
      right: false,
      action: "stopped",
      outputs: { left: 0, right: 0 },
      trackPoints: [{ x: 100, y: 350 }, { x: 140, y: 100 }, { x: 220, y: 100 }, { x: 500, y: 100 }],
    },
    {
      left: true,
      right: true,
      action: "stopped",
      outputs: { left: 0, right: 0 },
      trackPoints: [{ x: 100, y: 350 }, { x: 140, y: 350 }, { x: 176, y: 338 }, { x: 176, y: 362 }, { x: 300, y: 350 }],
    },
  ];
  const { runtime } = makeRuntime();
  runtime.useActivityForTest("line-follower");
  const activity = runtime.getActivityForTest("line-follower");
  activity.setSensorConfiguration({
    front: { mode: "dual", longitudinalOffset: 76, spacing: 24 },
    rear: { mode: "none", longitudinalOffset: 42, spacing: 42 },
  });

  for (const testCase of cases) {
    activity.track.setPoints(testCase.trackPoints);
    activity.reset();
    await execute(runtime, lineSensorProgram());
    const drive = runtime.getRobotForTest().drive.state;
    assert.equal(activity.readInput("left"), testCase.left);
    assert.equal(activity.readInput("right"), testCase.right);
    assert.equal(drive.action, testCase.action);
    assert.deepEqual(
      { left: drive.leftOutput, right: drive.rightOutput },
      testCase.outputs,
      `left=${testCase.left}, right=${testCase.right} must issue ${testCase.action}`,
    );
  }

  runtime.validateProgramFile(rightOnlyLineProgram);
  activity.setSensorConfiguration(rightOnlyLineProgram.settings.lineFollower.sensorConfiguration);
  activity.track.setPoints(rightOnlyLineProgram.settings.lineFollower.trackPoints);
  activity.reset();
  const observedDuringWait = [];
  const control = activeControl(runtime, {
    delay: async () => {
      observedDuringWait.push({
        action: runtime.getRobotForTest().drive.state.action,
        left: runtime.getRobotForTest().drive.state.leftOutput,
        right: runtime.getRobotForTest().drive.state.rightOutput,
      });
      return true;
    },
  });
  const fixtureStart = blockFromSerializedState(rightOnlyLineProgram.workspace.blocks.blocks[0]);
  assert.deepEqual(await execute(runtime, fixtureStart.getNextBlock(), control), ["RIGHT"]);
  assert.deepEqual(
    observedDuringWait,
    [{ action: "turnRight", left: 30, right: 10.5 }],
    "the importable right-only fixture must reach IF1 and expose real right-turn outputs during its wait",
  );
  assert.equal(runtime.getRobotForTest().drive.state.action, "stopped", "fixture Stop Program must halt after observation");
}

async function testContactSwitchAndImmediateStop() {
  const { runtime } = makeRuntime();
  runtime.useActivityForTest("contact-switch");
  const activity = runtime.getActivityForTest("contact-switch");
  activity.reset();
  const contactProgram = controlsIfBlock([
    {
      condition: statementBlock("sensor_contact_switch"),
      body: statementBlock("drive_stop"),
    },
  ], { elseBranch: statementBlock("drive_forward") });

  assert.equal(activity.readInput("contact"), false);
  await execute(runtime, contactProgram);
  assert.deepEqual(
    {
      left: runtime.getRobotForTest().drive.state.leftOutput,
      right: runtime.getRobotForTest().drive.state.rightOutput,
    },
    { left: 50, right: 50 },
    "the shipped Contact Switch convention must drive while the switch is OFF",
  );

  activity.stopObject.x = 160;
  activity.stopObject.y = 220;
  activity.updateContact();
  assert.equal(activity.readInput("contact"), true, "real contact geometry must switch ON at the stop");
  await execute(runtime, contactProgram);
  assert.equal(runtime.getRobotForTest().drive.state.action, "stopped");

  activity.stopObject.x = 510;
  activity.updateContact();
  await execute(runtime, contactProgram);
  assert.equal(runtime.getRobotForTest().drive.state.action, "forward");

  const control = activeControl(runtime);
  runtime.setProgramControlForTest(control);
  runtime.stopProgram("STOPPED");
  assert.deepEqual(
    {
      left: runtime.getRobotForTest().drive.state.leftOutput,
      right: runtime.getRobotForTest().drive.state.rightOutput,
    },
    { left: 0, right: 0 },
    "application STOP must zero both drive outputs immediately",
  );
}

function workspaceStub(initialState) {
  return {
    state: structuredClone(initialState),
    clear() { this.state = {}; },
  };
}

async function testStorageAndPortableRoundTrips() {
  const { context, createdBlobs, runtime } = makeRuntime();
  const workspace = workspaceStub(diagnosticProgram.workspace);
  context.Blockly = {
    serialization: {
      workspaces: {
        load(state, target) { target.state = structuredClone(state); },
        save(target) { return structuredClone(target.state); },
      },
    },
  };
  runtime.useActivityForTest("line-follower");
  runtime.setWorkspaceForTest(workspace);
  runtime.setProgramControlForTest(activeControl(runtime));

  runtime.saveProgram();
  workspace.state = { blocks: { blocks: [{ type: "drive_stop" }] } };
  runtime.loadProgram();
  assert.deepEqual(workspace.state, diagnosticProgram.workspace, "Save/Load must retain ELSE IF workspace state");

  runtime.exportProgram();
  assert.equal(createdBlobs.length, 1);
  const exported = JSON.parse(await createdBlobs[0].text());
  runtime.validateProgramFile(exported);
  assert.equal(exported.app, "cvs-digital-feedback");
  assert.equal(
    exported.workspace.blocks.blocks[0].next.block.next.block.extraState.elseIfCount,
    1,
    "Export must preserve the controls_if mutator state",
  );

  workspace.state = { blocks: { blocks: [{ type: "drive_forward" }] } };
  await runtime.importProgram({
    target: {
      files: [{ text: async () => JSON.stringify(exported) }],
      value: "fixture.json",
    },
  });
  assert.deepEqual(workspace.state, diagnosticProgram.workspace, "Export/Import must retain ELSE IF workspace state");
  const serializedStart = blockFromSerializedState(workspace.state.blocks.blocks[0]);
  assert.deepEqual(await execute(runtime, serializedStart.getNextBlock()), ["RIGHT"]);
}

async function main() {
  await testDiagnosticMatrixAndSerializedFixture();
  await testConditionalBranchSemantics();
  await testWaitOrdering();
  await testPauseResumeInsideElseIf();
  await testStopProgramInsideBranch();
  await testStopOrResetDuringWaitPreventsStaleDrive();
  await testLineSensorMotorIntegration();
  await testContactSwitchAndImmediateStop();
  await testStorageAndPortableRoundTrips();

  assert.match(appSource, /const APP_ID = "cvs-digital-feedback";/);
  assert.match(appSource, /case "feedback_if":/);
  assert.match(appSource, /case "feedback_if_else":/);
  console.log("PASS: Digital Feedback IF / ELSE IF / ELSE routes every configured branch in order");
  console.log("PASS: nested, empty-body, wait, pause/resume, Stop, and Reset semantics remain safe");
  console.log("PASS: all four dual line-sensor states issue the expected real drivetrain outputs");
  console.log("PASS: Contact Switch, immediate STOP, Save/Load, and Export/Import remain compatible");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
