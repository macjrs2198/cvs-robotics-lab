"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const aiVisionRoot = path.join(__dirname, "..");
const events = [];
let drivetrainStops = 0;
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
      camera: { mount: "front", height: 12 },
      startPose: "ball-default",
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
  console.log("PASS: imported scene, height, and start-pose settings are validated before application");
}

{
  const eventCount = events.length;
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "front", height: 12 },
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
      camera: { mount: "rear", height: 17.5 },
      startPose: expected.id,
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
    assert.deepEqual(JSON.parse(JSON.stringify(simulator.getSettings())), savedSettings);
    assert.deepEqual(JSON.parse(JSON.stringify(reset.camera)), { mount: "rear", height: 17.5, head: "forward" });
  });
  simulator.applySettings({
    scene: "byte-to-bite-dining-room",
    camera: { mount: "front", height: 12 },
    startPose: "table-4-north",
  });
  console.log("PASS: entrance presets face inward through apply, forward travel, camera articulation, and reset");
}

{
  const before = simulator.getWorldState();
  drivetrain.leftOutput = 37;
  drivetrain.rightOutput = 24;
  simulator.setHeadPreset("down");
  const after = simulator.getWorldState();
  assert.deepEqual(after.robot, before.robot);
  assert.equal(drivetrain.leftOutput, 37);
  assert.equal(drivetrain.rightOutput, 24);
  assert.equal(after.camera.head, "down");

  const captured = simulator.takeSnapshot("FIDUCIAL_IDS");
  assert.equal(captured.captured, true);
  assert.equal(captured.exists, true);
  assert.ok(captured.count >= 1);
  assert.equal(captured.objects.some((object) => object.id === 4), true);
  assert.equal(captured.objects.every((object) => object.type === "fiducial"), true);
  assert.equal(captured.objects.every((object) => object.confidenceSupported === false), true);
  const detectedIds = Array.from(captured.objects, (object) => object.id);
  assert.deepEqual(detectedIds, [...detectedIds].sort((a, b) => a - b));
  console.log("PASS: default 12-inch Down view captures real fiducials in VEX ID order without confidence claims");
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
    camera: { mount: "rear", height: 24 },
    startPose: "center-lane-northwest",
  });
  assert.equal(drivetrain.leftOutput, 0);
  assert.equal(drivetrain.rightOutput, 0);
  assert.equal(simulator.hasCapturedSnapshot(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(applied)), {
    scene: "byte-to-bite-dining-room",
    camera: { mount: "rear", height: 24 },
    startPose: "center-lane-northwest",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(applied.camera, "head"), false);
  console.log("PASS: persistent settings omit head/motors/detections and setup changes clear transient state");
}

{
  simulator.applySettings({});
  const projection = simulator.resetWorld();
  assert.ok(projection.detection);
  assert.equal(simulator.getSettings().scene, "ball");
  assert.equal(simulator.takeSnapshot().type, "target");
  console.log("PASS: old empty settings safely restore the unchanged ball sandbox");
}

console.log("All Dining Room controller integration tests passed.");
