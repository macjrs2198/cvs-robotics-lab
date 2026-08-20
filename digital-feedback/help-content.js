(function (root, factory) {
  "use strict";

  const content = factory();
  if (typeof module === "object" && module.exports) module.exports = content;
  if (root) {
    root.CVSHelpContent = content;
    if (root.CVSHelpUI && root.document) root.CVSHelpUI.mount(content);
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // When a user-facing feature changes, update this Help definition in the same change.
  return Object.freeze({
    title: "CVS Digital Feedback",
    purpose: "Use Blockly and digital ON/OFF sensors to control a simulated robot.",
    instructions: Object.freeze([
      Object.freeze({
        heading: "Choose an activity",
        body: "Select Line Follower or Contact Switch from the Activity control.",
      }),
      Object.freeze({
        heading: "Edit the line-following track",
        body: "Change the black-white-black tape path to make turns and curves. Reset Track restores the original path.",
      }),
      Object.freeze({
        heading: "Configure line sensors",
        body: "Choose front, rear, or both mounts; select a single receiver or left/right receivers; then adjust offset and spacing. Readings stay digital ON/OFF.",
      }),
      Object.freeze({
        heading: "Use the Contact Switch",
        body: "Move the contact stop and use its digital switch state in the robot program.",
      }),
      Object.freeze({
        heading: "Program the robot",
        body: "Build an autonomous Blockly program with Digital Sensor, Drive, Logic, and Control blocks.",
      }),
      Object.freeze({ common: "runtime" }),
      Object.freeze({ common: "blockLibrary" }),
    ]),
  });
});
