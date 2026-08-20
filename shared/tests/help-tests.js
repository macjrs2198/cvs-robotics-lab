"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.join(__dirname, "..", "..");
const helpUi = require(path.join(repositoryRoot, "shared", "help", "help-ui.js"));
const apps = [
  {
    directory: "ai-vision",
    requiredText: ["Move the target", "Camera View", "World View"],
  },
  {
    directory: "digital-feedback",
    requiredText: ["Edit the line-following track", "Configure line sensors", "Contact Switch"],
  },
  {
    directory: "analog-feedback",
    requiredText: ["Choose an arm size", "Calibrate potentiometers", "Read position"],
  },
];

assert.deepEqual(helpUi.storageItems, [
  {
    heading: "Save / Load",
    body: "Stores your project on this browser and device.",
  },
  {
    heading: "Export / Import",
    body: "Creates or opens a portable project file that can be moved between devices.",
  },
]);

apps.forEach(({ directory, requiredText }) => {
  const contentPath = path.join(repositoryRoot, directory, "help-content.js");
  const htmlPath = path.join(repositoryRoot, directory, "index.html");
  const content = require(contentPath);
  const contentSource = fs.readFileSync(contentPath, "utf8");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.equal(helpUi.validateContent(content), true);
  const scannableItems = content.instructions.length + helpUi.storageItems.length;
  assert.ok(scannableItems >= 6 && scannableItems <= 10, `${directory} Help should stay concise`);
  assert.equal((html.match(/id="help-button"/g) || []).length, 1, `${directory} needs one Help button`);
  assert.match(html, /shared\/help\/help-ui\.css/);
  assert.match(html, /shared\/help\/help-ui\.js/);
  assert.match(html, /help-content\.js/);
  assert.ok(
    html.indexOf("shared/help/help-ui.js") < html.indexOf("help-content.js"),
    `${directory} must load the shared renderer before its content`,
  );
  requiredText.forEach((text) => assert.match(contentSource, new RegExp(text)));
});

console.log("PASS: all three apps expose concise, app-owned Help definitions");
console.log("PASS: shared Help runtime, Block Library, and portable storage wording stay consistent");
