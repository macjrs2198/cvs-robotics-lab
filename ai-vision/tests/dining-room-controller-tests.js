"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const aiVisionRoot = path.join(__dirname, "..");
const controllerSource = fs.readFileSync(path.join(aiVisionRoot, "dining-room-controller.js"), "utf8");
const events = [];
let drivetrainStops = 0;
let programStopped = true;
let programPaused = false;
const DEFAULT_PRACTICE_OBSTRUCTIONS = Object.freeze({
  fruitClutter: false,
  roamingRobot: false,
  seed: 0x43565331,
  fruit: Object.freeze([]),
  roamingStart: null,
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultPracticeObstructions() {
  return plain(DEFAULT_PRACTICE_OBSTRUCTIONS);
}
const drivetrain = {
  driveSpeed: 50,
  turnSpeed: 30,
  leftOutput: 0,
  rightOutput: 0,
  action: "stopped",
};

class FakeCustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options && options.detail;
  }
}

const browserWindow = {
  drivetrain,
  cvsProgramControl: {
    isStopped() {
      return programStopped;
    },
    isPaused() {
      return programPaused;
    },
    isRunning() {
      return !programStopped && !programPaused;
    },
  },
  dispatchEvent(event) {
    events.push(event);
  },
  Drivetrain: {
    stop() {
      drivetrainStops += 1;
      drivetrain.leftOutput = 0;
      drivetrain.rightOutput = 0;
      drivetrain.action = "stopped";
    },
  },
};
const context = vm.createContext({
  window: browserWindow,
  CustomEvent: FakeCustomEvent,
  console,
});

function runSource(filename) {
  vm.runInContext(
    fs.readFileSync(path.join(aiVisionRoot, filename), "utf8"),
    context,
    { filename },
  );
}

runSource("dining-room-model.js");
runSource("simulator.js");
runSource("dining-room-controller.js");

const simulator = browserWindow.VisionSimulator;

{
  assert.deepEqual(
    JSON.parse(JSON.stringify(simulator.getSettings())),
    {
      scene: "ball",
      camera: { mount: "front", height: 12, head: "forward" },
      chassis: { length: 18, width: 18 },
      startPose: "ball-default",
      diningStartPose: "table-4-north",
      practiceObstructions: defaultPracticeObstructions(),
    },
  );
  const target = simulator.takeSnapshot("TARGET");
  assert.equal(target.exists, true);
  assert.equal(target.count, 1);
  assert.equal(target.type, "target");
  assert.equal(target.id, 1);
  assert.equal(target.confidenceSupported, true);
  console.log("PASS: two-scene controller preserves the original target snapshot by default");
}

{
  assert.throws(() => simulator.normalizeSettings({ scene: "unknown" }), /Unsupported AI Vision scene/);
  assert.throws(
    () => simulator.normalizeSettings({ scene: "byte-to-bite-dining-room", camera: { height: 12.3 } }),
    /0.5-inch increments/,
  );
  assert.throws(
    () => simulator.normalizeSettings({ scene: "byte-to-bite-dining-room", startPose: "inside-table" }),
    /Unsupported Dining Room start pose/,
  );
  assert.throws(
    () => simulator.normalizeSettings({ scene: "byte-to-bite-dining-room", camera: { head: "down30" } }),
    /Unsupported camera head preset/,
  );
  assert.throws(
    () => simulator.normalizeSettings({ scene: "byte-to-bite-dining-room", chassis: { length: 5.5, width: 18 } }),
    /Length must be 6.*36 inches/,
  );
  assert.throws(
    () => simulator.normalizeSettings({ scene: "byte-to-bite-dining-room", chassis: { length: 18, width: 18.25 } }),
    /Width must use 0.5-inch increments/,
  );
  assert.throws(
    () => simulator.normalizeSettings({
      scene: "byte-to-bite-dining-room",
      startPose: "table-4-north",
      chassis: { length: 36, width: 36 },
    }),
    /does not fit.*Choose another start or smaller dimensions/,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(simulator.normalizeSettings({
      scene: "byte-to-bite-dining-room",
      chassis: { length: 18.0000005, width: 17.9999995 },
      startPose: "table-4-north",
    }).chassis)),
    { length: 18, width: 18 },
    "accepted floating-point tolerance must canonicalize to the model's exact half-inch dimensions",
  );
  console.log("PASS: imported scene, camera, chassis, and start-pose settings are validated together before application");
}

