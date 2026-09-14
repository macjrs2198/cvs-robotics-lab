"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const aiVisionRoot = path.join(__dirname, "..");
const programControlPath = path.join(aiVisionRoot, "..", "shared", "runtime", "program-control.js");
const drivetrainPath = path.join(aiVisionRoot, "drivetrain.js");
const appSource = fs.readFileSync(path.join(aiVisionRoot, "app.js"), "utf8");
const motorFixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "motor-pivot-program.json"),
  "utf8",
));

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function serializedChain(firstBlock) {
  const blocks = [];
  let block = firstBlock;
  while (block) {
    blocks.push(block);
    block = block.next && block.next.block;
  }
  return blocks;
}

function testSerializedMotorFixture() {
  assert.deepEqual(
    {
      format: motorFixture.format,
      formatVersion: motorFixture.formatVersion,
      app: motorFixture.app,
      appVersion: motorFixture.appVersion,
    },
    {
      format: "cvs-robotics-program",
      formatVersion: 1,
      app: "cvs-ai-vision",
      appVersion: "4.0",
    },
  );
  assert.deepEqual(motorFixture.settings, {
    scene: "byte-to-bite-dining-room",
    camera: { mount: "right", height: 13.5, head: "down45" },
    chassis: { length: 12, width: 10 },
    startPose: "center-lane-northwest",
    diningStartPose: "center-lane-northwest",
  });

  const blocks = serializedChain(motorFixture.workspace.blocks.blocks[0]);
  assert.deepEqual(blocks.map((block) => block.type), [
    "event_when_started",
    "drive_stop",
    "motor_set_velocity",
    "motor_set_velocity",
    "motor_spin",
    "motor_spin",
    "core_wait_seconds",
    "motor_stop",
    "motor_stop",
  ]);
  assert.equal(blocks[2].fields.DEVICE, "LeftDrive");
  assert.equal(blocks[2].inputs.VELOCITY.shadow.fields.NUM, 20);
  assert.equal(blocks[3].fields.DEVICE, "RightDrive");
  assert.equal(blocks[3].inputs.VELOCITY.block.type, "math_arithmetic");
  assert.equal(blocks[3].inputs.VELOCITY.block.fields.OP, "MULTIPLY");
  assert.deepEqual(
    [
      blocks[3].inputs.VELOCITY.block.inputs.A.shadow.fields.NUM,
      blocks[3].inputs.VELOCITY.block.inputs.B.shadow.fields.NUM,
    ],
    [4, 5],
  );
  assert.deepEqual(blocks[4].fields, { DEVICE: "LeftDrive", DIRECTION: "reverse" });
  assert.deepEqual(blocks[5].fields, { DEVICE: "RightDrive", DIRECTION: "forward" });
  assert.equal(blocks[6].inputs.SECONDS.shadow.fields.NUM, 0.5);
  assert.equal(blocks[7].fields.DEVICE, "LeftDrive");
  assert.equal(blocks[8].fields.DEVICE, "RightDrive");
  console.log("PASS: portable fixture contains the exact real Blockly 0.5-second motor-pivot demonstration");
}

async function waitFor(predicate, message, timeoutMs = 300) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) assert.fail(message);
    await sleep(2);
  }
}

function outputConsoleStub() {
  return {
    children: [],
    scrollHeight: 0,
    scrollTop: 0,
    replaceChildren() {
      this.children.forEach((child) => { child.isConnected = false; });
      this.children = [];
    },
    appendChild(node) {
      node.isConnected = true;
      node.remove = () => {
        this.children = this.children.filter((child) => child !== node);
        node.isConnected = false;
      };
      this.children.push(node);
    },
    get firstElementChild() {
      return this.children[0] || null;
    },
  };
}

