"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const events = [];

class FakeCustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options && options.detail;
  }
}

const browserWindow = {
  dispatchEvent(event) {
    events.push(event);
  },
};

const context = vm.createContext({
  window: browserWindow,
  CustomEvent: FakeCustomEvent,
});

vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "drivetrain.js"), "utf8"),
  context,
  { filename: "drivetrain.js" },
);

const drivetrain = browserWindow.drivetrain;
const api = browserWindow.Drivetrain;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectOutputs(left, right, action) {
  assert.equal(drivetrain.leftOutput, left);
  assert.equal(drivetrain.rightOutput, right);
  assert.equal(drivetrain.action, action);
}

function expectMotor(device, velocity, direction) {
  assert.deepEqual(plain(drivetrain.motors[device]), { velocity, direction });
}

function reset() {
  api.stop();
  api.setMotorVelocity("LeftDrive", 50);
  api.setMotorVelocity("RightDrive", 50);
  api.setDriveSpeed(50);
  api.setTurnSpeed(30);
  events.length = 0;
}

{
  expectOutputs(0, 0, "stopped");
  expectMotor("LeftDrive", 50, "stopped");
  expectMotor("RightDrive", 50, "stopped");
  [
    "command",
    "forward",
    "reverse",
    "setDriveSpeed",
    "setMotorVelocity",
    "setTurnSpeed",
    "spinMotor",
    "stop",
    "stopMotor",
    "turnLeft",
    "turnRight",
  ].forEach((method) => assert.equal(typeof api[method], "function", `${method} must remain public`));
  console.log("PASS: drivetrain exposes two stopped 50% MC55 devices and preserves the legacy API");
}

{
  reset();
  const before = plain(drivetrain);
  assert.equal(api.setMotorVelocity("leftdrive", 75), false);
  assert.equal(api.spinMotor("Left", "forward"), false);
  assert.equal(api.spinMotor("LeftDrive", "FORWARD"), false);
  assert.equal(api.spinMotor("RightDrive", "coast"), false);
  assert.equal(api.stopMotor("Right"), false);
  assert.deepEqual(plain(drivetrain), before);
  assert.equal(events.length, 0, "rejected commands must not publish state");

  assert.equal(api.setMotorVelocity("LeftDrive", -12), true);
  expectMotor("LeftDrive", 0, "stopped");
  assert.equal(api.setMotorVelocity("RightDrive", 120), true);
  expectMotor("RightDrive", 100, "stopped");
  const eventsBeforeInvalidVelocity = events.length;
  assert.equal(api.setMotorVelocity("LeftDrive", Number.NaN), false);
  expectMotor("LeftDrive", 0, "stopped");
  assert.equal(api.setMotorVelocity("RightDrive", Number.POSITIVE_INFINITY), false);
  expectMotor("RightDrive", 100, "stopped");
  assert.equal(events.length, eventsBeforeInvalidVelocity, "non-finite velocity values must be rejected without publishing");
  expectOutputs(0, 0, "stopped");
  console.log("PASS: motor device/direction validation is exact and velocity values clamp safely");
}

{
  reset();
  api.setMotorVelocity("LeftDrive", 25);
  api.setMotorVelocity("RightDrive", 70);
  api.spinMotor("LeftDrive", "forward");
  expectOutputs(25, 0, "individual");
  expectMotor("LeftDrive", 25, "forward");
  expectMotor("RightDrive", 70, "stopped");

  api.spinMotor("RightDrive", "reverse");
  expectOutputs(25, -70, "individual");
  expectMotor("RightDrive", 70, "reverse");

  api.setMotorVelocity("LeftDrive", 40);
  expectOutputs(40, -70, "individual");
  api.setMotorVelocity("RightDrive", 15);
  expectOutputs(40, -15, "individual");

  api.stopMotor("LeftDrive");
  expectOutputs(0, -15, "individual");
  expectMotor("LeftDrive", 40, "stopped");
  api.stopMotor("RightDrive");
  expectOutputs(0, 0, "stopped");
  expectMotor("RightDrive", 15, "stopped");
  console.log("PASS: spin, active retuning, and stopping remain independent per motor");
}