{
  const eventCount = events.length;
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "front", height: 12, head: "forward" },
    chassis: { length: 18, width: 18 },
    startPose: "table-4-north",
  });
  assert.equal(drivetrainStops, 1);
  assert.equal(events.slice(eventCount).some((event) => event.type === "visionsettingschange"), true);
  assert.equal(simulator.hasCapturedSnapshot(), false);
  assert.equal(simulator.getWorldState().blocked, false);
  console.log("PASS: applying Dining Room setup stops motion, clears capture, and selects a verified pose");
}

{
  const entranceCases = [
    { id: "top-opening-right", robot: { x: 54, y: 48, heading: -Math.PI / 2 } },
    { id: "bottom-opening-left", robot: { x: -54, y: -48, heading: Math.PI / 2 } },
  ];

  entranceCases.forEach((expected) => {
    const savedSettings = {
      scene: "byte-to-bite-dining-room",
      camera: { mount: "rear", height: 17.5, head: "forward" },
      chassis: { length: 18, width: 18 },
      startPose: expected.id,
      diningStartPose: expected.id,
      practiceObstructions: defaultPracticeObstructions(),
    };
    assert.deepEqual(JSON.parse(JSON.stringify(simulator.applySettings(savedSettings))), savedSettings);

    const started = simulator.getWorldState();
    assert.deepEqual(JSON.parse(JSON.stringify(started.robot)), expected.robot);
    assert.deepEqual(JSON.parse(JSON.stringify(started.camera)), { mount: "rear", height: 17.5, head: "forward" });
    assert.equal(started.blocked, false);

    simulator.setHeadPreset("down");
    const articulated = simulator.getWorldState();
    assert.deepEqual(JSON.parse(JSON.stringify(articulated.robot)), expected.robot, "camera articulation must not rotate the chassis");
    assert.deepEqual(JSON.parse(JSON.stringify(articulated.camera)), { mount: "rear", height: 17.5, head: "down" });

    drivetrain.leftOutput = 20;
    drivetrain.rightOutput = 20;
    simulator.step(0.25);
    const driven = simulator.getWorldState();
    assert.equal(driven.blocked, false);
    assert.ok(Math.abs(driven.robot.y) < Math.abs(expected.robot.y), `${expected.id} must drive farther into the room`);
    assert.equal(driven.robot.heading, expected.robot.heading);
    assert.deepEqual(JSON.parse(JSON.stringify(driven.camera)), { mount: "rear", height: 17.5, head: "down" });

    simulator.resetWorld();
    const reset = simulator.getWorldState();
    assert.deepEqual(JSON.parse(JSON.stringify(reset.robot)), expected.robot);
    assert.deepEqual(JSON.parse(JSON.stringify(simulator.getSettings())), {
      ...savedSettings,
      camera: { ...savedSettings.camera, head: "down" },
    });
    assert.deepEqual(JSON.parse(JSON.stringify(reset.camera)), { mount: "rear", height: 17.5, head: "down" });
  });
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "front", height: 12, head: "forward" },
    chassis: { length: 18, width: 18 },
    startPose: "table-4-north",
  });
  console.log("PASS: entrance presets face inward through apply, forward travel, camera articulation, and reset");
}

{
  const before = simulator.getWorldState();
  drivetrain.leftOutput = 37;
  drivetrain.rightOutput = 24;
  const settingsEventsBeforeHead = events.filter((event) => event.type === "visionsettingschange").length;
  const stopsBeforeHead = drivetrainStops;
  const directions = [];
  [
    ["forward", 0],
    ["down45", 45],
    ["down", 60],
  ].forEach(([head, expectedPitch]) => {
    simulator.setHeadPreset(head);
    const after = simulator.getWorldState();
    assert.deepEqual(after.robot, before.robot);
    assert.equal(drivetrain.leftOutput, 37);
    assert.equal(drivetrain.rightOutput, 24);
    assert.equal(after.camera.head, head);
    assert.equal(simulator.getSettings().camera.head, head);
    assert.equal(simulator.getLiveProjection().camera.pitchDegrees, expectedPitch);
    directions.push(JSON.stringify(simulator.getLiveProjection().camera.forward));
  });
  assert.equal(new Set(directions).size, 3);
  assert.equal(drivetrainStops, stopsBeforeHead);
  assert.equal(events.filter((event) => event.type === "visionsettingschange").length, settingsEventsBeforeHead);

  const captured = simulator.takeSnapshot("FIDUCIAL_IDS");
  assert.equal(captured.captured, true);
  assert.equal(captured.exists, true);
  assert.ok(captured.count >= 1);
  assert.equal(captured.objects.some((object) => object.id === 4), true);
  assert.equal(captured.objects.every((object) => object.type === "fiducial"), true);
  assert.equal(captured.objects.every((object) => object.confidenceSupported === false), true);
  const detectedIds = Array.from(captured.objects, (object) => object.id);
  assert.deepEqual(detectedIds, [...detectedIds].sort((a, b) => a - b));
  console.log("PASS: all three head angles share the real projection without changing chassis, motors, or setup events");
}

