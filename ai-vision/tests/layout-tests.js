"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const layout = require("../layout.js");
const ballModel = require("../simulator.js");
const diningModel = require("../dining-room-model.js");

const aiVisionRoot = path.join(__dirname, "..");

function nearlyEqual(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(rect) {
    this.rect = { ...rect };
    this.clientWidth = rect.width;
    this.clientLeft = 0;
    this.offsetWidth = rect.width;
    this.hidden = false;
    this.tabIndex = 0;
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.capturedPointer = null;
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value),
      getPropertyValue: (name) => this.style.values.get(name) || "",
    };
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type, detail) {
    const event = {
      type,
      button: 0,
      isPrimary: true,
      shiftKey: false,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...detail,
    };
    (this.listeners.get(type) || []).forEach((listener) => listener(event));
    return event;
  }

  getBoundingClientRect() {
    return { ...this.rect };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  toggleAttribute(name, force) {
    if (force) this.attributes.set(name, "");
    else this.attributes.delete(name);
  }

  setPointerCapture(pointerId) {
    this.capturedPointer = pointerId;
  }

  hasPointerCapture(pointerId) {
    return this.capturedPointer === pointerId;
  }

  releasePointerCapture(pointerId) {
    if (this.capturedPointer === pointerId) this.capturedPointer = null;
  }
}

function createControllerHarness(existingStorageValues) {
  const frames = new Map();
  let nextFrameId = 1;
  let resizeNotifications = 0;
  const body = { classList: new FakeClassList() };
  const mediaListeners = [];
  const mediaQuery = {
    matches: true,
    addEventListener(type, listener) {
      if (type === "change") mediaListeners.push(listener);
    },
    removeEventListener() {},
  };
  const storageValues = existingStorageValues || new Map();
  const storage = {
    getItem(key) { return storageValues.get(key) || null; },
    setItem(key, value) { storageValues.set(key, value); },
  };
  const ownerWindow = {
    localStorage: storage,
    addEventListener() {},
    removeEventListener() {},
  };
  const ownerDocument = { body, defaultView: ownerWindow };
  const workbench = new FakeElement({ left: 100, top: 0, width: 1330, height: 700 });
  workbench.ownerDocument = ownerDocument;
  workbench.clientWidth = 1330;
  const divider = new FakeElement({ left: 620, top: 0, width: 24, height: 700 });
  divider.ownerDocument = ownerDocument;
  const requestAnimationFrame = (callback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    frames.set(id, callback);
    return id;
  };
  const cancelAnimationFrame = (id) => frames.delete(id);
  const flushFrames = () => {
    while (frames.size) {
      const pending = [...frames.entries()];
      frames.clear();
      pending.forEach(([, callback]) => callback());
    }
  };
  const controller = layout.create({
    workbench,
    divider,
    window: ownerWindow,
    storage,
    mediaQuery,
    requestAnimationFrame,
    cancelAnimationFrame,
    getComputedStyle: () => ({ paddingLeft: "18px", paddingRight: "18px" }),
    onResize: () => { resizeNotifications += 1; },
  });
  flushFrames();

  return {
    body,
    controller,
    divider,
    flushFrames,
    mediaQuery,
    mediaListeners,
    storageValues,
    workbench,
    getResizeNotifications: () => resizeNotifications,
  };
}

{
  const bounds = layout.getSplitBounds(1330 - 36, 24);
  assert.ok(bounds.minimum < 40);
  assert.ok(bounds.maximum > 40);
  const split = layout.getEffectiveSplit(40, 1330 - 36, 24);
  nearlyEqual(split.percent, 40);
  nearlyEqual(split.workspacePixels, split.usableWidth * 0.4);
  assert.equal(layout.getEffectiveSplit(5, 1330 - 36, 24).percent, bounds.minimum);
  assert.equal(layout.getEffectiveSplit(95, 1330 - 36, 24).percent, bounds.maximum);
  console.log("PASS: desktop split defaults near 40/60 and clamps both pane minima");
}

