"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;

const appRoot = path.resolve(__dirname, "..");
for (const file of ["motors.js", "analog.js", "arm.js", "objects.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(appRoot, file), "utf8"), { filename: file });
}

const { MotorBank, clampVelocity } = AnalogFeedbackMotors;
const { AnalogSystem, mapValue } = AnalogFeedbackAnalog;
const { ArmModel } = AnalogFeedbackArm;
const { ManipulationTask } = AnalogFeedbackObjects;

function near(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

const analog = new AnalogSystem();
const motors = new MotorBank(1);
const arm = new ArmModel(1, analog);
const task = new ManipulationTask(arm);

assert.deepEqual(motors.getNames(), ["Joint1", "Gripper"]);
motors.configure(3);
assert.deepEqual(motors.getNames(), ["Joint1", "Joint2", "Joint3", "Gripper"]);
motors.configure(1);

for (const count of [1, 2, 3]) {
  motors.configure(count);
  arm.configure(count, analog);
  const initialOpen = arm.getPosition("Gripper");
  const initialRaw = analog.rawFor("Gripper", initialOpen);
  motors.setVelocity("Gripper", 50);
  motors.spin("Gripper", "forward");
  arm.update(0.5, motors, analog);
  const closedPosition = arm.getPosition("Gripper");
  assert.ok(closedPosition < initialOpen, `Gripper forward should close in ${count}-joint mode`);
  assert.ok(analog.rawFor("Gripper", closedPosition) < initialRaw, `Gripper raw value should decrease in ${count}-joint mode`);
  assert.equal(motors.getState("Gripper").velocity, 50);
  assert.equal(motors.getState("Gripper").direction, "forward");

  motors.stop("Gripper");
  const stoppedPosition = arm.getPosition("Gripper");
  arm.update(0.5, motors, analog);
  assert.equal(arm.getPosition("Gripper"), stoppedPosition);

  motors.spin("Gripper", "reverse");
  arm.update(0.5, motors, analog);
  assert.ok(arm.getPosition("Gripper") > stoppedPosition, `Gripper reverse should open in ${count}-joint mode`);
  motors.stopAll();
}

motors.configure(1);
arm.configure(1, analog);
motors.setVelocity("Gripper", 100);
motors.spin("Gripper", "forward");
arm.update(10, motors, analog);
assert.equal(arm.getPosition("Gripper"), 0);
assert.equal(analog.rawFor("Gripper", arm.getPosition("Gripper")), 400);
motors.spin("Gripper", "reverse");
arm.update(10, motors, analog);
assert.equal(arm.getPosition("Gripper"), 100);
assert.equal(analog.rawFor("Gripper", arm.getPosition("Gripper")), 3700);
motors.stopAll();
arm.reset(analog);

assert.equal(clampVelocity(-12), 0);
assert.equal(clampVelocity(130), 100);
motors.setVelocity("Joint1", 35);
motors.spin("Joint1", "forward");
arm.update(1, motors, analog);
near(arm.getPosition("Joint1"), 59.5, 0.001, "forward motion");
motors.spin("Joint1", "reverse");
arm.update(1, motors, analog);
near(arm.getPosition("Joint1"), 35, 0.001, "reverse motion");
motors.stop("Joint1");
arm.update(1, motors, analog);
near(arm.getPosition("Joint1"), 35, 0.001, "stopped motion");

assert.equal(analog.rawFor("Joint1", 0), 620);
assert.equal(analog.rawFor("Joint1", 180), 3470);
near(mapValue(2184, 620, 3470, 0, 180), 98.779, 0.001, "generic map");

motors.setVelocity("Joint1", 100);
motors.spin("Joint1", "forward");
arm.update(10, motors, analog);
assert.equal(arm.getPosition("Joint1"), 180);
assert.equal(analog.rawFor("Joint1", arm.getPosition("Joint1")), 3470);
motors.spin("Joint1", "reverse");
arm.update(10, motors, analog);
assert.equal(arm.getPosition("Joint1"), 0);
assert.equal(analog.rawFor("Joint1", arm.getPosition("Joint1")), 620);

motors.stopAll();
arm.reset(analog);
task.reset(arm);
motors.setVelocity("Gripper", 100);
motors.spin("Gripper", "forward");
for (let index = 0; index < 12; index += 1) {
  arm.update(0.1, motors, analog);
  task.update(arm);
}
assert.ok(task.held, "gripper should capture the object when sufficiently closed");
assert.ok(analog.rawFor("Gripper", arm.gripperPosition) < 3700, "gripper raw value should change");

motors.stop("Gripper");
motors.setVelocity("Joint1", 100);
motors.spin("Joint1", "forward");
for (let index = 0; index < 10; index += 1) {
  arm.update(0.1, motors, analog);
  task.update(arm);
}
near(arm.getPosition("Joint1"), 105, 0.001, "task destination angle");
assert.ok(task.held, "object should remain attached while the arm moves");

motors.stop("Joint1");
motors.spin("Gripper", "reverse");
for (let index = 0; index < 10; index += 1) {
  arm.update(0.1, motors, analog);
  task.update(arm);
}
assert.equal(task.held, false);
assert.equal(task.complete, true);

console.log("PASS: motor state, velocity clamp, forward/reverse/stop, limits");
console.log("PASS: 12-bit calibrated analog values and generic mapping");
console.log("PASS: gripper feedback, capture, transport, release, task completion");
