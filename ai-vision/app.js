(function () {
  "use strict";

  const STORAGE_KEY = "vex-ai-vision-simulator-program-v1";
  const PROGRAM_FORMAT = "cvs-robotics-program";
  const PROGRAM_FORMAT_VERSION = 1;
  const APP_ID = "cvs-ai-vision";
  const APP_VERSION = "3.0";
  const APP_DISPLAY_NAME = "CVS AI Vision";
  const APP_DISPLAY_NAMES = Object.freeze({
    "cvs-ai-vision": APP_DISPLAY_NAME,
    "cvs-digital-feedback": "CVS Digital Feedback",
    "cvs-analog-feedback": "CVS Analog Feedback"
  });
  const FOREVER_DELAY_MS = 140;
  const MAX_CONSOLE_LINES = 80;
  const SNAPSHOT_GUIDANCE = "This program needs Take Snapshot inside its sensing loop to refresh camera readings.";
  const BALL_SCENE = "ball";
  const DINING_ROOM_SCENE = "byte-to-bite-dining-room";
  const TARGET_SIGNATURE = "TARGET";
  const FIDUCIAL_SIGNATURE = "FIDUCIAL_IDS";

  let workspace = null;
  let running = false;
  let programControl = null;
  let blockLibrary = null;
  let layoutController = null;
  let blocklyResizeFrame = null;
  let saveStatusTimer = null;
  let snapshotGuidanceShown = false;
  let activeVisionSignature = null;
  const variables = new Map();

  const elements = {};

  function getElements() {
    elements.programState = document.querySelector(".program-state");
    elements.programStateText = document.getElementById("program-state-text");
    elements.runButton = document.getElementById("run-button");
    elements.pauseButton = document.getElementById("pause-button");
    elements.stopButton = document.getElementById("stop-button");
    elements.resetButton = document.getElementById("reset-button");
    elements.saveButton = document.getElementById("save-button");
    elements.loadButton = document.getElementById("load-button");
    elements.exportButton = document.getElementById("export-button");
    elements.importButton = document.getElementById("import-button");
    elements.importFileInput = document.getElementById("import-file-input");
    elements.clearButton = document.getElementById("clear-button");
    elements.saveStatus = document.getElementById("save-status");
    elements.outputConsole = document.getElementById("output-console");
    elements.consolePlaceholder = document.getElementById("console-placeholder");
    elements.blocklyError = document.getElementById("blockly-error");
    elements.dataExists = document.getElementById("data-exists");
    elements.dataCount = document.getElementById("data-count");
    elements.dataSelectedItem = document.getElementById("data-selected-item");
    elements.dataCenterX = document.getElementById("data-center-x");
    elements.dataCenterY = document.getElementById("data-center-y");
    elements.dataWidth = document.getElementById("data-width");
    elements.dataHeight = document.getElementById("data-height");
    elements.dataId = document.getElementById("data-id");
    elements.dataConfidence = document.getElementById("data-confidence");
    elements.drivetrainStatus = document.querySelector(".drivetrain-status");
    elements.drivetrainStatusValue = document.getElementById("drivetrain-status-value");
    elements.blockLibraryButton = document.getElementById("block-library-button");
    elements.blockLibraryDialog = document.getElementById("block-library-dialog");
    elements.blockLibraryList = document.getElementById("block-library-list");
    elements.blockLibraryClose = document.getElementById("block-library-close");
    elements.workbench = document.getElementById("vision-workbench");
    elements.layoutDivider = document.getElementById("layout-divider");
  }

  function scheduleBlocklyResize() {
    if (!workspace || !window.Blockly || blocklyResizeFrame !== null) return;
    blocklyResizeFrame = window.requestAnimationFrame(() => {
      blocklyResizeFrame = null;
      Blockly.svgResize(workspace);
    });
  }

  function initLayout() {
    if (!window.CVSVisionLayout || !elements.workbench || !elements.layoutDivider) return false;
    layoutController = window.CVSVisionLayout.create({
      workbench: elements.workbench,
      divider: elements.layoutDivider,
      onResize: scheduleBlocklyResize,
    });
    window.cvsVisionLayout = layoutController;
    return true;
  }

  function renderProgramState(state) {
    running = !state.stopped;
    elements.programState.classList.toggle("is-running", state.running);
    elements.programState.classList.toggle("is-paused", state.paused);
    elements.programStateText.textContent = state.paused
      ? "Program paused"
      : state.running ? "Program running" : "Program stopped";
    elements.runButton.disabled = !state.stopped;
    elements.pauseButton.disabled = state.stopped;
    elements.pauseButton.textContent = state.paused ? "Resume" : "Pause";
    elements.stopButton.disabled = state.stopped;
  }

  function showSaveStatus(message) {
    window.clearTimeout(saveStatusTimer);
    elements.saveStatus.textContent = message;
    saveStatusTimer = window.setTimeout(() => {
      elements.saveStatus.textContent = "";
    }, 2600);
  }

  function getSimulatorSettings() {
    if (!window.VisionSimulator || typeof window.VisionSimulator.getSettings !== "function") {
      return { scene: BALL_SCENE };
    }

    const settings = window.VisionSimulator.getSettings();
    return settings && typeof settings === "object" ? settings : { scene: BALL_SCENE };
  }

  function defaultSnapshotSignature(scene = getSimulatorSettings().scene) {
    return scene === DINING_ROOM_SCENE ? FIDUCIAL_SIGNATURE : TARGET_SIGNATURE;
  }

  function resolveSnapshotSignature(block) {
    const signature = block && typeof block.getFieldValue === "function"
      ? block.getFieldValue("SIGNATURE")
      : null;
    return [TARGET_SIGNATURE, FIDUCIAL_SIGNATURE].includes(signature)
      ? signature
      : defaultSnapshotSignature();
  }

  function renderSensorData(sensor) {
    const safeSensor = sensor && typeof sensor === "object" ? sensor : {};
    const hasObjects = Boolean(safeSensor.exists);
    const selectedExists = typeof safeSensor.selectedExists === "boolean"
      ? safeSensor.selectedExists
      : hasObjects && Number(safeSensor.id) !== -1;
    const isFiducialScene = getSimulatorSettings().scene === DINING_ROOM_SCENE;
    const selectedItem = Number.isFinite(Number(safeSensor.selectedItem))
      ? Math.max(1, Math.trunc(Number(safeSensor.selectedItem)))
      : 1;

    elements.dataExists.textContent = hasObjects ? "TRUE" : "FALSE";
    elements.dataExists.classList.toggle("is-false", !hasObjects);
    if (elements.dataCount) elements.dataCount.textContent = safeSensor.captured ? String(Number(safeSensor.count) || 0) : "\u2014";
    if (elements.dataSelectedItem) elements.dataSelectedItem.textContent = safeSensor.captured ? String(selectedItem) : "\u2014";
    elements.dataCenterX.textContent = selectedExists ? safeSensor.centerX : "\u2014";
    elements.dataCenterY.textContent = selectedExists ? safeSensor.centerY : "\u2014";
    elements.dataWidth.textContent = selectedExists ? safeSensor.width : "\u2014";
    elements.dataHeight.textContent = selectedExists ? safeSensor.height : "\u2014";
    elements.dataId.textContent = selectedExists ? safeSensor.id : "\u2014";
    elements.dataConfidence.textContent = selectedExists && !isFiducialScene && safeSensor.confidenceSupported !== false
      ? safeSensor.confidence
      : "\u2014";
  }

  function renderDrivetrain(state) {
    const labels = {
      forward: "FORWARD",
      reverse: "REVERSE",
      turnLeft: "TURN LEFT",
      turnRight: "TURN RIGHT",
      stopped: "STOPPED"
    };

    const leftOutput = Math.round(state.leftOutput);
    const rightOutput = Math.round(state.rightOutput);
    elements.drivetrainStatusValue.textContent = `${labels[state.action]} \u2014 L ${leftOutput}% \u00b7 R ${rightOutput}%`;
    elements.drivetrainStatusValue.title = `Drive speed ${state.driveSpeed}% \u00b7 Turn speed ${state.turnSpeed}%`;
    elements.drivetrainStatus.classList.toggle("is-stopped", state.action === "stopped");
  }

  function clearOutput() {
    elements.outputConsole.replaceChildren();
    const placeholder = document.createElement("p");
    placeholder.id = "console-placeholder";
    placeholder.className = "console-placeholder";
    placeholder.textContent = "Printed values will appear here.";
    elements.outputConsole.appendChild(placeholder);
    elements.consolePlaceholder = placeholder;
  }

  function printToConsole(value, isSystemMessage = false) {
    const printableValue = String(value);

    if (elements.consolePlaceholder && elements.consolePlaceholder.isConnected) {
      elements.consolePlaceholder.remove();
    }

    const line = document.createElement("p");
    line.className = isSystemMessage ? "console-line console-line--system" : "console-line";
    line.textContent = printableValue;
    elements.outputConsole.appendChild(line);

    while (elements.outputConsole.children.length > MAX_CONSOLE_LINES) {
      elements.outputConsole.firstElementChild.remove();
    }

    elements.outputConsole.scrollTop = elements.outputConsole.scrollHeight;
  }

  function stopProgram(reason = "stopped") {
    if (programControl) programControl.stop(reason);
  }

  function togglePause() {
    if (!programControl) return;
    if (programControl.isPaused()) programControl.resume();
    else programControl.pause();
  }

  function delay(milliseconds, runId) {
    return programControl.delay(milliseconds, runId);
  }

  function inputBlock(block, inputName) {
    return block.getInputTargetBlock(inputName);
  }

  function variableKey(block) {
    return block.getFieldValue("VAR") || "value";
  }

  function readVisionSensor(property) {
    const sensor = window.visionSensor && typeof window.visionSensor === "object"
      ? window.visionSensor
      : {};

    if (!sensor.captured && !snapshotGuidanceShown) {
      snapshotGuidanceShown = true;
      printToConsole(SNAPSHOT_GUIDANCE, true);
    }

    if (property === "exists") return Boolean(sensor.exists);
    if (property === "id") {
      return Number.isFinite(Number(sensor.id)) ? Math.trunc(Number(sensor.id)) : -1;
    }
    if (
      property === "confidence" &&
      (
        getSimulatorSettings().scene === DINING_ROOM_SCENE ||
        activeVisionSignature === FIDUCIAL_SIGNATURE ||
        sensor.confidenceSupported === false
      )
    ) {
      return 0;
    }

    return Number.isFinite(Number(sensor[property])) ? Number(sensor[property]) : 0;
  }

  function evaluateValue(block) {
    if (!block || block.isEnabled() === false) {
      return false;
    }

    switch (block.type) {
      case "vision_exists":
        return readVisionSensor("exists");
      case "vision_object_count":
        return readVisionSensor("count");
      case "vision_is_fiducial_id": {
        const fiducialId = Number(evaluateValue(inputBlock(block, "ID")));
        return window.visionSensor?.type === "fiducial" &&
          Number.isInteger(fiducialId) &&
          fiducialId >= 0 &&
          readVisionSensor("id") === fiducialId;
      }
      case "vision_center_x":
        return readVisionSensor("centerX");
      case "vision_center_y":
        return readVisionSensor("centerY");
      case "vision_width":
        return readVisionSensor("width");
      case "vision_height":
        return readVisionSensor("height");
      case "vision_id":
        return readVisionSensor("id");
      case "vision_confidence":
        return readVisionSensor("confidence");
      case "math_number":
        return Number(block.getFieldValue("NUM")) || 0;
      case "variables_get":
        return variables.get(variableKey(block)) ?? 0;
      case "math_arithmetic": {
        const left = Number(evaluateValue(inputBlock(block, "A"))) || 0;
        const right = Number(evaluateValue(inputBlock(block, "B"))) || 0;
        const operation = block.getFieldValue("OP");
        if (operation === "MINUS") return left - right;
        if (operation === "MULTIPLY") return left * right;
        if (operation === "DIVIDE") return right === 0 ? 0 : left / right;
        return left + right;
      }
      case "logic_compare": {
        const left = evaluateValue(inputBlock(block, "A"));
        const right = evaluateValue(inputBlock(block, "B"));
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
          ? Boolean(evaluateValue(inputBlock(block, "A"))) || Boolean(evaluateValue(inputBlock(block, "B")))
          : Boolean(evaluateValue(inputBlock(block, "A"))) && Boolean(evaluateValue(inputBlock(block, "B")));
      case "logic_negate":
        return !Boolean(evaluateValue(inputBlock(block, "BOOL")));
      case "logic_boolean":
        return block.getFieldValue("BOOL") === "TRUE";
      case "logic_equals":
        return Number(evaluateValue(inputBlock(block, "LEFT"))) === Number(block.getFieldValue("RIGHT"));
      case "logic_less_than":
        return Number(evaluateValue(inputBlock(block, "LEFT"))) < Number(block.getFieldValue("RIGHT"));
      case "logic_greater_than":
        return Number(evaluateValue(inputBlock(block, "LEFT"))) > Number(block.getFieldValue("RIGHT"));
      case "logic_and":
        return Boolean(evaluateValue(inputBlock(block, "LEFT"))) && Boolean(evaluateValue(inputBlock(block, "RIGHT")));
      case "logic_or":
        return Boolean(evaluateValue(inputBlock(block, "LEFT"))) || Boolean(evaluateValue(inputBlock(block, "RIGHT")));
      case "logic_not":
        return !Boolean(evaluateValue(inputBlock(block, "VALUE")));
      default:
        return false;
    }
  }

  async function executeStatementChain(firstBlock, runId) {
    let block = firstBlock;

    while (block && programControl.isActive(runId)) {
      if (!(await programControl.waitWhilePaused(runId))) return;
      if (block.isEnabled() === false) {
        block = block.getNextBlock();
        continue;
      }

      switch (block.type) {
        case "core_forever":
        case "control_forever":
          while (programControl.isActive(runId)) {
            await executeStatementChain(inputBlock(block, "DO"), runId);
            await delay(FOREVER_DELAY_MS, runId);
          }
          return;
        case "controls_repeat_ext": {
          const repeatCount = Math.max(0, Math.floor(Number(evaluateValue(inputBlock(block, "TIMES"))) || 0));
          for (let index = 0; index < repeatCount && programControl.isActive(runId); index += 1) {
            await executeStatementChain(inputBlock(block, "DO"), runId);
            await programControl.yieldControl(runId);
          }
          break;
        }
        case "core_wait_seconds":
          await delay(Math.max(0, Number(evaluateValue(inputBlock(block, "SECONDS"))) || 0) * 1000, runId);
          break;
        case "core_wait_until":
          await programControl.waitUntil(
            () => Boolean(evaluateValue(inputBlock(block, "CONDITION"))),
            runId,
          );
          break;
        case "controls_if":
          if (Boolean(evaluateValue(inputBlock(block, "IF0")))) {
            await executeStatementChain(inputBlock(block, "DO0"), runId);
          } else {
            await executeStatementChain(inputBlock(block, "ELSE"), runId);
          }
          break;
        case "control_if":
          if (Boolean(evaluateValue(inputBlock(block, "CONDITION")))) {
            await executeStatementChain(inputBlock(block, "DO"), runId);
          }
          break;
        case "control_if_else":
          if (Boolean(evaluateValue(inputBlock(block, "CONDITION")))) {
            await executeStatementChain(inputBlock(block, "DO"), runId);
          } else {
            await executeStatementChain(inputBlock(block, "ELSE"), runId);
          }
          break;
        case "variables_set":
          variables.set(variableKey(block), evaluateValue(inputBlock(block, "VALUE")));
          break;
        case "math_change":
          variables.set(
            variableKey(block),
            Number(variables.get(variableKey(block)) || 0) + Number(evaluateValue(inputBlock(block, "DELTA")) || 0),
          );
          break;
        case "core_stop_program":
          stopProgram("stop program");
          return;
        case "core_print_text":
        case "output_print_text":
          printToConsole(block.getFieldValue("TEXT"));
          break;
        case "core_print_value":
        case "output_print_value":
          printToConsole(evaluateValue(inputBlock(block, "VALUE")));
          break;
        case "vision_take_snapshot": {
          const signature = resolveSnapshotSignature(block);
          activeVisionSignature = signature;
          window.VisionSimulator.takeSnapshot(signature);
          break;
        }
        case "vision_set_object_item": {
          const studentItem = Math.max(
            1,
            Math.trunc(Number(evaluateValue(inputBlock(block, "ITEM"))) || 1),
          );
          window.VisionSimulator.setSnapshotObjectItem(studentItem);
          break;
        }
        case "vision_look_forward":
          window.VisionSimulator.setHeadPreset("forward");
          break;
        case "vision_look_down":
          window.VisionSimulator.setHeadPreset("down");
          break;
        case "drive_forward":
          window.Drivetrain.forward();
          break;
        case "drive_reverse":
          window.Drivetrain.reverse();
          break;
        case "drive_turn_left":
          window.Drivetrain.turnLeft();
          break;
        case "drive_turn_right":
          window.Drivetrain.turnRight();
          break;
        case "drive_stop":
          window.Drivetrain.stop();
          break;
        case "drive_set_speed":
          window.Drivetrain.setDriveSpeed(block.getFieldValue("SPEED"));
          break;
        case "drive_set_turn_speed":
          window.Drivetrain.setTurnSpeed(block.getFieldValue("SPEED"));
          break;
        case "drivetrain_forward":
          window.Drivetrain.command("forward", block.getFieldValue("SPEED"));
          break;
        case "drivetrain_reverse":
          window.Drivetrain.command("reverse", block.getFieldValue("SPEED"));
          break;
        case "drivetrain_turn_left":
          window.Drivetrain.command("turnLeft", block.getFieldValue("SPEED"));
          break;
        case "drivetrain_turn_right":
          window.Drivetrain.command("turnRight", block.getFieldValue("SPEED"));
          break;
        case "drivetrain_stop":
          window.Drivetrain.stop();
          break;
        default:
          break;
      }

      block = block.getNextBlock();
    }
  }

  async function runProgram() {
    stopProgram("ready");
    clearOutput();
    variables.clear();
    snapshotGuidanceShown = false;
    activeVisionSignature = null;
    window.VisionSimulator.clearSnapshot();

    const startBlocks = workspace
      .getTopBlocks(true)
      .filter((block) => ["core_when_started", "event_when_started"].includes(block.type) && block.isEnabled() !== false);

    if (startBlocks.length === 0) {
      printToConsole("Add a When Started block to run your program.", true);
      return;
    }

    const runId = programControl.run();
    try {
      await Promise.all(
        startBlocks.map((startBlock) => executeStatementChain(startBlock.getNextBlock(), runId))
      );
    } catch (error) {
      if (programControl.isActive(runId)) {
        printToConsole("The program stopped because a block could not be executed.", true);
        console.error(error);
      }
    } finally {
      programControl.complete(runId);
    }
  }

  function resetSimulator() {
    programControl.reset(() => {
      window.VisionSimulator.resetWorld();
      variables.clear();
      activeVisionSignature = null;
      clearOutput();
    });
    showSaveStatus("Simulator reset");
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function validateWorkspaceState(workspaceState) {
    if (!isRecord(workspaceState)) {
      throw new Error("The program does not contain a valid Blockly workspace.");
    }
    return workspaceState;
  }

  function visitSerializedBlocks(workspaceState, visitor) {
    const topBlocks = workspaceState?.blocks?.blocks;
    if (!Array.isArray(topBlocks)) return;

    function visit(blockState) {
      if (!isRecord(blockState)) return;
      visitor(blockState);

      Object.values(blockState.inputs || {}).forEach((inputState) => {
        if (!isRecord(inputState)) return;
        visit(inputState.block);
        visit(inputState.shadow);
      });
      visit(blockState.next?.block);
    }

    topBlocks.forEach(visit);
  }

  function migrateLegacySnapshotSignatures(workspaceState, scene) {
    const migratedState = JSON.parse(JSON.stringify(validateWorkspaceState(workspaceState)));
    const fallbackSignature = defaultSnapshotSignature(scene);

    visitSerializedBlocks(migratedState, (blockState) => {
      if (blockState.type !== "vision_take_snapshot") return;
      if (isRecord(blockState.fields) && Object.hasOwn(blockState.fields, "SIGNATURE")) return;
      blockState.fields = { ...(isRecord(blockState.fields) ? blockState.fields : {}), SIGNATURE: fallbackSignature };
    });

    return migratedState;
  }

  function normalizeProgramSettings(settings) {
    if (!isRecord(settings)) {
      throw new Error("The program file does not contain valid simulator settings.");
    }
    if (!window.VisionSimulator || typeof window.VisionSimulator.normalizeSettings !== "function") {
      throw new Error("Simulator settings are unavailable.");
    }

    const normalizedSettings = window.VisionSimulator.normalizeSettings(settings);
    if (!isRecord(normalizedSettings)) {
      throw new Error("The program file does not contain valid simulator settings.");
    }
    return normalizedSettings;
  }

  function getProgramSettings() {
    return normalizeProgramSettings(getSimulatorSettings());
  }

  function restoreProgramSettings(normalizedSettings) {
    if (!window.VisionSimulator || typeof window.VisionSimulator.applySettings !== "function") {
      throw new Error("Simulator settings are unavailable.");
    }
    window.VisionSimulator.applySettings(normalizedSettings);
  }

  function replaceProgramTransactionally(nextWorkspaceState, normalizedSettings = null) {
    const previousWorkspace = Blockly.serialization.workspaces.save(workspace);
    const previousSettings = getProgramSettings();
    const nextScene = normalizedSettings?.scene || previousSettings.scene;
    const migratedWorkspace = migrateLegacySnapshotSignatures(nextWorkspaceState, nextScene);
    let workspaceWasMutated = false;

    try {
      if (normalizedSettings) restoreProgramSettings(normalizedSettings);
      workspaceWasMutated = true;
      workspace.clear();
      Blockly.serialization.workspaces.load(migratedWorkspace, workspace);
      activeVisionSignature = null;
    } catch (error) {
      try {
        restoreProgramSettings(previousSettings);
      } catch (rollbackError) {
        console.error(rollbackError);
      }

      if (workspaceWasMutated) {
        try {
          workspace.clear();
          Blockly.serialization.workspaces.load(previousWorkspace, workspace);
        } catch (rollbackError) {
          console.error(rollbackError);
        }
      }
      throw error;
    }
  }

  function saveProgram() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(createProgramFile()));
      showSaveStatus("Program saved on this device");
    } catch (error) {
      showSaveStatus("Could not save program");
      console.error(error);
    }
  }

  function loadProgram() {
    try {
      const savedProgram = localStorage.getItem(STORAGE_KEY);

      if (!savedProgram) {
        showSaveStatus("No saved program found");
        return;
      }

      const savedState = JSON.parse(savedProgram);
      const validatedProgram = savedState?.format === PROGRAM_FORMAT
        ? validateProgramFile(savedState)
        : {
          workspace: validateWorkspaceState(savedState),
          // Raw workspace saves predate scenes and can only belong to the
          // original Ball sandbox. Restore that context before migration.
          settings: normalizeProgramSettings({})
        };
      stopProgram();
      replaceProgramTransactionally(validatedProgram.workspace, validatedProgram.settings);
      clearOutput();
      showSaveStatus("Saved program loaded");
    } catch (error) {
      showSaveStatus("Saved program could not be loaded");
      console.error(error);
    }
  }

  function createProgramFile() {
    return {
      format: PROGRAM_FORMAT,
      formatVersion: PROGRAM_FORMAT_VERSION,
      app: APP_ID,
      appVersion: APP_VERSION,
      workspace: Blockly.serialization.workspaces.save(workspace),
      settings: getProgramSettings()
    };
  }

  function exportProgram() {
    try {
      const contents = `${JSON.stringify(createProgramFile(), null, 2)}\n`;
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "CVS-AI-Vision-Program.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      showSaveStatus("Portable program exported");
    } catch (error) {
      showSaveStatus("Program could not be exported");
      console.error(error);
    }
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
    const workspaceState = validateWorkspaceState(programFile.workspace);
    const normalizedSettings = normalizeProgramSettings(programFile.settings);
    return { workspace: workspaceState, settings: normalizedSettings };
  }

  async function importProgram(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;

    let programFile;
    try {
      programFile = JSON.parse(await file.text());
    } catch (error) {
      showSaveStatus("The selected file is not valid JSON");
      return;
    }

    let validatedProgram;
    try {
      validatedProgram = validateProgramFile(programFile);
    } catch (error) {
      showSaveStatus(error.message);
      return;
    }

    stopProgram();

    try {
      replaceProgramTransactionally(validatedProgram.workspace, validatedProgram.settings);
      clearOutput();
      showSaveStatus("Portable program imported");
    } catch (error) {
      showSaveStatus("Program file could not be loaded");
      console.error(error);
    }
  }

  function clearProgram() {
    stopProgram();
    workspace.clear();
    clearOutput();

    try {
      localStorage.removeItem(STORAGE_KEY);
      showSaveStatus("Program and saved copy cleared");
    } catch (error) {
      showSaveStatus("Program cleared");
      console.error(error);
    }
  }

  function disableProgramButtons() {
    [
      elements.runButton,
      elements.pauseButton,
      elements.stopButton,
      elements.resetButton,
      elements.saveButton,
      elements.loadButton,
      elements.exportButton,
      elements.importButton,
      elements.clearButton,
      elements.blockLibraryButton
    ].forEach((button) => {
      button.disabled = true;
    });
  }

  function initBlockly() {
    if (!window.Blockly || !window.VisionBlocks || window.VisionBlocks.error) {
      elements.blocklyError.hidden = false;
      disableProgramButtons();
      return false;
    }

    try {
      const packs = window.VisionBlocks.getPacks();
      const preferences = window.CVSCoreToolbox.readPreferences(APP_ID, packs);
      workspace = window.VisionBlocks.createWorkspace("blockly-div", preferences);
      window.VisionBlocks.addStarterBlock(workspace);
      blockLibrary = window.CVSCoreToolbox.setup({
        appId: APP_ID,
        packs,
        workspace,
        getToolbox: (nextPreferences) => window.VisionBlocks.getToolbox(nextPreferences),
        button: elements.blockLibraryButton,
        dialog: elements.blockLibraryDialog,
        list: elements.blockLibraryList,
        closeButton: elements.blockLibraryClose,
      });
    } catch (error) {
      elements.blocklyError.hidden = false;
      disableProgramButtons();
      console.error(error);
      return false;
    }

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(scheduleBlocklyResize);
      resizeObserver.observe(document.getElementById("blockly-host"));
    } else {
      window.addEventListener("resize", scheduleBlocklyResize);
    }

    if (layoutController) layoutController.refresh();
    scheduleBlocklyResize();

    return true;
  }

  function bindEvents() {
    elements.runButton.addEventListener("click", runProgram);
    elements.pauseButton.addEventListener("click", togglePause);
    elements.stopButton.addEventListener("click", () => stopProgram());
    elements.resetButton.addEventListener("click", resetSimulator);
    elements.saveButton.addEventListener("click", saveProgram);
    elements.loadButton.addEventListener("click", loadProgram);
    elements.exportButton.addEventListener("click", exportProgram);
    elements.importButton.addEventListener("click", () => elements.importFileInput.click());
    elements.importFileInput.addEventListener("change", importProgram);
    elements.clearButton.addEventListener("click", clearProgram);
    window.addEventListener("visiondatachange", (event) => renderSensorData(event.detail));
    window.addEventListener("drivetrainchange", (event) => renderDrivetrain(event.detail));
    window.addEventListener("visionsettingschange", () => {
      stopProgram("settings changed");
      activeVisionSignature = null;
    });
  }

  function init() {
    getElements();
    initLayout();
    programControl = window.CVSProgramControl.create({
      stopMotion: () => window.Drivetrain.stop(),
      onStateChange: renderProgramState,
    });
    window.cvsProgramControl = programControl;
    bindEvents();
    window.VisionSimulator.init();
    renderSensorData(window.visionSensor);
    renderDrivetrain(window.drivetrain);
    initBlockly();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
