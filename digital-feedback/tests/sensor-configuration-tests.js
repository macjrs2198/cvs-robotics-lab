"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
const appRoot = path.resolve(__dirname, "..");
for (const file of ["robot.js", "sensors.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(appRoot, file), "utf8"), { filename: file });
}

const { RobotModel } = DigitalFeedbackRobot;
const { DigitalSensorArray } = DigitalFeedbackSensors;

function near(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function signedHeadingDelta(after, before) {
  let delta = after - before;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

const robot = new RobotModel({ x: 100, y: 200, heading: 0 });
const track = {
  getSurfaceAt(x) {
    return x > robot.state.x ? "white" : "field";
  },
};
const sensors = new DigitalSensorArray(track, robot);

let positions = sensors.getPositions();
assert.equal(positions.front.mode, "single");
assert.equal(positions.rear, null);
assert.equal(sensors.state.frontSingle, true);

sensors.setConfiguration({
  front: { mode: "none", longitudinalOffset: 50, spacing: 40 },
  rear: { mode: "single", longitudinalOffset: 50, spacing: 40 },
});
positions = sensors.getPositions();
assert.equal(positions.front, null);
near(positions.rear.single.x, 50, 0.001, "rear longitudinal offset");
assert.equal(sensors.state.frontSingle, false);
assert.equal(sensors.state.rearSingle, false);

sensors.setConfiguration({
  front: { mode: "dual", longitudinalOffset: 54, spacing: 60 },
  rear: { mode: "dual", longitudinalOffset: 46, spacing: 36 },
});
positions = sensors.getPositions();
near(Math.hypot(
  positions.front.left.x - positions.front.right.x,
  positions.front.left.y - positions.front.right.y,
), 60, 0.001, "front receiver spacing");
near((positions.front.left.x + positions.front.right.x) / 2, positions.front.emitter.x, 0.001, "front emitter x center");
near((positions.front.left.y + positions.front.right.y) / 2, positions.front.emitter.y, 0.001, "front emitter y center");
near(Math.hypot(
  positions.rear.left.x - positions.rear.right.x,
  positions.rear.left.y - positions.rear.right.y,
), 36, 0.001, "rear receiver spacing");
near((positions.rear.left.x + positions.rear.right.x) / 2, positions.rear.emitter.x, 0.001, "rear emitter x center");
near((positions.rear.left.y + positions.rear.right.y) / 2, positions.rear.emitter.y, 0.001, "rear emitter y center");

const originalFrontX = positions.front.emitter.x;
sensors.updateMount("front", { longitudinalOffset: 70 });
positions = sensors.getPositions();
near(positions.front.emitter.x - originalFrontX, 16, 0.001, "front assembly offset change");

robot.state.heading = Math.PI / 2;
positions = sensors.getPositions();
near(positions.front.emitter.x, robot.state.x, 0.001, "rotated front emitter x");
near(positions.front.emitter.y, robot.state.y + 70, 0.001, "rotated front emitter y");
near(positions.rear.emitter.x, robot.state.x, 0.001, "rotated rear emitter x");
near(positions.rear.emitter.y, robot.state.y - 46, 0.001, "rotated rear emitter y");

const visualization = sensors.getVisualization();
assert.equal(visualization.assemblies.length, 2);
assert.equal(visualization.assemblies[0].receivers.length, 2);
assert.equal(visualization.assemblies[1].receivers.length, 2);

robot.drive.setDriveSpeed(40);
robot.drive.setTurnSpeed(25);
robot.drive.forward();
assert.deepEqual(
  { left: robot.drive.state.leftOutput, right: robot.drive.state.rightOutput },
  { left: 40, right: 40 },
);
robot.drive.turnLeft();
assert.deepEqual(
  { left: robot.drive.state.leftOutput, right: robot.drive.state.rightOutput },
  { left: 8.75, right: 25 },
);
assert.ok(robot.drive.state.rightOutput > robot.drive.state.leftOutput);
robot.drive.stop();
assert.deepEqual(
  { left: robot.drive.state.leftOutput, right: robot.drive.state.rightOutput },
  { left: 0, right: 0 },
);

for (const heading of [-2.4, -Math.PI / 2, -0.3, 0, 1.1, 2.7]) {
  robot.state.heading = heading;
  robot.drive.turnLeft();
  robot.update(0.1);
  assert.ok(
    signedHeadingDelta(robot.state.heading, heading) < 0,
    `Turn Left must rotate counterclockwise on screen at heading ${heading}`,
  );

  robot.state.heading = heading;
  robot.drive.turnRight();
  assert.ok(robot.drive.state.leftOutput > robot.drive.state.rightOutput);
  robot.update(0.1);
  assert.ok(
    signedHeadingDelta(robot.state.heading, heading) > 0,
    `Turn Right must rotate clockwise on screen at heading ${heading}`,
  );

  robot.state.heading = heading;
  positions = sensors.getPositions();
  const visualLeft = { x: Math.sin(heading), y: -Math.cos(heading) };
  for (const mount of ["front", "rear"]) {
    const leftOffset = {
      x: positions[mount].left.x - robot.state.x,
      y: positions[mount].left.y - robot.state.y,
    };
    const rightOffset = {
      x: positions[mount].right.x - robot.state.x,
      y: positions[mount].right.y - robot.state.y,
    };
    assert.ok(
      leftOffset.x * visualLeft.x + leftOffset.y * visualLeft.y > 0,
      `${mount} left sensor must stay on the robot's visual left at heading ${heading}`,
    );
    assert.ok(
      rightOffset.x * visualLeft.x + rightOffset.y * visualLeft.y < 0,
      `${mount} right sensor must stay on the robot's visual right at heading ${heading}`,
    );
  }
}

console.log("PASS: front/rear none, single, dual, and simultaneous configurations");
console.log("PASS: offsets, dual spacing, centered emitters, and rotation transforms");
console.log("PASS: left/right turns and sensor sides remain correct across headings");
console.log("PASS: digital tape states, stale-state clearing, and existing drive controls");
