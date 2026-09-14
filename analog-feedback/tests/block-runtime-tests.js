"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const CVSProgramControl = require("../../shared/runtime/program-control.js");

const analogRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(analogRoot, "app.js"), "utf8");
const diagnosticProgram = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "else-if-diagnostic-program.json"), "utf8"),
);
const potentiometerProgram = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "potentiometer-else-if-program.json"), "utf8"),
);

function elementStub() {
  let innerHTML = "";
  const element = {
    children: [],
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    checked: false,
    scrollHeight: 0,
    scrollTop: 0,
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    click() { this.clicked = true; },
    remove() { this.removed = true; },
  };
  Object.defineProperty(element, "innerHTML", {
    get() { return innerHTML; },
    set(value) {
      innerHTML = String(value);
      element.children = [];
    },
  });
  return element;
}

function canvasContextStub() {
  return {
    clearRect() {},
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    strokeRect() {},
    fillText() {},
    arc() {},
    fill() {},
    closePath() {},
    translate() {},
    rotate() {},
  };
}

function outputLines(output) {
  return output.children.map((child) => child.textContent);
}

function makeRuntime() {
  const elements = new Map();
  const canvas = elementStub();
  canvas.getContext = () => canvasContextStub();
  elements.set("#arm-canvas", canvas);
  const document = {
    body: elementStub(),
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, elementStub());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return elementStub(); },
  };
  const stored = new Map();
  const localStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  let exportedBlob = null;
  const context = {
    Blob,
    console,
    document,
    localStorage,
    performance: { now: () => 0 },
    requestAnimationFrame() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    URL: {
      createObjectURL(blob) { exportedBlob = blob; return "blob:analog-test"; },
      revokeObjectURL() {},
    },
    CVSProgramControl,
    addEventListener() {},
  };
  context.window = context;
  context.globalThis = context;
  context.AnalogFeedbackBlocks = {
    error: false,
    setDeviceNames() {},
    loadStarter() {},
  };
  context.Blockly = {
    serialization: {
      workspaces: {
        save(workspace) { return structuredClone(workspace.state); },
        load(state, workspace) { workspace.state = structuredClone(state); },
      },
    },
  };

  vm.createContext(context);
  for (const file of ["motors.js", "analog.js", "arm.js", "objects.js"]) {
    vm.runInContext(fs.readFileSync(path.join(analogRoot, file), "utf8"), context, { filename: file });
  }

  const instrumentedSource = appSource.replace(
    /\s*initialize\(\);\s*\}\)\(\);\s*$/,
    `
      window.__analogRuntimeTest = {
        evaluateValue,
        executeChain,
        stopProgram,
        resetSimulation,
        configureJointCount,
        portableSettings,
        validateProgramFile,
        exportProgram,
        importProgram,
        saveProgram,
        loadProgram,
        setWorkspaceForTest(nextWorkspace) { workspace = nextWorkspace; },
        setProgramControlForTest(nextProgramControl) { programControl = nextProgramControl; },
        beginRunForTest(output) {
          variables.clear();
          elements.outputConsole = output;
        },
        getAnalog() { return analog; },
        getArm() { return arm; },
        getMotors() { return motors; },
        getVariables() { return variables; }
      };
    })();`,
  );
  assert.notEqual(instrumentedSource, appSource, "test instrumentation must replace initialize()");
  vm.runInContext(instrumentedSource, context, { filename: "app.js" });
  return {
    context,
    document,
    localStorage,
    runtime: context.__analogRuntimeTest,
    getExportedBlob: () => exportedBlob,
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

function numberBlock(value) {
  return statementBlock("math_number", { fields: { NUM: value } });
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

function variableBlock(name) {
  return statementBlock("variables_get", { fields: { VAR: name } });
}

function comparisonBlock(variableName, operation, value) {
  return statementBlock("logic_compare", {
    fields: { OP: operation },
    inputs: { A: variableBlock(variableName), B: numberBlock(value) },
  });
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

function outputStub() {
  return elementStub();
}

function activeProgramControl(runtime, options = {}) {
  let active = true;
  return {
    isActive: () => active,
    waitWhilePaused: options.waitWhilePaused || (async () => active),
    delay: options.delay || (async () => active),
    yieldControl: async () => active,
    waitUntil: async (predicate) => active && Boolean(predicate()),
    stop(reason) {
      active = false;
      runtime.getMotors().stopAll();
      if (options.onStop) options.onStop(reason);
    },
  };
}

function controlledSharedProgramControl(runtime) {
  let currentTime = 0;
  const scheduled = [];
  const control = CVSProgramControl.create({
    stopMotion: () => runtime.getMotors().stopAll(),
    now: () => currentTime,
    schedule(resolve, milliseconds) {
      scheduled.push({ resolve, milliseconds });
    },
  });
  return {
    control,
    pendingCount: () => scheduled.length,
    advanceOne() {
      const pending = scheduled.shift();
      assert.ok(pending, "a shared-runtime timer slice must be pending");
      currentTime += pending.milliseconds;
      pending.resolve();
    },
  };
}

async function runChain(firstBlock, options = {}) {
  const instance = options.instance || makeRuntime();
  const output = options.output || outputStub();
  instance.runtime.beginRunForTest(output);
  const control = options.control || activeProgramControl(instance.runtime);
  instance.runtime.setProgramControlForTest(control);
  await instance.runtime.executeChain(firstBlock, 1);
  return { ...instance, control, output, lines: outputLines(output) };
}

function diagnosticChain(value) {
  const conditional = controlsIfBlock([
    { condition: comparisonBlock("testX", "LT", 140), body: printBlock("LEFT") },
    { condition: comparisonBlock("testX", "GT", 180), body: printBlock("RIGHT") },
  ], { elseBranch: printBlock("CENTER") });
  return statementBlock("variables_set", {
    fields: { VAR: "testX" },
    inputs: { VALUE: numberBlock(value) },
    next: conditional,
  });
}

async function captureCurrentDiagnostic() {
  const result = await runChain(diagnosticChain(250));
  console.log(`CURRENT ANALOG DIAGNOSTIC testX=250: ${result.lines.join(" | ")}`);
}

async function testBranchSelectionAndDiagnosticMatrix() {
  let laterEvaluations = 0;
  const firstMatch = controlsIfBlock([
    { condition: booleanBlock(true), body: printBlock("FIRST") },
    { condition: booleanBlock(true, () => { laterEvaluations += 1; }), body: printBlock("LATER") },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("AFTER") });
  assert.deepEqual((await runChain(firstMatch)).lines, ["FIRST", "AFTER"]);
  assert.equal(laterEvaluations, 0, "conditions after the first match must not be evaluated");

  const firstElseIf = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: printBlock("IF1") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual((await runChain(firstElseIf)).lines, ["IF1"]);

  const laterElseIf = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: null, body: printBlock("IF1") },
    { condition: booleanBlock(true), body: printBlock("IF2") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual(
    (await runChain(laterElseIf)).lines,
    ["IF2"],
    "an unconnected configured condition must not hide a later ELSE IF",
  );

  const allFalse = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(false), body: printBlock("IF1") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual((await runChain(allFalse)).lines, ["ELSE"]);

  const noElse = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(false), body: printBlock("IF1") },
  ], { next: printBlock("CONTINUED") });
  assert.deepEqual((await runChain(noElse)).lines, ["CONTINUED"]);

  const emptyMatchedBody = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: null },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("CONTINUED") });
  assert.deepEqual(
    (await runChain(emptyMatchedBody)).lines,
    ["CONTINUED"],
    "a true condition with an empty body must count as a match",
  );

  const cases = [
    [100, "LEFT"],
    [140, "CENTER"],
    [160, "CENTER"],
    [180, "CENTER"],
    [250, "RIGHT"],
  ];
  for (const [value, expected] of cases) {
    assert.deepEqual((await runChain(diagnosticChain(value))).lines, [expected], `testX=${value}`);
  }
}