{
  assert.equal(layout.parseStoredSplit(null), 40);
  assert.equal(layout.parseStoredSplit("null"), 40);
  assert.equal(layout.parseStoredSplit("not json"), 40);
  assert.equal(layout.parseStoredSplit(JSON.stringify({ desktopSplitPercent: "nope" })), 40);
  assert.equal(layout.parseStoredSplit(JSON.stringify({ desktopSplitPercent: 7 })), 20);
  assert.equal(layout.parseStoredSplit(JSON.stringify({ desktopSplitPercent: 97 })), 80);
  assert.equal(layout.readStoredSplit({ getItem() { throw new Error("blocked"); } }), 40);
  assert.equal(layout.writeStoredSplit({ setItem() { throw new Error("blocked"); } }, 44), false);
  console.log("PASS: layout preference validation and unavailable storage fail safely");
}

{
  const harness = createControllerHarness();
  assert.match(harness.workbench.style.getPropertyValue("--workspace-size"), /px$/);
  assert.equal(harness.divider.getAttribute("aria-valuenow"), "40");
  assert.match(harness.divider.getAttribute("aria-valuetext"), /programming.*simulation/);
  const initialResizeCount = harness.getResizeNotifications();

  const keyboard = harness.divider.dispatch("keydown", { key: "ArrowRight" });
  harness.flushFrames();
  assert.equal(keyboard.defaultPrevented, true);
  assert.equal(keyboard.propagationStopped, true);
  assert.equal(harness.controller.getPreferredSplit(), 42);
  assert.ok(harness.getResizeNotifications() > initialResizeCount);
  assert.ok(harness.storageValues.has(layout.STORAGE_KEY));

  harness.divider.dispatch("keydown", { key: "Home" });
  harness.flushFrames();
  assert.equal(
    Math.round(harness.controller.getEffectiveSplit()),
    Number(harness.divider.getAttribute("aria-valuemin")),
  );
  harness.divider.dispatch("keydown", { key: "End" });
  harness.flushFrames();
  assert.equal(
    Math.round(harness.controller.getEffectiveSplit()),
    Number(harness.divider.getAttribute("aria-valuemax")),
  );
  const restored = createControllerHarness(harness.storageValues);
  restored.flushFrames();
  assert.equal(restored.controller.getPreferredSplit(), harness.controller.getPreferredSplit());
  console.log("PASS: separator keyboard controls update ARIA, clamp, persist, and notify Blockly sizing");
}

{
  const harness = createControllerHarness();
  const down = harness.divider.dispatch("pointerdown", {
    pointerId: 9,
    pointerType: "touch",
    clientX: 625,
  });
  assert.equal(down.defaultPrevented, true);
  assert.equal(harness.divider.capturedPointer, 9);
  assert.equal(harness.body.classList.contains("is-resizing-layout"), true);
  const move = harness.divider.dispatch("pointermove", {
    pointerId: 9,
    pointerType: "touch",
    clientX: 700,
  });
  harness.flushFrames();
  assert.equal(move.defaultPrevented, true);
  assert.ok(harness.controller.getPreferredSplit() > 40);
  const up = harness.divider.dispatch("pointerup", {
    pointerId: 9,
    pointerType: "touch",
    clientX: 700,
  });
  assert.equal(up.defaultPrevented, true);
  assert.equal(harness.divider.capturedPointer, null);
  assert.equal(harness.body.classList.contains("is-resizing-layout"), false);
  assert.ok(harness.storageValues.has(layout.STORAGE_KEY));
  console.log("PASS: one Pointer Events path supports touch, pointer capture, and persisted drag cleanup");
}

{
  const harness = createControllerHarness();
  const saved = harness.controller.getPreferredSplit();
  harness.divider.dispatch("pointerdown", { pointerId: 17, clientX: 625 });
  assert.equal(harness.divider.capturedPointer, 17);
  harness.mediaQuery.matches = false;
  harness.mediaListeners.forEach((listener) => listener({ matches: false }));
  harness.flushFrames();
  assert.equal(harness.divider.hidden, true);
  assert.equal(harness.divider.tabIndex, -1);
  assert.equal(harness.divider.capturedPointer, null);
  assert.equal(harness.body.classList.contains("is-resizing-layout"), false);
  assert.notEqual(harness.divider.getAttribute("aria-hidden"), null);
  assert.equal(harness.controller.getPreferredSplit(), saved);
  harness.mediaQuery.matches = true;
  harness.mediaListeners.forEach((listener) => listener({ matches: true }));
  harness.flushFrames();
  assert.equal(harness.divider.hidden, false);
  assert.equal(harness.divider.tabIndex, 0);
  assert.equal(harness.controller.getPreferredSplit(), saved);
  console.log("PASS: narrow mode hides the divider without discarding the desktop preference");
}

