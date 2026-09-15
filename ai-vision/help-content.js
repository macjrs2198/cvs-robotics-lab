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
        heading: "Choose a scene and safe chassis",
        body: "Change chassis dimensions in Setup only while stopped. Dining Room Length — front/back and Width — left/right each accept 6–36 inches in 0.5-inch steps. A change is accepted only when the selected start remains collision-free; the dimensions set the visible footprint, physical collisions, and camera mount offsets.",
      }),
      Object.freeze({
        heading: "Place the one camera",
        body: "Choose Front, Rear, Left, or Right and a 5.5–24 inch lens height. Forward is 0°, Down 45° is the new middle angle, and Down 60° preserves the original Look Down behavior. The selected head is saved; articulation changes the live camera view without moving the chassis, changing motor commands, or refreshing Last Snapshot.",
      }),
      Object.freeze({
        heading: "Command individual drive motors",
        body: "Motors blocks spin, stop, or set velocity for LeftDrive and RightDrive independently. Each side starts stopped with a 50% velocity setting and keeps its latest applicable command; setting velocity does not start a stopped motor, and Wait leaves a spinning motor running. STOP, Stop Program, RESET, completion, and runtime errors stop both sides. The DRIVE readout shows commanded output, not measured speed.",
      }),
      Object.freeze({
        heading: "Live Camera and explicit snapshots",
        body: "The preview is live, but program readings change only after Take Snapshot. Moving the robot or camera head does not alter captured values. Check Object Exists; in the Dining Room, read Count, then select item 1, 2, and so on. Cut-off, rear-facing, too-small, or obstructed fiducials are omitted.",
      }),
      Object.freeze({
        heading: "Select repeatable Table Meals",
        body: "While stopped in the Dining Room, open Table Meals, turn it On, and select table IDs 0–8. Randomize Meals chooses a mixed selection; Clear Meals removes all selections. Off hides meals but remembers the selected tables, and Reset repeats the setup. Meals can hide tabletop fiducials. A missing tag can also result from viewing angle, distance, or another obstruction. Fruit Clutter and Roaming Robot have separate controls and Randomize; they are not detected object classes.",
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