async function testSerializedDiagnosticAndNestedConditional() {
  const start = blockFromSerializedState(diagnosticProgram.workspace.blocks.blocks[0]);
  assert.deepEqual((await runChain(start.getNextBlock())).lines, ["RIGHT"]);

  const inner = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("INNER IF0") },
    { condition: booleanBlock(true), body: printBlock("INNER IF1") },
  ], { elseBranch: printBlock("INNER ELSE") });
  const outer = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("OUTER IF0") },
    { condition: booleanBlock(true), body: inner },
  ], { elseBranch: printBlock("OUTER ELSE"), next: printBlock("AFTER") });
  assert.deepEqual((await runChain(outer)).lines, ["INNER IF1", "AFTER"]);
}

async function testLegacyAnalogConditionals() {
  const singleIfTrue = statementBlock("analog_if", {
    inputs: { IF0: booleanBlock(true), DO0: printBlock("SINGLE TRUE") },
    next: printBlock("AFTER SINGLE"),
  });
  assert.deepEqual((await runChain(singleIfTrue)).lines, ["SINGLE TRUE", "AFTER SINGLE"]);

  const singleIfFalse = statementBlock("analog_if", {
    inputs: { IF0: booleanBlock(false), DO0: printBlock("SHOULD NOT RUN") },
    next: printBlock("AFTER FALSE SINGLE"),
  });
  assert.deepEqual((await runChain(singleIfFalse)).lines, ["AFTER FALSE SINGLE"]);

  const ifElseTrue = statementBlock("analog_if_else", {
    inputs: {
      IF0: booleanBlock(true),
      DO0: printBlock("LEGACY IF"),
      ELSE: printBlock("LEGACY ELSE"),
    },
  });
  assert.deepEqual((await runChain(ifElseTrue)).lines, ["LEGACY IF"]);

  const ifElseFalse = statementBlock("analog_if_else", {
    inputs: {
      IF0: booleanBlock(false),
      DO0: printBlock("LEGACY IF"),
      ELSE: printBlock("LEGACY ELSE"),
    },
  });
  assert.deepEqual((await runChain(ifElseFalse)).lines, ["LEGACY ELSE"]);
}

