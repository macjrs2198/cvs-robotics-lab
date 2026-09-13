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
        heading: "Live Camera and Last Snapshot",
        body: "The camera preview updates live. Program readings come only from the most recent Take Snapshot block.",
      }),
      Object.freeze({
        heading: "Refresh while tracking",
        body: "Repeat Take Snapshot inside the sensing loop whenever the program needs refreshed camera readings.",
      }),
      Object.freeze({
        heading: "Check Object Exists",
        body: "Check Object Exists before using object position, size, ID, or confidence properties.",
      }),
      Object.freeze({
        heading: "World View is a debug view",
        body: "World View is a teaching and debugging aid. It is not another sensor available to the robot program.",
      }),
      Object.freeze({ common: "runtime" }),
      Object.freeze({ common: "blockLibrary" }),
    ]),
  });
});
