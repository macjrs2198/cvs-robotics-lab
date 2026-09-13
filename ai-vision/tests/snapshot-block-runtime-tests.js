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

const packStart = blocksSource.indexOf('id: "vision-sensors"');
const snapshotToolboxPosition = blocksSource.indexOf('type: "vision_take_snapshot"', packStart);
const firstReporterPosition = blocksSource.indexOf('type: "vision_exists"', packStart);
assert.ok(packStart >= 0, "the existing vision-sensors pack must remain available");
assert.ok(snapshotToolboxPosition > packStart, "Take Snapshot must be in the vision-sensors pack");
assert.ok(snapshotToolboxPosition < firstReporterPosition, "Take Snapshot must be the pack's first block");

assert.match(
  appSource,
  /case "vision_take_snapshot":\s*window\.VisionSimulator\.takeSnapshot\(\);\s*break;/,
);
assert.equal(
  (appSource.match(/VisionSimulator\.takeSnapshot\(\)/g) || []).length,
  1,
  "only the explicit Take Snapshot statement may capture",
);
assert.equal(
  (appSource.match(/VisionSimulator\.clearSnapshot\(\)/g) || []).length,
  1,
  "a fresh Run must clear the previous snapshot exactly once",
);

const runProgramSource = appSource.slice(
  appSource.indexOf("async function runProgram()"),
  appSource.indexOf("function resetSimulator()"),
);
assert.match(runProgramSource, /snapshotGuidanceShown = false;\s*window\.VisionSimulator\.clearSnapshot\(\);/);

const guidance = "This program needs Take Snapshot inside its sensing loop to refresh camera readings.";
assert.equal((appSource.match(new RegExp(guidance.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
assert.match(appSource, /if \(!window\.visionSensor\.captured && !snapshotGuidanceShown\)/);
assert.match(appSource, /snapshotGuidanceShown = true;\s*printToConsole\(SNAPSHOT_GUIDANCE, true\);/);
assert.match(appSource, /sensor\.exists \? sensor\.centerX : "\\u2014"/);
assert.match(appSource, /sensor\.exists \? sensor\.id : "\\u2014"/);

function testGuidanceGate() {
  const outputConsole = {
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
  const instrumentedSource = appSource.replace(
    /\}\)\(\);\s*$/,
    `window.__visionRuntimeTest = {
      evaluateValue,
      beginRunForTest(output) {
        snapshotGuidanceShown = false;
        elements.outputConsole = output;
        elements.consolePlaceholder = null;
      }
    };\n})();`,
  );
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
        centerX: 0,
        centerY: 0,
        width: 0,
        height: 0,
        id: -1,
        confidence: 0,
      },
      addEventListener() {},
      clearTimeout() {},
      setTimeout() {},
    },
  };

  vm.runInNewContext(instrumentedSource, context, { filename: "app.js" });
  const runtime = context.window.__visionRuntimeTest;
  const reporter = (type) => ({ type, isEnabled: () => true });

  runtime.beginRunForTest(outputConsole);
  assert.equal(runtime.evaluateValue(reporter("vision_exists")), false);
  assert.equal(runtime.evaluateValue(reporter("vision_center_x")), 0);
  assert.equal(outputConsole.children.length, 1, "multiple pre-snapshot reporters need one guidance line");
  assert.equal(outputConsole.children[0].textContent, guidance);

  context.window.visionSensor = { ...context.window.visionSensor, captured: true, exists: true, centerX: 123 };
  assert.equal(runtime.evaluateValue(reporter("vision_center_x")), 123);
  assert.equal(outputConsole.children.length, 1, "captured reporters must not add guidance");

  context.window.visionSensor = { ...context.window.visionSensor, captured: false, exists: false, centerX: 0 };
  runtime.beginRunForTest(outputConsole);
  runtime.evaluateValue(reporter("vision_exists"));
  runtime.evaluateValue(reporter("vision_width"));
  assert.equal(outputConsole.children.length, 2, "a new run may show one new guidance line");
}

testGuidanceGate();

console.log("PASS: Take Snapshot is the first AI Vision block and is the only capture path");
console.log("PASS: existing reporter IDs read only Last Snapshot data with once-per-run guidance");
console.log("PASS: unavailable Last Snapshot details render as dashes without changing reporter fallbacks");
console.log("PASS: storage key and portable program format remain compatible");
