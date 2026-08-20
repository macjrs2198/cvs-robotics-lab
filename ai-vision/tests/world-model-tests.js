"use strict";

const assert = require("assert");
const model = require("../simulator.js");

function drive(leftOutput, rightOutput) {
  return { leftOutput, rightOutput };
}

function nearlyEqual(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function resetProjection() {
  const world = model.createWorldState();
  return { world, projection: model.projectTarget(world) };
}

{
  const { projection } = resetProjection();
  assert.equal(projection.sensor.exists, true);
  assert.equal(projection.sensor.centerX, 160);
  assert.equal(projection.sensor.centerY, 120);
  assert.equal(projection.sensor.width, 40);
  assert.equal(projection.sensor.height, 40);
  console.log("PASS: reset target is centered and visible");
}

{
  const { world, projection: before } = resetProjection();
  model.integrateRobot(world, drive(50, 50), 1);
  const afterForward = model.projectTarget(world);
  assert.ok(afterForward.distance < before.distance);
  assert.ok(afterForward.sensor.width > before.sensor.width);
  nearlyEqual(afterForward.sensor.centerX, before.sensor.centerX);

  model.integrateRobot(world, drive(-50, -50), 1);
  const afterReverse = model.projectTarget(world);
  nearlyEqual(afterReverse.distance, before.distance);
  assert.equal(afterReverse.sensor.width, before.sensor.width);
  console.log("PASS: forward grows target and reverse shrinks it");
}

{
  const leftWorld = model.createWorldState();
  model.integrateRobot(leftWorld, drive(10.5, 30), 1);
  const afterLeft = model.projectTarget(leftWorld);
  assert.ok(afterLeft.sensor.centerX > 160);

  const rightWorld = model.createWorldState();
  model.integrateRobot(rightWorld, drive(30, 10.5), 1);
  const afterRight = model.projectTarget(rightWorld);
  assert.ok(afterRight.sensor.centerX < 160);
  console.log("PASS: left turn moves target right and right turn moves target left");
}

{
  const world = model.createWorldState();
  const centerXs = [];
  for (let index = 0; index < 12; index += 1) {
    model.integrateRobot(world, drive(10.5, 30), 0.1);
    centerXs.push(model.projectTarget(world).sensor.centerX);
  }
  assert.ok(centerXs.every((value, index) => index === 0 || value >= centerXs[index - 1]));
  assert.ok(new Set(centerXs).size > 6);

  for (let index = 0; index < 24; index += 1) {
    model.integrateRobot(world, drive(10.5, 30), 0.1);
  }
  assert.equal(model.projectTarget(world).sensor.exists, false);

  for (let index = 0; index < 36; index += 1) {
    model.integrateRobot(world, drive(30, 10.5), 0.1);
  }
  assert.equal(model.projectTarget(world).sensor.exists, true);
  console.log("PASS: turning changes center continuously and target exits/re-enters view");
}

{
  const world = model.createWorldState();
  model.setTargetFromCamera(world, 80, 120);
  const leftTarget = model.projectTarget(world);
  assert.ok(Math.abs(leftTarget.sensor.centerX - 80) <= 1);
  assert.ok(world.target.y > 0);

  model.setTargetFromCamera(world, 240, 0);
  const farRightTarget = model.projectTarget(world);
  assert.ok(Math.abs(farRightTarget.sensor.centerX - 240) <= 1);
  assert.ok(farRightTarget.distance > leftTarget.distance);

  model.resetWorld(world);
  const reset = model.projectTarget(world);
  assert.equal(reset.sensor.centerX, 160);
  assert.equal(reset.sensor.width, 40);
  console.log("PASS: dragging maps camera input into world target position and reset restores defaults");
}

{
  const world = model.createWorldState();
  world.robot.x = 299.99;
  const close = model.projectTarget(world);
  assert.ok(close.apparentSize <= model.config.maxRenderedSize);
  assert.ok(close.apparentSize > 0);
  assert.ok(Number.isFinite(close.apparentSize));
  console.log("PASS: apparent-size projection is finite and clamped at close range");
}

{
  const world = model.createWorldState();
  const before = model.layoutWorldView(world);
  const fixedTargetX = before.target.x;
  const fixedTargetY = before.target.y;

  model.integrateRobot(world, drive(50, 50), 1);
  const after = model.layoutWorldView(world);

  assert.ok(after.robot.x > before.robot.x);
  nearlyEqual(after.target.x, fixedTargetX);
  nearlyEqual(after.target.y, fixedTargetY);
  assert.ok(after.distance < before.distance);
  assert.equal(after.targetInFov, model.projectTarget(world).sensor.exists);
  console.log("PASS: World View reads the shared world state while a fixed target stays fixed");
}

{
  const leftWorld = model.createWorldState();
  model.integrateRobot(leftWorld, drive(10.5, 30), 1);
  const leftMap = model.layoutWorldView(leftWorld);
  assert.ok(leftMap.robot.rotationDegrees < 0);
  assert.ok(leftMap.fov.direction.y < leftMap.robot.y);
  assert.equal(leftMap.targetInFov, model.projectTarget(leftWorld).sensor.exists);

  const rightWorld = model.createWorldState();
  model.integrateRobot(rightWorld, drive(30, 10.5), 1);
  const rightMap = model.layoutWorldView(rightWorld);
  assert.ok(rightMap.robot.rotationDegrees > 0);
  assert.ok(rightMap.fov.direction.y > rightMap.robot.y);
  assert.equal(rightMap.targetInFov, model.projectTarget(rightWorld).sensor.exists);
  console.log("PASS: World View robot and exact 60-degree FOV rotate with shared heading");
}

{
  const world = model.createWorldState();
  const before = model.layoutWorldView(world);
  model.setTargetFromCamera(world, 75, 40);
  const dragged = model.layoutWorldView(world);
  assert.notEqual(dragged.target.x, before.target.x);
  assert.notEqual(dragged.target.y, before.target.y);
  assert.equal(dragged.targetInFov, model.projectTarget(world).sensor.exists);

  model.resetWorld(world);
  const reset = model.layoutWorldView(world);
  nearlyEqual(reset.robot.x, before.robot.x);
  nearlyEqual(reset.robot.y, before.robot.y);
  nearlyEqual(reset.target.x, before.target.x);
  nearlyEqual(reset.target.y, before.target.y);
  console.log("PASS: target dragging and reset update camera and World View from one state");
}

{
  const world = model.createWorldState();
  world.robot.x = 1000;
  world.robot.y = 620;
  world.target.x = -700;
  world.target.y = -480;
  const layout = model.layoutWorldView(world);
  const points = [layout.robot, layout.target];

  points.forEach((point) => {
    assert.ok(point.x >= 0 && point.x <= layout.width);
    assert.ok(point.y >= 0 && point.y <= layout.height);
  });
  console.log("PASS: World View auto-fit keeps robot and target visible outside normal bounds");
}