{
  const state = ballModel.createWorldState();
  const before = JSON.stringify(state);
  const ballLayout = ballModel.layoutWorldView(state, 720, 480);
  assert.equal(ballLayout.width, 720);
  assert.equal(ballLayout.height, 480);
  assert.equal(JSON.stringify(state), before);

  const diningState = diningModel.createState();
  const diningBefore = JSON.stringify(diningState);
  const diningLayout = diningModel.layoutWorldView(diningState, 720, 480);
  const squareDiningLayout = diningModel.layoutWorldView(diningState, 640, 640);
  const tallDiningLayout = diningModel.layoutWorldView(diningState, 440, 580);
  assert.equal(diningLayout.width, 720);
  assert.equal(diningLayout.height, 480);
  nearlyEqual(diningLayout.outerBoundary.width, diningLayout.outerBoundary.height);
  assert.ok(diningLayout.outerBoundary.x >= 0);
  assert.ok(diningLayout.outerBoundary.y >= 0);
  assert.ok(diningLayout.outerBoundary.x + diningLayout.outerBoundary.width <= diningLayout.width);
  assert.ok(diningLayout.outerBoundary.y + diningLayout.outerBoundary.height <= diningLayout.height);
  diningLayout.tables.forEach((table) => nearlyEqual(table.width, table.height));
  nearlyEqual(squareDiningLayout.outerBoundary.width, squareDiningLayout.outerBoundary.height);
  nearlyEqual(squareDiningLayout.outerBoundary.x, squareDiningLayout.outerBoundary.y);
  nearlyEqual(tallDiningLayout.outerBoundary.width, tallDiningLayout.outerBoundary.height);
  assert.ok(tallDiningLayout.outerBoundary.x >= 0);
  assert.ok(tallDiningLayout.outerBoundary.y >= 0);
  assert.ok(tallDiningLayout.outerBoundary.x + tallDiningLayout.outerBoundary.width <= tallDiningLayout.width);
  assert.ok(tallDiningLayout.outerBoundary.y + tallDiningLayout.outerBoundary.height <= tallDiningLayout.height);
  assert.equal(JSON.stringify(diningState), diningBefore);
  console.log("PASS: resized Ball and Dining maps use live dimensions, uniform scale, and immutable world state");
}