async function testWaitAndPauseResumeInsideElseIf() {
  let releaseDelay;
  const trace = [];
  const instance = makeRuntime();
  const control = activeProgramControl(instance.runtime, {
    delay: async (milliseconds) => {
      trace.push(["delay-start", milliseconds]);
      await new Promise((resolve) => { releaseDelay = resolve; });
      trace.push(["delay-finish", milliseconds]);
      return true;
    },
  });
  const branch = statementBlock("core_wait_seconds", {
    inputs: { SECONDS: numberBlock(0.025) },
    next: printBlock("BRANCH FINISHED"),
  });
  const conditional = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: branch },
  ], { elseBranch: printBlock("ELSE"), next: printBlock("AFTER") });
  const output = outputStub();
  instance.runtime.beginRunForTest(output);
  instance.runtime.setProgramControlForTest(control);
  const execution = instance.runtime.executeChain(conditional, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof releaseDelay, "function");
  assert.deepEqual(outputLines(output), []);
  releaseDelay();
  await execution;
  assert.deepEqual(trace, [["delay-start", 25], ["delay-finish", 25]]);
  assert.deepEqual(outputLines(output), ["BRANCH FINISHED", "AFTER"]);

  let paused = false;
  let active = true;
  let finishWait;
  let resumeWaiter;
  const pauseInstance = makeRuntime();
  const pauseControl = {
    isActive: () => active,
    waitWhilePaused() {
      if (!active) return Promise.resolve(false);
      if (!paused) return Promise.resolve(true);
      return new Promise((resolve) => { resumeWaiter = () => resolve(active); });
    },
    delay: async () => new Promise((resolve) => { finishWait = () => resolve(active); }),
    stop() { active = false; pauseInstance.runtime.getMotors().stopAll(); },
    pause() { paused = true; },
    resume() { paused = false; if (resumeWaiter) resumeWaiter(); },
  };
  const pausedBranch = statementBlock("core_wait_seconds", {
    inputs: { SECONDS: numberBlock(0.01) },
    next: printBlock("RESUMED BRANCH"),
  });
  const pausedConditional = controlsIfBlock([
    { condition: booleanBlock(false), body: null },
    { condition: booleanBlock(true), body: pausedBranch },
  ], { next: printBlock("RESUMED OUTER") });
  const pausedOutput = outputStub();
  pauseInstance.runtime.beginRunForTest(pausedOutput);
  pauseInstance.runtime.setProgramControlForTest(pauseControl);
  const pausedExecution = pauseInstance.runtime.executeChain(pausedConditional, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof finishWait, "function", "selected branch must reach Wait");
  pauseControl.pause();
  finishWait();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(outputLines(pausedOutput), [], "paused branch must not advance after Wait");
  assert.equal(typeof resumeWaiter, "function");
  pauseControl.resume();
  await pausedExecution;
  assert.deepEqual(outputLines(pausedOutput), ["RESUMED BRANCH", "RESUMED OUTER"]);
}

