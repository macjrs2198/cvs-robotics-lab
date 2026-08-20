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
    title: "CVS Analog Feedback",
    purpose: "Use potentiometer feedback to control the position of a simulated robotic arm.",
    instructions: Object.freeze([
      Object.freeze({
        heading: "Choose an arm size",
        body: "Configure the arm with 1, 2, or 3 joints. The gripper is always available.",
      }),
      Object.freeze({
        heading: "Calibrate potentiometers",
        body: "Set raw analog minimum and maximum values and map them to the mechanical angle range for each joint and the gripper.",
      }),
      Object.freeze({
        heading: "Move the arm",
        body: "Use the motor Spin, Reverse, Stop, and Velocity blocks to control each joint or the gripper.",
      }),
      Object.freeze({
        heading: "Read position",
        body: "Blockly receives the raw potentiometer value. Use mapping tools in the program to convert it into useful position information.",
      }),
      Object.freeze({
        heading: "Complete the task",
        body: "Move the arm to the object, grip it, move it to the destination, and release it.",
      }),
      Object.freeze({ common: "runtime" }),
      Object.freeze({ common: "blockLibrary" }),
    ]),
  });
});