{
  const indexSource = fs.readFileSync(path.join(aiVisionRoot, "index.html"), "utf8");
  const stylesSource = fs.readFileSync(path.join(aiVisionRoot, "styles.css"), "utf8");
  const appSource = fs.readFileSync(path.join(aiVisionRoot, "app.js"), "utf8");
  const controllerSource = fs.readFileSync(path.join(aiVisionRoot, "dining-room-controller.js"), "utf8");
  const layoutSource = fs.readFileSync(path.join(aiVisionRoot, "layout.js"), "utf8");

  function elementTag(tagName, id) {
    const match = indexSource.match(new RegExp(`<${tagName}\\b[^>]*\\bid="${id}"[^>]*>`, "i"));
    assert.ok(match, `expected ${tagName}#${id}`);
    return match[0];
  }

  function attribute(tag, name) {
    const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
    return match && match[1];
  }

  function localAssetVersion(assetName) {
    const escapedName = assetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = Array.from(indexSource.matchAll(new RegExp(`(?:href|src)="\\./${escapedName}\\?v=([0-9]+\\.[0-9]+)"`, "g")));
    assert.equal(matches.length, 1, `${assetName} must have exactly one numeric cache-busted reference`);
    return matches[0][1];
  }

  assert.equal((indexSource.match(/role="separator"/g) || []).length, 1);
  assert.match(indexSource, /id="world-stage"/);
  assert.match(stylesSource, /--divider-size:\s*24px/);
  assert.match(stylesSource, /\.camera-view\s*\{[^}]*box-sizing:\s*content-box;[^}]*width:\s*min\(320px,/s);
  assert.match(stylesSource, /\.camera-view\s*\{[^}]*max-width:\s*320px;[^}]*aspect-ratio:\s*4\s*\/\s*3;/s);
  assert.match(stylesSource, /@media \(max-width: 1180px\)[\s\S]*?\.layout-divider\s*\{\s*display:\s*none;/);
  assert.match(controllerSource, /layoutWorldView\(ballWorld, worldDisplayWidth, worldDisplayHeight\)/);
  assert.match(controllerSource, /layoutWorldView\(diningState, worldDisplayWidth, worldDisplayHeight\)/);
  assert.match(controllerSource, /setTransform\(worldPixelRatio, 0, 0, worldPixelRatio, 0, 0\)/);
  assert.match(controllerSource, /cameraElement\.clientLeft/);
  assert.match(controllerSource, /cameraElement\.clientWidth/);
  assert.match(appSource, /const STORAGE_KEY = "vex-ai-vision-simulator-program-v1"/);
  const clearProgramSource = appSource.slice(
    appSource.indexOf("function clearProgram"),
    appSource.indexOf("function disableProgramButtons"),
  );
  assert.equal((clearProgramSource.match(/localStorage\.removeItem\(STORAGE_KEY\)/g) || []).length, 1);
  assert.equal(clearProgramSource.includes(layout.STORAGE_KEY), false);
  assert.notEqual(layout.STORAGE_KEY, "vex-ai-vision-simulator-program-v1");

  assert.match(indexSource, /<span>Length (?:&mdash;|—) front\/back<\/span>/);
  assert.match(indexSource, /<span>Width (?:&mdash;|—) left\/right<\/span>/);
  ["chassis-length-input", "chassis-width-input"].forEach((id) => {
    const input = elementTag("input", id);
    assert.equal(attribute(input, "type"), "number");
    assert.equal(attribute(input, "min"), "6");
    assert.equal(attribute(input, "max"), "36");
    assert.equal(attribute(input, "step"), "0.5");
    assert.equal(attribute(input, "value"), "18");
  });

  const headGroup = indexSource.match(/<div class="head-buttons"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(headGroup, "camera head button group must exist");
  const headButtons = Array.from(headGroup[1].matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g), (match) => ({
    id: attribute(match[1], "id"),
    pressed: attribute(match[1], "aria-pressed"),
    label: match[2].replace(/&deg;/g, "°").replace(/\s+/g, " ").trim(),
  }));
  assert.deepEqual(headButtons, [
    { id: "look-forward-button", pressed: "true", label: "Forward" },
    { id: "look-down-45-button", pressed: "false", label: "Down 45°" },
    { id: "look-down-button", pressed: "false", label: "Down 60°" },
  ]);

  const cameraCanvas = elementTag("canvas", "dining-camera-canvas");
  assert.equal(attribute(cameraCanvas, "width"), "320");
  assert.equal(attribute(cameraCanvas, "height"), "240");

  const originalAssetVersions = {
    "styles.css": "4.0",
    "help-content.js": "3.0",
    "dining-room-model.js": "1.1",
    "dining-room-controller.js": "2.0",
    "blocks.js": "3.0",
    "app.js": "4.1",
  };
  Object.entries(originalAssetVersions).forEach(([assetName, priorVersion]) => {
    assert.notEqual(
      localAssetVersion(assetName),
      priorVersion,
      `${assetName} must be cache-busted for this release`,
    );
  });
  localAssetVersion("drivetrain.js");

  ["VisionSimulator", "takeSnapshot", "resetWorld", "resetTarget", "setTargetPosition", "Drivetrain", "cvsProgramControl"]
    .forEach((forbidden) => assert.equal(layoutSource.includes(forbidden), false, `${forbidden} must stay out of layout.js`));
  console.log("PASS: setup labels, dimensions, three head controls, camera cap, cache busts, and source boundaries remain exact");
}
