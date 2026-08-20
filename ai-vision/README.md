# CVS AI Vision Simulator

A small, browser-based educational simulator that lets students use Google Blockly to write programs against simulated VEX V5 AI Vision Sensor data and issue basic simulated drivetrain commands. It is designed for learning sensor logic before a VEX V5 Brain or AI Vision Sensor is available.

The simulator uses a lightweight 2D world model to keep robot motion, the draggable target, camera projection, and a compact World View synchronized. It does not perform computer vision or connect to VEX hardware.

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

- **Save / Load** stores the Blockly program in this browser and device.
- **Export / Import** downloads or opens a portable `CVS-AI-Vision-Program.json` file.

## Version 1 features

- A touch-friendly Blockly workspace with event, control, logic, AI Vision, Drive, and output blocks
- One draggable target in a responsive 320 × 240 simulated camera coordinate system
- A compact top-down World View showing the shared robot position, heading, target, and 60-degree camera field of view
- Live `exists`, `centerX`, `centerY`, `width`, `height`, `id`, and `confidence` values
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
- `simulator.js` — shared world model, camera projection, World View layout, and draggable target simulation
- `drivetrain.js` — independent drivetrain command state and validation
- `blocks.js` — Blockly block definitions and toolbox setup
- `app.js` — block program interpreter, controls, output, local saving, and portable program files
- `assets/stormy.png` — transparent Stormy mascot artwork used by the interface

The Blockly program reads from the plain `window.visionSensor` object defined in `simulator.js`. Drivetrain commands update the separate `window.drivetrain` state through the small interface in `drivetrain.js`. These boundaries keep the sensor model, drivetrain state, Blockly definitions, and UI rendering independent.

## Future ideas — not implemented

- Multiple detected objects
- Adjustable object size
- Confidence changes
- Simulated missed detections
- Sensor noise
- AprilTags
- BEST Robotics game field
- Generated VEXcode Python or C++
- Offline/PWA support

These are intentionally outside Version 1. The current version is limited to proving that a Blockly program can respond live to simulated VEX AI Vision sensor data.
