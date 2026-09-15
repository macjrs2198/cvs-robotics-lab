# CVS Robotics Lab

CVS Robotics Lab is a static browser package containing three independent Blockly robotics simulators, a two-player robot battle game, and a separate practice Score & Strategy calculator:

**Live student site:** https://macjrs2198.github.io/cvs-robotics-lab/

- **CVS Digital Feedback** — digital sensors, line following, and autonomous feedback
- **CVS AI Vision** — machine vision and autonomous sensor response
- **CVS Analog Feedback** — potentiometers, motor control, and position feedback
- **Robot Rumble** — two-player keyboard robot combat with directional blocking and arena hazards
- **[CVS Score & Strategy](./score-strategy/)** — Byte to Bite practice-round scorer, independent three-minute timer, and optional measured task-time optimizer

## Run Locally

Open `index.html` in a modern browser, or serve the repository with any static file server and open its root URL. No build step or backend is required. Internet access is required for Blockly in the simulators; Score & Strategy has no Blockly dependency. Google Fonts are optional because system fallbacks are provided.

## Project Storage

- **Save / Load / Clear** uses browser-local storage on the current device.
- **Export / Import** uses a portable JSON student-project file. Each simulator validates the file format, version, and target app before loading it.
- **Score & Strategy** keeps its practice round history, drafts, custom objectives, planning profiles, and timer state in browser-local storage. Its portable JSON and CSV exports are separate from simulator project files and are not cloud backups.

## GitHub Pages Deployment

1. Push the complete `cvs-robotics-lab` repository to GitHub.
2. Open repository **Settings**.
3. Open **Pages**.
4. Select **Deploy from a branch**.
5. Select `main`.
6. Select `/ (root)`.
7. Save.
8. Use the generated GitHub Pages URL.

The launcher and all simulator assets use relative paths, so the package can be hosted below a repository path such as `https://username.github.io/cvs-robotics-lab/`.

The `score-strategy/` route is independent of the simulators and uses only static assets. Its supplied Byte to Bite practice preset is attributed to the 2026 BEST Robotics Classic Competition Rules v3.3 (September 10, 2026); it is provisional practice scoring, not official referee software. See [concise source and modeling notes](./score-strategy/RULES_NOTES.md). The original supplied rules PDFs remain local and are not deployed.

## Maintaining In-App Help

Each simulator keeps its current instructions in its own `help-content.js` file. The shared modal renderer and shared wording live in `shared/help/`.

**When adding or removing a user-facing simulator feature, review and update that app's Help content in the same change.**
