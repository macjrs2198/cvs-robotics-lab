"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const aiVisionRoot = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(aiVisionRoot, "app.js"), "utf8");
const blocksSource = fs.readFileSync(path.join(aiVisionRoot, "blocks.js"), "utf8");
const reporterMappings = {
  vision_exists: "exists",
  vision_object_count: "count",
  vision_center_x: "centerX",
  vision_center_y: "centerY",
  vision_width: "width",
  vision_height: "height",
  vision_id: "id",
  vision_confidence: "confidence",
};

assert.match(appSource, /const STORAGE_KEY = "vex-ai-vision-simulator-program-v1";/);
assert.match(appSource, /const PROGRAM_FORMAT = "cvs-robotics-program";/);
assert.match(appSource, /const PROGRAM_FORMAT_VERSION = 1;/);

Object.entries(reporterMappings).forEach(([blockType, sensorProperty]) => {
  assert.match(
    appSource,
    new RegExp(`case "${blockType}":\\s*return readVisionSensor\\("${sensorProperty}"\\);`),
    `${blockType} must read the captured window.visionSensor property`,
  );
  assert.match(blocksSource, new RegExp(`type: "${blockType}"`));
});

[
  "vision_set_object_item",
  "vision_is_fiducial_id",
  "vision_look_forward",
  "vision_look_down",
].forEach((blockType) => assert.match(blocksSource, new RegExp(`type: "${blockType}"`)));

assert.match(blocksSource, /message0: "Take Snapshot of %1"/);
assert.match(blocksSource, /name: "SIGNATURE"/);
assert.match(blocksSource, /\["Target", "TARGET"\]/);
assert.match(blocksSource, /\["Fiducial IDs", "FIDUCIAL_IDS"\]/);
assert.match(blocksSource, /type: "vision_set_object_item"[\s\S]*?name: "ITEM", check: "Number"/);
assert.match(blocksSource, /type: "vision_is_fiducial_id"[\s\S]*?name: "ID", check: "Number"/);

const packStart = blocksSource.indexOf('id: "vision-sensors"');
const snapshotToolboxPosition = blocksSource.indexOf('type: "vision_take_snapshot"', packStart);
const firstReporterPosition = blocksSource.indexOf('type: "vision_exists"', packStart);
assert.ok(packStart >= 0, "the existing vision-sensors pack must remain available");
assert.ok(snapshotToolboxPosition > packStart, "Take Snapshot must be in the vision-sensors pack");
assert.ok(snapshotToolboxPosition < firstReporterPosition, "Take Snapshot must be the pack's first block");

