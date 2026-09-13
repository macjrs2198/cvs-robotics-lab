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
    purpose: "Use Blockly to control a simulated robot from explicit AI Vision snapshots in either the ball sandbox or the Byte to Bite Dining Room.",
    instructions: Object.freeze([
      Object.freeze({
        heading: "Choose a scene and safe start",
        body: "Use Setup while stopped. The Dining Room offers only checked starting poses; tables and walls are solid, while the four visible corner openings remain passable.",
      }),
      Object.freeze({
        heading: "Place the one camera",
        body: "Choose Front, Rear, Left, or Right and a 5.5–24 inch lens height. Forward looks straight out from that side; Down tilts 60 degrees downward and outward without turning or stopping the robot.",
      }),
      Object.freeze({
        heading: "Live Camera and explicit snapshots",
        body: "The preview is live, but program readings change only after Take Snapshot. Check Object Exists; in the Dining Room, read Count, then select item 1, 2, and so on before checking its fiducial ID or image position.",
      }),
      Object.freeze({
        heading: "Fiducial limits",
        body: "Dining markers model VEX Circle21h7 AprilTag IDs 0–20. Cut-off, rear-facing, too-small, or obstructed patterns are omitted; confidence is not reported for tags.",
      }),
      Object.freeze({
        heading: "World View is a debug view",
        body: "World View shows chassis heading, camera mount/view, and physical blocking for teaching. Those true coordinates and collision details are not Blockly sensors. On wide screens, drag the divider—or focus it and use Left/Right arrows—to resize the programming and simulation areas; this device remembers that view preference, while narrower screens stack automatically.",
      }),
      Object.freeze({ common: "runtime" }),
      Object.freeze({ common: "blockLibrary" }),
    ]),
  });
});
