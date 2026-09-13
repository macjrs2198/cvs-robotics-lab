"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const model = require("../simulator.js");

const SENSOR_KEYS = [
  "exists",
  "count",
  "centerX",
  "centerY",
  "width",
  "height",
  "id",
  "confidence"
];

function sensorValues(snapshot) {
  return Object.fromEntries(SENSOR_KEYS.map((key) => [key, snapshot[key]]));
}

function assertNoDetection(sensor) {
  assert.deepStrictEqual(sensorValues(sensor), {
    exists: false,
    count: 0,
    centerX: 0,
    centerY: 0,
    width: 0,
    height: 0,
    id: -1,
    confidence: 0
  });
  assert.equal(sensor.objects ? sensor.objects.length : 0, 0);
}

function snapshot(world) {
  return model.captureSnapshot(model.projectTarget(world));
}

{
  const empty = model.createEmptySnapshot();
  assert.equal(empty.captured, false);
  assertNoDetection(empty);
  assert.ok(Object.isFrozen(empty));
  assert.ok(Object.isFrozen(empty.objects));
  assert.throws(() => {
    empty.centerX = 99;
  }, TypeError);
  console.log("PASS: an uncaptured snapshot is deeply frozen and uses fixed unavailable values");
}

{
  const world = model.createWorldState();
  const projection = model.projectTarget(world);
  const captured = model.captureSnapshot(projection);

  assert.equal(Object.prototype.hasOwnProperty.call(projection, "sensor"), false);
  assert.equal(captured.captured, true);
  assert.equal(captured.exists, true);
  assert.equal(captured.count, 1);
  assert.equal(captured.centerX, 160);
  assert.equal(captured.centerY, 120);
  assert.equal(captured.width, 40);
  assert.equal(captured.height, 40);
  assert.equal(captured.id, 1);
  assert.equal(captured.confidence, 100);
  assert.equal(captured.objects.length, 1);
  assert.notStrictEqual(captured.objects[0], projection.detection);
  assert.ok(Object.isFrozen(captured));
  assert.ok(Object.isFrozen(captured.objects));
  assert.ok(Object.isFrozen(captured.objects[0]));
  console.log("PASS: a visible detection is copied into an immutable snapshot");
}

{
  const leftWorld = model.createWorldState();
  leftWorld.target.x = -300;
  leftWorld.target.y = 120;
  const leftProjection = model.projectTarget(leftWorld);
  const leftSnapshot = model.captureSnapshot(leftProjection);

  const rightWorld = model.createWorldState();
  rightWorld.target.x = -300;
  rightWorld.target.y = -120;
  const rightProjection = model.projectTarget(rightWorld);
  const rightSnapshot = model.captureSnapshot(rightProjection);

  assert.equal(leftProjection.detection, null);
  assert.equal(rightProjection.detection, null);
  assertNoDetection(leftSnapshot);
  assertNoDetection(rightSnapshot);
  assert.deepStrictEqual(sensorValues(leftSnapshot), sensorValues(rightSnapshot));
  assert.notEqual(leftProjection.rawCenterX, rightProjection.rawCenterX);
  console.log("PASS: hidden targets on opposite sides publish identical sanitized readings");
}

{
  const world = model.createWorldState();
  world.target.x = 100000;
  world.target.y = 0;
  const projection = model.projectTarget(world);

  assert.equal(projection.visibleInFrame, true);
  assert.equal(projection.withinDetectionRange, false);
  assert.equal(projection.apparentSize, model.config.minRenderedSize);
  assert.equal(projection.detection, null);
  assertNoDetection(model.captureSnapshot(projection));
  assert.equal(model.config.detectionRangeIsSimulatorApproximation, true);
  const layout = model.layoutWorldView(world);
  assert.equal(layout.targetInFov, true);
  assert.equal(layout.targetDetected, false);
  console.log("PASS: render-size clamping cannot make an out-of-range target detectable");
}