assert.match(appSource, /const signature = resolveSnapshotSignature\(block\);[\s\S]*?VisionSimulator\.takeSnapshot\(signature\);/);
assert.equal(
  (appSource.match(/VisionSimulator\.takeSnapshot\(/g) || []).length,
  1,
  "only the explicit Take Snapshot statement may capture",
);
assert.match(appSource, /VisionSimulator\.setSnapshotObjectItem\(studentItem\)/);
assert.match(appSource, /VisionSimulator\.setHeadPreset\("forward"\)/);
assert.match(appSource, /VisionSimulator\.setHeadPreset\("down"\)/);
assert.equal(
  (appSource.match(/VisionSimulator\.clearSnapshot\(\)/g) || []).length,
  1,
  "a fresh Run must clear the previous snapshot exactly once",
);

const runProgramSource = appSource.slice(
  appSource.indexOf("async function runProgram()"),
  appSource.indexOf("function resetSimulator()"),
);
assert.match(runProgramSource, /snapshotGuidanceShown = false;[\s\S]*?VisionSimulator\.clearSnapshot\(\);/);

const guidance = "This program needs Take Snapshot inside its sensing loop to refresh camera readings.";
assert.equal((appSource.match(new RegExp(guidance.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
assert.match(appSource, /if \(!sensor\.captured && !snapshotGuidanceShown\)/);
assert.match(appSource, /snapshotGuidanceShown = true;\s*printToConsole\(SNAPSHOT_GUIDANCE, true\);/);
assert.match(appSource, /selectedExists \? safeSensor\.centerX : "\\u2014"/);
assert.match(appSource, /selectedExists \? safeSensor\.id : "\\u2014"/);
assert.match(appSource, /scene === DINING_ROOM_SCENE \? FIDUCIAL_SIGNATURE : TARGET_SIGNATURE/);
assert.match(appSource, /window\.addEventListener\("visionsettingschange"[\s\S]*?stopProgram\("settings changed"\)/);

function outputConsoleStub() {
  return {
    children: [],
    scrollHeight: 0,
    scrollTop: 0,
    appendChild(node) {
      node.isConnected = true;
      node.remove = () => {
        this.children = this.children.filter((child) => child !== node);
        node.isConnected = false;
      };
      this.children.push(node);
    },
    get firstElementChild() {
      return this.children[0] || null;
    },
  };
}

function makeRuntime() {
  const instrumentedSource = appSource.replace(
    /\}\)\(\);\s*$/,
    `window.__visionRuntimeTest = {
      evaluateValue,
      resolveSnapshotSignature,
      migrateLegacySnapshotSignatures,
      normalizeProgramSettings,
      validateProgramFile,
      replaceProgramTransactionally,
      createProgramFile,
      executeStatementChain,
      setWorkspaceForTest(nextWorkspace) { workspace = nextWorkspace; },
      setProgramControlForTest(nextProgramControl) { programControl = nextProgramControl; },
      beginRunForTest(output) {
        snapshotGuidanceShown = false;
        activeVisionSignature = null;
        elements.outputConsole = output;
        elements.consolePlaceholder = null;
      }
    };\n})();`,
  );
  const appliedSettings = [];
  const context = {
    console,
    document: {
      readyState: "loading",
      addEventListener() {},
      createElement() {
        return { className: "", textContent: "", isConnected: false };
      },
    },
    window: {
      visionSensor: {
        captured: false,
        exists: false,
        count: 0,
        centerX: 0,
        centerY: 0,
        width: 0,
        height: 0,
        id: -1,
        confidence: 0,
      },
      VisionSimulator: {
        settings: { scene: "ball", cameraMount: "front" },
        getSettings() { return { ...this.settings }; },
        normalizeSettings(settings) {
          if (settings.invalid) throw new Error("invalid settings");
          return { scene: settings.scene || "ball", cameraMount: settings.cameraMount || "front" };
        },
        applySettings(settings) {
          appliedSettings.push({ ...settings });
          this.settings = { ...settings };
        },
      },
      addEventListener() {},
      clearTimeout() {},
      setTimeout() {},
    },
  };

  vm.runInNewContext(instrumentedSource, context, { filename: "app.js" });
  return { context, runtime: context.window.__visionRuntimeTest, appliedSettings };
}

function reporter(type, inputs = {}) {
  return {
    type,
    isEnabled: () => true,
    getInputTargetBlock(name) { return inputs[name] || null; },
  };
}

function numberBlock(value) {
  return {
    type: "math_number",
    isEnabled: () => true,
    getFieldValue: () => value,
  };
}

function statementBlock(type, options = {}) {
  return {
    type,
    isEnabled: () => true,
    getFieldValue(name) { return options.fields?.[name] ?? null; },
    getInputTargetBlock(name) { return options.inputs?.[name] || null; },
    getNextBlock() { return options.next || null; },
  };
}

function testGuidanceAndReporters() {
  const { context, runtime } = makeRuntime();
  const output = outputConsoleStub();

  runtime.beginRunForTest(output);
  assert.equal(runtime.evaluateValue(reporter("vision_exists")), false);
  assert.equal(runtime.evaluateValue(reporter("vision_object_count")), 0);
  assert.equal(runtime.evaluateValue(reporter("vision_center_x")), 0);
  assert.equal(output.children.length, 1, "multiple pre-snapshot reporters need one guidance line");
  assert.equal(output.children[0].textContent, guidance);

  context.window.visionSensor = {
    ...context.window.visionSensor,
    captured: true,
    exists: true,
    count: 2,
    centerX: 123,
    id: 0,
    type: "fiducial",
    confidence: 91,
  };
  assert.equal(runtime.evaluateValue(reporter("vision_object_count")), 2);
  assert.equal(runtime.evaluateValue(reporter("vision_center_x")), 123);
  assert.equal(runtime.evaluateValue(reporter("vision_is_fiducial_id", { ID: numberBlock(0) })), true, "ID 0 is valid");
  assert.equal(runtime.evaluateValue(reporter("vision_is_fiducial_id", { ID: numberBlock(1) })), false);
  context.window.visionSensor = { ...context.window.visionSensor, type: "target", id: 1 };
  assert.equal(runtime.evaluateValue(reporter("vision_is_fiducial_id", { ID: numberBlock(1) })), false, "target IDs are not fiducials");
  assert.equal(output.children.length, 1, "captured reporters must not add guidance");

  context.window.VisionSimulator.settings.scene = "byte-to-bite-dining-room";
  assert.equal(runtime.evaluateValue(reporter("vision_confidence")), 0, "fiducial confidence is unsupported");
}

function testSignatureDefaultsAndMigration() {
  const { context, runtime } = makeRuntime();
  const missingFieldBlock = { getFieldValue: () => null };
  const targetBlock = { getFieldValue: () => "TARGET" };
  const fiducialBlock = { getFieldValue: () => "FIDUCIAL_IDS" };

  assert.equal(runtime.resolveSnapshotSignature(missingFieldBlock), "TARGET");
  assert.equal(runtime.resolveSnapshotSignature(targetBlock), "TARGET");
  assert.equal(runtime.resolveSnapshotSignature(fiducialBlock), "FIDUCIAL_IDS");
  context.window.VisionSimulator.settings.scene = "byte-to-bite-dining-room";
  assert.equal(runtime.resolveSnapshotSignature(missingFieldBlock), "FIDUCIAL_IDS");

  const legacyWorkspace = {
    blocks: {
      blocks: [{
        type: "event_when_started",
        next: { block: { type: "vision_take_snapshot", next: { block: { type: "vision_exists" } } } },
      }],
    },
  };
  const migrated = runtime.migrateLegacySnapshotSignatures(legacyWorkspace, "byte-to-bite-dining-room");
  assert.equal(migrated.blocks.blocks[0].next.block.fields.SIGNATURE, "FIDUCIAL_IDS");
  assert.equal(legacyWorkspace.blocks.blocks[0].next.block.fields, undefined, "migration must not mutate saved input");
}

function makeWorkspace(initialState, order, failNextLoad = false) {
  return {
    state: structuredClone(initialState),
    failNextLoad,
    clear() {
      order.push("clear-workspace");
      this.state = {};
    },
  };
}

function testTransactionalSettings() {
  const { context, runtime, appliedSettings } = makeRuntime();
  const order = [];
  const workspace = makeWorkspace({ blocks: { blocks: [{ type: "old" }] } }, order);
  context.Blockly = {
    serialization: {
      workspaces: {
        save(target) { return structuredClone(target.state); },
        load(state, target) {
          order.push(`load-${state.blocks.blocks[0].type}`);
          if (target.failNextLoad) {
            target.failNextLoad = false;
            throw new Error("workspace load failed");
          }
          target.state = structuredClone(state);
        },
      },
    },
  };
  const originalApply = context.window.VisionSimulator.applySettings;
  context.window.VisionSimulator.applySettings = function applySettings(settings) {
    order.push(`apply-${settings.scene}`);
    originalApply.call(this, settings);
  };
  runtime.setWorkspaceForTest(workspace);

  const normalized = runtime.normalizeProgramSettings({ scene: "byte-to-bite-dining-room", cameraMount: "rear" });
  runtime.replaceProgramTransactionally(
    { blocks: { blocks: [{ type: "vision_take_snapshot" }] } },
    normalized,
  );
  assert.deepEqual(order.slice(0, 3), [
    "apply-byte-to-bite-dining-room",
    "clear-workspace",
    "load-vision_take_snapshot",
  ], "settings must apply before workspace mutation");
  assert.equal(workspace.state.blocks.blocks[0].fields.SIGNATURE, "FIDUCIAL_IDS");

  order.length = 0;
  workspace.failNextLoad = true;
  assert.throws(
    () => runtime.replaceProgramTransactionally(
      { blocks: { blocks: [{ type: "broken" }] } },
      runtime.normalizeProgramSettings({ scene: "ball" }),
    ),
    /workspace load failed/,
  );
  assert.equal(appliedSettings.at(-1).scene, "byte-to-bite-dining-room", "failed loads restore prior settings");
  assert.equal(workspace.state.blocks.blocks[0].type, "vision_take_snapshot", "failed loads restore prior workspace");

  order.length = 0;
  runtime.replaceProgramTransactionally(
    { blocks: { blocks: [{ type: "vision_take_snapshot" }] } },
    runtime.normalizeProgramSettings({}),
  );
  assert.equal(appliedSettings.at(-1).scene, "ball", "raw legacy saves restore their original Ball scene");
  assert.equal(
    workspace.state.blocks.blocks[0].fields.SIGNATURE,
    "TARGET",
    "raw legacy snapshot blocks migrate using Ball semantics even when Dining was active",
  );
}

async function testCommandDispatch() {
  const { context, runtime } = makeRuntime();
  const calls = [];
  context.window.VisionSimulator.takeSnapshot = (signature) => calls.push(["snapshot", signature]);
  context.window.VisionSimulator.setSnapshotObjectItem = (item) => calls.push(["item", item]);
  context.window.VisionSimulator.setHeadPreset = (preset) => calls.push(["head", preset]);
  runtime.setProgramControlForTest({
    isActive: () => true,
    waitWhilePaused: async () => true,
  });

  const lookForward = statementBlock("vision_look_forward");
  const lookDown = statementBlock("vision_look_down", { next: lookForward });
  const selectItem = statementBlock("vision_set_object_item", {
    inputs: { ITEM: numberBlock(2) },
    next: lookDown,
  });
  const snapshot = statementBlock("vision_take_snapshot", {
    fields: { SIGNATURE: "FIDUCIAL_IDS" },
    next: selectItem,
  });

  await runtime.executeStatementChain(snapshot, 1);
  assert.deepEqual(calls, [
    ["snapshot", "FIDUCIAL_IDS"],
    ["item", 2],
    ["head", "down"],
    ["head", "forward"],
  ]);
}

async function main() {
  testGuidanceAndReporters();
  testSignatureDefaultsAndMigration();
  testTransactionalSettings();
  await testCommandDispatch();

  assert.match(appSource, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(createProgramFile\(\)\)\)/);
  assert.match(
    appSource,
    /savedState\?\.format === PROGRAM_FORMAT[\s\S]*?workspace: validateWorkspaceState\(savedState\)[\s\S]*?settings: normalizeProgramSettings\(\{\}\)/,
  );

  console.log("PASS: VEX-style snapshot, item selection, count, fiducial identity, and camera-head blocks are wired");
  console.log("PASS: legacy snapshots default by scene and raw saved workspaces remain loadable");
  console.log("PASS: simulator settings validate and apply before workspace mutation with rollback");
  console.log("PASS: Last Snapshot guidance, fallbacks, and portable format version 1 remain compatible");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