{
  reset();
  api.setDriveSpeed(60);
  api.forward();
  expectOutputs(60, 60, "forward");
  expectMotor("LeftDrive", 50, "forward");
  expectMotor("RightDrive", 50, "forward");

  api.setMotorVelocity("LeftDrive", 20);
  expectOutputs(20, 60, "individual");
  api.setDriveSpeed(90);
  expectOutputs(20, 60, "individual");
  assert.equal(drivetrain.driveSpeed, 90);

  api.spinMotor("RightDrive", "reverse");
  expectOutputs(20, -50, "individual");
  api.setTurnSpeed(80);
  expectOutputs(20, -50, "individual");
  assert.equal(drivetrain.turnSpeed, 80);

  api.reverse();
  expectOutputs(-90, -90, "reverse");
  expectMotor("LeftDrive", 20, "reverse");
  expectMotor("RightDrive", 50, "reverse");
  api.stopMotor("LeftDrive");
  expectOutputs(0, -90, "individual");
  api.setDriveSpeed(10);
  expectOutputs(0, -90, "individual");
  console.log("PASS: paired and individual commands follow last-command-per-affected-side precedence");
}

{
  reset();
  api.setDriveSpeed(40);
  api.forward();
  api.setDriveSpeed(65);
  expectOutputs(65, 65, "forward");
  api.reverse();
  expectOutputs(-65, -65, "reverse");
  api.setDriveSpeed(35);
  expectOutputs(-35, -35, "reverse");

  api.setTurnSpeed(20);
  api.turnLeft();
  expectOutputs(7, 20, "turnLeft");
  api.setTurnSpeed(40);
  expectOutputs(14, 40, "turnLeft");
  api.turnRight();
  expectOutputs(40, 14, "turnRight");
  expectMotor("LeftDrive", 50, "forward");
  expectMotor("RightDrive", 50, "forward");
  console.log("PASS: existing paired speed setters and arc-turn behavior remain unchanged");
}

{
  reset();
  api.command("forward", 44);
  expectOutputs(44, 44, "forward");
  api.command("turnLeft", 20);
  expectOutputs(7, 20, "turnLeft");
  api.command("reverse", 32);
  expectOutputs(-32, -32, "reverse");
  api.command("turnRight", 40);
  expectOutputs(40, 14, "turnRight");
  api.command("unsupported", 100);
  expectOutputs(0, 0, "stopped");
  console.log("PASS: legacy command dispatch retains its paired drive and fallback-stop behavior");
}

{
  reset();
  api.setMotorVelocity("LeftDrive", 23);
  api.setMotorVelocity("RightDrive", 67);
  const eventsBeforeSpin = events.length;
  api.spinMotor("LeftDrive", "reverse");
  assert.equal(events.length, eventsBeforeSpin + 1, "a valid individual command publishes exactly once");
  api.spinMotor("RightDrive", "forward");
  const eventBeforeStop = events.at(-1);
  assert.equal(eventBeforeStop.type, "drivetrainchange");
  assert.deepEqual(plain(eventBeforeStop.detail.motors), {
    LeftDrive: { velocity: 23, direction: "reverse" },
    RightDrive: { velocity: 67, direction: "forward" },
  });

  api.stop();
  expectOutputs(0, 0, "stopped");
  expectMotor("LeftDrive", 23, "stopped");
  expectMotor("RightDrive", 67, "stopped");
  assert.equal(events.at(-1).type, "drivetrainchange");
  assert.deepEqual(plain(events.at(-1).detail), plain(drivetrain));

  const captured = events.at(-1).detail;
  api.spinMotor("LeftDrive", "forward");
  assert.equal(captured.leftOutput, 0, "published top-level state must be a snapshot");
  assert.equal(captured.motors.LeftDrive.direction, "stopped", "published motor state must be a snapshot");
  assert.equal(Object.isFrozen(captured.motors), true);
  assert.equal(Object.isFrozen(captured.motors.LeftDrive), true);
  console.log("PASS: global Stop zeros both sides, retains velocities, and publishes safe state snapshots");
}
