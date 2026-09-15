"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const aiVisionRoot = path.join(__dirname, "..");
const errors = [];

class FakeCustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options && options.detail;
  }
}

const browserWindow = {
  dispatchEvent() {},
  addEventListener() {},
};
const context = vm.createContext({
  window: browserWindow,
  globalThis: browserWindow,
  CustomEvent: FakeCustomEvent,
  console: {
    ...console,
    error(...args) { errors.push(args); },
  },
  performance,
  setTimeout,
  clearTimeout,
});

function runSource(relativePath) {
  vm.runInContext(
    fs.readFileSync(path.join(aiVisionRoot, relativePath), "utf8"),
    context,
    { filename: relativePath },
  );
}

runSource("dining-room-model.js");
runSource("simulator.js");
runSource("dining-room-controller.js");
runSource("drivetrain.js");
runSource(path.join("..", "shared", "runtime", "program-control.js"));

const simulator = browserWindow.VisionSimulator;
const control = browserWindow.CVSProgramControl.create({
  stopMotion: () => browserWindow.Drivetrain.stop(),
  onStateChange: (state) => simulator.syncProgramState(state),
});
browserWindow.cvsProgramControl = control;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function roamingPose() {
  const roaming = simulator.getLiveProjection().obstructions
    .find((item) => item.kind === "roaming-robot");
  assert.ok(roaming, "the test scenario must include its roaming robot");
  return plain({ x: roaming.x, y: roaming.y, heading: roaming.heading });
}

function stepWorld(count = 1, seconds = 0.05) {
  for (let index = 0; index < count; index += 1) simulator.step(seconds);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

(async function run() {
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "front", height: 12, head: "forward" },
    chassis: { length: 18, width: 18 },
    startPose: "center-lane-northwest",
  });
  simulator.setPracticeObstructions({ fruitClutter: true, roamingRobot: true });
  const initialSettings = plain(simulator.getSettings());
  const initialObstructions = plain(simulator.getLiveProjection().obstructions);
  const initialRoaming = roamingPose();

  const waitToken = control.run("wait lifecycle");
  const waiting = control.delay(65, waitToken);
  for (let index = 0; index < 6; index += 1) {
    stepWorld(1, 0.04);
    await sleep(12);
  }
  assert.equal(await waiting, true);
  assert.notDeepEqual(roamingPose(), initialRoaming, "roaming must advance while a Blockly Wait is active");

  const beforeMotorStop = roamingPose();
  browserWindow.Drivetrain.stopMotor("LeftDrive");
  browserWindow.Drivetrain.stopMotor("RightDrive");
  stepWorld(4);
  assert.notDeepEqual(roamingPose(), beforeMotorStop, "student motor-stop blocks must not stop roaming");

  control.pause("pause lifecycle");
  const paused = roamingPose();
  stepWorld(20);
  assert.deepEqual(roamingPose(), paused, "Pause must freeze roaming pose and its simulation timer");
  control.resume("resume lifecycle");
  stepWorld(4);
  assert.notDeepEqual(roamingPose(), paused, "Resume must continue the same roaming state");

  const completionPose = roamingPose();
  assert.equal(control.complete(waitToken, "complete"), true);
  stepWorld(20);
  assert.deepEqual(roamingPose(), completionPose, "normal completion must leave no stale roaming motion");
  assert.equal(browserWindow.drivetrain.leftOutput, 0);
  assert.equal(browserWindow.drivetrain.rightOutput, 0);

  const secondToken = control.run("stop lifecycle");
  stepWorld(3);
  control.stop("stop program");
  const stopped = roamingPose();
  stepWorld(20);
  assert.deepEqual(roamingPose(), stopped, "Stop Program must freeze the current roaming pose");
  assert.equal(control.isActive(secondToken), false);

  control.reset(() => simulator.resetWorld(), "ready");
  assert.deepEqual(plain(simulator.getSettings()), initialSettings);
  assert.deepEqual(plain(simulator.getLiveProjection().obstructions), initialObstructions);
  assert.equal(simulator.hasCapturedSnapshot(), false);

  assert.equal(errors.length, 0);
  console.log("PASS: real ProgramControl Wait, Pause/Resume, Stop, completion, and Reset own the roaming lifecycle");
  console.log("PASS: individual motor stops affect only the student drivetrain and no stopped-state motion remains");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