function makeHarness() {
  const drivetrainEvents = [];
  const errors = [];
  const simulatorCalls = { clearSnapshot: 0, resetWorld: 0 };
  const outputConsole = outputConsoleStub();
  const saveStatus = { textContent: "" };
  const browserWindow = {
    visionSensor: {},
    VisionSimulator: {
      clearSnapshot() { simulatorCalls.clearSnapshot += 1; },
      resetWorld() { simulatorCalls.resetWorld += 1; },
      getSettings() { return { scene: "ball" }; },
    },
    dispatchEvent(event) {
      if (event.type === "drivetrainchange") drivetrainEvents.push(event.detail);
    },
    addEventListener() {},
    clearTimeout() {},
    setTimeout() { return 1; },
  };

  class FakeCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options && options.detail;
    }
  }

  const context = vm.createContext({
    window: browserWindow,
    document: {
      readyState: "loading",
      addEventListener() {},
      createElement() {
        return { className: "", textContent: "", isConnected: false };
      },
    },
    CustomEvent: FakeCustomEvent,
    console: {
      ...console,
      error(...args) { errors.push(args); },
    },
    performance,
    setTimeout,
    clearTimeout,
    structuredClone,
  });

  vm.runInContext(fs.readFileSync(programControlPath, "utf8"), context, {
    filename: "shared/runtime/program-control.js",
  });
  vm.runInContext(fs.readFileSync(drivetrainPath, "utf8"), context, {
    filename: "ai-vision/drivetrain.js",
  });

  const instrumentedAppSource = appSource.replace(
    /\}\)\(\);\s*$/,
    `window.__motorProgramRuntime = {
      executeStatementChain,
      runProgram,
      resetSimulator,
      stopProgram,
      togglePause,
      setWorkspaceForTest(nextWorkspace) { workspace = nextWorkspace; },
      setProgramControlForTest(nextProgramControl) { programControl = nextProgramControl; },
      setElementsForTest(nextElements) { Object.assign(elements, nextElements); }
    };
})();`,
  );
  assert.notEqual(instrumentedAppSource, appSource, "the app interpreter must be instrumented");
  vm.runInContext(instrumentedAppSource, context, { filename: "ai-vision/app.js" });

  const runtime = browserWindow.__motorProgramRuntime;
  const control = browserWindow.CVSProgramControl.create({
    stopMotion: () => browserWindow.Drivetrain.stop(),
  });
  runtime.setProgramControlForTest(control);
  runtime.setElementsForTest({ outputConsole, consolePlaceholder: null, saveStatus });

  return {
    window: browserWindow,
    runtime,
    control,
    drivetrain: browserWindow.drivetrain,
    drivetrainEvents,
    errors,
    simulatorCalls,
    outputConsole,
    saveStatus,
  };
}

function statementBlock(type, options = {}) {
  return {
    type,
    next: options.next || null,
    isEnabled: () => options.enabled !== false,
    getFieldValue(name) { return options.fields?.[name] ?? null; },
    getInput(name) {
      return Object.prototype.hasOwnProperty.call(options.inputs || {}, name) ? { name } : null;
    },
    getInputTargetBlock(name) { return options.inputs?.[name] || null; },
    getNextBlock() { return this.next; },
  };
}

function sequence(...blocks) {
  blocks.forEach((block, index) => { block.next = blocks[index + 1] || null; });
  return blocks[0] || null;
}

function numberBlock(value) {
  return statementBlock("math_number", { fields: { NUM: value } });
}

function arithmeticBlock(operation, left, right) {
  return statementBlock("math_arithmetic", {
    fields: { OP: operation },
    inputs: { A: left, B: right },
  });
}

function setVelocity(device, valueBlock) {
  return statementBlock("motor_set_velocity", {
    fields: { DEVICE: device },
    inputs: { VELOCITY: valueBlock },
  });
}

function spin(device, direction) {
  return statementBlock("motor_spin", { fields: { DEVICE: device, DIRECTION: direction } });
}

function stopMotor(device) {
  return statementBlock("motor_stop", { fields: { DEVICE: device } });
}

function waitSeconds(seconds) {
  return statementBlock("core_wait_seconds", { inputs: { SECONDS: numberBlock(seconds) } });
}

function workspaceFor(chain) {
  const start = statementBlock("core_when_started", { next: chain });
  return { getTopBlocks: () => [start] };
}

function expectOutputs(harness, left, right) {
  assert.equal(harness.drivetrain.leftOutput, left);
  assert.equal(harness.drivetrain.rightOutput, right);
}

function expectMotor(harness, device, velocity, direction) {
  assert.deepEqual(plain(harness.drivetrain.motors[device]), { velocity, direction });
}

function startDirect(harness, chain) {
  const token = harness.control.run("integration test");
  const promise = harness.runtime.executeStatementChain(chain, token);
  return { token, promise };
}

function startProgram(harness, chain) {
  harness.runtime.setWorkspaceForTest(workspaceFor(chain));
  return harness.runtime.runProgram();
}