{
  const frozenCapture = simulator.getSnapshot();
  const recordedObjects = JSON.stringify(frozenCapture.objects);
  simulator.setHeadPreset("forward");
  assert.equal(JSON.stringify(simulator.getSnapshot().objects), recordedObjects);
  assert.equal(simulator.getSnapshot().captured, true);

  const outOfRange = simulator.setSnapshotObjectItem(999);
  assert.equal(outOfRange.exists, true, "Object Exists describes the captured dataset");
  assert.equal(outOfRange.selectedExists, false);
  assert.equal(outOfRange.id, -1);
  assert.equal(outOfRange.centerX, 0);
  assert.strictEqual(outOfRange.objects, frozenCapture.objects);
  console.log("PASS: head movement and 1-based selection never mutate the immutable captured dataset");
}

{
  const wrongSignature = simulator.takeSnapshot("TARGET");
  assert.equal(wrongSignature.captured, true);
  assert.equal(wrongSignature.exists, false);
  assert.equal(wrongSignature.count, 0);
  assert.equal(wrongSignature.id, -1);
  console.log("PASS: snapshot signature filtering cannot leak Dining Room fiducials into Target mode");
}

{
  simulator.setHeadPreset("down");
  drivetrain.leftOutput = 100;
  drivetrain.rightOutput = 100;
  simulator.step(1);
  const blocked = simulator.getWorldState();
  assert.equal(blocked.blocked, true);
  assert.equal(drivetrain.leftOutput, 100);
  assert.equal(drivetrain.rightOutput, 100);

  drivetrain.leftOutput = -100;
  drivetrain.rightOutput = -100;
  simulator.step(0.05);
  const retreated = simulator.getWorldState();
  assert.equal(retreated.blocked, false);
  assert.equal(drivetrain.leftOutput, -100);
  assert.equal(drivetrain.rightOutput, -100);
  console.log("PASS: physical collision is distinct from motor state and a reverse command can retreat");
}

{
  simulator.takeSnapshot("FIDUCIAL_IDS");
  drivetrain.leftOutput = 40;
  drivetrain.rightOutput = 40;
  const applied = simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "rear", height: 24, head: "down45" },
    chassis: { length: 18, width: 18 },
    startPose: "center-lane-northwest",
    diningStartPose: "center-lane-northwest",
    practiceObstructions: defaultPracticeObstructions(),
  });
  assert.equal(drivetrain.leftOutput, 0);
  assert.equal(drivetrain.rightOutput, 0);
  assert.equal(simulator.hasCapturedSnapshot(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(applied)), {
    scene: "byte-to-bite-dining-room",
    camera: { mount: "rear", height: 24, head: "down45" },
    chassis: { length: 18, width: 18 },
    startPose: "center-lane-northwest",
    diningStartPose: "center-lane-northwest",
    practiceObstructions: defaultPracticeObstructions(),
  });
  assert.equal(Object.prototype.hasOwnProperty.call(applied, "motors"), false);
  console.log("PASS: persistent settings include chassis/head but omit runtime motors/detections and setup changes clear transient state");
}