{
  const world = model.createWorldState();
  world.target.x = model.config.maxDetectionDistance;
  world.target.y = 0;
  const atBoundary = model.projectTarget(world);
  assert.equal(atBoundary.withinDetectionRange, true);
  assert.ok(atBoundary.detection);
  assert.equal(model.captureSnapshot(atBoundary).exists, true);

  world.target.x = model.config.maxDetectionDistance + 0.01;
  const beyondBoundary = model.projectTarget(world);
  assert.equal(beyondBoundary.visibleInFrame, true);
  assert.equal(beyondBoundary.withinDetectionRange, false);
  assert.equal(beyondBoundary.detection, null);
  assertNoDetection(model.captureSnapshot(beyondBoundary));
  console.log("PASS: the centralized approximate detection range has a tested boundary");
}

{
  const world = model.createWorldState();
  model.setTargetFromCamera(world, -10, 120);
  const partial = model.projectTarget(world);

  assert.equal(partial.visibleInFrame, true);
  assert.ok(partial.detection);
  assert.ok(partial.rawCenterX < 0);
  assert.equal(partial.detection.centerX, 5);
  assert.equal(partial.detection.width, 10);
  assert.equal(partial.detection.centerY, 120);
  assert.equal(partial.detection.height, 40);

  model.setTargetFromCamera(world, 330, 120);
  const rightPartial = model.projectTarget(world);
  assert.equal(rightPartial.visibleInFrame, true);
  assert.ok(rightPartial.detection);
  assert.ok(rightPartial.rawCenterX > model.SENSOR_WIDTH);
  assert.equal(rightPartial.detection.centerX, 315);
  assert.equal(rightPartial.detection.width, 10);
  assert.equal(rightPartial.detection.centerY, 120);
  assert.equal(rightPartial.detection.height, 40);

  model.setTargetFromCamera(world, -21, 120);
  const outside = model.projectTarget(world);
  assert.equal(outside.visibleInFrame, false);
  assert.equal(outside.detection, null);
  assertNoDetection(model.captureSnapshot(outside));
  console.log("PASS: partial targets use clipped bounds and fully outside targets are absent");
}

{
  const world = model.createWorldState();
  world.target.x = 0.001;
  world.target.y = 0;
  const projection = model.projectTarget(world);
  const captured = model.captureSnapshot(projection);
  [projection.distance, projection.rawCenterX, projection.apparentSize].forEach((value) => {
    assert.ok(Number.isFinite(value));
  });
  SENSOR_KEYS.filter((key) => key !== "exists").forEach((key) => {
    assert.ok(Number.isFinite(captured[key]));
  });
  assert.ok(projection.apparentSize <= model.config.maxRenderedSize);
  console.log("PASS: near-camera projection and detection geometry remain finite");
}

{
  const world = model.createWorldState();
  const firstProjection = model.projectTarget(world);
  const firstSnapshot = model.captureSnapshot(firstProjection);
  const recorded = sensorValues(firstSnapshot);

  world.robot.heading = 0.2;
  const movedProjection = model.projectTarget(world);
  assert.notEqual(movedProjection.detection.centerX, firstSnapshot.centerX);
  assert.deepStrictEqual(sensorValues(firstSnapshot), recorded);

  const refreshed = model.captureSnapshot(movedProjection);
  assert.notEqual(refreshed.centerX, firstSnapshot.centerX);
  assert.deepStrictEqual(sensorValues(firstSnapshot), recorded);
  console.log("PASS: live movement does not mutate an existing snapshot; recapture refreshes it");
}

{
  const world = model.createWorldState();
  const visible = snapshot(world);
  assert.equal(visible.exists, true);

  world.robot.heading = Math.PI;
  const lost = snapshot(world);
  assert.equal(lost.captured, true);
  assertNoDetection(lost);
  assert.equal(visible.exists, true);
  assert.equal(visible.centerX, 160);
  console.log("PASS: an empty recapture replaces a prior valid detection without stale coordinates");
}