async function testMinimumMotorSequence() {
  const harness = makeHarness();
  const chain = sequence(
    statementBlock("drive_stop"),
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", arithmeticBlock("MULTIPLY", numberBlock(4), numberBlock(5))),
    spin("LeftDrive", "reverse"),
    spin("RightDrive", "forward"),
    waitSeconds(0.08),
    stopMotor("LeftDrive"),
    stopMotor("RightDrive"),
  );
  const { token, promise } = startDirect(harness, chain);

  await waitFor(
    () => harness.drivetrain.leftOutput === -20 && harness.drivetrain.rightOutput === 20,
    "the minimum program never latched -20/+20 during its real Wait",
  );
  expectOutputs(harness, -20, 20);
  expectMotor(harness, "LeftDrive", 20, "reverse");
  expectMotor(harness, "RightDrive", 20, "forward");

  await promise;
  expectOutputs(harness, 0, 0);
  expectMotor(harness, "LeftDrive", 20, "stopped");
  expectMotor(harness, "RightDrive", 20, "stopped");
  harness.control.complete(token);
  console.log("PASS: minimum Stop/set/spin/Wait/side-stop program latches -20/+20 then stops both sides");
}

async function testIndependentOutputsAndPrecedence() {
  const harness = makeHarness();
  const token = harness.control.run("output matrix");

  await harness.runtime.executeStatementChain(sequence(
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", numberBlock(20)),
    spin("LeftDrive", "forward"),
    spin("RightDrive", "forward"),
  ), token);
  expectOutputs(harness, 20, 20);

  await harness.runtime.executeStatementChain(sequence(
    setVelocity("LeftDrive", numberBlock(15)),
    setVelocity("RightDrive", numberBlock(35)),
    spin("LeftDrive", "forward"),
    spin("RightDrive", "forward"),
    stopMotor("LeftDrive"),
  ), token);
  expectOutputs(harness, 0, 35);

  await harness.runtime.executeStatementChain(sequence(
    statementBlock("drive_stop"),
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", numberBlock(30)),
    spin("LeftDrive", "reverse"),
    spin("RightDrive", "forward"),
  ), token);
  expectOutputs(harness, -20, 30);

  await harness.runtime.executeStatementChain(sequence(
    statementBlock("drive_set_speed", { fields: { SPEED: 60 } }),
    statementBlock("drive_forward"),
  ), token);
  expectOutputs(harness, 60, 60);

  await harness.runtime.executeStatementChain(sequence(
    spin("LeftDrive", "reverse"),
    statementBlock("drive_set_speed", { fields: { SPEED: 90 } }),
  ), token);
  expectOutputs(harness, -20, 60);

  await harness.runtime.executeStatementChain(statementBlock("drive_reverse"), token);
  expectOutputs(harness, -90, -90);
  harness.control.complete(token);
  expectOutputs(harness, 0, 0);
  console.log("PASS: equal, unequal, one-side-stop, and paired/individual precedence use authoritative outputs");
}

async function testPauseAndResume() {
  const harness = makeHarness();
  const chain = sequence(
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", numberBlock(20)),
    spin("LeftDrive", "forward"),
    spin("RightDrive", "forward"),
    waitSeconds(0.08),
    setVelocity("LeftDrive", numberBlock(33)),
    stopMotor("LeftDrive"),
    stopMotor("RightDrive"),
  );
  const program = startProgram(harness, chain);
  let finished = false;
  program.then(() => { finished = true; });

  await waitFor(
    () => harness.drivetrain.leftOutput === 20 && harness.drivetrain.rightOutput === 20,
    "the pause program never began its Wait",
  );
  harness.runtime.togglePause();
  assert.equal(harness.control.isPaused(), true);
  await sleep(100);
  assert.equal(finished, false, "paused wall time must not consume the cooperative Wait");
  expectOutputs(harness, 20, 20);
  expectMotor(harness, "LeftDrive", 20, "forward");

  harness.runtime.togglePause();
  assert.equal(harness.control.isRunning(), true);
  await sleep(10);
  assert.equal(finished, false, "the suspended Wait must retain time after Resume");
  expectOutputs(harness, 20, 20);

  await program;
  expectOutputs(harness, 0, 0);
  expectMotor(harness, "LeftDrive", 33, "stopped");
  assert.equal(harness.control.getState().reason, "complete");
  console.log("PASS: Pause preserves latched outputs and Wait duration; Resume continues before completion Stop");
}

async function testStopProgramBlock() {
  const harness = makeHarness();
  const chain = sequence(
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", numberBlock(20)),
    spin("LeftDrive", "forward"),
    spin("RightDrive", "reverse"),
    statementBlock("core_stop_program"),
    setVelocity("LeftDrive", numberBlock(99)),
    spin("LeftDrive", "reverse"),
  );

  await startProgram(harness, chain);
  expectOutputs(harness, 0, 0);
  expectMotor(harness, "LeftDrive", 20, "stopped");
  expectMotor(harness, "RightDrive", 20, "stopped");
  assert.equal(harness.control.getState().reason, "stop program");
  console.log("PASS: Stop Program zeros both motors and prevents its stale statement tail");
}

