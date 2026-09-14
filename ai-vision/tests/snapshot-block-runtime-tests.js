"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const aiVisionRoot = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(aiVisionRoot, "app.js"), "utf8");
const blocksSource = fs.readFileSync(path.join(aiVisionRoot, "blocks.js"), "utf8");
const elseIfDiagnosticProgram = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "else-if-diagnostic-program.json"), "utf8"),
);
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
    getInput(name) {
      return Object.prototype.hasOwnProperty.call(options.inputs || {}, name) ? { name } : null;
    },
    getInputTargetBlock(name) { return options.inputs?.[name] || null; },
    getNextBlock() { return options.next || null; },
  };
}

function booleanBlock(value, onEvaluate = null) {
  return {
    type: "logic_boolean",
    isEnabled: () => true,
    getFieldValue(name) {
      if (name === "BOOL" && onEvaluate) onEvaluate();
      return name === "BOOL" && value ? "TRUE" : "FALSE";
    },
  };
}

function variableBlock(name) {
  return statementBlock("variables_get", { fields: { VAR: name } });
}

function comparisonBlock(variableName, operation, value) {
  return statementBlock("logic_compare", {
    fields: { OP: operation },
    inputs: {
      A: variableBlock(variableName),
      B: numberBlock(value),
    },
  });
}

function printBlock(text, next = null) {
  return statementBlock("core_print_text", { fields: { TEXT: text }, next });
}

function controlsIfBlock(branches, options = {}) {
  const inputs = {};
  branches.forEach((branch, index) => {
    inputs[`IF${index}`] = branch.condition;
    inputs[`DO${index}`] = branch.body;
  });
  if (Object.prototype.hasOwnProperty.call(options, "elseBranch")) {
    inputs.ELSE = options.elseBranch;
  }
  return statementBlock("controls_if", { inputs, next: options.next || null });
}

function blockFromSerializedState(blockState) {
  if (!blockState) return null;
  const fields = { ...(blockState.fields || {}) };
  if (fields.VAR && typeof fields.VAR === "object") fields.VAR = fields.VAR.id;
  const inputs = Object.fromEntries(
    Object.entries(blockState.inputs || {}).map(([name, input]) => [
      name,
      blockFromSerializedState(input.block || input.shadow),
    ]),
  );
  return statementBlock(blockState.type, {
    fields,
    inputs,
    next: blockFromSerializedState(blockState.next?.block),
  });
}

function outputLines(output) {
  return output.children.map((line) => line.textContent);
}

function activeProgramControl(options = {}) {
  let active = true;
  return {
    isActive: () => active,
    waitWhilePaused: async () => active,
    delay: options.delay || (async () => active),
    stop(reason) {
      active = false;
      if (options.onStop) options.onStop(reason);
    },
  };
}

async function runStatementChain(firstBlock, control = activeProgramControl()) {
  const { runtime } = makeRuntime();
  const output = outputConsoleStub();
  runtime.beginRunForTest(output);
  runtime.setProgramControlForTest(control);
  await runtime.executeStatementChain(firstBlock, 1);
  return outputLines(output);
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

async function testControlsIfBranchSelection() {
  let laterConditionEvaluations = 0;
  const afterFirst = printBlock("AFTER");
  const firstMatch = controlsIfBlock([
    { condition: booleanBlock(true), body: printBlock("FIRST") },
    {
      condition: booleanBlock(true, () => { laterConditionEvaluations += 1; }),
      body: printBlock("LATER"),
    },
  ], {
    elseBranch: printBlock("ELSE"),
    next: afterFirst,
  });
  assert.deepEqual(await runStatementChain(firstMatch), ["FIRST", "AFTER"]);
  assert.equal(laterConditionEvaluations, 0, "conditions after the first match must not be evaluated");

  const firstElseIf = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: printBlock("IF1") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual(await runStatementChain(firstElseIf), ["IF1"], "the first ELSE IF branch must execute");

  const laterElseIf = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: null, body: printBlock("IF1") },
    { condition: booleanBlock(true), body: printBlock("IF2") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual(
    await runStatementChain(laterElseIf),
    ["IF2"],
    "a configured but unconnected condition must be false without hiding later ELSE IF branches",
  );

  const allFalseWithElse = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(false), body: printBlock("IF1") },
  ], { elseBranch: printBlock("ELSE") });
  assert.deepEqual(await runStatementChain(allFalseWithElse), ["ELSE"]);

  const allFalseWithoutElse = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(false), body: printBlock("IF1") },
  ], { next: printBlock("CONTINUED") });
  assert.deepEqual(await runStatementChain(allFalseWithoutElse), ["CONTINUED"]);
}

async function testControlsIfDiagnosticMatrix() {
  const cases = [
    [100, "LEFT"],
    [160, "CENTER"],
    [250, "RIGHT - expected result"],
    [140, "CENTER"],
    [180, "CENTER"],
  ];

  for (const [testX, expected] of cases) {
    const conditional = controlsIfBlock([
      {
        condition: comparisonBlock("testX", "LT", 140),
        body: printBlock("LEFT"),
      },
      {
        condition: comparisonBlock("testX", "GT", 180),
        body: printBlock("RIGHT - expected result"),
      },
    ], { elseBranch: printBlock("CENTER") });
    const program = statementBlock("variables_set", {
      fields: { VAR: "testX" },
      inputs: { VALUE: numberBlock(testX) },
      next: conditional,
    });

    assert.deepEqual(
      await runStatementChain(program),
      [expected],
      `testX=${testX} must select ${expected}`,
    );
  }
}

