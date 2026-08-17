(function () {
  "use strict";

  const PROGRAM_STORAGE_KEY = "cvs-analog-feedback-program-v1";
  const SETTINGS_STORAGE_KEY = "cvs-analog-feedback-settings-v1";
  const PROGRAM_FORMAT = "cvs-robotics-program";
  const PROGRAM_FORMAT_VERSION = 1;
  const APP_ID = "cvs-analog-feedback";
  const APP_VERSION = "2.0";
  const APP_DISPLAY_NAME = "CVS Analog Feedback";
  const APP_DISPLAY_NAMES = Object.freeze({
    "cvs-ai-vision": "CVS AI Vision",
    "cvs-digital-feedback": "CVS Digital Feedback",
    "cvs-analog-feedback": APP_DISPLAY_NAME,
  });
  const MAX_OUTPUT_LINES = 60;
  const { MotorBank } = window.AnalogFeedbackMotors;
  const { AnalogSystem, mapValue } = window.AnalogFeedbackAnalog;
  const { ArmModel, FIELD_WIDTH, FIELD_HEIGHT } = window.AnalogFeedbackArm;
  const { ManipulationTask } = window.AnalogFeedbackObjects;

  const elements = {
    canvas: document.querySelector("#arm-canvas"),
    jointRadios: [...document.querySelectorAll('input[name="joint-count"]')],
    runButton: document.querySelector("#run-button"),
    pauseButton: document.querySelector("#pause-button"),
    stopButton: document.querySelector("#stop-button"),
    resetButton: document.querySelector("#reset-button"),
    saveButton: document.querySelector("#save-button"),
    loadButton: document.querySelector("#load-button"),
    exportButton: document.querySelector("#export-button"),
    importButton: document.querySelector("#import-button"),
    importFileInput: document.querySelector("#import-file-input"),
    clearButton: document.querySelector("#clear-button"),
    blockLibraryButton: document.querySelector("#block-library-button"),
    blockLibraryDialog: document.querySelector("#block-library-dialog"),
    blockLibraryList: document.querySelector("#block-library-list"),
    blockLibraryClose: document.querySelector("#block-library-close"),
    clearOutputButton: document.querySelector("#clear-output-button"),
    runState: document.querySelector("#run-state"),
    headerStatus: document.querySelector(".header-status"),
    calibrationGrid: document.querySelector("#calibration-grid"),
    instrumentationGrid: document.querySelector("#instrumentation-grid"),
    taskComplete: document.querySelector("#task-complete"),
    outputConsole: document.querySelector("#output-console"),
    blocklyError: document.querySelector("#blockly-error"),
  };

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "null") || {};
    } catch (error) {
      console.error(error);
      return {};
    }
  }

  const savedSettings = readSettings();
  const analog = new AnalogSystem();
  analog.load(savedSettings.calibration);
  let jointCount = Math.min(3, Math.max(1, Number(savedSettings.jointCount) || 1));
  const motors = new MotorBank(jointCount);
  const arm = new ArmModel(jointCount, analog);
  const task = new ManipulationTask(arm);
  const context = elements.canvas.getContext("2d");
  const variables = new Map();

  let workspace = null;
  let running = false;
  let programControl = null;
  let blockLibrary = null;
  let outputLines = [];
  let lastFrameTime = performance.now();
  let lastUiUpdate = 0;

  function setRunState(label, isRunning) {
    elements.runState.textContent = label;
    elements.headerStatus.classList.toggle("is-running", Boolean(isRunning));
  }

  function renderRuntimeState(state) {
    running = !state.stopped;
    setRunState(state.paused ? "PAUSED" : state.running ? "RUNNING" : String(state.reason || "STOPPED").toUpperCase(), state.running);
    elements.headerStatus.classList.toggle("is-paused", state.paused);
    elements.runButton.disabled = !state.stopped;
    elements.pauseButton.disabled = state.stopped;
    elements.pauseButton.textContent = state.paused ? "RESUME" : "PAUSE";
    elements.stopButton.disabled = state.stopped;
  }

  function togglePause() {
    if (programControl.isPaused()) programControl.resume();
    else programControl.pause();
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ jointCount, calibration: analog.serialize() }),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function activeNames() {
    return motors.getNames();
  }

  function renderCalibrationPanel() {
    elements.calibrationGrid.replaceChildren();
    activeNames().forEach((name) => {
      const calibration = analog.getCalibration(name);
      const card = document.createElement("section");
      card.className = "calibration-card";
      const heading = document.createElement("h3");
      heading.textContent = name === "Gripper" ? "GRIPPER" : name.replace("Joint", "JOINT ");
      card.appendChild(heading);

      const fields = document.createElement("div");
      fields.className = "calibration-fields";
      const definitions = [
        ["rawMin", "Raw Min", 1],
        ["rawMax", "Raw Max", 1],
        ["angleMin", name === "Gripper" ? "Open Min %" : "Angle Min °", 0.1],
        ["angleMax", name === "Gripper" ? "Open Max %" : "Angle Max °", 0.1],
      ];

      definitions.forEach(([key, labelText, step]) => {
        const label = document.createElement("label");
        label.className = "calibration-field";
        label.textContent = labelText;
        const input = document.createElement("input");
        input.type = "number";
        input.step = String(step);
        input.value = String(calibration[key]);
        input.dataset.device = name;
        input.dataset.key = key;
        input.addEventListener("input", handleCalibrationInput);
        input.addEventListener("change", handleCalibrationChange);
        label.appendChild(input);
        fields.appendChild(label);
      });
      card.appendChild(fields);
      elements.calibrationGrid.appendChild(card);
    });
  }

  function applyCalibrationInput(input, shouldRender) {
    const device = input.dataset.device;
    const key = input.dataset.key;
    const normalized = analog.setCalibration(device, { [key]: input.value });
    arm.constrainToLimits(analog);
    task.update(arm);
    if (shouldRender) {
      elements.calibrationGrid.querySelectorAll(`[data-device="${device}"]`).forEach((field) => {
        field.value = String(normalized[field.dataset.key]);
      });
    }
    updateInstrumentation();
    saveSettings();
  }

  function handleCalibrationInput(event) {
    applyCalibrationInput(event.currentTarget, false);
  }

  function handleCalibrationChange(event) {
    applyCalibrationInput(event.currentTarget, true);
  }

  function buildInstrumentation() {
    elements.instrumentationGrid.replaceChildren();
    const names = activeNames();
    elements.instrumentationGrid.style.setProperty("--actuator-count", names.length);
    names.forEach((name) => {
      const card = document.createElement("section");
      card.className = "instrument-card";
      card.dataset.device = name;
      const title = name === "Gripper" ? "GRIPPER" : name.replace("Joint", "JOINT ");
      const positionLabel = name === "Gripper" ? "Actual Open" : "Actual Angle";
      card.innerHTML = `
        <h3>${title}</h3>
        <dl>
          <dt>Raw Analog</dt><dd data-value="raw">0</dd>
          <dt>${positionLabel}</dt><dd data-value="position">0</dd>
          <dt>Motor</dt><dd data-value="direction">STOPPED</dd>
          <dt>Velocity</dt><dd data-value="velocity">50%</dd>
        </dl>
      `;
      elements.instrumentationGrid.appendChild(card);
    });
  }

  function updateInstrumentation() {
    activeNames().forEach((name) => {
      const card = elements.instrumentationGrid.querySelector(`[data-device="${name}"]`);
      if (!card) return;
      const position = arm.getPosition(name);
      const motor = motors.getState(name);
      card.querySelector('[data-value="raw"]').textContent = analog.rawFor(name, position);
      card.querySelector('[data-value="position"]').textContent = name === "Gripper"
        ? `${position.toFixed(1)}%`
        : `${position.toFixed(1)}°`;
      const direction = card.querySelector('[data-value="direction"]');
      direction.textContent = motor.direction.toUpperCase();
      direction.classList.toggle("is-moving", motor.direction !== "stopped");
      card.querySelector('[data-value="velocity"]').textContent = `${Math.round(motor.velocity)}%`;
    });
    elements.taskComplete.hidden = !task.complete;
  }

  function drawScene() {
    context.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    const background = context.createLinearGradient(0, 0, 0, FIELD_HEIGHT);
    background.addColorStop(0, "#69766f");
    background.addColorStop(1, "#46534d");
    context.fillStyle = background;
    context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

    context.save();
    context.strokeStyle = "rgba(229,243,236,0.08)";
    context.lineWidth = 1;
    for (let x = 0; x <= FIELD_WIDTH; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, FIELD_HEIGHT);
      context.stroke();
    }
    for (let y = 0; y <= FIELD_HEIGHT; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(FIELD_WIDTH, y);
      context.stroke();
    }
    context.strokeStyle = "rgba(7,16,14,0.46)";
    context.lineWidth = 3;
    context.strokeRect(7, 7, FIELD_WIDTH - 14, FIELD_HEIGHT - 14);
    context.fillStyle = "rgba(7,16,14,0.68)";
    context.fillRect(40, 35, 330, 54);
    context.fillStyle = "#e3eee9";
    context.font = "700 15px Space Grotesk, sans-serif";
    context.fillText(`${jointCount}-JOINT ANALOG ARM`, 57, 58);
    context.fillStyle = "#b9cbc4";
    context.font = "700 10px Space Mono, monospace";
    context.fillText("MOTOR → MOTION → POTENTIOMETER → RAW INPUT", 57, 77);
    context.restore();

    task.draw(context);
    arm.draw(context);
  }

  function animationFrame(timestamp) {
    const delta = Math.min(0.05, Math.max(0, (timestamp - lastFrameTime) / 1000));
    lastFrameTime = timestamp;
    if (running && !programControl?.isPaused()) arm.update(delta, motors, analog);
    task.update(arm);
    drawScene();
    if (timestamp - lastUiUpdate > 50) {
      updateInstrumentation();
      lastUiUpdate = timestamp;
    }
    requestAnimationFrame(animationFrame);
  }

  function clearOutput() {
    outputLines = [];
    elements.outputConsole.innerHTML = '<span class="console-placeholder">Program output appears here.</span>';
  }

  function printOutput(value) {
    outputLines.push(String(value));
    outputLines = outputLines.slice(-MAX_OUTPUT_LINES);
    elements.outputConsole.replaceChildren();
    outputLines.forEach((line) => {
      const row = document.createElement("span");
      row.className = "console-line";
      row.textContent = line;
      elements.outputConsole.appendChild(row);
    });
    elements.outputConsole.scrollTop = elements.outputConsole.scrollHeight;
  }

  function runIsActive(token) {
    return programControl.isActive(token);
  }

  function variableKey(block) {
    return block.getFieldValue("VAR") || "value";
  }

  function evaluateValue(block) {
    if (!block) return 0;
    switch (block.type) {
      case "analog_number":
        return Number(block.getFieldValue("NUM")) || 0;
      case "math_number":
        return Number(block.getFieldValue("NUM")) || 0;
      case "analog_pot_raw": {
        const device = block.getFieldValue("DEVICE");
        return analog.rawFor(device, arm.getPosition(device));
      }
      case "analog_variable_get":
      case "variables_get":
        return variables.get(variableKey(block)) ?? 0;
      case "math_arithmetic":
      case "analog_arithmetic": {
        const left = Number(evaluateValue(block.getInputTargetBlock("A"))) || 0;
        const right = Number(evaluateValue(block.getInputTargetBlock("B"))) || 0;
        const operation = block.getFieldValue("OP");
        if (operation === "MINUS") return left - right;
        if (operation === "MULTIPLY") return left * right;
        if (operation === "DIVIDE") return right === 0 ? 0 : left / right;
        return left + right;
      }
      case "analog_map":
        return mapValue(
          evaluateValue(block.getInputTargetBlock("VALUE")),
          evaluateValue(block.getInputTargetBlock("IN_MIN")),
          evaluateValue(block.getInputTargetBlock("IN_MAX")),
          evaluateValue(block.getInputTargetBlock("OUT_MIN")),
          evaluateValue(block.getInputTargetBlock("OUT_MAX")),
        );
      case "analog_less":
        return Number(evaluateValue(block.getInputTargetBlock("A"))) < Number(evaluateValue(block.getInputTargetBlock("B")));
      case "analog_greater":
        return Number(evaluateValue(block.getInputTargetBlock("A"))) > Number(evaluateValue(block.getInputTargetBlock("B")));
      case "analog_equals":
        return Number(evaluateValue(block.getInputTargetBlock("A"))) === Number(evaluateValue(block.getInputTargetBlock("B")));
      case "logic_compare": {
        const left = evaluateValue(block.getInputTargetBlock("A"));
        const right = evaluateValue(block.getInputTargetBlock("B"));
        const operation = block.getFieldValue("OP");
        if (operation === "NEQ") return left !== right;
        if (operation === "LT") return Number(left) < Number(right);
        if (operation === "LTE") return Number(left) <= Number(right);
        if (operation === "GT") return Number(left) > Number(right);
        if (operation === "GTE") return Number(left) >= Number(right);
        return left === right;
      }
      case "logic_operation":
        return block.getFieldValue("OP") === "OR"
          ? Boolean(evaluateValue(block.getInputTargetBlock("A"))) || Boolean(evaluateValue(block.getInputTargetBlock("B")))
          : Boolean(evaluateValue(block.getInputTargetBlock("A"))) && Boolean(evaluateValue(block.getInputTargetBlock("B")));
      case "logic_negate":
        return !Boolean(evaluateValue(block.getInputTargetBlock("BOOL")));
      case "logic_boolean":
        return block.getFieldValue("BOOL") === "TRUE";
      case "analog_and":
        return Boolean(evaluateValue(block.getInputTargetBlock("A"))) && Boolean(evaluateValue(block.getInputTargetBlock("B")));
      case "analog_or":
        return Boolean(evaluateValue(block.getInputTargetBlock("A"))) || Boolean(evaluateValue(block.getInputTargetBlock("B")));
      case "analog_not":
        return !Boolean(evaluateValue(block.getInputTargetBlock("BOOL")));
      default:
        return 0;
    }
  }

  async function executeChain(firstBlock, token) {
    let block = firstBlock;
    while (block && runIsActive(token)) {
      if (!(await programControl.waitWhilePaused(token))) return;
      switch (block.type) {
        case "core_forever":
        case "analog_forever":
          while (runIsActive(token)) {
            await executeChain(block.getInputTargetBlock("DO"), token);
            await programControl.delay(30, token);
          }
          return;
        case "controls_repeat_ext": {
          const repeatCount = Math.max(0, Math.floor(Number(evaluateValue(block.getInputTargetBlock("TIMES"))) || 0));
          for (let index = 0; index < repeatCount && runIsActive(token); index += 1) {
            await executeChain(block.getInputTargetBlock("DO"), token);
            await programControl.yieldControl(token);
          }
          break;
        }
        case "core_wait_seconds":
          await programControl.delay(
            Math.max(0, Number(evaluateValue(block.getInputTargetBlock("SECONDS"))) || 0) * 1000,
            token,
          );
          break;
        case "core_wait_until":
          await programControl.waitUntil(
            () => Boolean(evaluateValue(block.getInputTargetBlock("CONDITION"))),
            token,
          );
          break;
        case "controls_if":
          if (evaluateValue(block.getInputTargetBlock("IF0"))) {
            await executeChain(block.getInputTargetBlock("DO0"), token);
          } else {
            await executeChain(block.getInputTargetBlock("ELSE"), token);
          }
          break;
        case "analog_if":
          if (evaluateValue(block.getInputTargetBlock("IF0"))) {
            await executeChain(block.getInputTargetBlock("DO0"), token);
          }
          break;
        case "analog_if_else":
          if (evaluateValue(block.getInputTargetBlock("IF0"))) {
            await executeChain(block.getInputTargetBlock("DO0"), token);
          } else {
            await executeChain(block.getInputTargetBlock("ELSE"), token);
          }
          break;
        case "analog_wait":
          await programControl.delay(Math.max(0, Number(block.getFieldValue("SECONDS")) || 0) * 1000, token);
          break;
        case "variables_set":
        case "analog_variable_set":
          variables.set(variableKey(block), Number(evaluateValue(block.getInputTargetBlock("VALUE"))) || 0);
          break;
        case "math_change":
          variables.set(
            variableKey(block),
            Number(variables.get(variableKey(block)) || 0) + Number(evaluateValue(block.getInputTargetBlock("DELTA")) || 0),
          );
          break;
        case "core_stop_program":
          stopProgram("STOPPED");
          return;
        case "analog_motor_spin":
          motors.spin(block.getFieldValue("DEVICE"), block.getFieldValue("DIRECTION"));
          break;
        case "analog_motor_stop":
          motors.stop(block.getFieldValue("DEVICE"));
          break;
        case "analog_motor_velocity":
          motors.setVelocity(block.getFieldValue("DEVICE"), block.getFieldValue("VELOCITY"));
          break;
        case "analog_print_text":
          printOutput(block.getFieldValue("TEXT"));
          break;
        case "core_print_text":
          printOutput(block.getFieldValue("TEXT"));
          break;
        case "core_print_value":
        case "analog_print_value":
          printOutput(evaluateValue(block.getInputTargetBlock("VALUE")));
          break;
        default:
          break;
      }
      block = block.getNextBlock();
    }
  }

  async function runProgram() {
    if (!workspace) return;
    stopProgram("READY");
    const startBlock = workspace.getTopBlocks(true).find((block) => ["core_when_started", "analog_when_started"].includes(block.type));
    if (!startBlock) {
      printOutput("Add a When Started block before running.");
      setRunState("NEEDS START", false);
      return;
    }
    variables.clear();
    const token = programControl.run();
    await executeChain(startBlock.getNextBlock(), token);
    if (runIsActive(token)) {
      programControl.complete(token, "complete");
    }
  }

  function stopProgram(label = "STOPPED") {
    if (programControl) programControl.stop(String(label).toLowerCase());
    updateInstrumentation();
  }

  function resetSimulation() {
    stopProgram("READY");
    arm.reset(analog);
    task.reset(arm);
    variables.clear();
    clearOutput();
    updateInstrumentation();
  }

  function configureJointCount(nextCount, options = {}) {
    stopProgram("READY");
    jointCount = Math.min(3, Math.max(1, Math.round(Number(nextCount) || 1)));
    elements.jointRadios.forEach((radio) => { radio.checked = Number(radio.value) === jointCount; });
    motors.configure(jointCount);
    arm.configure(jointCount, analog);
    task.reset(arm);
    variables.clear();
    if (workspace) {
      window.AnalogFeedbackBlocks.setDeviceNames(activeNames(), workspace, blockLibrary?.preferences);
      if (options.loadStarter !== false) window.AnalogFeedbackBlocks.loadStarter(workspace);
    }
    renderCalibrationPanel();
    buildInstrumentation();
    updateInstrumentation();
    clearOutput();
    if (options.persist !== false) saveSettings();
  }

  function portableSettings() {
    return {
      jointCount,
      calibration: analog.serialize(),
    };
  }

  function applyPortableSettings(settings) {
    analog.load(settings.calibration);
    configureJointCount(settings.jointCount, { loadStarter: false, persist: false });
    arm.reset(analog);
    task.reset(arm);
    variables.clear();
    renderCalibrationPanel();
    buildInstrumentation();
    updateInstrumentation();
  }

  function validateProgramFile(programFile) {
    if (!programFile || typeof programFile !== "object" || Array.isArray(programFile)) {
      throw new Error("This file does not contain a valid program.");
    }
    if (programFile.format !== PROGRAM_FORMAT) {
      throw new Error("This is not a CVS Robotics program file.");
    }
    if (programFile.formatVersion !== PROGRAM_FORMAT_VERSION) {
      throw new Error(`Unsupported program file version: ${String(programFile.formatVersion)}.`);
    }
    if (programFile.app !== APP_ID) {
      const sourceApp = APP_DISPLAY_NAMES[programFile.app] || "another CVS simulator";
      throw new Error(`This program was created for ${sourceApp} and cannot be loaded into ${APP_DISPLAY_NAME}.`);
    }
    if (!programFile.workspace || typeof programFile.workspace !== "object" || Array.isArray(programFile.workspace)) {
      throw new Error("The program file does not contain a valid Blockly workspace.");
    }
    const settings = programFile.settings;
    if (
      !settings ||
      ![1, 2, 3].includes(Number(settings.jointCount)) ||
      !settings.calibration ||
      typeof settings.calibration !== "object" ||
      Array.isArray(settings.calibration)
    ) {
      throw new Error("The program file does not contain valid simulator settings.");
    }
  }

  function exportProgram() {
    if (!workspace) return;
    try {
      const programFile = {
        format: PROGRAM_FORMAT,
        formatVersion: PROGRAM_FORMAT_VERSION,
        app: APP_ID,
        appVersion: APP_VERSION,
        workspace: Blockly.serialization.workspaces.save(workspace),
        settings: portableSettings(),
      };
      const contents = `${JSON.stringify(programFile, null, 2)}\n`;
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "CVS-Analog-Feedback-Program.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setRunState("EXPORTED", false);
    } catch (error) {
      console.error(error);
      printOutput("The program could not be exported.");
      setRunState("EXPORT ERROR", false);
    }
  }

  async function importProgram(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || !workspace) return;

    let programFile;
    try {
      programFile = JSON.parse(await file.text());
      validateProgramFile(programFile);
    } catch (error) {
      const message = error instanceof SyntaxError ? "The selected file is not valid JSON." : error.message;
      printOutput(message);
      setRunState("IMPORT ERROR", false);
      return;
    }

    const previousWorkspace = Blockly.serialization.workspaces.save(workspace);
    const previousSettings = portableSettings();
    stopProgram("READY");

    try {
      applyPortableSettings(programFile.settings);
      workspace.clear();
      Blockly.serialization.workspaces.load(programFile.workspace, workspace);
      saveSettings();
      clearOutput();
      updateInstrumentation();
      setRunState("IMPORTED", false);
    } catch (error) {
      console.error(error);
      applyPortableSettings(previousSettings);
      workspace.clear();
      Blockly.serialization.workspaces.load(previousWorkspace, workspace);
      saveSettings();
      printOutput("The program file could not be loaded.");
      setRunState("IMPORT ERROR", false);
    }
  }

  function saveProgram() {
    if (!workspace) return;
    const payload = {
      version: 1,
      jointCount,
      calibration: analog.serialize(),
      workspace: Blockly.serialization.workspaces.save(workspace),
    };
    localStorage.setItem(PROGRAM_STORAGE_KEY, JSON.stringify(payload));
    saveSettings();
    setRunState("SAVED", false);
  }

  function loadProgram() {
    if (!workspace) return;
    const stored = localStorage.getItem(PROGRAM_STORAGE_KEY);
    if (!stored) {
      printOutput("No saved program found in this browser.");
      setRunState("NO SAVE", false);
      return;
    }
    try {
      const payload = JSON.parse(stored);
      analog.load(payload.calibration);
      configureJointCount(payload.jointCount, { loadStarter: false, persist: false });
      arm.reset(analog);
      task.reset(arm);
      renderCalibrationPanel();
      workspace.clear();
      Blockly.serialization.workspaces.load(payload.workspace, workspace);
      saveSettings();
      setRunState("LOADED", false);
    } catch (error) {
      console.error(error);
      printOutput("The saved program could not be loaded.");
      setRunState("LOAD ERROR", false);
    }
  }

  function clearProgram() {
    stopProgram("CLEARED");
    if (workspace) workspace.clear();
    localStorage.removeItem(PROGRAM_STORAGE_KEY);
    clearOutput();
  }

  function bindEvents() {
    elements.jointRadios.forEach((radio) => {
      radio.addEventListener("change", (event) => {
        if (event.target.checked) configureJointCount(event.target.value);
      });
    });
    elements.runButton.addEventListener("click", runProgram);
    elements.pauseButton.addEventListener("click", togglePause);
    elements.stopButton.addEventListener("click", () => stopProgram());
    elements.resetButton.addEventListener("click", resetSimulation);
    elements.saveButton.addEventListener("click", saveProgram);
    elements.loadButton.addEventListener("click", loadProgram);
    elements.exportButton.addEventListener("click", exportProgram);
    elements.importButton.addEventListener("click", () => elements.importFileInput.click());
    elements.importFileInput.addEventListener("change", importProgram);
    elements.clearButton.addEventListener("click", clearProgram);
    elements.clearOutputButton.addEventListener("click", clearOutput);
    window.addEventListener("resize", () => { if (workspace) Blockly.svgResize(workspace); });
  }

  function initialize() {
    programControl = window.CVSProgramControl.create({
      stopMotion: () => motors.stopAll(),
      onStateChange: renderRuntimeState,
    });
    window.cvsProgramControl = programControl;
    bindEvents();
    configureJointCount(jointCount, { loadStarter: false, persist: false });
    if (!window.Blockly || window.AnalogFeedbackBlocks.error) {
      elements.blocklyError.hidden = false;
      setRunState("BLOCKLY ERROR", false);
      requestAnimationFrame(animationFrame);
      return;
    }
    try {
      const packs = window.AnalogFeedbackBlocks.getPacks();
      const initialPreferences = window.CVSCoreToolbox.readPreferences(APP_ID, packs);
      workspace = window.AnalogFeedbackBlocks.createWorkspace(
        document.querySelector("#blockly-div"),
        activeNames(),
        initialPreferences,
      );
      window.AnalogFeedbackBlocks.loadStarter(workspace);
      blockLibrary = window.CVSCoreToolbox.setup({
        appId: APP_ID,
        packs,
        workspace,
        getToolbox: (preferences) => window.AnalogFeedbackBlocks.getToolbox(preferences),
        button: elements.blockLibraryButton,
        dialog: elements.blockLibraryDialog,
        list: elements.blockLibraryList,
        closeButton: elements.blockLibraryClose,
      });
    } catch (error) {
      console.error(error);
      elements.blocklyError.hidden = false;
      setRunState("BLOCKLY ERROR", false);
    }
    clearOutput();
    updateInstrumentation();
    requestAnimationFrame(animationFrame);
  }

  initialize();
})();
