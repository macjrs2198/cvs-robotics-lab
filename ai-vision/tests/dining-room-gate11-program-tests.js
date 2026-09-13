"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../dining-room-model.js");

const fixturePath = path.join(
  __dirname,
  "fixtures",
  "dining-room-wall-to-table-program.json",
);
const program = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function nextBlock(block) {
  return block?.next?.block || null;
}

function inputBlock(block, name) {
  const input = block?.inputs?.[name];
  return input?.block || input?.shadow || null;
}

function inputNumber(block, name) {
  const numberBlock = inputBlock(block, name);
  assert.equal(numberBlock?.type, "math_number", `${block?.id}.${name} must be a number block`);
  const value = Number(numberBlock.fields?.NUM);
  assert.ok(Number.isFinite(value), `${block?.id}.${name} must contain a finite number`);
  return value;
}

function chainFrom(firstBlock) {
  const chain = [];
  const seen = new Set();
  let block = firstBlock;

  while (block) {
    assert.ok(!seen.has(block), "serialized next links must not contain a cycle");
    seen.add(block);
    chain.push(block);
    block = nextBlock(block);
  }

  return chain;
}

function visitBlocks(firstBlock, visitor) {
  if (!firstBlock) return;
  visitor(firstBlock);
  Object.values(firstBlock.inputs || {}).forEach((input) => {
    visitBlocks(input?.block, visitor);
    visitBlocks(input?.shadow, visitor);
  });
  visitBlocks(nextBlock(firstBlock), visitor);
}

assert.deepEqual(
  {
    format: program.format,
    formatVersion: program.formatVersion,
    app: program.app,
    appVersion: program.appVersion,
  },
  {
    format: "cvs-robotics-program",
    formatVersion: 1,
    app: "cvs-ai-vision",
    appVersion: "3.0",
  },
);
assert.deepEqual(program.settings, {
  scene: model.SCENE_ID,
  camera: { mount: "front", height: 12 },
  startPose: "table-4-north",
});
assert.equal(program.workspace?.blocks?.languageVersion, 0);
assert.equal(program.workspace?.blocks?.blocks?.length, 1);
console.log("PASS: Gate 11 fixture is a portable AI Vision v3 program with deterministic Dining Room setup");

const start = program.workspace.blocks.blocks[0];
const mainChain = chainFrom(start);
assert.deepEqual(mainChain.map((block) => block.type), [
  "event_when_started",
  "vision_look_forward",
  "vision_take_snapshot",
  "vision_set_object_item",
  "controls_if",
  "vision_look_down",
  "vision_take_snapshot",
  "vision_set_object_item",
  "controls_if",
]);

const [
  ,
  lookForward,
  wallSnapshot,
  wallItemBlock,
  wallIf,
  lookDown,
  tableSnapshot,
  tableItemBlock,
  tableIf,
] = mainChain;

assert.equal(lookForward.type, "vision_look_forward");
assert.equal(wallSnapshot.fields?.SIGNATURE, "FIDUCIAL_IDS");
assert.equal(tableSnapshot.fields?.SIGNATURE, "FIDUCIAL_IDS");
assert.equal(lookDown.type, "vision_look_down");

const wallCondition = inputBlock(wallIf, "IF0");
const wallBranch = chainFrom(inputBlock(wallIf, "DO0"));
assert.equal(wallCondition?.type, "vision_is_fiducial_id");
assert.equal(inputNumber(wallCondition, "ID"), 15);
assert.deepEqual(wallBranch.map((block) => block.type), [
  "core_print_text",
  "drive_set_turn_speed",
  "drive_turn_left",
  "core_wait_seconds",
  "drive_stop",
]);
assert.equal(wallBranch[0].fields?.TEXT, "WALL 15 VISIBLE");
const configuredTurnSpeed = Number(wallBranch[1].fields?.SPEED);
const configuredTurnSeconds = inputNumber(wallBranch[3], "SECONDS");
assert.equal(configuredTurnSpeed, 3);
assert.equal(configuredTurnSeconds, 0.2);
assert.ok(configuredTurnSeconds >= 0.15, "turn must remain visible across multiple animation frames");

const tableCondition = inputBlock(tableIf, "IF0");
const tableBranch = chainFrom(inputBlock(tableIf, "DO0"));
assert.equal(tableCondition?.type, "vision_is_fiducial_id");
assert.equal(inputNumber(tableCondition, "ID"), 4);
assert.deepEqual(tableBranch.map((block) => block.type), ["core_print_text"]);
assert.equal(tableBranch[0].fields?.TEXT, "TABLE 4 VISIBLE");

const allowedTypes = new Set([
  "event_when_started",
  "vision_look_forward",
  "vision_take_snapshot",
  "vision_set_object_item",
  "vision_is_fiducial_id",
  "vision_look_down",
  "controls_if",
  "core_print_text",
  "core_wait_seconds",
  "drive_set_turn_speed",
  "drive_turn_left",
  "drive_stop",
  "math_number",
]);
const serializedIds = new Set();
visitBlocks(start, (block) => {
  assert.ok(allowedTypes.has(block.type), `unexpected Gate 11 block type: ${block.type}`);
  assert.equal(typeof block.id, "string", `${block.type} must have a stable serialization ID`);
  assert.ok(!serializedIds.has(block.id), `duplicate serialized block ID: ${block.id}`);
  serializedIds.add(block.id);
});
console.log("PASS: sensor identity gates the only motion branch and all fixture blocks use public student APIs");

const initialState = model.createState({
  startPoseId: program.settings.startPose,
  camera: {
    ...program.settings.camera,
    head: "forward",
  },
});
assert.equal(model.isPoseValid(initialState.robot), true);

const forwardDetections = model.detectFiducials(initialState);
assert.deepEqual(forwardDetections.map((detection) => detection.id), [7, 15, 16]);
const wallItem = inputNumber(wallItemBlock, "ITEM");
assert.equal(wallItem, 2, "VEX Object Item selection is one-based");
const selectedWall = forwardDetections[wallItem - 1];
assert.equal(selectedWall.id, inputNumber(wallCondition, "ID"));
assert.equal(model.scene.fiducials.find((marker) => marker.id === selectedWall.id).surface, "wall");
console.log("PASS: the first real camera projection selects wall Fiducial ID 15 as Object Item 2");

// drive_turn_left runs the inside side at 35% of the configured output and
// the outside side at the full configured output.
const movement = model.integrateRobot(
  initialState,
  { leftOutput: configuredTurnSpeed * 0.35, rightOutput: configuredTurnSpeed },
  configuredTurnSeconds,
);
assert.equal(movement.blocked, false);
assert.equal(movement.collision, null);
assert.ok(
  Math.hypot(
    movement.pose.x - initialState.robot.x,
    movement.pose.y - initialState.robot.y,
  ) > 0.1,
  "conditional turn must produce real chassis motion",
);
assert.ok(movement.pose.heading > initialState.robot.heading, "Turn Left must increase heading");

const downDetections = model.detectFiducials(movement.pose, {
  ...program.settings.camera,
  head: "down",
});
assert.deepEqual(downDetections.map((detection) => detection.id), [4]);
const tableItem = inputNumber(tableItemBlock, "ITEM");
assert.equal(tableItem, 1);
const selectedTable = downDetections[tableItem - 1];
assert.equal(selectedTable.id, inputNumber(tableCondition, "ID"));
assert.equal(model.scene.fiducials.find((marker) => marker.id === selectedTable.id).surface, "table");
console.log("PASS: the conditional turn stays collision-free and the Down snapshot selects table Fiducial ID 4");

console.log("All Gate 11 wall-to-table program tests passed.");
