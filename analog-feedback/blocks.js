(function () {
  "use strict";

  if (!window.Blockly) {
    window.AnalogFeedbackBlocks = { error: "Blockly did not load." };
    return;
  }

  let deviceOptions = [["Joint1", "Joint1"], ["Gripper", "Gripper"]];

  const DEFINITIONS = [
    {
      type: "analog_when_started",
      message0: "when started",
      nextStatement: null,
      style: "event_blocks",
      tooltip: "Run the connected blocks when RUN is pressed.",
    },
    {
      type: "analog_forever",
      message0: "forever %1 %2",
      args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
      tooltip: "Repeat until STOP is pressed.",
    },
    {
      type: "analog_if",
      message0: "if %1 then %2 %3",
      args0: [
        { type: "input_value", name: "IF0", check: "Boolean" },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO0" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
    {
      type: "analog_if_else",
      message0: "if %1 then %2 %3 else %4 %5",
      args0: [
        { type: "input_value", name: "IF0", check: "Boolean" },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO0" },
        { type: "input_dummy" },
        { type: "input_statement", name: "ELSE" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
    {
      type: "analog_wait",
      message0: "wait %1 seconds",
      args0: [{ type: "field_number", name: "SECONDS", value: 0.25, min: 0, max: 60, precision: 0.05 }],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
      tooltip: "Pause this program branch for the selected time.",
    },
    {
      type: "analog_less",
      message0: "%1 < %2",
      args0: [
        { type: "input_value", name: "A", check: "Number" },
        { type: "input_value", name: "B", check: "Number" },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
    },
    {
      type: "analog_greater",
      message0: "%1 > %2",
      args0: [
        { type: "input_value", name: "A", check: "Number" },
        { type: "input_value", name: "B", check: "Number" },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
    },
    {
      type: "analog_equals",
      message0: "%1 = %2",
      args0: [
        { type: "input_value", name: "A", check: "Number" },
        { type: "input_value", name: "B", check: "Number" },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
    },
    {
      type: "analog_and",
      message0: "%1 AND %2",
      args0: [
        { type: "input_value", name: "A", check: "Boolean" },
        { type: "input_value", name: "B", check: "Boolean" },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
    },
    {
      type: "analog_or",
      message0: "%1 OR %2",
      args0: [
        { type: "input_value", name: "A", check: "Boolean" },
        { type: "input_value", name: "B", check: "Boolean" },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
    },
    {
      type: "analog_not",
      message0: "NOT %1",
      args0: [{ type: "input_value", name: "BOOL", check: "Boolean" }],
      output: "Boolean",
      style: "logic_blocks",
    },
    {
      type: "analog_variable_set",
      message0: "set %1 to %2",
      args0: [
        { type: "field_variable", name: "VAR", variable: "value" },
        { type: "input_value", name: "VALUE", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "variable_blocks",
    },
    {
      type: "analog_variable_get",
      message0: "%1",
      args0: [{ type: "field_variable", name: "VAR", variable: "value" }],
      output: "Number",
      style: "variable_blocks",
    },
    {
      type: "analog_number",
      message0: "%1",
      args0: [{ type: "field_number", name: "NUM", value: 0, precision: 0.1 }],
      output: "Number",
      style: "math_blocks",
    },
    {
      type: "analog_arithmetic",
      message0: "%1 %2 %3",
      args0: [
        { type: "input_value", name: "A", check: "Number" },
        {
          type: "field_dropdown",
          name: "OP",
          options: [["+", "ADD"], ["−", "MINUS"], ["×", "MULTIPLY"], ["÷", "DIVIDE"]],
        },
        { type: "input_value", name: "B", check: "Number" },
      ],
      inputsInline: true,
      output: "Number",
      style: "math_blocks",
    },
    {
      type: "analog_map",
      message0: "map %1",
      args0: [{ type: "input_value", name: "VALUE", check: "Number" }],
      message1: "from %1 to %2",
      args1: [
        { type: "input_value", name: "IN_MIN", check: "Number" },
        { type: "input_value", name: "IN_MAX", check: "Number" },
      ],
      message2: "to %1 to %2",
      args2: [
        { type: "input_value", name: "OUT_MIN", check: "Number" },
        { type: "input_value", name: "OUT_MAX", check: "Number" },
      ],
      output: "Number",
      style: "math_blocks",
      tooltip: "Linearly map a value from one range to another.",
    },
    {
      type: "analog_print_text",
      message0: "Print Text %1",
      args0: [{ type: "field_input", name: "TEXT", text: "arm moving" }],
      previousStatement: null,
      nextStatement: null,
      style: "output_blocks",
    },
    {
      type: "analog_print_value",
      message0: "Print Value %1",
      args0: [{ type: "input_value", name: "VALUE" }],
      previousStatement: null,
      nextStatement: null,
      style: "output_blocks",
    },
  ];

  const theme = Blockly.Theme.defineTheme("cvsAnalogTheme", {
    base: Blockly.Themes.Classic,
    blockStyles: {
      event_blocks: { colourPrimary: "#2e9f66" },
      control_blocks: { colourPrimary: "#a96c2a" },
      logic_blocks: { colourPrimary: "#5b70c6" },
      variable_blocks: { colourPrimary: "#a64d94" },
      math_blocks: { colourPrimary: "#356bb3" },
      sensor_blocks: { colourPrimary: "#168fa3" },
      motor_blocks: { colourPrimary: "#008d58" },
      output_blocks: { colourPrimary: "#7e5db6" },
    },
    categoryStyles: {
      event_category: { colour: "#a96c2a" },
      logic_category: { colour: "#5b70c6" },
      variable_category: { colour: "#a64d94" },
      math_category: { colour: "#356bb3" },
      sensor_category: { colour: "#168fa3" },
      motor_category: { colour: "#008d58" },
      output_category: { colour: "#7e5db6" },
    },
    componentStyles: {
      workspaceBackgroundColour: "#101b18",
      toolboxBackgroundColour: "#091310",
      toolboxForegroundColour: "#d9e5e0",
      flyoutBackgroundColour: "#13211d",
      flyoutForegroundColour: "#d9e5e0",
      scrollbarColour: "#3e5b50",
      insertionMarkerColour: "#45e07f",
      insertionMarkerOpacity: 0.55,
      markerColour: "#70e1f5",
      cursorColour: "#70e1f5",
    },
    fontStyle: { family: "Space Grotesk, sans-serif", weight: "600", size: 12 },
  });

  function defineDynamicBlocks() {
    Blockly.Blocks.analog_pot_raw = {
      init() {
        this.appendDummyInput()
          .appendField(new Blockly.FieldDropdown(() => deviceOptions), "DEVICE")
          .appendField("Pot raw value");
        this.setOutput(true, "Number");
        this.setStyle("sensor_blocks");
        this.setTooltip("The current 12-bit raw analog input value from the selected potentiometer.");
      },
    };

    Blockly.Blocks.analog_motor_spin = {
      init() {
        this.appendDummyInput()
          .appendField("spin")
          .appendField(new Blockly.FieldDropdown(() => deviceOptions), "DEVICE")
          .appendField(new Blockly.FieldDropdown([["forward", "forward"], ["reverse", "reverse"]]), "DIRECTION");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setStyle("motor_blocks");
      },
    };

    Blockly.Blocks.analog_motor_stop = {
      init() {
        this.appendDummyInput()
          .appendField("stop")
          .appendField(new Blockly.FieldDropdown(() => deviceOptions), "DEVICE");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setStyle("motor_blocks");
      },
    };

    Blockly.Blocks.analog_motor_velocity = {
      init() {
        this.appendDummyInput()
          .appendField("set")
          .appendField(new Blockly.FieldDropdown(() => deviceOptions), "DEVICE")
          .appendField("velocity to")
          .appendField(new Blockly.FieldNumber(50, 0, 100, 1), "VELOCITY")
          .appendField("%");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setStyle("motor_blocks");
      },
    };
  }

  function block(type) {
    return { kind: "block", type };
  }

  function getToolbox() {
    return {
      kind: "categoryToolbox",
      contents: [
        {
          kind: "category",
          name: "Events / Control",
          categorystyle: "event_category",
          contents: [block("analog_when_started"), block("analog_forever"), block("analog_if"), block("analog_if_else"), block("analog_wait")],
        },
        {
          kind: "category",
          name: "Logic",
          categorystyle: "logic_category",
          contents: [block("analog_less"), block("analog_greater"), block("analog_equals"), block("analog_and"), block("analog_or"), block("analog_not")],
        },
        {
          kind: "category",
          name: "Variables",
          categorystyle: "variable_category",
          contents: [
            { kind: "button", text: "Create variable", callbackkey: "CREATE_VARIABLE" },
            block("analog_variable_set"),
            block("analog_variable_get"),
          ],
        },
        {
          kind: "category",
          name: "Math",
          categorystyle: "math_category",
          contents: [block("analog_number"), block("analog_arithmetic"), block("analog_map")],
        },
        {
          kind: "category",
          name: "Analog Sensors",
          categorystyle: "sensor_category",
          contents: [block("analog_pot_raw")],
        },
        {
          kind: "category",
          name: "Motors",
          categorystyle: "motor_category",
          contents: [block("analog_motor_spin"), block("analog_motor_stop"), block("analog_motor_velocity")],
        },
        {
          kind: "category",
          name: "Output",
          categorystyle: "output_category",
          contents: [block("analog_print_text"), block("analog_print_value")],
        },
      ],
    };
  }

  function numberBlock(value) {
    return { block: { type: "analog_number", fields: { NUM: value } } };
  }

  function mappedJointOne() {
    return {
      block: {
        type: "analog_map",
        inputs: {
          VALUE: { block: { type: "analog_pot_raw", fields: { DEVICE: "Joint1" } } },
          IN_MIN: numberBlock(620),
          IN_MAX: numberBlock(3470),
          OUT_MIN: numberBlock(0),
          OUT_MAX: numberBlock(180),
        },
      },
    };
  }

  function makeStarter() {
    return {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "analog_when_started",
            x: 42,
            y: 36,
            next: {
              block: {
                type: "analog_motor_velocity",
                fields: { DEVICE: "Joint1", VELOCITY: 35 },
                next: {
                  block: {
                    type: "analog_forever",
                    inputs: {
                      DO: {
                        block: {
                          type: "analog_if_else",
                          inputs: {
                            IF0: {
                              block: {
                                type: "analog_less",
                                inputs: { A: mappedJointOne(), B: numberBlock(85) },
                              },
                            },
                            DO0: { block: { type: "analog_motor_spin", fields: { DEVICE: "Joint1", DIRECTION: "forward" } } },
                            ELSE: {
                              block: {
                                type: "analog_if_else",
                                inputs: {
                                  IF0: {
                                    block: {
                                      type: "analog_greater",
                                      inputs: { A: mappedJointOne(), B: numberBlock(95) },
                                    },
                                  },
                                  DO0: { block: { type: "analog_motor_spin", fields: { DEVICE: "Joint1", DIRECTION: "reverse" } } },
                                  ELSE: { block: { type: "analog_motor_stop", fields: { DEVICE: "Joint1" } } },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    };
  }

  function setDeviceNames(names, workspace) {
    deviceOptions = names.map((name) => [name, name]);
    if (workspace) workspace.updateToolbox(getToolbox());
  }

  function createWorkspace(element, names) {
    setDeviceNames(names);
    Blockly.defineBlocksWithJsonArray(DEFINITIONS);
    defineDynamicBlocks();
    const workspace = Blockly.inject(element, {
      toolbox: getToolbox(),
      theme,
      renderer: "zelos",
      trashcan: true,
      sounds: false,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.76, maxScale: 1.3, minScale: 0.42, scaleSpeed: 1.12 },
      grid: { spacing: 20, length: 2, colour: "#30453e", snap: false },
    });
    workspace.registerButtonCallback("CREATE_VARIABLE", () => {
      Blockly.Variables.createVariableButtonHandler(workspace);
    });
    return workspace;
  }

  function loadStarter(workspace) {
    workspace.clear();
    Blockly.serialization.workspaces.load(makeStarter(), workspace);
  }

  window.AnalogFeedbackBlocks = { createWorkspace, setDeviceNames, loadStarter };
})();