{
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "left", height: 14, head: "down45" },
    chassis: { length: 18, width: 18 },
    startPose: "top-opening-right",
  });
  simulator.takeSnapshot("FIDUCIAL_IDS");
  const beforeSettings = JSON.stringify(simulator.getSettings());
  const beforeWorld = JSON.stringify(simulator.getWorldState());
  const beforeSnapshot = simulator.getSnapshot();
  const stopsBefore = drivetrainStops;
  const eventsBefore = events.length;
  assert.throws(() => simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "front", height: 12, head: "forward" },
    chassis: { length: 36, width: 36 },
    startPose: "table-4-north",
  }), /does not fit/);
  assert.equal(JSON.stringify(simulator.getSettings()), beforeSettings);
  assert.equal(JSON.stringify(simulator.getWorldState()), beforeWorld);
  assert.strictEqual(simulator.getSnapshot(), beforeSnapshot);
  assert.equal(drivetrainStops, stopsBefore);
  assert.equal(events.length, eventsBefore);

  programStopped = false;
  assert.throws(() => simulator.applySettings({
    ...simulator.getSettings(),
    chassis: { length: 12, width: 12 },
  }), /Stop the program before changing chassis dimensions/);
  programStopped = true;
  assert.equal(JSON.stringify(simulator.getSettings()), beforeSettings);
  assert.equal(JSON.stringify(simulator.getWorldState()), beforeWorld);
  assert.strictEqual(simulator.getSnapshot(), beforeSnapshot);
  console.log("PASS: invalid and running chassis changes are atomic and preserve setup, world, snapshot, and work");
}

{
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "right", height: 13.5, head: "down45" },
    chassis: { length: 30, width: 12 },
    startPose: "center-lane-northwest",
  });
  const diningSetup = simulator.getSettings();
  assert.equal(diningSetup.diningStartPose, "center-lane-northwest");

  simulator.applySettings({
    ...diningSetup,
    scene: "ball",
    startPose: "ball-default",
  });
  const ballSetup = simulator.getSettings();
  assert.equal(ballSetup.diningStartPose, "center-lane-northwest");

  simulator.applySettings({
    ...ballSetup,
    scene: "byte-to-bite-dining-room",
    startPose: ballSetup.diningStartPose,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(simulator.getWorldState().chassis)), { length: 30, width: 12 });
  assert.equal(simulator.getWorldState().startPoseId, "center-lane-northwest");
  console.log("PASS: scene toggles preserve a valid Dining start for a nondefault chassis");
}

{
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "front", height: 12, head: "forward" },
    chassis: { length: 18, width: 18 },
    startPose: "center-lane-northwest",
  });
  assert.equal(simulator.getLiveProjection().obstructions.length, 0);

  const fruitOnly = simulator.setPracticeObstructions({ fruitClutter: true, roamingRobot: false });
  assert.equal(fruitOnly.practiceObstructions.fruitClutter, true);
  assert.equal(fruitOnly.practiceObstructions.roamingRobot, false);
  assert.equal(fruitOnly.practiceObstructions.fruit.length, 4);
  assert.equal(fruitOnly.practiceObstructions.roamingStart, null);
  assert.equal(simulator.getLiveProjection().obstructions.length, 4);

  const roamingOnly = simulator.setPracticeObstructions({ fruitClutter: false, roamingRobot: true });
  assert.equal(roamingOnly.practiceObstructions.fruit.length, 0);
  assert.ok(roamingOnly.practiceObstructions.roamingStart);
  assert.deepEqual(
    plain(simulator.getLiveProjection().obstructions.map((item) => item.kind)),
    ["roaming-robot"],
  );

  const both = simulator.setPracticeObstructions({ fruitClutter: true, roamingRobot: true });
  assert.equal(both.practiceObstructions.fruit.length, 4);
  assert.ok(both.practiceObstructions.roamingStart);
  assert.equal(simulator.getLiveProjection().obstructions.length, 5);

  const externalCopy = simulator.getSettings();
  externalCopy.practiceObstructions.fruit[0].x = 9999;
  externalCopy.practiceObstructions.roamingStart.x = 9999;
  assert.notEqual(simulator.getSettings().practiceObstructions.fruit[0].x, 9999);
  assert.notEqual(simulator.getSettings().practiceObstructions.roamingStart.x, 9999);
  console.log("PASS: practice options are independent, default-clean, and deeply copied from persistent settings");
}

