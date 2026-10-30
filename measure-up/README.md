# CVS Measure Up

CVS Measure Up is a static, browser-only measurement and layout trainer for secondary woods, welding, robotics, and trades classes. It is part of the CVS Robotics Lab launcher and runs without a build step or backend.

## Open the app

- From the repository launcher, choose **CVS Measure Up**.
- Directly, open `measure-up/index.html` or serve the repository root and visit `measure-up/` relative to that server.

All links and assets are relative so the app works under the repository path used by GitHub Pages.

## Tools and modes

- **Tape Measure / Ruler** — inch fractions through sixteenths and a separate metric millimeter track.
- **Dial Caliper** — a documented 0–6 inch, 0.001 inch-resolution model. The beam advances in 0.1 inch increments and the dial covers 0.100 inch per revolution. A reading is the last exposed beam tenth plus the dial thousandths. The model is intentionally structured so digital and vernier variants can be added later.
- **Framing Square** — perpendicular lines, corner checks, and simple notch layout against a reference edge.
- **Speed Square** — square lines, 45-degree lines, pivot/degree settings, and introductory rise/run recognition. The UI keeps degree setting, marked-line angle, and rise/run terminology distinct.

**Practice Bench** is untimed and includes optional hints and visual correction. **60-Second Challenge** keeps one fixed difficulty per run, draws numeric readings without replacement from broad prepared pools, starts ordinary Play Again runs with a fresh sequence, stores browser-local personal bests, and offers a locally generated PDF or printable completion certificate. Explicitly seeded model decks remain reproducible for tests and lesson preparation. **Job Orders** carry one coherent workpiece, reference edge, and feature model through all three steps; positioning controls move the same learner mark that is graded, and corrections show the learner and target marks together.

Advanced roof/stair layout, digital/vernier calipers, student accounts, shared leaderboards, and a central database are outside this first release.

## Local data and privacy

Personal bests are stored in `localStorage` for the current browser/profile and are keyed separately by tool, units, difficulty, and 60-second duration. Completed-run certificate values are frozen in memory before download or print; the app does not send student names or scores to a server.

## Tests

Run the dependency-free Node tests from the repository root:

```text
node measure-up/tests/measure-model-tests.js
node measure-up/tests/certificate-tests.js
node measure-up/tests/app-tests.js
```

The automated tests cover measurement math and equivalent fractions, at least 20 distinct numeric readings for every standard Tape and Caliper configuration, without-replacement cycling and seeded replay, varied Framing and Speed Square setups, first-attempt scoring and timer expiration, fresh ordinary replay seeds, coherent Job Order geometry and grading, personal-best isolation, frozen certificate values, generated PDF/print content, relative navigation, and core accessibility hooks.

For this release, manual browser checks covered the desktop and a 768-pixel-wide layout, navigation from the hub, natural 60-second expiration, results and missed-question review, keyboard adjustment in a Tape Measure job order, PDF download, and certificate print preview. The narrow layout and control sizing were inspected for tablet use; a physical touchscreen was not part of that check.
