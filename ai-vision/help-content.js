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
    title: "CVS AI Vision",
    purpose: "Use Blockly to control a simulated robot using information from an AI Vision camera.",
    instructions: Object.freeze([
      Object.freeze({
        heading: "Move the target",
        body: "Drag the target object to place it in a different position in the simulated world.",
      }),
      Object.freeze({
        heading: "Camera View",
        body: "See what the robot currently sees. The target shifts as the robot turns and changes size as distance changes.",
      }),
      Object.freeze({
        heading: "World View",
        body: "Use the map to check the robot location, direction, camera field of view, and target position.",
      }),
      Object.freeze({
        heading: "Program the robot",
        body: "Build a Blockly program with the available Vision, Drive, Logic, and Control blocks.",
      }),
      Object.freeze({ common: "runtime" }),
      Object.freeze({ common: "blockLibrary" }),
    ]),
  });
});