function startEveryActuator(runtime) {
  runtime.getMotors().configure(3);
  runtime.getArm().configure(3, runtime.getAnalog());
  runtime.getMotors().getNames().forEach((name) => {
    runtime.getMotors().setVelocity(name, 10);
    runtime.getMotors().spin(name, "forward");
  });
}

function assertEveryActuatorStopped(runtime, message) {
  runtime.getMotors().getNames().forEach((name) => {
    assert.equal(runtime.getMotors().getState(name).direction, "stopped", `${message}: ${name}`);
  });
}

async function testStopProgramAndApplicationStopAllActuators() {
  const instance = makeRuntime();
  startEveryActuator(instance.runtime);
  const control = CVSProgramControl.create({ stopMotion: () => instance.runtime.getMotors().stopAll() });
  control.run();
  const stopBlock = statementBlock("core_stop_program", {
    next: statementBlock("analog_motor_spin", { fields: { DEVICE: "Joint1", DIRECTION: "reverse" } }),
  });
  const selected = controlsIfBlock([
    { condition: booleanBlock(false), body: null },
    { condition: booleanBlock(true), body: stopBlock },
  ], {
    next: statementBlock("analog_motor_spin", { fields: { DEVICE: "Gripper", DIRECTION: "reverse" } }),
  });
  await runChain(selected, { instance, control });
  assert.equal(control.getState().reason, "stopped");
  assertEveryActuatorStopped(instance.runtime, "Stop Program must stop all actuators");

  const stopInstance = makeRuntime();
  startEveryActuator(stopInstance.runtime);
  const stopControl = CVSProgramControl.create({ stopMotion: () => stopInstance.runtime.getMotors().stopAll() });
  stopControl.run();
  stopInstance.runtime.setProgramControlForTest(stopControl);
  stopInstance.runtime.stopProgram("STOPPED");
  assertEveryActuatorStopped(stopInstance.runtime, "application STOP must stop all actuators");
}

async function testStopAndResetPreventStaleCommands() {
  async function exercise(interrupt) {
    let releaseDelay;
    const instance = makeRuntime();
    const control = activeProgramControl(instance.runtime, {
      delay: async () => new Promise((resolve) => { releaseDelay = () => resolve(true); }),
    });
    const staleCommand = statementBlock("analog_motor_spin", {
      fields: { DEVICE: "Joint1", DIRECTION: "reverse" },
      next: printBlock("STALE BRANCH"),
    });
    const wait = statementBlock("core_wait_seconds", {
      inputs: { SECONDS: numberBlock(0.02) },
      next: staleCommand,
    });
    const conditional = controlsIfBlock([
      { condition: booleanBlock(false), body: null },
      { condition: booleanBlock(true), body: wait },
    ], { next: printBlock("STALE OUTER") });
    const output = outputStub();
    instance.runtime.beginRunForTest(output);
    instance.runtime.setProgramControlForTest(control);
    instance.runtime.getMotors().spin("Joint1", "forward");
    const execution = instance.runtime.executeChain(conditional, 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof releaseDelay, "function");
    interrupt(instance.runtime);
    assert.equal(instance.runtime.getMotors().getState("Joint1").direction, "stopped");
    releaseDelay();
    await execution;
    assert.equal(instance.runtime.getMotors().getState("Joint1").direction, "stopped");
    assert.deepEqual(outputLines(output), [], "an interrupted wait must not issue stale output");
  }

  await exercise((runtime) => runtime.stopProgram("STOPPED"));
  await exercise((runtime) => runtime.resetSimulation());
}