{
  function studentProgram(sensor) {
    if (!sensor.exists) return { leftOutput: 35, rightOutput: 35 };
    if (sensor.centerX < 145) return { leftOutput: 10.5, rightOutput: 30 };
    if (sensor.centerX > 175) return { leftOutput: 30, rightOutput: 10.5 };
    return { leftOutput: 40, rightOutput: 40 };
  }

  const leftWorld = model.createWorldState();
  leftWorld.target.x = -400;
  leftWorld.target.y = 100;
  const rightWorld = model.createWorldState();
  rightWorld.target.x = -400;
  rightWorld.target.y = -100;
  const leftCommands = [];
  const rightCommands = [];

  for (let index = 0; index < 8; index += 1) {
    const leftSnapshot = snapshot(leftWorld);
    const rightSnapshot = snapshot(rightWorld);
    assertNoDetection(leftSnapshot);
    assertNoDetection(rightSnapshot);
    const leftCommand = studentProgram(leftSnapshot);
    const rightCommand = studentProgram(rightSnapshot);
    leftCommands.push(leftCommand);
    rightCommands.push(rightCommand);
    model.integrateRobot(leftWorld, leftCommand, 0.1);
    model.integrateRobot(rightWorld, rightCommand, 0.1);
  }

  assert.deepStrictEqual(leftCommands, rightCommands);
  assert.deepStrictEqual(leftWorld.robot, rightWorld.robot);
  console.log("PASS: invisible target position cannot alter student motor commands or robot motion");
}

{
  const world = model.createWorldState();
  world.target.y = 90;
  const snapshots = [];
  let stopped = false;

  for (let index = 0; index < 600; index += 1) {
    const captured = snapshot(world);
    snapshots.push(captured);
    let command;

    if (!captured.exists) {
      command = { leftOutput: 8, rightOutput: 30 };
    } else if (captured.centerX < 145) {
      command = { leftOutput: 8, rightOutput: 30 };
    } else if (captured.centerX > 175) {
      command = { leftOutput: 30, rightOutput: 8 };
    } else if (captured.width < 70) {
      command = { leftOutput: 35, rightOutput: 35 };
    } else {
      command = { leftOutput: 0, rightOutput: 0 };
      stopped = true;
    }

    model.integrateRobot(world, command, 0.1);
    if (stopped) break;
  }

  const finalSnapshot = snapshots[snapshots.length - 1];
  assert.equal(stopped, true);
  assert.equal(finalSnapshot.exists, true);
  assert.ok(finalSnapshot.centerX >= 145 && finalSnapshot.centerX <= 175);
  assert.ok(finalSnapshot.width >= 70);
  assert.ok(snapshots.length > 2);
  console.log("PASS: repeated snapshots support a closed-loop center, approach, and stop program");
}

{
  const events = [];
  class FakeCustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const browserWindow = {
    drivetrain: { leftOutput: 40, rightOutput: 40 },
    dispatchEvent(event) {
      events.push(event);
    }
  };
  const context = vm.createContext({
    window: browserWindow,
    CustomEvent: FakeCustomEvent,
    console
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "simulator.js"), "utf8");
  vm.runInContext(source, context, { filename: "simulator.js" });

  const simulator = browserWindow.VisionSimulator;
  const initial = browserWindow.visionSensor;
  assert.equal(simulator.hasCapturedSnapshot(), false);
  assertNoDetection(initial);
  assert.ok(Object.isFrozen(initial));

  const captured = simulator.takeSnapshot();
  assert.notStrictEqual(browserWindow.visionSensor, initial);
  assert.strictEqual(simulator.getSnapshot(), browserWindow.visionSensor);
  assert.strictEqual(captured, browserWindow.visionSensor);
  assert.equal(simulator.hasCapturedSnapshot(), true);
  assert.equal(events.length, 1);

  simulator.step(0.1);
  simulator.step(0.1);
  assert.strictEqual(browserWindow.visionSensor, captured);
  assert.equal(events.length, 1);

  const cleared = simulator.clearSnapshot();
  assert.notStrictEqual(cleared, captured);
  assert.equal(simulator.hasCapturedSnapshot(), false);
  assertNoDetection(cleared);
  assert.equal(events.length, 2);

  simulator.takeSnapshot();
  const beforeReset = browserWindow.visionSensor;
  simulator.resetWorld();
  assert.notStrictEqual(browserWindow.visionSensor, beforeReset);
  assert.equal(simulator.hasCapturedSnapshot(), false);
  assertNoDetection(browserWindow.visionSensor);
  console.log("PASS: browser API replaces snapshots only on capture, clear, and reset—not live steps");
}
