"use strict";

const assert = require("assert");
const model = require("../dining-room-model.js");

function nearlyEqual(actual, expected, tolerance = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`
  );
}

function assertVector(vector, expected, tolerance = 0.000001) {
  nearlyEqual(vector.x, expected.x, tolerance);
  nearlyEqual(vector.y, expected.y, tolerance);
  nearlyEqual(vector.z, expected.z, tolerance);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stateAt(robot, camera, chassis) {
  const state = {
    sceneId: model.SCENE_ID,
    startPoseId: model.config.defaultStartPoseId,
    robot: { ...robot },
    camera: {
      mount: "front",
      height: 12,
      head: "forward",
      ...(camera || {})
    }
  };
  if (chassis) state.chassis = { ...chassis };
  return state;
}

function boundsOf(points) {
  return {
    minimumX: Math.min(...points.map((point) => point.x)),
    maximumX: Math.max(...points.map((point) => point.x)),
    minimumY: Math.min(...points.map((point) => point.y)),
    maximumY: Math.max(...points.map((point) => point.y))
  };
}

function projectionFor(sceneProjection, id) {
  const result = sceneProjection.markers.find((candidate) => candidate.id === id);
  assert.ok(result, `expected projected marker ${id}`);
  return result;
}

{
  assert.equal(model.SCENE_ID, "byte-to-bite-dining-room");
  assert.equal(model.scene.id, model.SCENE_ID);
  assert.equal(model.scene.units, "inches");
  assert.ok(model.scene.coordinateFrame.y.includes("Blue/Red"));
  assert.equal(model.config.sensorWidth, 320);
  assert.equal(model.config.sensorHeight, 240);
  assert.equal(model.config.cameraHorizontalFovDegrees, 60);
  assert.equal(model.config.cameraDown45PitchDegrees, 45);
  assert.equal(model.config.cameraDownPitchDegrees, 60);
  assert.equal(model.config.robotDefaultLength, 18);
  assert.equal(model.config.robotDefaultWidth, 18);
  assert.equal(model.config.robotDimensionMin, 6);
  assert.equal(model.config.robotDimensionMax, 36);
  assert.equal(model.config.robotDimensionStep, 0.5);
  assert.equal(model.config.robotSide, 18);
  assert.equal(model.config.robotCornerRadius, 2);
  assert.equal(model.config.robotTopZ, 4.5);
  assert.equal(model.config.tableTopZ, 3.625);
  assert.equal(model.config.tableMarkerPlaneZ, 3.6281);
  nearlyEqual(model.config.patternSide, 550 / 72, 0.0000001);
  assert.equal(model.config.paperSide, 8.5);
  assert.notEqual(model.config.patternSide, model.config.paperSide);
  assert.ok(Object.isFrozen(model.scene));
  assert.ok(Object.isFrozen(model.scene.fiducials));
  assert.ok(Object.isFrozen(model.scene.fiducials[0].corners));
  assert.deepEqual(model.normalizeChassis(), { length: 18, width: 18 });
  assert.deepEqual(model.normalizeChassis({ chassis: { length: 29.74, width: 12.26 } }), { length: 29.5, width: 12.5 });
  assert.deepEqual(model.normalizeChassis({ length: 0, width: 99 }), { length: 6, width: 36 });
  console.log("PASS: centralized scene, robot, camera, and pattern constants are dimensioned and immutable");
}

{
  const expectedTableCenters = [
    [-36, 36], [0, 36], [36, 36],
    [-36, 0], [0, 0], [36, 0],
    [-36, -36], [0, -36], [36, -36]
  ];
  assert.equal(model.scene.tables.length, 9);
  model.scene.tables.forEach((table, id) => {
    assert.equal(table.markerId, id);
    assert.deepEqual([table.center.x, table.center.y], expectedTableCenters[id]);
    assert.equal(table.width, 12);
    assert.equal(table.depth, 12);
    assert.equal(table.topZ, 3.625);
  });

  assert.deepEqual(model.scene.fiducials.map((marker) => marker.id), Array.from({ length: 21 }, (_, id) => id));
  model.scene.fiducials.slice(0, 9).forEach((marker, id) => {
    assert.equal(marker.surface, "table");
    assert.equal(marker.ownerId, `table-${id}`);
    assert.deepEqual([marker.center.x, marker.center.y], expectedTableCenters[id]);
    assert.equal(marker.center.z, 3.6281);
    assertVector(marker.normal, { x: 0, y: 0, z: 1 });
    assertVector(marker.up, { x: 0, y: 1, z: 0 });
    assertVector(marker.right, { x: 1, y: 0, z: 0 });
  });
  console.log("PASS: table grid and fiducial IDs 0–8 are row-major from map top to bottom");
}

{
  const expectedWalls = [
    ["wall-top", -42, 66, 42, 66],
    ["wall-right", 66, 69.625, 66, -69.625],
    ["wall-bottom", 42, -66, -42, -66],
    ["wall-left", -66, -69.625, -66, 69.625]
  ];
  model.scene.walls.forEach((candidate, index) => {
    const expected = expectedWalls[index];
    assert.deepEqual(
      [candidate.id, candidate.start.x, candidate.start.y, candidate.end.x, candidate.end.y],
      expected
    );
    assert.equal(candidate.height, 18);
    assert.equal(candidate.kind, "competition-wall");
  });

  const expectedMarkers = {
    9: [-18, 65.9969, 9, 0, -1],
    10: [18, 65.9969, 9, 0, -1],
    11: [65.9969, 54, 9, -1, 0],
    12: [65.9969, 18, 9, -1, 0],
    13: [65.9969, -18, 9, -1, 0],
    14: [65.9969, -54, 9, -1, 0],
    15: [18, -65.9969, 9, 0, 1],
    16: [-18, -65.9969, 9, 0, 1],
    17: [-65.9969, -54, 9, 1, 0],
    18: [-65.9969, -18, 9, 1, 0],
    19: [-65.9969, 18, 9, 1, 0],
    20: [-65.9969, 54, 9, 1, 0]
  };
  Object.entries(expectedMarkers).forEach(([idText, expected]) => {
    const marker = model.scene.fiducials[Number(idText)];
    assert.deepEqual(
      [marker.center.x, marker.center.y, marker.center.z, marker.normal.x, marker.normal.y],
      expected
    );
    assertVector(marker.up, { x: 0, y: 0, z: 1 });
    const expectedRight = {
      x: marker.up.y * marker.normal.z - marker.up.z * marker.normal.y,
      y: marker.up.z * marker.normal.x - marker.up.x * marker.normal.z,
      z: marker.up.x * marker.normal.y - marker.up.y * marker.normal.x
    };
    assertVector(marker.right, expectedRight);
  });
  console.log("PASS: finite wall segments, openings, wall IDs, inward faces, and numbered-top orientation match the contract");
}

{
  const state = model.createState();
  assert.equal(state.startPoseId, "table-4-north");
  assert.deepEqual(state.robot, { x: 0, y: 16, heading: -Math.PI / 2 });
  assert.deepEqual(state.chassis, { length: 18, width: 18 });
  assert.deepEqual(state.camera, { mount: "front", height: 12, head: "forward" });
  assert.ok(model.startPoses.length >= 5);
  assert.equal(new Set(model.startPoses.map((pose) => pose.id)).size, model.startPoses.length);
  model.startPoses.forEach((pose) => assert.ok(model.isPoseValid(pose), `${pose.id} must be collision-free`));

  const entranceCases = [
    { id: "top-opening-right", label: "Top-right opening", robot: { x: 54, y: 48, heading: -Math.PI / 2 } },
    { id: "bottom-opening-left", label: "Bottom-left opening", robot: { x: -54, y: -48, heading: Math.PI / 2 } }
  ];
  entranceCases.forEach((expected) => {
    const preset = model.startPoses.find((candidate) => candidate.id === expected.id);
    assert.deepEqual(preset, { id: expected.id, label: expected.label, ...expected.robot });
    const before = clone(state);
    const moved = model.applyStartPose(state, expected.id);
    assert.deepEqual(state, before);
    assert.equal(moved.startPoseId, expected.id);
    assert.deepEqual(moved.robot, expected.robot);
    assert.deepEqual(moved.chassis, state.chassis, "applying an entrance preset must preserve chassis dimensions");
    assert.deepEqual(moved.camera, state.camera, "applying an entrance preset must not change camera configuration");
    assert.ok(model.isPoseValid(moved.robot));

    const forward = model.integrateRobot(moved.robot, { leftOutput: 20, rightOutput: 20 }, 0.25);
    assert.equal(forward.blocked, false);
    nearlyEqual(forward.pose.x, expected.robot.x);
    assert.ok(Math.abs(forward.pose.y) < Math.abs(expected.robot.y), `${expected.id} must drive farther into the room`);
    nearlyEqual(forward.pose.heading, expected.robot.heading);
  });

  assert.deepEqual(
    model.normalizeCameraSettings({ mount: "bogus", height: 2, head: "bogus" }),
    { mount: "front", height: 5.5, head: "forward" }
  );
  assert.deepEqual(
    model.normalizeCameraSettings({ mount: "rear", height: 23.76, head: "down" }),
    { mount: "rear", height: 24, head: "down" }
  );
  assert.deepEqual(
    model.normalizeCameraSettings({ mount: "left", height: 12, head: "down45" }),
    { mount: "left", height: 12, head: "down45" }
  );
  console.log("PASS: fixed start-pose selection, inward entrance travel, and camera settings are deterministic and non-mutating");
}

{
  const footprint = model.getRobotFootprint({ x: 0, y: 0, heading: 0 });
  assert.ok(footprint.length >= 32);
  nearlyEqual(Math.max(...footprint.map((point) => point.x)), 9);
  nearlyEqual(Math.min(...footprint.map((point) => point.x)), -9);
  nearlyEqual(Math.max(...footprint.map((point) => point.y)), 9);
  nearlyEqual(Math.min(...footprint.map((point) => point.y)), -9);
  assert.equal(footprint.some((point) => Math.abs(point.x - 9) < 0.000001 && Math.abs(point.y - 9) < 0.000001), false);

  assert.ok(model.isPoseValid({ x: -18, y: 0, heading: 0 }), "18-inch robot must fit a 24-inch lane");
  assert.ok(model.isPoseValid({ x: 54, y: 66, heading: Math.PI / 2 }), "top-right 24-inch opening must remain open");
  assert.ok(model.isPoseValid({ x: -54, y: -66, heading: -Math.PI / 2 }), "bottom-left 24-inch opening must remain open");
  assert.equal(model.isPoseValid({ x: 0, y: 0, heading: 0 }), false, "table footprints are solid");
  assert.equal(model.isPoseValid({ x: 0, y: 57, heading: 0 }), false, "top wall panel blocks the full footprint");
  assert.equal(model.isPoseValid({ x: 57, y: 0, heading: 0 }), false, "right wall panel blocks the full footprint");
  assert.equal(model.isPoseValid({ x: 82, y: 0, heading: 0 }), false, "outer boundary is a distinct full-footprint limit");
  assert.ok(model.isPoseValid({ x: 16, y: 0, heading: 0 }));
  assert.equal(model.isPoseValid({ x: 16, y: 0, heading: Math.PI / 4 }), false, "rotation uses the oriented rounded footprint");
  console.log("PASS: rounded full-footprint collision preserves real openings, table solids, walls, and the outer boundary");
}

{
  const defaultState = model.createState();
  const poseOnlyFootprint = model.getRobotFootprint(defaultState.robot);
  assert.deepEqual(model.getRobotFootprint(defaultState), poseOnlyFootprint, "pose-only calls must retain 18 × 18 geometry");
  assert.deepEqual(
    model.getCameraPose(defaultState.robot, defaultState.camera),
    model.getCameraPose(defaultState),
    "pose-only camera calls must retain the default 18-inch edge offset"
  );

  const longState = stateAt(
    { x: 20, y: 0, heading: 0 },
    { mount: "front", height: 12, head: "forward" },
    { length: 30, width: 12 }
  );
  const wideState = stateAt(
    { x: 20, y: 0, heading: 0 },
    { mount: "front", height: 12, head: "forward" },
    { length: 12, width: 30 }
  );
  const longBounds = boundsOf(model.getRobotFootprint(longState));
  const wideBounds = boundsOf(model.getRobotFootprint(wideState));
  nearlyEqual(longBounds.maximumX - longBounds.minimumX, 30);
  nearlyEqual(longBounds.maximumY - longBounds.minimumY, 12);
  nearlyEqual(wideBounds.maximumX - wideBounds.minimumX, 12);
  nearlyEqual(wideBounds.maximumY - wideBounds.minimumY, 30);

  const rotatedLong = { ...longState, robot: { ...longState.robot, heading: Math.PI / 2 } };
  const rotatedWide = { ...wideState, robot: { ...wideState.robot, heading: Math.PI / 2 } };
  const rotatedLongBounds = boundsOf(model.getRobotFootprint(rotatedLong));
  nearlyEqual(rotatedLongBounds.maximumX - rotatedLongBounds.minimumX, 12);
  nearlyEqual(rotatedLongBounds.maximumY - rotatedLongBounds.minimumY, 30);
  assert.deepEqual(rotatedLong.chassis, { length: 30, width: 12 }, "rotation must not swap stored robot-local dimensions");

  assert.deepEqual(model.collisionForPose(longState), { kind: "table", id: "table-4" });
  assert.equal(model.isPoseValid(longState), false);
  assert.equal(model.isPoseValid(rotatedLong), true);
  assert.equal(model.isPoseValid(wideState), true);
  assert.deepEqual(model.collisionForPose(rotatedWide), { kind: "table", id: "table-4" });
  assert.equal(model.isPoseValid(rotatedWide), false);

  const longLayout = model.layoutWorldView({
    ...rotatedLong,
    robot: { x: -18, y: 18, heading: -Math.PI / 2 }
  });
  const wideLayout = model.layoutWorldView({
    ...wideState,
    robot: { x: 0, y: 16, heading: -Math.PI / 2 }
  });
  const longLayoutBounds = boundsOf(longLayout.robot.footprint);
  const wideLayoutBounds = boundsOf(wideLayout.robot.footprint);
  assert.deepEqual(
    { length: longLayout.robot.length, width: longLayout.robot.width },
    { length: 30, width: 12 }
  );
  assert.deepEqual(
    { length: wideLayout.robot.length, width: wideLayout.robot.width },
    { length: 12, width: 30 }
  );
  nearlyEqual(longLayoutBounds.maximumX - longLayoutBounds.minimumX, 12 * longLayout.scale);
  nearlyEqual(longLayoutBounds.maximumY - longLayoutBounds.minimumY, 30 * longLayout.scale);
  nearlyEqual(wideLayoutBounds.maximumX - wideLayoutBounds.minimumX, 30 * wideLayout.scale);
  nearlyEqual(wideLayoutBounds.maximumY - wideLayoutBounds.minimumY, 12 * wideLayout.scale);
  console.log("PASS: 30 × 12 and 12 × 30 chassis footprints stay robot-local and collide as rotated rounded rectangles");
}

{
  const validState = model.createState({
    startPoseId: "center-lane-northwest",
    chassis: { length: 30, width: 12 },
    camera: { mount: "rear", height: 17.5, head: "down45" }
  });
  assert.equal(model.isPoseValid(validState), true);
  const moved = model.applyStartPose(validState, "top-opening-right");
  assert.deepEqual(moved.chassis, { length: 30, width: 12 });
  assert.deepEqual(moved.robot, { x: 54, y: 48, heading: -Math.PI / 2 });
  assert.deepEqual(moved.camera, validState.camera);
  assert.equal(model.isPoseValid(moved), true);

  const incompatible = model.createState({ chassis: { length: 12, width: 30 } });
  const before = clone(incompatible);
  assert.throws(
    () => model.applyStartPose(incompatible, "top-opening-right"),
    /does not fit the 12 × 30-inch chassis/
  );
  assert.deepEqual(incompatible, before, "a rejected starting pose must not mutate the prior valid state");
  assert.throws(
    () => model.createState({
      startPoseId: "top-opening-right",
      chassis: { length: 6, width: 24 },
    }),
    /does not fit the 6 × 24-inch chassis/,
    "state construction must reject the same incompatible selected start as later start application",
  );
  console.log("PASS: resized start application preserves chassis/camera and rejects an overlapping preset without mutation");
}

{
  assert.deepEqual(
    model.collisionForPose({ x: NaN, y: 20, heading: 0 }),
    { kind: "invalid-pose" },
  );
  assert.deepEqual(
    model.collisionForPose({ robot: { x: 20, y: undefined, heading: 0 }, chassis: { length: 18, width: 18 } }),
    { kind: "invalid-pose" },
  );
  assert.equal(model.isPoseValid({ x: NaN, y: 20, heading: 0 }), false);
  console.log("PASS: invalid raw poses are rejected before normalization can sanitize them");
}

{
  const drivetrain = Object.freeze({ leftOutput: 20, rightOutput: 20 });
  const start = { x: -18, y: 18, heading: -Math.PI / 2 };
  const result = model.integrateRobot(start, drivetrain, 1);
  assert.equal(result.blocked, false);
  nearlyEqual(result.pose.x, -18);
  nearlyEqual(result.pose.y, -2);
  nearlyEqual(result.pose.heading, -Math.PI / 2);
  assert.ok(result.substeps >= 40);
  assert.equal(result.completedSubsteps, result.substeps);
  assert.deepEqual(drivetrain, { leftOutput: 20, rightOutput: 20 });
  assert.deepEqual(start, { x: -18, y: 18, heading: -Math.PI / 2 });
  console.log("PASS: straight travel through an inter-table lane is non-mutating and substep-bounded");
}

{
  const compactState = stateAt(
    { x: -18, y: 18, heading: 0 },
    null,
    { length: 6, width: 6 }
  );
  const straight = model.integrateRobot(compactState, { leftOutput: 20, rightOutput: 20 }, 0.25);
  assert.equal(straight.blocked, false);
  assert.ok(straight.pose.x > compactState.robot.x);
  nearlyEqual(straight.pose.y, compactState.robot.y);
  nearlyEqual(straight.pose.heading, 0);

  const arc = model.integrateRobot(compactState, { leftOutput: 10, rightOutput: 20 }, 0.25);
  assert.equal(arc.blocked, false);
  assert.ok(arc.pose.x > compactState.robot.x);
  assert.ok(arc.pose.y > compactState.robot.y);
  assert.ok(arc.pose.heading > 0);

  const pivot = model.integrateRobot(compactState, { leftOutput: -20, rightOutput: 20 }, 0.25);
  assert.equal(pivot.blocked, false);
  nearlyEqual(pivot.pose.x, compactState.robot.x);
  nearlyEqual(pivot.pose.y, compactState.robot.y);
  assert.ok(pivot.pose.heading > 0);

  const oneSide = model.integrateRobot(compactState, { leftOutput: 0, rightOutput: 20 }, 0.25);
  assert.equal(oneSide.blocked, false);
  assert.ok(oneSide.pose.x > compactState.robot.x);
  assert.ok(oneSide.pose.heading > 0);
  console.log("PASS: equal, unequal, opposite, and one-sided motor outputs produce straight, arc, pivot, and one-side motion");
}

{
  const drive = { leftOutput: 100, rightOutput: 100 };
  const start = { x: 0, y: 20, heading: -Math.PI / 2 };
  const beforeDrive = clone(drive);
  const blocked = model.integrateRobot(start, drive, 1);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.collision.kind, "table");
  assert.equal(blocked.collision.id, "table-4");
  assert.ok(blocked.pose.y > 15);
  assert.ok(blocked.attemptedPose.y < -60);
  assert.ok(blocked.completedSubsteps < blocked.substeps);
  assert.deepEqual(drive, beforeDrive, "collision must not rewrite motor commands");

  const retreat = model.integrateRobot(blocked.pose, { leftOutput: -100, rightOutput: -100 }, 0.02);
  assert.equal(retreat.blocked, false);
  assert.ok(retreat.pose.y > blocked.pose.y);

  const wallHit = model.integrateRobot({ x: 18, y: 45, heading: Math.PI / 2 }, drive, 1);
  assert.equal(wallHit.blocked, true);
  assert.equal(wallHit.collision.kind, "wall");
  assert.equal(wallHit.collision.id, "wall-top");
  assert.ok(wallHit.pose.y < 57);

  const throughOpening = model.integrateRobot({ x: 54, y: 40, heading: Math.PI / 2 }, { leftOutput: 50, rightOutput: 50 }, 0.7);
  assert.equal(throughOpening.blocked, false);
  assert.ok(throughOpening.pose.y > 66);
  console.log("PASS: bounded sweep prevents table/wall tunneling while retreat and real openings remain usable");
}

{
  const turningDrive = { leftOutput: -100, rightOutput: 100 };
  const start = { x: 16, y: 0, heading: 0 };
  const result = model.integrateRobot(start, turningDrive, 1);
  assert.equal(result.blocked, true);
  assert.equal(result.collision.kind, "table");
  assert.ok(result.substeps >= Math.ceil(Math.abs(200 / 70) / (2 * Math.PI / 180)));
  assert.ok(Math.abs(result.pose.heading) < Math.abs(result.attemptedPose.heading));
  assert.deepEqual(turningDrive, { leftOutput: -100, rightOutput: 100 });
  console.log("PASS: high-speed rotation is swept with a two-degree bound and stops before overlap");
}

{
  const wallApproach = stateAt(
    { x: 40, y: 18, heading: 0 },
    null,
    { length: 30, width: 12 }
  );
  assert.equal(model.isPoseValid(wallApproach), true);
  const wallBlocked = model.integrateRobot(wallApproach, { leftOutput: 100, rightOutput: 100 }, 1);
  assert.equal(wallBlocked.blocked, true);
  assert.deepEqual(wallBlocked.collision, { kind: "wall", id: "wall-right" });
  assert.ok(wallBlocked.completedSubsteps < wallBlocked.substeps);

  const tableApproach = stateAt(
    { x: 0, y: 18, heading: -Math.PI / 2 },
    null,
    { length: 12, width: 30 }
  );
  assert.equal(model.isPoseValid(tableApproach), true);
  const tableBlocked = model.integrateRobot(tableApproach, { leftOutput: 100, rightOutput: 100 }, 1);
  assert.equal(tableBlocked.blocked, true);
  assert.deepEqual(tableBlocked.collision, { kind: "table", id: "table-4" });
  assert.ok(tableBlocked.completedSubsteps < tableBlocked.substeps);

  const rotationApproach = stateAt(
    { x: 20, y: 0, heading: 0 },
    null,
    { length: 12, width: 30 }
  );
  const rotationBlocked = model.integrateRobot(
    rotationApproach,
    { leftOutput: -100, rightOutput: 100 },
    1
  );
  assert.equal(rotationBlocked.blocked, true);
  assert.equal(rotationBlocked.collision.kind, "table");
  assert.ok(rotationBlocked.completedSubsteps < rotationBlocked.substeps);
  assert.ok(Math.abs(rotationBlocked.pose.heading) < Math.abs(rotationBlocked.attemptedPose.heading));
  console.log("PASS: resized translation and rotation retain swept table/wall collision blocking");
}

{
  const robot = { x: 7, y: -11, heading: 0.37 };
  const original = clone(robot);
  const yawOffsets = { front: 0, rear: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };

  Object.keys(yawOffsets).forEach((mount) => {
    [5.5, 24].forEach((height) => {
      ["forward", "down45", "down"].forEach((head) => {
        const camera = model.getCameraPose(robot, { mount, height, head });
        nearlyEqual(Math.hypot(camera.position.x - robot.x, camera.position.y - robot.y), 9);
        nearlyEqual(camera.position.z, height);
        nearlyEqual(length(camera.forward), 1);
        nearlyEqual(length(camera.right), 1);
        nearlyEqual(length(camera.up), 1);
        nearlyEqual(dot(camera.forward, camera.right), 0);
        nearlyEqual(dot(camera.forward, camera.up), 0);
        nearlyEqual(dot(camera.right, camera.up), 0);
        nearlyEqual(camera.pitchDegrees, { forward: 0, down45: 45, down: 60 }[head]);
        nearlyEqual(model.normalizeAngle(camera.yaw - robot.heading), model.normalizeAngle(yawOffsets[mount]));
      });
    });
  });
  assert.deepEqual(robot, original);
  console.log("PASS: all mounts and height endpoints use rigid orthonormal camera transforms without changing chassis pose");
}

{
  const robot = { x: 7, y: -11, heading: Math.PI / 3 };
  const chassis = { length: 30, width: 12 };
  const state = stateAt(robot, null, chassis);
  const cosine = Math.cos(robot.heading);
  const sine = Math.sin(robot.heading);
  const localOffsets = {
    front: { x: 15, y: 0 },
    rear: { x: -15, y: 0 },
    left: { x: 0, y: 6 },
    right: { x: 0, y: -6 }
  };

  Object.entries(localOffsets).forEach(([mount, local]) => {
    const camera = model.getCameraPose({
      ...state,
      camera: { mount, height: 12, head: "down45" }
    });
    nearlyEqual(camera.position.x, robot.x + local.x * cosine - local.y * sine);
    nearlyEqual(camera.position.y, robot.y + local.x * sine + local.y * cosine);
    nearlyEqual(camera.pitchDegrees, 45);
  });
  assert.deepEqual(state.chassis, chassis);
  assert.deepEqual(state.robot, robot);
  console.log("PASS: all camera mounts follow the midpoint of the resized robot-local body edge under rotation");
}

{
  const state = stateAt({ x: 5, y: 9, heading: -0.61 }, { mount: "right", height: 12, head: "down" });
  const before = clone(state);
  const camera = model.getCameraPose(state);
  const center = model.projectPoint({
    x: camera.position.x + camera.forward.x * 10,
    y: camera.position.y + camera.forward.y * 10,
    z: camera.position.z + camera.forward.z * 10
  }, camera);
  nearlyEqual(center.x, 160);
  nearlyEqual(center.y, 120);
  nearlyEqual(center.depth, 10);

  const imageRight = model.projectPoint({
    x: camera.position.x + camera.forward.x * 10 + camera.right.x,
    y: camera.position.y + camera.forward.y * 10 + camera.right.y,
    z: camera.position.z + camera.forward.z * 10 + camera.right.z
  }, camera);
  const imageUp = model.projectPoint({
    x: camera.position.x + camera.forward.x * 10 + camera.up.x,
    y: camera.position.y + camera.forward.y * 10 + camera.up.y,
    z: camera.position.z + camera.forward.z * 10 + camera.up.z
  }, camera);
  assert.ok(imageRight.x > center.x);
  assert.ok(imageUp.y < center.y);

  const behind = model.projectPoint({
    x: camera.position.x - camera.forward.x,
    y: camera.position.y - camera.forward.y,
    z: camera.position.z - camera.forward.z
  }, camera);
  assert.equal(behind.inFront, false);
  assert.ok(behind.finite);
  assert.ok(Number.isFinite(behind.x) && Number.isFinite(behind.y));
  assert.deepEqual(state, before);
  console.log("PASS: 3D projection keeps image X right, image Y down, and near/behind values finite");
}

{
  const defaultDown = model.createState({ camera: { mount: "front", height: 12, head: "down" } });
  assert.ok(model.isPoseValid(defaultDown.robot));
  const projection = model.projectScene(defaultDown);
  const marker4 = projectionFor(projection, 4);
  assert.equal(marker4.frontFacing, true);
  assert.equal(marker4.allInFront, true);
  assert.equal(marker4.fullyInFrame, true);
  assert.equal(marker4.sufficientlyLarge, true);
  assert.equal(marker4.occluded, false);
  assert.equal(marker4.eligible, true);
  const detections = model.detectFiducials(projection);
  assert.deepEqual(detections.map((detection) => detection.id), [4]);
  assert.ok(detections[0].originX >= 0 && detections[0].originY >= 0);
  assert.ok(detections[0].originX + detections[0].width <= 320);
  assert.ok(detections[0].originY + detections[0].height <= 240);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(detections), true);
  assert.equal(Object.isFrozen(detections[0]), true);
  console.log("PASS: exact default front/12/down setup fully reads table marker 4 from a collision-free pose");
}

{
  const idZeroState = stateAt(
    { x: -36, y: 52, heading: -Math.PI / 2 },
    { mount: "front", height: 12, head: "down" }
  );
  assert.ok(model.isPoseValid(idZeroState.robot));
  const detections = model.detectFiducials(idZeroState);
  assert.deepEqual(detections.map((detection) => detection.id), [0]);
  assert.equal(detections[0].type, "fiducial");
  assert.equal(detections[0].objectType, "fiducial");
  assert.equal(detections[0].tagID, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(detections[0], "confidence"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(detections[0], "angle"), false);
  console.log("PASS: fiducial ID 0 remains valid and tag records omit unsupported confidence/angle claims");
}

{
  const wallState = stateAt(
    { x: 0, y: 18, heading: 0 },
    { mount: "left", height: 12, head: "forward" }
  );
  const detections = model.detectFiducials(wallState);
  assert.deepEqual(detections.map((detection) => detection.id), [9, 10]);
  assert.ok(detections.every((detection) => detection.width > 0 && detection.height > 0));
  assert.ok(detections.every((detection) => detection.originX >= 0 && detection.originY >= 0));

  const cutOffState = stateAt(
    { x: 2, y: 16, heading: -Math.PI / 2 },
    { mount: "front", height: 12, head: "down" }
  );
  const cutOffMarker = projectionFor(model.projectScene(cutOffState), 4);
  assert.equal(cutOffMarker.eligible, false);
  assert.ok(cutOffMarker.rejectionReasons.includes("cut-off"));
  assert.equal(model.detectFiducials(cutOffState).some((detection) => detection.id === 4), false);

  const backfaceState = stateAt(
    { x: 0, y: 76, heading: -Math.PI / 2 },
    { mount: "front", height: 12, head: "forward" }
  );
  const backface = projectionFor(model.projectScene(backfaceState), 9);
  assert.ok(backface.rejectionReasons.includes("backface"));
  assert.equal(backface.eligible, false);

  const occludedState = stateAt(
    { x: -80, y: -80, heading: 0 },
    { mount: "front", height: 5.5, head: "forward" }
  );
  assert.ok(model.isPoseValid(occludedState.robot));
  const occluded = projectionFor(model.projectScene(occludedState), 13);
  assert.equal(occluded.frontFacing, true);
  assert.equal(occluded.fullyInFrame, true);
  assert.equal(occluded.occluded, true);
  assert.deepEqual(occluded.rejectionReasons, ["occluded"]);
  assert.equal(model.detectFiducials(occludedState).some((detection) => detection.id === 13), false);
  console.log("PASS: wall multi-detections sort by ID and backface, cut-off, and 3D occlusion reject conservatively");
}

{
  const robot = { x: -72, y: 79, heading: -2 * Math.PI / 3 };
  const camera = { mount: "left", height: 5.5, head: "forward" };
  const compact = stateAt(robot, camera, { length: 6, width: 6 });
  const wide = stateAt(robot, camera, { length: 6, width: 36 });
  assert.equal(model.isPoseValid(compact), true);
  assert.equal(model.isPoseValid(wide), true);

  const compactMarker = projectionFor(model.projectScene(compact), 12);
  const wideMarker = projectionFor(model.projectScene(wide), 12);
  ["frontFacing", "allInFront", "fullyInFrame", "sufficientlyLarge"].forEach((key) => {
    assert.equal(compactMarker[key], true);
    assert.equal(wideMarker[key], true);
  });
  assert.deepEqual(compactMarker.rejectionReasons, ["occluded"]);
  assert.equal(compactMarker.eligible, false);
  assert.deepEqual(wideMarker.rejectionReasons, []);
  assert.equal(wideMarker.eligible, true);
  assert.equal(model.detectFiducials(compact).some((detection) => detection.id === 12), false);
  assert.equal(model.detectFiducials(wide).some((detection) => detection.id === 12), true);
  console.log("PASS: resized camera-edge placement feeds the real projection and 3D occlusion path");
}

{
  const robot = { x: -18, y: 0, heading: 0 };
  ["front", "rear", "left", "right"].forEach((mount) => {
    [5.5, 24].forEach((height) => {
      ["forward", "down45", "down"].forEach((head) => {
        const projection = model.projectScene(stateAt(robot, { mount, height, head }));
        projection.markers.forEach((candidate) => {
          candidate.corners.forEach((corner) => {
            assert.ok(Number.isFinite(corner.x));
            assert.ok(Number.isFinite(corner.y));
            assert.ok(Number.isFinite(corner.depth));
          });
        });
        const ids = model.detectFiducials(projection).map((detection) => detection.id);
        assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
      });
    });
  });
  console.log("PASS: mount/height/head matrix stays finite and every detection dataset is ID-ordered");
}

{
  const forwardState = model.createState({ camera: { mount: "front", height: 12, head: "forward" } });
  const down45State = model.createState({ camera: { mount: "front", height: 12, head: "down45" } });
  const downState = model.createState({ camera: { mount: "front", height: 12, head: "down" } });
  const forwardLayout = model.layoutWorldView(forwardState);
  const down45Layout = model.layoutWorldView(down45State);
  const downLayout = model.layoutWorldView(downState);
  assert.equal(forwardLayout.width, 320);
  assert.equal(forwardLayout.height, 220);
  assert.equal(forwardLayout.outerBoundary.kind, "simulation-boundary");
  assert.equal(forwardLayout.walls.length, 4);
  assert.equal(forwardLayout.tables.length, 9);
  assert.equal(forwardLayout.fiducials.length, 21);
  assert.equal(forwardLayout.robot.length, 18);
  assert.equal(forwardLayout.robot.width, 18);
  assert.equal(forwardLayout.robot.footprint.length, model.getRobotFootprint(forwardState).length);
  assert.deepEqual(forwardLayout.robot, down45Layout.robot, "45-degree head tilt must leave the World View chassis unchanged");
  assert.deepEqual(forwardLayout.robot, downLayout.robot, "head tilt must leave the World View chassis unchanged");
  assert.deepEqual(
    { x: forwardLayout.camera.x, y: forwardLayout.camera.y, mount: forwardLayout.camera.mount },
    { x: down45Layout.camera.x, y: down45Layout.camera.y, mount: down45Layout.camera.mount }
  );
  assert.deepEqual(
    { x: forwardLayout.camera.x, y: forwardLayout.camera.y, mount: forwardLayout.camera.mount },
    { x: downLayout.camera.x, y: downLayout.camera.y, mount: downLayout.camera.mount }
  );
  assert.notDeepEqual(forwardLayout.camera.viewFootprint, down45Layout.camera.viewFootprint);
  assert.notDeepEqual(down45Layout.camera.viewFootprint, downLayout.camera.viewFootprint);
  assert.notDeepEqual(forwardLayout.camera.viewFootprint, downLayout.camera.viewFootprint);
  assert.notDeepEqual(forwardLayout.camera.direction, down45Layout.camera.direction);
  assert.notDeepEqual(down45Layout.camera.direction, downLayout.camera.direction);
  assert.notDeepEqual(forwardLayout.camera.direction, downLayout.camera.direction);
  [forwardLayout, down45Layout, downLayout].forEach((layout) => {
    layout.camera.viewFootprint.forEach((point) => {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x <= layout.width);
      assert.ok(point.y >= 0 && point.y <= layout.height);
    });
  });

  const projections = [forwardState, down45State, downState].map((state) => model.projectScene(state));
  assert.deepEqual(projections.map((projection) => projection.camera.pitchDegrees), [0, 45, 60]);
  assert.ok(projections[0].camera.forward.z > projections[1].camera.forward.z);
  assert.ok(projections[1].camera.forward.z > projections[2].camera.forward.z);
  assert.deepEqual(projections[0].chassis, { length: 18, width: 18 });
  assert.notDeepEqual(projectionFor(projections[0], 4).bounds, projectionFor(projections[1], 4).bounds);
  assert.notDeepEqual(projectionFor(projections[1], 4).bounds, projectionFor(projections[2], 4).bounds);
  console.log("PASS: World View and real projection distinguish 0°, 45°, and legacy 60° head transforms without moving chassis");
}

{
  assert.equal(model.config.practiceFruitCount, 4);
  assert.equal(model.config.practiceFruitRadius, 2);
  assert.equal(model.config.practiceFruitHeight, 4);
  assert.equal(model.config.practiceRobotLength, 18);
  assert.equal(model.config.practiceRobotWidth, 18);
  assert.equal(model.config.practiceRobotTopZ, 4.5);
  assert.equal(model.config.practicePlacementAttempts, 120);
  assert.equal(model.config.practiceDefaultSeed, 0x43565331);
  const clean = model.createState();
  assert.deepEqual(clean.practiceObstructions, {
    fruitClutter: false,
    roamingRobot: false,
    seed: 0x43565331,
    fruit: [],
    roamingStart: null
  });
  assert.deepEqual(clean.practiceRuntime, { roaming: null });
  assert.deepEqual(model.projectScene(clean).obstructions, []);
  assert.deepEqual(model.layoutWorldView(clean).obstructions, []);
  console.log("PASS: legacy/missing Practice Obstructions data defaults to the unchanged clean arena");
}

{
  const context = {
    robot: model.startPoses.find((pose) => pose.id === "center-lane-northwest"),
    chassis: { length: 18, width: 18 },
    seed: 25
  };
  const fruitOnly = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: false },
    context
  );
  const fruitAgain = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: false },
    context
  );
  const roamingOnly = model.createPracticeObstructions(
    { fruitClutter: false, roamingRobot: true },
    context
  );
  const together = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: true },
    context
  );
  const randomized = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: true },
    { ...context, seed: 26 }
  );

  assert.deepEqual(fruitOnly, fruitAgain, "the same seed must reproduce the same initial layout");
  assert.equal(fruitOnly.fruit.length, 4);
  assert.equal(fruitOnly.roamingStart, null);
  assert.deepEqual(roamingOnly.fruit, []);
  assert.ok(roamingOnly.roamingStart);
  assert.equal(together.fruit.length, 4);
  assert.ok(together.roamingStart);
  assert.notDeepEqual(together, randomized, "a new seed must change placement and the wander stream");

  [fruitOnly, roamingOnly, together, randomized].forEach((practice) => {
    const state = model.createState({
      startPoseId: "center-lane-northwest",
      chassis: context.chassis,
      practiceObstructions: practice
    });
    assert.equal(model.collisionForPose(state), null);
    const projection = model.projectScene(state);
    assert.equal(
      projection.obstructions.length,
      practice.fruit.length + (practice.roamingStart ? 1 : 0)
    );
    assert.equal(
      projection.detections.every((detection) => detection.type === "fiducial"),
      true,
      "practice props must never become recognized object records"
    );
  });

  const fourCornerOpenings = [
    { minimumX: -66, maximumX: -38, minimumY: 38, maximumY: 66 },
    { minimumX: 38, maximumX: 66, minimumY: 38, maximumY: 66 },
    { minimumX: -66, maximumX: -38, minimumY: -66, maximumY: -38 },
    { minimumX: 38, maximumX: 66, minimumY: -66, maximumY: -38 }
  ];
  const openingRegression = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: true },
    { ...context, seed: 2 }
  );
  const openingProjection = model.projectScene(model.createState({
    startPoseId: "center-lane-northwest",
    practiceObstructions: openingRegression
  }));
  openingProjection.obstructions.forEach((obstruction) => {
    obstruction.footprint.forEach((point) => {
      assert.equal(
        fourCornerOpenings.some((opening) =>
          point.x >= opening.minimumX && point.x <= opening.maximumX &&
          point.y >= opening.minimumY && point.y <= opening.maximumY
        ),
        false,
        `${obstruction.id} must leave all four real corner openings clear`
      );
    });
  });
  console.log("PASS: seeded generation is repeatable, randomizable, and supports both obstruction toggles independently");
}

{
  const chassisCases = [
    { length: 6, width: 6 },
    { length: 18, width: 18 },
    { length: 30, width: 12 },
    { length: 12, width: 30 },
    { length: 24, width: 24 }
  ];
  chassisCases.forEach((chassis, chassisIndex) => {
    const start = model.startPoses.find((pose) => model.isPoseValid({ robot: pose, chassis }));
    assert.ok(start, `expected a valid start for ${chassis.length} × ${chassis.width}`);
    [3, 17, 81].forEach((seed) => {
      const practice = model.createPracticeObstructions(
        { fruitClutter: true, roamingRobot: true },
        { robot: start, chassis, seed: seed + chassisIndex }
      );
      assert.doesNotThrow(() => model.createState({
        startPoseId: start.id,
        chassis,
        practiceObstructions: practice
      }));
    });
  });

  const invalidFruit = {
    fruitClutter: true,
    roamingRobot: false,
    seed: 1,
    fruit: [{ id: "fruit-1", kind: "practice-fruit", x: 0, y: 0 }],
    roamingStart: null
  };
  assert.throws(
    () => model.createState({ practiceObstructions: invalidFruit }),
    /Fruit prop fruit-1 overlaps/
  );
  assert.throws(
    () => model.normalizePracticeObstructions({
      fruitClutter: true,
      roamingRobot: false,
      seed: 1,
      fruit: [{ id: "fruit-1", kind: "practice-fruit", x: NaN, y: 8 }],
      roamingStart: null
    }, { robot: model.startPoses[0], chassis: { length: 18, width: 18 } }),
    /finite coordinates/
  );
  const strictContext = { robot: model.startPoses[0], chassis: { length: 18, width: 18 } };
  const validFruit = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: false },
    { ...strictContext, seed: 1 }
  );
  assert.throws(
    () => model.normalizePracticeObstructions({ ...validFruit, seed: null }, strictContext),
    /unsigned 32-bit integer/
  );
  assert.throws(
    () => model.normalizePracticeObstructions({
      ...validFruit,
      fruit: validFruit.fruit.map((item, index) => index === 0 ? { ...item, x: String(item.x) } : item)
    }, strictContext),
    /finite coordinates/
  );
  assert.throws(
    () => model.normalizePracticeObstructions({
      fruitClutter: false,
      roamingRobot: true,
      seed: 1,
      fruit: [],
      roamingStart: { x: 0, y: 16, heading: -Math.PI / 2 }
    }, { robot: model.startPoses[0], chassis: { length: 18, width: 18 } }),
    /Roaming Robot start overlaps/
  );
  const hugeHeadingContext = strictContext;
  const validRoaming = model.createPracticeObstructions(
    { fruitClutter: false, roamingRobot: true },
    { ...hugeHeadingContext, seed: 1 }
  );
  assert.throws(
    () => model.normalizePracticeObstructions({
      ...validRoaming,
      roamingStart: { ...validRoaming.roamingStart, heading: false }
    }, hugeHeadingContext),
    /finite x, y, and heading/
  );
  const hugeHeading = model.normalizePracticeObstructions({
    fruitClutter: false,
    roamingRobot: true,
    seed: 1,
    fruit: [],
    roamingStart: { ...validRoaming.roamingStart, heading: 1e308 }
  }, hugeHeadingContext);
  assert.ok(
    Number.isFinite(hugeHeading.roamingStart.heading) &&
      hugeHeading.roamingStart.heading > -Math.PI &&
      hugeHeading.roamingStart.heading <= Math.PI,
    "extreme finite saved headings must normalize in bounded time"
  );
  console.log("PASS: generated layouts validate across chassis sizes while malformed or overlapping saved layouts reject strictly");
}

{
  const practice = {
    fruitClutter: true,
    roamingRobot: false,
    seed: 41,
    fruit: [{ id: "fruit-1", kind: "practice-fruit", x: -18, y: 2.5 }],
    roamingStart: null
  };
  const state = model.createState({
    startPoseId: "center-lane-northwest",
    practiceObstructions: practice
  });
  const command = Object.freeze({ leftOutput: 100, rightOutput: 100 });
  const hit = model.integrateScene(state, command, 0.5, { advanceRoaming: true });
  assert.equal(hit.blocked, true);
  assert.deepEqual(hit.collision, { kind: "fruit", id: "fruit-1" });
  assert.ok(hit.state.robot.y > 2.5);
  assert.deepEqual(command, { leftOutput: 100, rightOutput: 100 }, "collision must not steer or rewrite student commands");
  const retreat = model.integrateScene(
    hit.state,
    { leftOutput: -100, rightOutput: -100 },
    0.05,
    { advanceRoaming: true }
  );
  assert.equal(retreat.blocked, false);
  assert.ok(retreat.state.robot.y > hit.state.robot.y);
  console.log("PASS: stationary fruit blocks swept student motion without pushing, steering, or changing motor commands");
}

{
  const practice = {
    fruitClutter: false,
    roamingRobot: true,
    seed: 7,
    fruit: [],
    roamingStart: { x: -18, y: -18, heading: Math.PI / 2 }
  };
  const state = model.createState({
    startPoseId: "center-lane-northwest",
    practiceObstructions: practice
  });
  const collision = model.integrateScene(
    state,
    { leftOutput: 100, rightOutput: 100 },
    0.5,
    { advanceRoaming: true }
  );
  assert.equal(collision.blocked, true);
  assert.deepEqual(collision.collision, { kind: "roaming-robot", id: "roaming-robot" });
  assert.equal(collision.roamingBlocked, true);
  assert.deepEqual(collision.roamingCollision, { kind: "student-robot", id: "student-robot" });
  assert.equal(model.collisionForPose(collision.state), null, "the accepted joint state must not overlap");
  assert.ok(
    Math.hypot(
      collision.state.practiceRuntime.roaming.pose.x - practice.roamingStart.x,
      collision.state.practiceRuntime.roaming.pose.y - practice.roamingStart.y
    ) <= model.config.practiceForwardOutput / 100 * model.config.maxLinearSpeed * 0.5 + 0.000001,
    "the roaming robot must move continuously rather than teleport"
  );
  console.log("PASS: shared motion substeps reject a same-tick robot collision without overlap, tunneling, pushing, or teleportation");
}

{
  const start = model.startPoses.find((pose) => pose.id === "center-lane-northwest");
  const practice = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: true },
    { robot: start, chassis: { length: 18, width: 18 }, seed: 2 }
  );
  let withRendering = model.createState({ startPoseId: start.id, practiceObstructions: practice });
  let withoutRendering = model.createState({ startPoseId: start.id, practiceObstructions: practice });
  const initialRuntime = clone(withRendering.practiceRuntime);

  const frozen = model.integrateScene(
    withRendering,
    { leftOutput: 0, rightOutput: 0 },
    1,
    { advanceRoaming: false }
  );
  assert.deepEqual(frozen.state.practiceRuntime, initialRuntime, "paused/stopped time must not advance roaming state");

  for (let index = 0; index < 300; index += 1) {
    model.projectScene(withRendering);
    model.layoutWorldView(withRendering);
    withRendering = model.integrateScene(
      withRendering,
      { leftOutput: 0, rightOutput: 0 },
      0.05,
      { advanceRoaming: true }
    ).state;
    withoutRendering = model.integrateScene(
      withoutRendering,
      { leftOutput: 0, rightOutput: 0 },
      0.05,
      { advanceRoaming: true }
    ).state;
    assert.equal(model.collisionForPose(withRendering), null);
  }
  assert.deepEqual(withRendering.practiceRuntime, withoutRendering.practiceRuntime);
  assert.notDeepEqual(withRendering.practiceRuntime, initialRuntime);

  const reset = model.createState({ startPoseId: start.id, practiceObstructions: practice });
  assert.deepEqual(reset.practiceRuntime, initialRuntime, "Reset must replay the saved scenario rather than reshuffle it");
  assert.deepEqual(reset.practiceObstructions, practice);
  console.log("PASS: wandering is seeded and simulation-time-driven; rendering is inert and Reset exactly reconstructs the scenario");
}

{
  const practice = {
    fruitClutter: false,
    roamingRobot: true,
    seed: 1,
    fruit: [],
    roamingStart: { x: 56.5, y: 18, heading: 0 }
  };
  const initial = model.createState({ practiceObstructions: practice });
  initial.practiceRuntime.roaming.remainingSeconds = 1;
  const single = model.integrateScene(
    initial,
    { leftOutput: 0, rightOutput: 0 },
    1,
    { advanceRoaming: true }
  ).state;
  // Give the split run the same explicit one-second initial decision timer.
  const splitInitial = model.createState({ practiceObstructions: practice });
  splitInitial.practiceRuntime.roaming.remainingSeconds = 1;
  const splitFirst = model.integrateScene(
    splitInitial,
    { leftOutput: 0, rightOutput: 0 },
    0.5,
    { advanceRoaming: true }
  ).state;
  const splitFinal = model.integrateScene(
    splitFirst,
    { leftOutput: 0, rightOutput: 0 },
    0.5,
    { advanceRoaming: true }
  ).state;
  const singleRoaming = single.practiceRuntime.roaming;
  const splitRoaming = splitFinal.practiceRuntime.roaming;
  nearlyEqual(singleRoaming.pose.x, splitRoaming.pose.x, 0.000001);
  nearlyEqual(singleRoaming.pose.y, splitRoaming.pose.y, 0.000001);
  nearlyEqual(singleRoaming.pose.heading, splitRoaming.pose.heading, 0.000001);
  nearlyEqual(singleRoaming.remainingSeconds, splitRoaming.remainingSeconds, 0.000001);
  assert.equal(singleRoaming.mode, splitRoaming.mode);
  assert.equal(singleRoaming.randomState, splitRoaming.randomState);
  assert.equal(model.collisionForPose(single), null);
  assert.equal(model.collisionForPose(splitFinal), null);
  console.log("PASS: blocked roaming motion consumes only actual collision time and is stable across frame cadence");
}

{
  const wallFruit = {
    fruitClutter: true,
    roamingRobot: false,
    seed: 99,
    fruit: [{ id: "fruit-1", kind: "practice-fruit", x: 9, y: 46.5 }],
    roamingStart: null
  };
  const clearWallState = model.createState({
    robot: { x: 0, y: 18, heading: 0 },
    camera: { mount: "left", height: 12, head: "forward" }
  });
  const fruitWallState = model.createState({
    robot: { x: 0, y: 18, heading: 0 },
    camera: { mount: "left", height: 12, head: "forward" },
    practiceObstructions: wallFruit
  });
  assert.deepEqual(model.detectFiducials(clearWallState).map((item) => item.id), [9, 10]);
  assert.deepEqual(model.detectFiducials(fruitWallState).map((item) => item.id), [9, 10]);

  const occludingStart = model.startPoses.find((pose) => pose.id === "center-lane-northwest");
  const occludingFruit = model.createPracticeObstructions(
    { fruitClutter: true, roamingRobot: false },
    { robot: occludingStart, chassis: { length: 18, width: 18 }, seed: 25 }
  );
  const clearTableState = model.createState({
    startPoseId: occludingStart.id,
    camera: { mount: "front", height: 5.5, head: "forward" }
  });
  const fruitTableState = model.createState({
    startPoseId: occludingStart.id,
    camera: { mount: "front", height: 5.5, head: "forward" },
    practiceObstructions: occludingFruit
  });
  assert.ok(model.detectFiducials(clearTableState).some((item) => item.id === 6));
  const fruitProjection = model.projectScene(fruitTableState);
  assert.equal(fruitProjection.detections.some((item) => item.id === 6), false);
  assert.deepEqual(projectionFor(fruitProjection, 6).rejectionReasons, ["occluded"]);

  fruitProjection.obstructions.forEach((obstruction) => {
    assert.ok(Array.isArray(obstruction.footprint) && obstruction.footprint.length >= 12);
    assert.equal(obstruction.minimumZ, 0);
    assert.ok(obstruction.maximumZ > 0);
  });
  const worldLayout = model.layoutWorldView(fruitTableState);
  assert.equal(worldLayout.obstructions.length, 4);
  assert.ok(worldLayout.obstructions.every((item) => item.footprint.every((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y)
  )));
  console.log("PASS: low fruit uses its real height, can occlude floor tags, cannot falsely hide elevated wall tags, and supplies shared render geometry");
}

console.log("All dining-room model tests passed.");