async function testSharedControlPauseStopAndResetDuringWait() {
  async function interruptSharedWait(interrupt) {
    const instance = makeRuntime();
    const shared = controlledSharedProgramControl(instance.runtime);
    const output = outputStub();
    instance.runtime.beginRunForTest(output);
    instance.runtime.setProgramControlForTest(shared.control);
    const token = shared.control.run();
    instance.runtime.getMotors().spin("Joint1", "forward");
    const wait = statementBlock("core_wait_seconds", {
      inputs: { SECONDS: numberBlock(0.08) },
      next: statementBlock("analog_motor_spin", {
        fields: { DEVICE: "Joint1", DIRECTION: "reverse" },
        next: printBlock("STALE BRANCH"),
      }),
    });
    const selected = controlsIfBlock([
      { condition: booleanBlock(false), body: null },
      { condition: booleanBlock(true), body: wait },
    ], { next: printBlock("STALE OUTER") });
    const execution = instance.runtime.executeChain(selected, token);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shared.pendingCount(), 1, "the actual shared control must be inside a timer slice");
    interrupt(instance.runtime);
    assertEveryActuatorStopped(instance.runtime, "interrupting a shared wait must stop motion");
    shared.advanceOne();
    await execution;
    assertEveryActuatorStopped(instance.runtime, "interrupted shared wait must not restart motion");
    assert.deepEqual(outputLines(output), []);
  }

  await interruptSharedWait((runtime) => runtime.stopProgram("STOPPED"));
  await interruptSharedWait((runtime) => runtime.resetSimulation());

  const instance = makeRuntime();
  const shared = controlledSharedProgramControl(instance.runtime);
  const output = outputStub();
  instance.runtime.beginRunForTest(output);
  instance.runtime.setProgramControlForTest(shared.control);
  const token = shared.control.run();
  const branch = statementBlock("core_wait_seconds", {
    inputs: { SECONDS: numberBlock(0.08) },
    next: printBlock("RESUMED BRANCH"),
  });
  const selected = controlsIfBlock([
    { condition: booleanBlock(false), body: null },
    { condition: booleanBlock(true), body: branch },
  ], { next: printBlock("RESUMED OUTER") });
  const execution = instance.runtime.executeChain(selected, token);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(shared.pendingCount(), 1);
  shared.control.pause();
  shared.advanceOne();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(shared.pendingCount(), 0, "paused shared control must not schedule another timer slice");
  assert.deepEqual(outputLines(output), []);
  shared.control.resume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(shared.pendingCount(), 1);
  shared.advanceOne();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(shared.pendingCount(), 1);
  shared.advanceOne();
  await execution;
  assert.deepEqual(outputLines(output), ["RESUMED BRANCH", "RESUMED OUTER"]);
}

function mappedJointPosition() {
  return statementBlock("analog_map", {
    inputs: {
      VALUE: statementBlock("analog_pot_raw", { fields: { DEVICE: "Joint1" } }),
      IN_MIN: numberBlock(620),
      IN_MAX: numberBlock(3470),
      OUT_MIN: numberBlock(0),
      OUT_MAX: numberBlock(180),
    },
  });
}

function jointBandProgram() {
  const conditional = controlsIfBlock([
    {
      condition: statementBlock("analog_less", { inputs: { A: mappedJointPosition(), B: numberBlock(85) } }),
      body: statementBlock("analog_motor_spin", { fields: { DEVICE: "Joint1", DIRECTION: "forward" } }),
    },
    {
      condition: statementBlock("analog_greater", { inputs: { A: mappedJointPosition(), B: numberBlock(95) } }),
      body: statementBlock("analog_motor_spin", { fields: { DEVICE: "Joint1", DIRECTION: "reverse" } }),
    },
  ], {
    elseBranch: statementBlock("analog_motor_stop", { fields: { DEVICE: "Joint1" } }),
  });
  return statementBlock("analog_motor_velocity", {
    fields: { DEVICE: "Joint1", VELOCITY: 10 },
    next: conditional,
  });
}

async function testPotentiometerJointBandIntegration() {
  const cases = [
    { position: 80, expected: "forward", change: 1 },
    { position: 100, expected: "reverse", change: -1 },
    { position: 90, expected: "stopped", change: 0 },
  ];
  for (const testCase of cases) {
    const instance = makeRuntime();
    instance.runtime.getArm().angles.Joint1 = testCase.position;
    await runChain(jointBandProgram(), { instance });
    const motor = instance.runtime.getMotors().getState("Joint1");
    assert.equal(motor.velocity, 10, "integration test must use low simulated speed");
    assert.equal(motor.direction, testCase.expected);
    const beforePosition = instance.runtime.getArm().getPosition("Joint1");
    const beforeRaw = instance.runtime.getAnalog().rawFor("Joint1", beforePosition);
    instance.runtime.getArm().update(0.5, instance.runtime.getMotors(), instance.runtime.getAnalog());
    const afterPosition = instance.runtime.getArm().getPosition("Joint1");
    const afterRaw = instance.runtime.getAnalog().rawFor("Joint1", afterPosition);
    assert.equal(Math.sign(afterPosition - beforePosition), testCase.change);
    assert.equal(Math.sign(afterRaw - beforeRaw), testCase.change, "potentiometer feedback must follow joint motion");
  }
}

