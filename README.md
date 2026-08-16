# CVS Robotics Lab

CVS Robotics Lab is a static browser package containing three independent Blockly robotics simulators:

- **CVS Digital Feedback** — digital sensors, line following, and autonomous feedback
- **CVS AI Vision** — machine vision and autonomous sensor response
- **CVS Analog Feedback** — potentiometers, motor control, and position feedback

## Run Locally

Open `index.html` in a modern browser, or serve the repository with any static file server and open its root URL. No build step or backend is required. Internet access is required for Blockly and Google Fonts.

## Project Storage

- **Save / Load / Clear** uses browser-local storage on the current device.
- **Export / Import** uses a portable JSON student-project file. Each simulator validates the file format, version, and target app before loading it.

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