{
  const initialSettings = simulator.getSettings();
  const initialObstructions = plain(simulator.getLiveProjection().obstructions);
  const captured = simulator.takeSnapshot("FIDUCIAL_IDS");
  const capturedObjects = JSON.stringify(captured.objects);
  const initialRoaming = initialObstructions.find((item) => item.kind === "roaming-robot");

  programStopped = false;
  programPaused = false;
  for (let index = 0; index < 20; index += 1) simulator.step(0.05);
  const movingRoaming = plain(simulator.getLiveProjection().obstructions)
    .find((item) => item.kind === "roaming-robot");
  assert.notDeepEqual(
    { x: movingRoaming.x, y: movingRoaming.y, heading: movingRoaming.heading },
    { x: initialRoaming.x, y: initialRoaming.y, heading: initialRoaming.heading },
  );
  assert.strictEqual(simulator.getSnapshot(), captured);
  assert.equal(JSON.stringify(simulator.getSnapshot().objects), capturedObjects);

  programPaused = true;
  const pausedRoaming = plain(movingRoaming);
  for (let index = 0; index < 20; index += 1) simulator.step(0.05);
  assert.deepEqual(
    plain(simulator.getLiveProjection().obstructions).find((item) => item.kind === "roaming-robot"),
    pausedRoaming,
  );

  programPaused = false;
  simulator.step(0.05);
  programStopped = true;
  const stoppedRoaming = plain(simulator.getLiveProjection().obstructions)
    .find((item) => item.kind === "roaming-robot");
  for (let index = 0; index < 20; index += 1) simulator.step(0.05);
  assert.deepEqual(
    plain(simulator.getLiveProjection().obstructions).find((item) => item.kind === "roaming-robot"),
    stoppedRoaming,
  );

  simulator.resetWorld();
  assert.deepEqual(plain(simulator.getLiveProjection().obstructions), initialObstructions);
  assert.deepEqual(plain(simulator.getSettings()), plain(initialSettings));
  assert.equal(simulator.hasCapturedSnapshot(), false);

  const randomized = simulator.randomizePracticeObstructions();
  assert.notEqual(randomized.practiceObstructions.seed, initialSettings.practiceObstructions.seed);
  assert.notDeepEqual(plain(simulator.getLiveProjection().obstructions), initialObstructions);
  const randomizedInitial = plain(simulator.getLiveProjection().obstructions);
  simulator.step(0.05);
  simulator.resetWorld();
  assert.deepEqual(plain(simulator.getLiveProjection().obstructions), randomizedInitial);
  console.log("PASS: roaming follows run/pause/stop state; snapshots stay historical; Randomize changes and Reset repeats the scenario");
}

{
  simulator.takeSnapshot("FIDUCIAL_IDS");
  const beforeSettings = plain(simulator.getSettings());
  const beforeObstructions = plain(simulator.getLiveProjection().obstructions);
  const beforeSnapshot = simulator.getSnapshot();
  const eventCount = events.length;
  const stopCount = drivetrainStops;
  programStopped = false;
  assert.throws(
    () => simulator.setPracticeObstructions({ fruitClutter: false, roamingRobot: false }),
    /Stop the program before changing practice obstructions/,
  );
  assert.throws(
    () => simulator.randomizePracticeObstructions(),
    /Stop the program before randomizing practice obstructions/,
  );
  programStopped = true;
  assert.deepEqual(plain(simulator.getSettings()), beforeSettings);
  assert.deepEqual(plain(simulator.getLiveProjection().obstructions), beforeObstructions);
  assert.strictEqual(simulator.getSnapshot(), beforeSnapshot);
  assert.equal(events.length, eventCount);
  assert.equal(drivetrainStops, stopCount);
  console.log("PASS: running practice-control changes are rejected atomically without stopping work or replacing snapshots");
}

{
  assert.match(controllerSource, /diningProjection\.obstructions\.forEach/);
  assert.match(controllerSource, /layout\.obstructions\.forEach/);
  assert.match(controllerSource, /function obstructionCountDescription[\s\S]*?fruit prop[\s\S]*?roaming robot/);
  assert.match(controllerSource, /Live projected Dining Room camera[\s\S]*?obstructionCountDescription\(diningProjection\.obstructions\)/);
  assert.match(controllerSource, /Dining Room debug World View[\s\S]*?obstructionCountDescription\(layout\.obstructions\)/);
  console.log("PASS: both canvases render modeled obstructions and expose concise obstruction counts");
}

{
  simulator.applySettings({});
  const projection = simulator.resetWorld();
  assert.ok(projection.detection);
  assert.equal(simulator.getSettings().scene, "ball");
  assert.deepEqual(JSON.parse(JSON.stringify(simulator.getSettings())), {
    scene: "ball",
      camera: { mount: "front", height: 12, head: "forward" },
      chassis: { length: 18, width: 18 },
      startPose: "ball-default",
      diningStartPose: "table-4-north",
      practiceObstructions: defaultPracticeObstructions(),
  });
  assert.equal(simulator.takeSnapshot().type, "target");
  console.log("PASS: old empty settings safely restore the unchanged ball sandbox");
}

console.log("All Dining Room controller integration tests passed.");
