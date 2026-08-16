# CVS Digital Feedback

CVS Digital Feedback is a lightweight, browser-only Blockly simulator for two autonomous digital-feedback activities: **Line Follower** and **Contact Switch**. The Line Follower supports constrained front and rear sensor mounting so students can compare placement without turning the activity into a freeform robot builder.

Both activities use one learning loop:

`digital sensor state → program decision → drive command → robot movement → new sensor state`

## Run locally

No build step is required. Serve this directory with any static file server, then open it in a modern browser.

```powershell
python -m http.server 4174
```

Then visit `http://localhost:4174`.

The app can also be deployed directly to GitHub Pages. Blockly and the two Google fonts are loaded from public CDNs, so the first page load requires a network connection.

## Files

- `index.html` — compact single-screen interface, sensor setup, and semantic controls
- `styles.css` — responsive CVS technical visual system
- `app.js` — shared activity selection, Blockly execution, rendering, persistence, and run controls
- `blocks.js` — Blockly definitions, configuration-aware toolbox, and starter programs
- `robot.js` — differential-drive state, motion model, and sensor rendering
- `sensors.js` — constrained front/rear single/dual digital receiver model and geometry
- `track.js` — editable smooth path, tape geometry, and surface lookup
- `activities/lineFollower.js` — line track, optical sensors, editor, and activity rendering
- `activities/contactSwitch.js` — movable contact stop, switch geometry, and activity rendering
- `tests/sensor-configuration-tests.js` — deterministic sensor geometry and drive regression tests
- `assets/stormy.png` — shared Stormy mascot artwork

## Activity architecture

Each activity implements a small shared shape: initialization, reset, update, Boolean inputs, and rendering. The selected activity owns only its environment and sensor state. Blockly execution, drive commands, the robot model, telemetry, controls, and output remain shared.

Changing activities stops execution and both drive outputs, resets the selected environment, swaps the visible sensor input blocks, and restores that activity's in-memory Blockly workspace.

## Line Follower

The track uses one configurable `TAPE_WIDTH` constant in `track.js`. It is rendered by drawing a three-tape-wide black stroke and a one-tape-wide white stroke over its center, producing `black | white | black`.

Receiver positions are calculated from the robot pose using robot-local longitudinal and lateral offsets. A receiver reports `ON` only while it is over the white center tape; black tape and the field report `OFF`. Surface calculations remain internal—Blockly receives Boolean values only.

The compact **SENSOR SETUP** panel independently configures front and rear mounts as **None**, **Single**, or **Dual**. Each active mount has a constrained longitudinal offset. Dual mounts also have constrained receiver spacing, with the emitter fixed at the midpoint. The defaults remain front single and rear none, preserving the original starting experience.

The Blockly toolbox is configuration-aware:

- Front single exposes `Front Sensor On?`.
- Front dual exposes `Front Left Sensor On?` and `Front Right Sensor On?`.
- Rear single exposes `Rear Sensor On?`.
- Rear dual exposes `Rear Left Sensor On?` and `Rear Right Sensor On?`.
- None exposes no blocks for that mount.

Changing a mounting mode or geometry stops execution and both drive outputs, resets the robot to the unchanged track's starting pose, clears inactive sensor states, updates the toolbox, and prevents stale inputs from remaining active.

Track editing remains unchanged: choose **DRAW / EDIT TRACK**, drag a handle or draw a replacement path, and use **RESET TRACK** to restore the original. The main **RESET** preserves the edited track.

## Contact Switch

The Contact Switch activity presents one differential-drive robot and one draggable striped contact stop. Three points across the robot's front switch bar are checked against the stop rectangle with a small contact margin. Contact reports one Boolean value: `ON` while touching and `OFF` otherwise. No force, pressure, distance, analog value, or collision response is modeled.

The supplied starter program drives forward at 40% until `Contact Switch On?` becomes true, then issues `Stop Driving`.

## Drive model

The simulated drivetrain maintains drive speed, turn speed, left output, right output, and current action. Forward and reverse apply equal outputs to both sides. Turns apply faster output to the outside wheel and reduced output to the inside wheel, producing the forward arcs used by the starter programs. Robot position is integrated with a lightweight differential-drive model; no collision or detailed wheel physics are included.

## Program storage

**SAVE**, **LOAD**, and **CLEAR** use separate browser `localStorage` slots for Line Follower and Contact Switch. Version 3 Line Follower saves include front/rear mode, longitudinal offset, and receiver spacing. Version 2 layout/spacing saves and the original Version 1 Line Follower save slot remain loadable without a separate migration workflow. No account or cloud service is used.

## Verification

Run the deterministic geometry/model checks with:

```powershell
node tests/sensor-configuration-tests.js
```

The updated application was also exercised in a real browser at 1366 × 768 and at the 900 × 1024 tablet breakpoint.

| Acceptance area | Result |
|---|---|
| Existing Line Follower, editable track, tape model, and drive commands | Pass |
| Front/rear None, Single, Dual, and simultaneous configurations | Pass |
| Configuration-aware Blockly sensor inputs with inactive blocks hidden | Pass |
| Front/rear offset, dual spacing, centered emitter, and rotation transforms | Pass |
| Boolean tape sensing and placement-dependent program behavior | Pass |
| Configuration changes during RUN stop execution and both drive outputs | Pass |
| Save/Load/Clear and Version 2 save compatibility | Pass |
| Contact Switch regression check | Pass |
| 1366 × 768 fit, tablet reflow, touch-safe canvas and coarse-pointer controls | Pass |
| Lightweight deterministic rendering with no browser warnings or errors | Pass |

## Scope and known limitations

The app implements exactly two activities: Line Follower and Contact Switch. Sensor placement is intentionally constrained to front/rear zones, one centered emitter, and at most two receivers per zone. It excludes arbitrary placement or rotation, analog sensing, thresholds, PID, vision, encoders, odometry, detailed collision physics, teleoperation, alternative chassis/motor configuration, accounts, analytics, and backend services.

Programs and configuration saves remain local to one browser. Blockly and the UI fonts require a network connection on first load because they are loaded from public CDNs.
