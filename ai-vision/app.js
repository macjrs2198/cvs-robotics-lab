(function () {
  "use strict";

  const STORAGE_KEY = "vex-ai-vision-simulator-program-v1";
  const PROGRAM_FORMAT = "cvs-robotics-program";
  const PROGRAM_FORMAT_VERSION = 1;
  const APP_ID = "cvs-ai-vision";
  const APP_VERSION = "2.0";
  const APP_DISPLAY_NAME = "CVS AI Vision";
  const APP_DISPLAY_NAMES = Object.freeze({
    "cvs-ai-vision": APP_DISPLAY_NAME,
    "cvs-digital-feedback": "CVS Digital Feedback",
    "cvs-analog-feedback": "CVS Analog Feedback"
  });
  const FOREVER_DELAY_MS = 140;
  const MAX_CONSOLE_LINES = 80;

  let workspace = null;
  let running = false;
  let programControl = null;
  let blockLibrary = null;
  let saveStatusTimer = null;
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

  function renderSensorData(sensor) {
    elements.dataExists.textContent = sensor.exists ? "TRUE" : "FALSE";
    elements.dataExists.classList.toggle("is-false", !sensor.exists);
    elements.dataCenterX.textContent = sensor.centerX;
    elements.dataCenterY.textContent = sensor.centerY;
    elements.dataWidth.textContent = sensor.width;
    elements.dataHeight.textContent = sensor.height;
    elements.dataId.textContent = sensor.id;
    elements.dataConfidence.textContent = sensor.confidence;
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

  function evaluateValue(block) {
    if (!block || block.isEnabled() === false) {
      return false;
    }

    switch (block.type) {
      case "vision_exists":
        return window.visionSensor.exists;
      case "vision_center_x":
        return window.visionSensor.centerX;
      case "vision_center_y":
        return window.visionSensor.centerY;
      case "vision_width":
        return window.visionSensor.width;
      case "vision_height":
        return window.visionSensor.height;
      case "vision_id":
        return window.visionSensor.id;
      case "vision_confidence":
        return window.visionSensor.confidence;
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
      clearOutput();
    });
    showSaveStatus("Simulator reset");
  }

  function saveProgram() {
    try {
      const programState = Blockly.serialization.workspaces.save(workspace);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(programState));
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

      stopProgram();
      Blockly.serialization.workspaces.load(JSON.parse(savedProgram), workspace);
      showSaveStatus("Saved program loaded");
    } catch (error) {
      showSaveStatus("Saved program could not be loaded");
      console.error(error);
    }
  }

  function getProgramSettings() {
    // The draggable target and drivetrain are runtime state, not project settings.
    return {};
  }

  function restoreProgramSettings(settings) {
    // Reserved for future project-level AI Vision settings.
    void settings;
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
    if (!programFile.workspace || typeof programFile.workspace !== "object" || Array.isArray(programFile.workspace)) {
      throw new Error("The program file does not contain a valid Blockly workspace.");
    }
    if (!programFile.settings || typeof programFile.settings !== "object" || Array.isArray(programFile.settings)) {
      throw new Error("The program file does not contain valid simulator settings.");
    }
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

    try {
      validateProgramFile(programFile);
    } catch (error) {
      showSaveStatus(error.message);
      return;
    }

    const currentWorkspace = Blockly.serialization.workspaces.save(workspace);
    stopProgram();

    try {
      workspace.clear();
      Blockly.serialization.workspaces.load(programFile.workspace, workspace);
      restoreProgramSettings(programFile.settings);
      window.VisionSimulator.resetWorld();
      clearOutput();
      showSaveStatus("Portable program imported");
    } catch (error) {
      workspace.clear();
      Blockly.serialization.workspaces.load(currentWorkspace, workspace);
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
      const resizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
      resizeObserver.observe(document.getElementById("blockly-host"));
    } else {
      window.addEventListener("resize", () => Blockly.svgResize(workspace));
    }

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
  }

  function init() {
    getElements();
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
