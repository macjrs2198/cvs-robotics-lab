# CVS AI Vision Simulator

A small, browser-based educational simulator that lets students use Google Blockly to write programs against simulated, snapshot-based VEX V5 AI Vision Sensor data and issue basic simulated drivetrain commands. It includes the original draggable-ball sandbox and a source-verified **Byte to Bite — Dining Room** fiducial scene.

The simulator uses lightweight 2D physics plus analytical 3D camera projection to keep robot motion, live preview, detections, and a compact World View synchronized. It does not perform pixel recognition, connect to VEX hardware, or expose debug-world coordinates to student code.

## Run Locally

The app has no build step, backend, database, or installation requirement. It does need an internet connection to load Google Blockly from its CDN.

Either open `index.html` directly in a modern browser or serve the folder with any static file server. For example, if Python is already installed:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages Deployment

1. Push the repository to GitHub.
2. Open the repository **Settings**.
3. Open **Pages**.
4. Select **Deploy from a branch**.
5. Select `main`.
6. Select `/ (root)`.
7. Save.
8. Use the generated GitHub Pages URL.

No build command or configuration file is required.

## Program Storage

- **Save / Load** stores the Blockly program and persistent scene/camera/start setup in this browser and device.
- **Export / Import** downloads or opens a portable `CVS-AI-Vision-Program.json` file with those settings.
- The desktop programming/simulation split is remembered separately as a device-only view preference. It is never included in saved or exported student programs, and clearing a program does not reset it.

Existing saved and portable projects continue to load without being rewritten. If a project reads an AI Vision reporter before taking a snapshot, it receives a compatibility message so the student can add snapshot capture inside the appropriate sensing loop.

## Snapshot sensing model

The **Live Camera** preview updates continuously from the simulated world. Blockly does not read that live projection. **Take Snapshot** copies the currently eligible target or fiducial detections into a separate immutable **Last Snapshot** dataset, and every AI Vision reporter reads only that captured dataset.

- A new Run or Reset begins with no captured detection.
- Take Snapshot replaces the previous dataset; moving the robot or target does not change an existing snapshot.
- Tracking programs should repeat Take Snapshot and check Object Exists before reading object properties. Fiducial programs can read Object Count and select student-facing items 1, 2, and so on.
- An empty snapshot returns `false` for Object Exists. Program-visible numeric position, size, and confidence fallbacks are `0`, and the internal unavailable ID is `-1`. The Last Snapshot panel displays unavailable properties as a dash rather than as meaningful measurements.
- The ball sandbox retains its partial-target policy and approximate range. Dining Room fiducials are conservative: a pattern must face the camera, be entirely inside the image, be large enough, and be unobstructed by modeled geometry.

The World View can display the true robot pose, camera mount/view, collision blocking, target location, distance, and bearing for teaching and debugging. Those world coordinates and debug measurements are not available through Blockly; student programs receive only values copied into the Last Snapshot dataset.

## Dining Room model

The Dining Room uses inches with the center table at the origin, +X to map-right, +Y toward the Blue/Red (map-top) side, and +Z upward. Source CAD and construction drawings establish:

- Nine 12 × 12 inch tables on a 36-inch grid, with 24-inch clear gaps and tabletop height 3.625 inches.
- Wall inside faces at X/Y = ±66 inches and 18 inches high. The 84-inch top/bottom walls leave the four real 24-inch corner openings; the two-piece side walls span 139.25 inches.
- Marker IDs and printed-top directions follow the supplied placement map. The 8.5-inch paper and 7.6388889-inch recognition pattern are modeled separately.
- The fixed chassis is an 18 × 18 inch rounded square with 2-inch corner radius and a 4.5-inch platform top. Collision uses its complete oriented rounded footprint and bounded movement substeps; blocked physical motion does not alter student motor commands.

