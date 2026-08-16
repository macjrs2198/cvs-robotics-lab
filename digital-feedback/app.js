(function () {
  "use strict";

  const LEGACY_STORAGE_KEY = "cvs-digital-feedback-program-v1";
  const STORAGE_PREFIX = "cvs-digital-feedback-program-v2";
  const PROGRAM_FORMAT = "cvs-robotics-program";
  const PROGRAM_FORMAT_VERSION = 1;
  const APP_ID = "cvs-digital-feedback";
  const APP_VERSION = "1.0";
  const APP_DISPLAY_NAME = "CVS Digital Feedback";
  const APP_DISPLAY_NAMES = Object.freeze({
    "cvs-ai-vision": "CVS AI Vision",
    "cvs-digital-feedback": APP_DISPLAY_NAME,
    "cvs-analog-feedback": "CVS Analog Feedback",
  });
  const MAX_OUTPUT_LINES = 60;
  const { FIELD_WIDTH, FIELD_HEIGHT } = window.DigitalFeedbackTrack;
  const { RobotModel } = window.DigitalFeedbackRobot;
  const { LineFollowerActivity, ContactSwitchActivity } = window.DigitalFeedbackActivities;

  const elements = {
    canvas: document.querySelector("#field-canvas"),
    activitySelector: document.querySelector("#activity-selector"),
    runButton: document.querySelector("#run-button"),
    stopButton: document.querySelector("#stop-button"),
    resetButton: document.querySelector("#reset-button"),
    saveButton: document.querySelector("#save-button"),
    loadButton: document.querySelector("#load-button"),
    exportButton: document.querySelector("#export-button"),
    importButton: document.querySelector("#import-button"),
    importFileInput: document.querySelector("#import-file-input"),
    clearButton: document.querySelector("#clear-button"),
    trackActions: document.querySelector("#track-actions"),
    editTrackButton: document.querySelector("#edit-track-button"),
    resetTrackButton: document.querySelector("#reset-track-button"),
    editHint: document.querySelector("#edit-hint"),
    configurationBar: document.querySelector("#configuration-bar"),
    sensorSetup: document.querySelector("#sensor-setup"),
    frontModeInputs: [...document.querySelectorAll('input[name="front-mode"]')],
    rearModeInputs: [...document.querySelectorAll('input[name="rear-mode"]')],
    frontOffset: document.querySelector("#front-offset"),
    frontOffsetValue: document.querySelector("#front-offset-value"),
    frontSpacing: document.querySelector("#front-spacing"),
    frontSpacingValue: document.querySelector("#front-spacing-value"),
    rearOffset: document.querySelector("#rear-offset"),
    rearOffsetValue: document.querySelector("#rear-offset-value"),
    rearSpacing: document.querySelector("#rear-spacing"),
    rearSpacingValue: document.querySelector("#rear-spacing-value"),
    tapeKey: document.querySelector("#tape-key"),
    contactHelp: document.querySelector("#contact-help"),
    simulationKicker: document.querySelector("#simulation-kicker"),
    fieldHeading: document.querySelector("#field-heading"),
    runState: document.querySelector("#run-state"),
    headerStatus: document.querySelector(".header-status"),
    sensorModeBadge: document.querySelector("#sensor-mode-badge"),
    lineSensorStatus: document.querySelector("#line-sensor-status"),
    contactReadout: document.querySelector("#contact-sensor-readout"),
    contactIndicator: document.querySelector("#contact-indicator"),
    contactValue: document.querySelector("#contact-value"),
    driveAction: document.querySelector("#drive-action"),
    leftOutput: document.querySelector("#left-output"),
    rightOutput: document.querySelector("#right-output"),
    driveSpeed: document.querySelector("#drive-speed"),
    turnSpeed: document.querySelector("#turn-speed"),
    poseX: document.querySelector("#pose-x"),
    poseY: document.querySelector("#pose-y"),
    poseHeading: document.querySelector("#pose-heading"),
    outputConsole: document.querySelector("#output-console"),
    clearOutputButton: document.querySelector("#clear-output-button"),
    blocklyError: document.querySelector("#blockly-error"),
  };

  const context = elements.canvas.getContext("2d");
  const robot = new RobotModel({ x: 0, y: 0, heading: 0 });
  const activities = {
    "line-follower": new LineFollowerActivity({
      canvas: elements.canvas,
      robot,
      onTrackCommit: () => {
        stopProgram("EDITING");
        updateTelemetry();
      },
    }),
    "contact-switch": new ContactSwitchActivity({
      canvas: elements.canvas,
      robot,
      onObjectMove: () => updateTelemetry(),
    }),
  };

  let currentActivityId = "line-follower";
  let currentActivity = activities[currentActivityId];
  let workspace = null;
  let running = false;
  let runToken = 0;
  let outputLines = [];
  let lastFrameTime = performance.now();
  let lastUiUpdate = 0;
  let sensorStatusSignature = "";
  const workspaceMemory = Object.create(null);

  function storageKey(activityId) {
    return `${STORAGE_PREFIX}-${activityId}`;
  }

  function setRunState(label, isRunning) {
    elements.runState.textContent = label;
    elements.headerStatus.classList.toggle("is-running", Boolean(isRunning));
  }

  function setSensorIndicator(indicator, valueElement, on) {
    indicator.classList.toggle("is-on", on);
    valueElement.classList.toggle("is-on", on);
    valueElement.textContent = on ? "ON" : "OFF";
  }

  function modeLabel(mode) {
    return mode === "dual" ? "DUAL" : mode === "single" ? "SINGLE" : "NONE";
  }

  function syncMountControls(mount, settings) {
    const inputs = mount === "front" ? elements.frontModeInputs : elements.rearModeInputs;
    const offset = mount === "front" ? elements.frontOffset : elements.rearOffset;
    const offsetValue = mount === "front" ? elements.frontOffsetValue : elements.rearOffsetValue;
    const spacing = mount === "front" ? elements.frontSpacing : elements.rearSpacing;
    const spacingValue = mount === "front" ? elements.frontSpacingValue : elements.rearSpacingValue;
    const mountElement = document.querySelector(`.mount-setup[data-mount="${mount}"]`);
    const offsetControl = mountElement.querySelector('[data-control="offset"]');
    const spacingControl = mountElement.querySelector('[data-control="spacing"]');
    const active = settings.mode !== "none";
    const dual = settings.mode === "dual";

    inputs.forEach((input) => { input.checked = input.value === settings.mode; });
    offset.value = String(settings.longitudinalOffset);
    offsetValue.value = String(settings.longitudinalOffset);
    spacing.value = String(settings.spacing);
    spacingValue.value = String(settings.spacing);
    offset.disabled = !active;
    spacing.disabled = !dual;
    offsetControl.classList.toggle("is-disabled", !active);
    spacingControl.classList.toggle("is-disabled", !dual);
  }

  function syncSensorSetupUi() {
    const configuration = activities["line-follower"].getSensorConfiguration();
    syncMountControls("front", configuration.front);
    syncMountControls("rear", configuration.rear);
    elements.sensorModeBadge.textContent = currentActivityId === "line-follower"
      ? `F:${modeLabel(configuration.front.mode)} · R:${modeLabel(configuration.rear.mode)}`
      : "CONTACT";
  }

  function renderLineSensorStatus(inputs) {
    const configuration = activities["line-follower"].getSensorConfiguration();
    const signature = `${configuration.front.mode}|${configuration.rear.mode}`;
    if (signature !== sensorStatusSignature) {
      sensorStatusSignature = signature;
      elements.lineSensorStatus.replaceChildren();
    }
    let activeMounts = 0;

    ["front", "rear"].forEach((mount) => {
      const settings = configuration[mount];
      if (settings.mode === "none") return;
      activeMounts += 1;
      if (signature === sensorStatusSignature && elements.lineSensorStatus.querySelector(`[data-status-mount="${mount}"]`)) {
        return;
      }
      const prefix = mount === "front" ? "front" : "rear";
      const values = settings.mode === "single"
        ? [{ label: "SENSOR", key: `${prefix}Single` }]
        : [{ label: "LEFT", key: `${prefix}Left` }, { label: "RIGHT", key: `${prefix}Right` }];
      const section = document.createElement("section");
      section.className = "mount-status";
      section.dataset.statusMount = mount;
      const heading = document.createElement("h4");
      heading.textContent = `${mount.toUpperCase()} · ${modeLabel(settings.mode)}`;
      section.appendChild(heading);
      const valueRow = document.createElement("div");
      valueRow.className = "mount-status-values";
      values.forEach(({ label, key }) => {
        const item = document.createElement("div");
        item.className = "mount-status-value";
        item.dataset.sensorKey = key;
        const indicator = document.createElement("i");
        indicator.className = "sensor-indicator";
        indicator.classList.toggle("is-on", Boolean(inputs[key]));
        indicator.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        const labelElement = document.createElement("span");
        labelElement.className = "readout-label";
        labelElement.textContent = label;
        const value = document.createElement("strong");
        value.classList.toggle("is-on", Boolean(inputs[key]));
        value.textContent = inputs[key] ? "ON" : "OFF";
        text.append(labelElement, value);
        item.append(indicator, text);
        valueRow.appendChild(item);
      });
      section.appendChild(valueRow);
      elements.lineSensorStatus.appendChild(section);
    });

    if (!activeMounts) {
      if (!elements.lineSensorStatus.querySelector(".line-sensor-empty")) {
        const empty = document.createElement("div");
        empty.className = "line-sensor-empty";
        empty.textContent = "NO LINE SENSORS CONFIGURED";
        elements.lineSensorStatus.appendChild(empty);
      }
    }

    elements.lineSensorStatus.querySelectorAll("[data-sensor-key]").forEach((item) => {
      const on = Boolean(inputs[item.dataset.sensorKey]);
      item.querySelector(".sensor-indicator").classList.toggle("is-on", on);
      const value = item.querySelector("strong");
      value.classList.toggle("is-on", on);
      value.textContent = on ? "ON" : "OFF";
    });
  }

  function updateActivityUi() {
    const lineSelected = currentActivityId === "line-follower";
    elements.activitySelector.value = currentActivityId;
    elements.trackActions.hidden = !lineSelected;
    elements.sensorSetup.hidden = !lineSelected;
    if (!lineSelected) elements.sensorSetup.open = false;
    elements.tapeKey.hidden = !lineSelected;
    elements.contactHelp.hidden = lineSelected;
    elements.configurationBar.classList.toggle("is-contact", !lineSelected);
    elements.editTrackButton.classList.toggle("is-active", lineSelected && currentActivity.editing);
    elements.editTrackButton.textContent = lineSelected && currentActivity.editing
      ? "FINISH EDITING"
      : "DRAW / EDIT TRACK";
    elements.editHint.hidden = !lineSelected || !currentActivity.editing;
    elements.simulationKicker.textContent = lineSelected ? "LINE FOLLOWING FIELD" : "DIGITAL CONTACT FIELD";
    elements.fieldHeading.textContent = lineSelected ? "Digital track" : "Contact switch";
    elements.canvas.setAttribute(
      "aria-label",
      lineSelected ? "Top-down digital line-following field" : "Top-down digital contact-switch field",
    );

    syncSensorSetupUi();
    elements.lineSensorStatus.hidden = !lineSelected;
    elements.contactReadout.hidden = lineSelected;
  }

  function updateTelemetry() {
    const inputs = currentActivity.getDigitalInputs();
    if (currentActivityId === "line-follower") renderLineSensorStatus(inputs);
    setSensorIndicator(elements.contactIndicator, elements.contactValue, Boolean(inputs.contact));

    const drive = robot.drive.state;
    const actionLabels = { turnLeft: "TURN LEFT", turnRight: "TURN RIGHT" };
    elements.driveAction.textContent = actionLabels[drive.action] || drive.action.toUpperCase();
    elements.leftOutput.textContent = `${Math.round(drive.leftOutput)}%`;
    elements.rightOutput.textContent = `${Math.round(drive.rightOutput)}%`;
    elements.driveSpeed.textContent = `${Math.round(drive.driveSpeed)}%`;
    elements.turnSpeed.textContent = `${Math.round(drive.turnSpeed)}%`;
    elements.poseX.textContent = Math.round(robot.state.x);
    elements.poseY.textContent = Math.round(robot.state.y);
    elements.poseHeading.textContent = `${Math.round((robot.state.heading * 180) / Math.PI)}°`;
  }

  function drawFieldBase() {
    context.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    const background = context.createLinearGradient(0, 0, 0, FIELD_HEIGHT);
    if (currentActivityId === "contact-switch") {
      background.addColorStop(0, "#63716a");
      background.addColorStop(1, "#46554e");
    } else {
      background.addColorStop(0, "#687a72");
      background.addColorStop(1, "#4f6159");
    }
    context.fillStyle = background;
    context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

    context.save();
    context.strokeStyle = "rgba(229, 243, 236, 0.08)";
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
    context.strokeStyle = "rgba(7, 16, 14, 0.46)";
    context.lineWidth = 3;
    context.strokeRect(7, 7, FIELD_WIDTH - 14, FIELD_HEIGHT - 14);
    context.restore();
  }

  function drawField() {
    drawFieldBase();
    currentActivity.render(context);
  }

  function animationFrame(timestamp) {
    const delta = Math.min(0.05, Math.max(0, (timestamp - lastFrameTime) / 1000));
    lastFrameTime = timestamp;
    currentActivity.update(delta, running);
    drawField();
    if (timestamp - lastUiUpdate > 50) {
      updateTelemetry();
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
    elements.outputConsole.innerHTML = "";
    outputLines.forEach((line) => {
      const row = document.createElement("span");
      row.className = "console-line";
      row.textContent = line;
      elements.outputConsole.appendChild(row);
    });
    elements.outputConsole.scrollTop = elements.outputConsole.scrollHeight;
  }

  function pause(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function runIsActive(token) {
    return running && token === runToken;
  }

  function evaluateValue(block) {
    if (!block) return false;
    switch (block.type) {
      case "sensor_line":
        return currentActivity.readInput("single");
      case "sensor_left_line":
        return currentActivity.readInput("left");
      case "sensor_right_line":
        return currentActivity.readInput("right");
      case "sensor_rear_line":
        return currentActivity.readInput("rearSingle");
      case "sensor_rear_left_line":
        return currentActivity.readInput("rearLeft");
      case "sensor_rear_right_line":
        return currentActivity.readInput("rearRight");
      case "sensor_contact_switch":
        return currentActivity.readInput("contact");
      case "feedback_and":
        return Boolean(evaluateValue(block.getInputTargetBlock("A"))) && Boolean(evaluateValue(block.getInputTargetBlock("B")));
      case "feedback_or":
        return Boolean(evaluateValue(block.getInputTargetBlock("A"))) || Boolean(evaluateValue(block.getInputTargetBlock("B")));
      case "feedback_not":
        return !Boolean(evaluateValue(block.getInputTargetBlock("BOOL")));
      case "feedback_equals":
        return Boolean(evaluateValue(block.getInputTargetBlock("A"))) === (block.getFieldValue("B") === "TRUE");
      default:
        return false;
    }
  }

  async function executeChain(firstBlock, token) {
    let block = firstBlock;
    while (block && runIsActive(token)) {
      switch (block.type) {
        case "feedback_when_started":
          break;
        case "feedback_forever":
          while (runIsActive(token)) {
            await executeChain(block.getInputTargetBlock("DO"), token);
            await pause(34);
          }
          return;
        case "feedback_if":
          if (evaluateValue(block.getInputTargetBlock("IF0"))) {
            await executeChain(block.getInputTargetBlock("DO0"), token);
          }
          break;
        case "feedback_if_else":
          if (evaluateValue(block.getInputTargetBlock("IF0"))) {
            await executeChain(block.getInputTargetBlock("DO0"), token);
          } else {
            await executeChain(block.getInputTargetBlock("ELSE"), token);
          }
          break;
        case "drive_forward":
          robot.drive.forward();
          break;
        case "drive_reverse":
          robot.drive.reverse();
          break;
        case "drive_turn_left":
          robot.drive.turnLeft();
          break;
        case "drive_turn_right":
          robot.drive.turnRight();
          break;
        case "drive_stop":
          robot.drive.stop();
          break;
        case "drive_set_speed":
          robot.drive.setDriveSpeed(block.getFieldValue("SPEED"));
          break;
        case "drive_set_turn_speed":
          robot.drive.setTurnSpeed(block.getFieldValue("SPEED"));
          break;
        case "output_print_text":
          printOutput(block.getFieldValue("TEXT"));
          break;
        case "output_print_value":
          printOutput(evaluateValue(block.getInputTargetBlock("VALUE")) ? "ON" : "OFF");
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
    if (currentActivityId === "line-follower" && currentActivity.editing) setTrackEditing(false);

    const startBlock = workspace.getTopBlocks(true).find((block) => block.type === "feedback_when_started");
    if (!startBlock) {
      printOutput("Add a When Started block before running.");
      setRunState("NEEDS START", false);
      return;
    }

    const token = ++runToken;
    running = true;
    setRunState("RUNNING", true);
    await executeChain(startBlock, token);

    if (runIsActive(token)) {
      running = false;
      robot.drive.stop();
      setRunState("COMPLETE", false);
    }
  }

  function stopProgram(label = "STOPPED") {
    running = false;
    runToken += 1;
    robot.drive.stop();
    setRunState(label, false);
    updateTelemetry();
  }

  function resetSimulation() {
    stopProgram("READY");
    currentActivity.reset();
    clearOutput();
    updateTelemetry();
  }

  function captureWorkspace() {
    if (!workspace) return;
    workspaceMemory[currentActivityId] = Blockly.serialization.workspaces.save(workspace);
  }

  function restoreWorkspace(activityId) {
    if (!workspace) return;
    const sensorConfiguration = activities["line-follower"].getSensorConfiguration();
    window.DigitalFeedbackBlocks.updateToolbox(workspace, activityId, sensorConfiguration);
    workspace.clear();
    if (workspaceMemory[activityId]) {
      Blockly.serialization.workspaces.load(workspaceMemory[activityId], workspace);
    } else {
      window.DigitalFeedbackBlocks.loadStarter(workspace, activityId, sensorConfiguration);
    }
  }

  function switchActivity(activityId) {
    if (!activities[activityId] || activityId === currentActivityId) return;
    stopProgram("READY");
    captureWorkspace();
    currentActivity.setActive(false);
    currentActivityId = activityId;
    currentActivity = activities[currentActivityId];
    currentActivity.setActive(true);
    currentActivity.reset();
    updateActivityUi();
    restoreWorkspace(currentActivityId);
    clearOutput();
    updateTelemetry();
  }

  function setSensorConfiguration(configuration, options = {}) {
    stopProgram("READY");
    const lineActivity = activities["line-follower"];
    lineActivity.setSensorConfiguration(configuration);
    lineActivity.reset();
    updateActivityUi();

    if (workspace && currentActivityId === "line-follower") {
      const nextConfiguration = lineActivity.getSensorConfiguration();
      window.DigitalFeedbackBlocks.updateToolbox(workspace, currentActivityId, nextConfiguration);
      if (options.loadStarter !== false) {
        window.DigitalFeedbackBlocks.loadStarter(workspace, currentActivityId, nextConfiguration);
      }
    }
    updateTelemetry();
  }

  function updateSensorMount(mount, values, options = {}) {
    const lineActivity = activities["line-follower"];
    const configuration = lineActivity.getSensorConfiguration();
    configuration[mount] = { ...configuration[mount], ...values };
    setSensorConfiguration(configuration, options);
  }

  function setTrackEditing(enabled) {
    if (currentActivityId !== "line-follower") return;
    currentActivity.setEditing(enabled);
    elements.editTrackButton.classList.toggle("is-active", currentActivity.editing);
    elements.editTrackButton.textContent = currentActivity.editing ? "FINISH EDITING" : "DRAW / EDIT TRACK";
    elements.editHint.hidden = !currentActivity.editing;
    if (currentActivity.editing) stopProgram("EDITING");
    else setRunState("READY", false);
  }

  function portableSettings() {
    const lineActivity = activities["line-follower"];
    const contactActivity = activities["contact-switch"];
    return {
      activityId: currentActivityId,
      lineFollower: {
        sensorConfiguration: lineActivity.getSensorConfiguration(),
        trackPoints: lineActivity.track.points.map((point) => ({ x: point.x, y: point.y })),
      },
      contactSwitch: {
        stopPosition: { x: contactActivity.stopObject.x, y: contactActivity.stopObject.y },
      },
    };
  }

  function applyPortableSettings(settings) {
    const lineActivity = activities["line-follower"];
    const contactActivity = activities["contact-switch"];
    lineActivity.setSensorConfiguration(settings.lineFollower.sensorConfiguration);
    lineActivity.track.setPoints(settings.lineFollower.trackPoints);

    if (settings.activityId !== currentActivityId) {
      currentActivity.setActive(false);
      currentActivityId = settings.activityId;
      currentActivity = activities[currentActivityId];
      currentActivity.setActive(true);
    }

    currentActivity.reset();
    const stop = settings.contactSwitch.stopPosition;
    contactActivity.stopObject.x = Math.min(
      FIELD_WIDTH - contactActivity.stopObject.width - 18,
      Math.max(18, stop.x),
    );
    contactActivity.stopObject.y = Math.min(
      FIELD_HEIGHT - contactActivity.stopObject.height - 18,
      Math.max(18, stop.y),
    );
    contactActivity.updateContact();
    updateActivityUi();
    updateTelemetry();
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
    const points = settings?.lineFollower?.trackPoints;
    const stop = settings?.contactSwitch?.stopPosition;
    if (
      !settings ||
      !activities[settings.activityId] ||
      !settings.lineFollower?.sensorConfiguration ||
      !Array.isArray(points) ||
      points.length < 2 ||
      !points.every((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) ||
      !Number.isFinite(Number(stop?.x)) ||
      !Number.isFinite(Number(stop?.y))
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
      link.download = "CVS-Digital-Feedback-Program.json";
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
    setTrackEditing(false);

    try {
      applyPortableSettings(programFile.settings);
      window.DigitalFeedbackBlocks.updateToolbox(
        workspace,
        currentActivityId,
        activities["line-follower"].getSensorConfiguration(),
      );
      workspace.clear();
      Blockly.serialization.workspaces.load(programFile.workspace, workspace);
      workspaceMemory[currentActivityId] = programFile.workspace;
      currentActivity.reset();
      if (currentActivityId === "contact-switch") {
        applyPortableSettings(programFile.settings);
      }
      clearOutput();
      updateTelemetry();
      setRunState("IMPORTED", false);
    } catch (error) {
      console.error(error);
      applyPortableSettings(previousSettings);
      window.DigitalFeedbackBlocks.updateToolbox(
        workspace,
        currentActivityId,
        activities["line-follower"].getSensorConfiguration(),
      );
      workspace.clear();
      Blockly.serialization.workspaces.load(previousWorkspace, workspace);
      printOutput("The program file could not be loaded.");
      setRunState("IMPORT ERROR", false);
    }
  }

  function saveProgram() {
    if (!workspace) return;
    const lineActivity = activities["line-follower"];
    const payload = {
      version: 3,
      activityId: currentActivityId,
      sensorConfiguration: lineActivity.getSensorConfiguration(),
      workspace: Blockly.serialization.workspaces.save(workspace),
    };
    localStorage.setItem(storageKey(currentActivityId), JSON.stringify(payload));
    workspaceMemory[currentActivityId] = payload.workspace;
    setRunState("SAVED", false);
  }

  function loadProgram() {
    if (!workspace) return;
    let stored = localStorage.getItem(storageKey(currentActivityId));
    if (!stored && currentActivityId === "line-follower") {
      stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    }
    if (!stored) {
      printOutput(`No saved ${currentActivity.title} program found in this browser.`);
      setRunState("NO SAVE", false);
      return;
    }

    try {
      const payload = JSON.parse(stored);
      if (payload.activityId && payload.activityId !== currentActivityId) {
        throw new Error("Saved program belongs to another activity.");
      }
      if (currentActivityId === "line-follower") {
        const lineActivity = activities["line-follower"];
        const currentConfiguration = lineActivity.getSensorConfiguration();
        const savedConfiguration = payload.sensorConfiguration || {
          front: {
            ...currentConfiguration.front,
            mode: payload.sensorMode === "dual" ? "dual" : "single",
            spacing: payload.sensorSpacing ?? currentConfiguration.front.spacing,
          },
          rear: { ...currentConfiguration.rear, mode: "none" },
        };
        setSensorConfiguration(savedConfiguration, { loadStarter: false });
      }
      window.DigitalFeedbackBlocks.updateToolbox(
        workspace,
        currentActivityId,
        activities["line-follower"].getSensorConfiguration(),
      );
      workspace.clear();
      Blockly.serialization.workspaces.load(payload.workspace, workspace);
      workspaceMemory[currentActivityId] = payload.workspace;
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
    workspaceMemory[currentActivityId] = null;
    localStorage.removeItem(storageKey(currentActivityId));
    if (currentActivityId === "line-follower") localStorage.removeItem(LEGACY_STORAGE_KEY);
    clearOutput();
  }

  function bindEvents() {
    elements.activitySelector.addEventListener("change", (event) => switchActivity(event.target.value));
    elements.runButton.addEventListener("click", runProgram);
    elements.stopButton.addEventListener("click", () => stopProgram());
    elements.resetButton.addEventListener("click", resetSimulation);
    elements.saveButton.addEventListener("click", saveProgram);
    elements.loadButton.addEventListener("click", loadProgram);
    elements.exportButton.addEventListener("click", exportProgram);
    elements.importButton.addEventListener("click", () => elements.importFileInput.click());
    elements.importFileInput.addEventListener("change", importProgram);
    elements.clearButton.addEventListener("click", clearProgram);
    elements.clearOutputButton.addEventListener("click", clearOutput);

    [
      ["front", elements.frontModeInputs],
      ["rear", elements.rearModeInputs],
    ].forEach(([mount, inputs]) => {
      inputs.forEach((input) => {
        input.addEventListener("change", (event) => {
          if (event.target.checked) updateSensorMount(mount, { mode: event.target.value });
        });
      });
    });

    [
      ["front", "longitudinalOffset", elements.frontOffset],
      ["front", "spacing", elements.frontSpacing],
      ["rear", "longitudinalOffset", elements.rearOffset],
      ["rear", "spacing", elements.rearSpacing],
    ].forEach(([mount, key, input]) => {
      input.addEventListener("input", (event) => {
        updateSensorMount(mount, { [key]: event.target.value }, { loadStarter: false });
      });
    });

    elements.editTrackButton.addEventListener("click", () => setTrackEditing(!currentActivity.editing));
    elements.resetTrackButton.addEventListener("click", () => {
      if (currentActivityId !== "line-follower") return;
      stopProgram("READY");
      setTrackEditing(false);
      currentActivity.resetTrack();
      updateTelemetry();
    });

    window.addEventListener("resize", () => {
      if (workspace) Blockly.svgResize(workspace);
    });
  }

  function initializeActivities() {
    Object.values(activities).forEach((activity) => activity.init());
    Object.values(activities).forEach((activity) => activity.setActive(false));
    currentActivity.setActive(true);
    currentActivity.reset();
    updateActivityUi();
  }

  function initialize() {
    bindEvents();
    initializeActivities();
    if (!window.Blockly) {
      elements.blocklyError.hidden = false;
      setRunState("BLOCKLY ERROR", false);
      requestAnimationFrame(animationFrame);
      return;
    }

    try {
      workspace = window.DigitalFeedbackBlocks.createWorkspace(
        document.querySelector("#blockly-div"),
        currentActivityId,
        activities["line-follower"].getSensorConfiguration(),
      );
      window.DigitalFeedbackBlocks.loadStarter(
        workspace,
        currentActivityId,
        activities["line-follower"].getSensorConfiguration(),
      );
    } catch (error) {
      console.error(error);
      elements.blocklyError.hidden = false;
      setRunState("BLOCKLY ERROR", false);
    }

    clearOutput();
    updateTelemetry();
    requestAnimationFrame(animationFrame);
  }

  initialize();
})();
