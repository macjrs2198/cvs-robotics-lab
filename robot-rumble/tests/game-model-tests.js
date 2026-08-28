"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const game = require(path.join(__dirname, "..", "game.js"));

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function testArenaGeneration() {
  const first = game.createObstacles(seededRandom(41));
  const second = game.createObstacles(seededRandom(42));
  assert.ok(first.length >= 5 && first.length <= 7);
  assert.ok(second.length >= 5 && second.length <= 7);
  assert.notDeepEqual(first, second);
  first.forEach((obstacle) => {
    assert.equal(game.overlapsSpawn(
      obstacle.x,
      obstacle.y,
      obstacle.width,
      obstacle.height,
    ), false);
  });
}

function testMovementAndCollision() {
  const keys = new Set(["w", "d", "arrowdown", "arrowleft"]);
  const playerOne = game.movementVector(keys, {
    up: "w", down: "s", left: "a", right: "d",
  });
  const playerTwo = game.movementVector(keys, {
    up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright",
  });
  assert.ok(playerOne.x > 0 && playerOne.y < 0);
  assert.ok(playerTwo.x < 0 && playerTwo.y > 0);

  const robot = game.createRobot(100, 0);
  robot.x = 100;
  robot.y = 100;
  const obstacle = { x: 90, y: 90, width: 50, height: 50, kind: "crate" };
  assert.equal(game.resolveObstacleCollision(robot, obstacle), true);
  const nearestX = game.clamp(robot.x, obstacle.x, obstacle.x + obstacle.width);
  const nearestY = game.clamp(robot.y, obstacle.y, obstacle.y + obstacle.height);
  assert.ok(Math.hypot(robot.x - nearestX, robot.y - nearestY) >= game.ROBOT_RADIUS);
}

function setPunch(attacker, now) {
  attacker.punchingUntil = now + 100;
  attacker.punchConnected = false;
}

function testDirectionalBlockAndKnockout() {
  const now = 1000;
  const attacker = game.createRobot(100, 0);
  const defender = game.createRobot(180, Math.PI);
  defender.blocking = true;
  setPunch(attacker, now);
  const blocked = game.resolvePunch(attacker, defender, now);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.hit, false);
  assert.equal(defender.hits, 0);

  defender.angle = 0;
  for (let hit = 1; hit <= game.MAX_HITS; hit += 1) {
    setPunch(attacker, now + hit);
    const result = game.resolvePunch(attacker, defender, now + hit);
    assert.equal(result.hit, true);
    assert.equal(defender.hits, hit);
    assert.equal(result.knockout, hit === game.MAX_HITS);
  }
}

testArenaGeneration();
testMovementAndCollision();
testDirectionalBlockAndKnockout();
console.log("PASS: randomized arenas avoid both robot spawn zones");
console.log("PASS: simultaneous player movement vectors and obstacle collision handling");
console.log("PASS: directional blocking and five-hit knockout rule");