async function testSerializedPotentiometerIntegration() {
  const instance = makeRuntime();
  const control = activeProgramControl(instance.runtime, {
    delay: async (milliseconds) => {
      instance.runtime.getArm().update(
        milliseconds / 1000,
        instance.runtime.getMotors(),
        instance.runtime.getAnalog(),
      );
      return true;
    },
  });
  const start = blockFromSerializedState(potentiometerProgram.workspace.blocks.blocks[0]);
  const result = await runChain(start.getNextBlock(), { instance, control });
  assert.deepEqual(result.lines, ["BELOW - FORWARD", "ABOVE - REVERSE", "WITHIN - STOPPED"]);
  assert.ok(
    instance.runtime.getArm().getPosition("Joint1") >= 55 &&
      instance.runtime.getArm().getPosition("Joint1") <= 65,
    "the finite browser fixture must finish inside its target band",
  );
  assertEveryActuatorStopped(instance.runtime, "finite potentiometer fixture must finish stopped");
}

function workspaceStub(state) {
  return {
    state: structuredClone(state),
    clear() { this.state = {}; },
  };
}

async function testSaveLoadImportExportCompatibility() {
  const instance = makeRuntime();
  const workspace = workspaceStub(diagnosticProgram.workspace);
  instance.runtime.setWorkspaceForTest(workspace);
  instance.runtime.setProgramControlForTest(activeProgramControl(instance.runtime));
  instance.runtime.validateProgramFile(diagnosticProgram);
  instance.runtime.validateProgramFile(potentiometerProgram);

  instance.runtime.saveProgram();
  const saved = JSON.parse(instance.localStorage.getItem("cvs-analog-feedback-program-v1"));
  assert.equal(saved.jointCount, 1);
  assert.deepEqual(saved.workspace, diagnosticProgram.workspace);
  workspace.state = { blocks: { blocks: [{ type: "changed" }] } };
  instance.runtime.loadProgram();
  assert.deepEqual(workspace.state, diagnosticProgram.workspace, "Save/Load must preserve ELSE IF workspace state");

  instance.runtime.exportProgram();
  const exported = JSON.parse(await instance.getExportedBlob().text());
  assert.equal(exported.app, "cvs-analog-feedback");
  assert.deepEqual(exported.workspace, diagnosticProgram.workspace);
  instance.runtime.validateProgramFile(exported);

  workspace.state = { blocks: { blocks: [{ type: "changed-again" }] } };
  const event = {
    target: {
      value: "fixture.json",
      files: [{ text: async () => JSON.stringify(diagnosticProgram) }],
    },
  };
  await instance.runtime.importProgram(event);
  assert.equal(event.target.value, "");
  assert.deepEqual(workspace.state, diagnosticProgram.workspace, "Export/Import must preserve ELSE IF workspace state");
}

async function main() {
  await testBranchSelectionAndDiagnosticMatrix();
  await testSerializedDiagnosticAndNestedConditional();
  await testLegacyAnalogConditionals();
  await testWaitAndPauseResumeInsideElseIf();
  await testStopProgramAndApplicationStopAllActuators();
  await testStopAndResetPreventStaleCommands();
  await testSharedControlPauseStopAndResetDuringWait();
  await testPotentiometerJointBandIntegration();
  await testSerializedPotentiometerIntegration();
  await testSaveLoadImportExportCompatibility();

  console.log("PASS: Analog Feedback Blockly IF / ELSE IF / ELSE uses ordered first-match execution");
  console.log("PASS: waits, Pause/Resume, Stop Program, STOP, and RESET prevent stale execution");
  console.log("PASS: low-speed potentiometer band control commands forward/reverse/stop with changing feedback");
  console.log("PASS: all joints and the gripper stop; Save/Load and Export/Import preserve the program");
}

if (process.argv.includes("--capture-current")) {
  captureCurrentDiagnostic().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
