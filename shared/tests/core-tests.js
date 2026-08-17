"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const sharedRoot = path.join(__dirname, "..");
const runtime = require(path.join(sharedRoot, "runtime", "program-control.js"));
const core = require(path.join(sharedRoot, "blockly", "core-blocks.js"));
const toolbox = require(path.join(sharedRoot, "blockly", "core-toolbox.js"));

async function testRuntime() {
  let stopped = 0;
  const states = [];
  const control = runtime.create({
    stopMotion: () => { stopped += 1; },
    onStateChange: (state) => states.push(state.state),
  });

  const token = control.run();
  assert.equal(control.isActive(token), true);
  assert.equal(control.pause(), true);
  assert.equal(control.isPaused(), true);

  let resumed = false;
  const waiting = control.waitWhilePaused(token).then((active) => { resumed = active; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(resumed, false);
  control.resume();
  await waiting;
  assert.equal(resumed, true);

  let condition = false;
  setTimeout(() => { condition = true; }, 10);
  assert.equal(await control.waitUntil(() => condition, token, 2), true);
  control.stop();
  assert.equal(control.isActive(token), false);
  assert.equal(stopped, 1);
  assert.deepEqual(states.slice(-4), ["running", "paused", "running", "stopped"]);

  const delayToken = control.run();
  let delayFinished = false;
  const delayed = control.delay(25, delayToken).then(() => { delayFinished = true; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  control.pause();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(delayFinished, false, "paused elapsed time must not consume the remaining wait");
  control.resume();
  await delayed;
  assert.equal(delayFinished, true);
  control.stop();
}

function testCoreToolbox() {
  const packs = [
    { id: "sensors", category: { kind: "category", name: "Sensors" } },
    { id: "drive", category: { kind: "category", name: "Drive" } },
  ];
  const composed = core.composeToolbox(packs, new Set(["drive"]));
  const names = composed.contents.map((category) => category.name);
  assert.deepEqual(names.slice(0, 5), ["Events / Control", "Logic", "Math", "Variables", "Output"]);
  assert.equal(names.includes("Sensors"), false);
  assert.equal(names.includes("Drive"), true);

  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
  };
  const definitions = [
    { id: "sensors", defaultEnabled: true },
    { id: "drive", defaultEnabled: false },
  ];
  assert.deepEqual(toolbox.readPreferences("test", definitions, storage), { sensors: true, drive: false });
  toolbox.writePreferences("test", { sensors: false, drive: true }, storage);
  assert.deepEqual(toolbox.readPreferences("test", definitions, storage), { sensors: false, drive: true });
}

(async () => {
  await testRuntime();
  testCoreToolbox();
  console.log("PASS: shared runtime run/pause/resume/stop and cooperative wait");
  console.log("PASS: mandatory Core toolbox and persisted optional pack preferences");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