async function testSerializedElseIfDiagnostic() {
  const startBlock = blockFromSerializedState(elseIfDiagnosticProgram.workspace.blocks.blocks[0]);
  assert.deepEqual(
    await runStatementChain(startBlock.getNextBlock()),
    ["RIGHT - expected result"],
    "the portable testX=250 diagnostic must execute its serialized ELSE IF branch",
  );
}

async function testNestedControlsIf() {
  const inner = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("INNER IF0") },
    { condition: booleanBlock(true), body: printBlock("INNER IF1") },
  ], { elseBranch: printBlock("INNER ELSE") });
  const outer = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("OUTER IF0") },
    { condition: booleanBlock(true), body: inner },
  ], {
    elseBranch: printBlock("OUTER ELSE"),
    next: printBlock("AFTER"),
  });

  assert.deepEqual(await runStatementChain(outer), ["INNER IF1", "AFTER"]);
}

async function testWaitInsideSelectedElseIf() {
  let releaseDelay = null;
  const trace = [];
  const control = activeProgramControl({
    delay: async (milliseconds) => {
      trace.push(["delay-start", milliseconds]);
      await new Promise((resolve) => { releaseDelay = resolve; });
      trace.push(["delay-finish", milliseconds]);
      return true;
    },
  });
  const wait = statementBlock("core_wait_seconds", {
    inputs: { SECONDS: numberBlock(0.025) },
    next: printBlock("BRANCH FINISHED"),
  });
  const conditional = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: wait },
  ], {
    elseBranch: printBlock("ELSE"),
    next: printBlock("AFTER"),
  });
  const { runtime } = makeRuntime();
  const output = outputConsoleStub();
  runtime.beginRunForTest(output);
  runtime.setProgramControlForTest(control);

  const execution = runtime.executeStatementChain(conditional, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof releaseDelay, "function", "the selected ELSE IF branch must enter its wait");
  assert.deepEqual(outputLines(output), [], "branch and outer statements must wait for the async command");
  assert.deepEqual(trace, [["delay-start", 25]]);

  releaseDelay();
  await execution;
  assert.deepEqual(trace, [["delay-start", 25], ["delay-finish", 25]]);
  assert.deepEqual(outputLines(output), ["BRANCH FINISHED", "AFTER"]);
}

async function testStopInsideSelectedElseIf() {
  const stopReasons = [];
  const control = activeProgramControl({ onStop: (reason) => stopReasons.push(reason) });
  const stop = statementBlock("core_stop_program", { next: printBlock("BRANCH TAIL") });
  const selectedBranch = printBlock("SELECTED", stop);
  const conditional = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: selectedBranch },
  ], {
    elseBranch: printBlock("ELSE"),
    next: printBlock("OUTER TAIL"),
  });

  assert.deepEqual(await runStatementChain(conditional, control), ["SELECTED"]);
  assert.deepEqual(stopReasons, ["stop program"]);
}

async function testPauseResumeBeforeControlsIf() {
  let active = true;
  let paused = true;
  let releasePause = null;
  const control = {
    isActive: () => active,
    waitWhilePaused() {
      if (!active) return Promise.resolve(false);
      if (!paused) return Promise.resolve(true);
      return new Promise((resolve) => {
        releasePause = () => {
          paused = false;
          resolve(active);
        };
      });
    },
    delay: async () => active,
    stop() { active = false; },
  };
  const conditional = controlsIfBlock([
    { condition: booleanBlock(false), body: printBlock("IF0") },
    { condition: booleanBlock(true), body: printBlock("RESUMED") },
  ], {
    elseBranch: printBlock("ELSE"),
    next: printBlock("AFTER"),
  });
  const { runtime } = makeRuntime();
  const output = outputConsoleStub();
  runtime.beginRunForTest(output);
  runtime.setProgramControlForTest(control);

  const execution = runtime.executeStatementChain(conditional, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof releasePause, "function");
  assert.deepEqual(outputLines(output), [], "no condition or branch should execute while paused");

  releasePause();
  await execution;
  assert.deepEqual(outputLines(output), ["RESUMED", "AFTER"]);
}

async function main() {
  testGuidanceAndReporters();
  testSignatureDefaultsAndMigration();
  testTransactionalSettings();
  await testCommandDispatch();
  await testControlsIfBranchSelection();
  await testControlsIfDiagnosticMatrix();
  await testSerializedElseIfDiagnostic();
  await testNestedControlsIf();
  await testWaitInsideSelectedElseIf();
  await testStopInsideSelectedElseIf();
  await testPauseResumeBeforeControlsIf();

  assert.match(appSource, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(createProgramFile\(\)\)\)/);
  assert.match(
    appSource,
    /savedState\?\.format === PROGRAM_FORMAT[\s\S]*?workspace: validateWorkspaceState\(savedState\)[\s\S]*?settings: normalizeProgramSettings\(\{\}\)/,
  );

  console.log("PASS: VEX-style snapshot, item selection, count, fiducial identity, and camera-head blocks are wired");
  console.log("PASS: legacy snapshots default by scene and raw saved workspaces remain loadable");
  console.log("PASS: simulator settings validate and apply before workspace mutation with rollback");
  console.log("PASS: Blockly IF / ELSE IF / ELSE execution preserves nesting, waits, pause/resume, and Stop");
  console.log("PASS: Last Snapshot guidance, fallbacks, and portable format version 1 remain compatible");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