async function testGlobalStopCancellation() {
  const harness = makeHarness();
  const chain = sequence(
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", numberBlock(20)),
    spin("LeftDrive", "reverse"),
    spin("RightDrive", "forward"),
    waitSeconds(0.12),
    setVelocity("LeftDrive", numberBlock(99)),
    spin("LeftDrive", "forward"),
  );
  const program = startProgram(harness, chain);
  await waitFor(
    () => harness.drivetrain.leftOutput === -20 && harness.drivetrain.rightOutput === 20,
    "the global-Stop program never began its Wait",
  );

  harness.runtime.stopProgram("global stop test");
  await program;
  expectOutputs(harness, 0, 0);
  expectMotor(harness, "LeftDrive", 20, "stopped");
  assert.equal(harness.control.getState().reason, "global stop test");
  console.log("PASS: global Stop cancels a real Wait, zeros both motors, and blocks the stale tail");
}

async function testResetCancellation() {
  const harness = makeHarness();
  const chain = sequence(
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", numberBlock(20)),
    spin("LeftDrive", "forward"),
    spin("RightDrive", "forward"),
    waitSeconds(0.12),
    setVelocity("RightDrive", numberBlock(99)),
    spin("RightDrive", "reverse"),
  );
  const program = startProgram(harness, chain);
  await waitFor(
    () => harness.drivetrain.leftOutput === 20 && harness.drivetrain.rightOutput === 20,
    "the Reset program never began its Wait",
  );

  harness.runtime.resetSimulator();
  await program;
  expectOutputs(harness, 0, 0);
  expectMotor(harness, "RightDrive", 20, "stopped");
  assert.equal(harness.simulatorCalls.resetWorld, 1);
  assert.equal(harness.saveStatus.textContent, "Simulator reset");
  assert.equal(harness.control.getState().reason, "ready");
  console.log("PASS: Reset cancels a real Wait, stops both motors, resets the world, and blocks the stale tail");
}

async function testNormalCompletion() {
  const harness = makeHarness();
  const chain = sequence(
    setVelocity("LeftDrive", numberBlock(21)),
    setVelocity("RightDrive", numberBlock(22)),
    spin("LeftDrive", "forward"),
    spin("RightDrive", "forward"),
    waitSeconds(0.03),
    setVelocity("LeftDrive", numberBlock(25)),
  );

  await startProgram(harness, chain);
  assert.equal(
    harness.drivetrainEvents.some((state) => state.leftOutput === 25 && state.rightOutput === 22),
    true,
    "the final statement must execute before normal completion",
  );
  expectOutputs(harness, 0, 0);
  expectMotor(harness, "LeftDrive", 25, "stopped");
  expectMotor(harness, "RightDrive", 22, "stopped");
  assert.equal(harness.control.getState().reason, "complete");
  await sleep(20);
  expectOutputs(harness, 0, 0);
  console.log("PASS: normal completion performs the global safety Stop with no stale motion");
}

async function testRuntimeErrorCancellation() {
  const harness = makeHarness();
  const chain = sequence(
    setVelocity("LeftDrive", numberBlock(20)),
    setVelocity("RightDrive", numberBlock(20)),
    spin("LeftDrive", "forward"),
    spin("RightDrive", "reverse"),
    setVelocity("RightDrive", numberBlock(Number.POSITIVE_INFINITY)),
    setVelocity("LeftDrive", numberBlock(99)),
    spin("LeftDrive", "reverse"),
  );

  await startProgram(harness, chain);
  expectOutputs(harness, 0, 0);
  expectMotor(harness, "LeftDrive", 20, "stopped");
  expectMotor(harness, "RightDrive", 20, "stopped");
  assert.equal(harness.errors.length, 1, "the production run wrapper must report the interpreter error once");
  assert.match(String(harness.errors[0][0]), /Motor velocity must be a finite number/);
  assert.equal(
    harness.outputConsole.children.some((line) => /could not be executed/.test(line.textContent)),
    true,
  );
  console.log("PASS: runtime errors stop both motors and prevent post-error statements from running");
}

(async function run() {
  const startedAt = performance.now();
  testSerializedMotorFixture();
  await testMinimumMotorSequence();
  await testIndependentOutputsAndPrecedence();
  await testPauseAndResume();
  await testStopProgramBlock();
  await testGlobalStopCancellation();
  await testResetCancellation();
  await testNormalCompletion();
  await testRuntimeErrorCancellation();
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs < 2000, `motor integration suite took ${Math.round(elapsedMs)} ms`);
  console.log(`PASS: real app/drivetrain/ProgramControl integration suite completed in ${Math.round(elapsedMs)} ms`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
