# CVS Analog Feedback

CVS Analog Feedback is a lightweight, static sibling simulator for learning closed-loop robot-arm control with MC55-style continuous motor commands and raw potentiometer feedback.

The only activity in this version is **Robot Arm**. Students command one to three rotational joints plus an always-present gripper, read each actuator's 12-bit analog value, map that value in Blockly, and decide when to reverse or stop the motor.

## Run locally

Serve this directory with any static web server and open `index.html`. For example:

```powershell
python -m http.server 4175
```

Then visit `http://127.0.0.1:4175/`.

Blockly and the two UI fonts are loaded from public CDNs, so the first page load needs an internet connection. The simulator itself has no backend, account, database, or cloud storage.

## Files

- `index.html` — semantic app shell, responsive two-panel layout, controls, canvas, instrumentation, and output.
- `styles.css` — CVS-family dark technical theme, grid, Blockly styling, responsive breakpoints, and touch sizing.
- `app.js` — application state, Blockly interpreter, Run/Stop/Reset, calibration UI, instrumentation, and localStorage.
- `blocks.js` — compact Blockly categories, custom blocks, dynamic device menus, and closed-loop starter program.
- `arm.js` — deterministic two-dimensional arm geometry, limits, motion, and canvas rendering.
- `motors.js` — independent MC55-style motor state and velocity clamping.
- `analog.js` — per-actuator calibration, 12-bit raw readings, and generic linear mapping.
- `objects.js` — one object, one drop zone, simple capture/release, and task completion.
- `assets/stormy.png` — shared Stormy family branding.
- `tests/model-tests.js` — deterministic model-level acceptance checks.

## Models

### Arm geometry

The arm is a 2D serial rotational chain rooted at a fixed base. Enabled links always total 260 canvas units:

- 1 joint: 260
- 2 joints: 165 + 95
- 3 joints: 130 + 75 + 55

Each link uses the cumulative angles of all preceding joints. Joint commands advance at up to 70 degrees per second, scaled linearly by motor velocity. Every position update is clamped to the mechanical limits from that actuator's calibration.

### Analog feedback

Each active moving element has calibration values for raw minimum/maximum and mechanical minimum/maximum. Physical position is linearly converted to an integer raw value and clamped to the configured 12-bit range. Blockly only receives the raw value; actual angle/opening is available solely in live instrumentation.

The generic map reporter implements:

```text
outputMin + ((value - inputMin) / (inputMax - inputMin)) × (outputMax - outputMin)
```

An invalid zero-width input range safely returns the output minimum.

### MC55-style motors

Motor state is separate from Blockly and geometry. Each active actuator stores only a continuous direction (`forward`, `reverse`, or `stopped`) and a velocity clamped to 0–100%. A spin command persists until another command changes it, STOP is pressed, or the program stops. There are no encoders or position motor commands.

### Gripper and object

The gripper uses the same motor and raw potentiometer model as a joint, with 0–100% internal opening. The single object attaches when it is near the capture point and the gripper closes to 35% or less. It follows the gripper while held and releases at 65% or more. Releasing inside the single drop zone shows `TASK COMPLETE`. No gravity, mass, force, slipping, or collision physics are simulated.

## Verification

Model tests:

```powershell
node tests/model-tests.js
```

The implementation was also exercised in a real browser at 1366 × 768 and at the 900 × 1024 tablet breakpoint.

| # | Acceptance criterion | Result |
|---:|---|---|
| 1 | Static web app loads | Pass |
| 2–5 | 1/2/3 joints, persistent gripper, matching motors and potentiometers | Pass |
| 6–9 | Editable calibration, bounded continuous raw values, generic map | Pass |
| 10–16 | Forward/reverse/stop/velocity, feedback loop, target settling, mechanical limits | Pass |
| 17–23 | Motor-driven gripper, gripper feedback, capture/move/release/drop completion | Pass |
| 24–25 | STOP preserves pose; RESET restores physical starting state and output | Pass |
| 26 | Save/Load/Clear through localStorage | Pass |
| 27 | 1366 × 768 layout fits without page overflow | Pass |
| 28 | Responsive tablet layout and coarse-pointer control sizing | Pass |
| 29 | Lightweight canvas geometry and throttled instrumentation remain smooth | Pass |

The default closed-loop starter was run in the browser. Joint 1 moved from 35.0° to 85.2°, its raw reading moved from 1174 to 1969, and the Blockly program stopped the motor inside the programmed 85–95° band.

## Known limitations

- The model is deliberately deterministic and educational, not a robot-arm engineering or physics simulator.
- Object interaction is distance/threshold based; links and objects do not collide.
- Only the supplied starter program is preloaded. The single manipulation challenge is intended to be programmed by the student.
- A student must update mapping constants after changing calibration; the app does not secretly rewrite their Blockly program.
- Programs and settings are browser-local and do not sync between devices.