The setup selector offers only validated starting poses. The one camera is fixed at the midpoint of the selected Front/Rear/Left/Right body edge. Lens height is 5.5–24 inches (12 by default); Look Forward is horizontal and Look Down is a fixed 60-degree downward/outward pitch. Camera head movement never changes chassis pose, chassis-forward, or drivetrain output.

Dining detections analytically project the actual supplied Circle21h7 patterns into the 320 × 240 image and use modeled 3D surfaces for front-face, image-cutoff, projected-size, and occlusion decisions. This approximates VEX-style sensor output; it is not hardware-validated decoding. Confidence is an AI-classification property and is unavailable for Dining Room tags. Tag angle is intentionally not exposed by this simulator.

The apparent source discrepancy between 54 and 69.625 inches is resolved: 54 inches is the outer long-wall fiducial centerline datum, while 69.625 inches is each transformed wall-panel half length. The assembled long wall is 139.25 inches. Raw CAD/PDF sources are not deployed; only the required extracted marker PNGs and this concise provenance are included.

## Current features

- A touch-friendly Blockly workspace with event, control, logic, AI Vision, Drive, and output blocks
- Original draggable target sandbox plus the fixed Byte to Bite Dining Room scene
- One configurable four-side camera with rigid mount and 0°/60° head presets
- Actual supplied fiducial artwork IDs 0–20 projected from 3D marker geometry
- A compact top-down, debug-only World View showing the shared robot position, heading, target, and 60-degree camera field of view
- An expandable desktop World View beside a camera preview capped at its native 320 × 240 content size, with one mouse-, touch-, and keyboard-accessible layout divider
- Explicit Take Snapshot sensing with immutable object lists, count, 1-based selection, identity, and image-space values
- Full-footprint Dining Room wall/table collision with anti-tunneling substeps
- Run, stop, and reset controls
- A live program output console for the Print blocks
- The same seven Drive blocks used by CVS Digital Feedback: forward, reverse, left, right, stop, drive speed, and turn speed
- Separate internal left/right drive outputs with a compact live output display
- Safety behavior that stops the drivetrain whenever program execution stops
- Local program save, load, and clear using `localStorage`
- Portable JSON program export and import with app and format validation
- Static files that run on GitHub Pages without a framework or build pipeline
- A restrained dark engineering-grid interface with machine-vision camera styling
- Space Grotesk and Space Mono typography with system-font fallbacks
- Stormy tornado mascot branding in the compact header and background watermark

## Project files

- `index.html` — page structure and Blockly CDN loading
- `styles.css` — responsive, touchscreen-friendly layout
- `dining-room-model.js` — verified scene data, robot collision, camera transforms, projection, and fiducial visibility
- `simulator.js` — ball-world model and immutable snapshot primitives
- `dining-room-controller.js` — two-scene browser rendering, setup controls, and draggable target simulation
- `layout.js` — isolated responsive divider behavior and device-only layout preference
- `drivetrain.js` — independent drivetrain command state and validation
- `blocks.js` — Blockly block definitions and toolbox setup
- `app.js` — block program interpreter, controls, output, local saving, and portable program files
- `assets/stormy.png` — transparent Stormy mascot artwork used by the interface
- `assets/fiducials/` — optimized supplied pattern artwork and attribution

The Blockly program reads captured data from the plain `window.visionSensor` object defined in `simulator.js`. Live projection and World View data remain separate inside the simulator. Drivetrain commands update the independent `window.drivetrain` state through the small interface in `drivetrain.js`. These boundaries keep world knowledge, live rendering, captured sensor data, drivetrain state, Blockly definitions, and UI rendering independent.

## Future ideas — not implemented

- Hardware-calibrated detection thresholds and optical distortion
- Adjustable object size
- Confidence changes
- Simulated missed detections
- Sensor noise
- Fiducial angle reporting
- Other BEST Robotics game areas and mechanisms
- Generated VEXcode Python or C++
- Offline/PWA support

These are intentionally outside Version 1. The current version is limited to proving that a Blockly program can respond to explicitly captured simulated VEX AI Vision sensor data.
