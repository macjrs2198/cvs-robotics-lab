(function () {
  "use strict";

  const BLOCK_DEFINITIONS = [
    {
      type: "feedback_when_started",
      message0: "when started",
      nextStatement: null,
      style: "event_blocks",
      tooltip: "Run the connected blocks when RUN is pressed.",
    },
    {
      type: "feedback_forever",
      message0: "forever %1 %2",
      args0: [
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
      tooltip: "Repeat the blocks inside until STOP is pressed.",
    },
    {
      type: "feedback_if",
      message0: "if %1 then %2 %3",
      args0: [
        { type: "input_value", name: "IF0", check: "Boolean" },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO0" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
      tooltip: "Run blocks only when a digital condition is ON.",
    },
    {
      type: "feedback_if_else",
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
      tooltip: "Choose between two actions from a digital condition.",
    },
    {
      type: "feedback_and",
      message0: "%1 AND %2",
      args0: [
        { type: "input_value", name: "A", check: "Boolean" },
        { type: "input_value", name: "B", check: "Boolean" },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
      tooltip: "ON only when both conditions are ON.",
    },
    {
      type: "feedback_or",
      message0: "%1 OR %2",
      args0: [
        { type: "input_value", name: "A", check: "Boolean" },
        { type: "input_value", name: "B", check: "Boolean" },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
      tooltip: "ON when either condition is ON.",
    },
    {
      type: "feedback_not",
      message0: "NOT %1",
      args0: [{ type: "input_value", name: "BOOL", check: "Boolean" }],
      output: "Boolean",
      style: "logic_blocks",
      tooltip: "Reverse an ON/OFF condition.",
    },
    {
      type: "feedback_equals",
      message0: "%1 equals %2",
      args0: [
        { type: "input_value", name: "A", check: "Boolean" },
        {
          type: "field_dropdown",
          name: "B",
          options: [
            ["ON", "TRUE"],
            ["OFF", "FALSE"],
          ],
        },
      ],
      inputsInline: true,
      output: "Boolean",
      style: "logic_blocks",
      tooltip: "Compare a digital condition with ON or OFF.",
    },
    {
      type: "sensor_line",
      message0: "Front Sensor On?",
      output: "Boolean",
      style: "sensor_blocks",
      tooltip: "Reports ON when the single front receiver is over white tape.",
    },
    {
      type: "sensor_left_line",
      message0: "Front Left Sensor On?",
      output: "Boolean",
      style: "sensor_blocks",
      tooltip: "Reports ON when the front-left receiver is over white tape.",
    },
    {
      type: "sensor_right_line",
      message0: "Front Right Sensor On?",
      output: "Boolean",
      style: "sensor_blocks",
      tooltip: "Reports ON when the front-right receiver is over white tape.",
    },
    {
      type: "sensor_rear_line",
      message0: "Rear Sensor On?",
      output: "Boolean",
      style: "sensor_blocks",
      tooltip: "Reports ON when the single rear receiver is over white tape.",
    },
    {
      type: "sensor_rear_left_line",
      message0: "Rear Left Sensor On?",
      output: "Boolean",
      style: "sensor_blocks",
      tooltip: "Reports ON when the rear-left receiver is over white tape.",
    },
    {
      type: "sensor_rear_right_line",
      message0: "Rear Right Sensor On?",
      output: "Boolean",
      style: "sensor_blocks",
      tooltip: "Reports ON when the rear-right receiver is over white tape.",
    },
    {
      type: "sensor_contact_switch",
      message0: "Contact Switch On?",
      output: "Boolean",
      style: "sensor_blocks",
      tooltip: "Reports ON only while the simulated switch is touching the contact stop.",
    },
    {
      type: "drive_forward",
      message0: "Drive Forward",
      previousStatement: null,
      nextStatement: null,
      style: "drive_blocks",
      tooltip: "Run both drive sides forward at the drive speed.",
    },
    {
      type: "drive_reverse",
      message0: "Drive Reverse",
      previousStatement: null,
      nextStatement: null,
      style: "drive_blocks",
      tooltip: "Run both drive sides in reverse at the drive speed.",
    },
    {
      type: "drive_turn_left",
      message0: "Turn Left",
      previousStatement: null,
      nextStatement: null,
      style: "drive_blocks",
      tooltip: "Turn left using separate left and right drive outputs.",
    },
    {
      type: "drive_turn_right",
      message0: "Turn Right",
      previousStatement: null,
      nextStatement: null,
      style: "drive_blocks",
      tooltip: "Turn right using separate left and right drive outputs.",
    },
    {
      type: "drive_stop",
      message0: "Stop Driving",
      previousStatement: null,
      nextStatement: null,
      style: "drive_blocks",
      tooltip: "Set both drive outputs to zero.",
    },
    {
      type: "drive_set_speed",
      message0: "Set Drive Speed to %1 %%",
      args0: [{ type: "field_number", name: "SPEED", value: 50, min: 0, max: 100, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      style: "drive_blocks",
      tooltip: "Set the forward and reverse speed percentage.",
    },
    {
      type: "drive_set_turn_speed",
      message0: "Set Turn Speed to %1 %%",
      args0: [{ type: "field_number", name: "SPEED", value: 30, min: 0, max: 100, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      style: "drive_blocks",
      tooltip: "Set the turning speed percentage.",
    },
    {
      type: "output_print_text",
      message0: "Print Text %1",
      args0: [{ type: "field_input", name: "TEXT", text: "following line" }],
      previousStatement: null,
      nextStatement: null,
      style: "output_blocks",
      tooltip: "Print text in the output panel.",
    },
    {
      type: "output_print_value",
      message0: "Print Value %1",
      args0: [{ type: "input_value", name: "VALUE", check: "Boolean" }],
      previousStatement: null,
      nextStatement: null,
      style: "output_blocks",
      tooltip: "Print a digital ON/OFF value.",
    },
  ];

  const theme = Blockly.Theme.defineTheme("cvsDigitalTheme", {
    base: Blockly.Themes.Classic,
    blockStyles: {
      event_blocks: { colourPrimary: "#2e9f66", colourSecondary: "#258254", colourTertiary: "#1d6943" },
      control_blocks: { colourPrimary: "#a96c2a", colourSecondary: "#8e581f", colourTertiary: "#704416" },
      logic_blocks: { colourPrimary: "#5b70c6", colourSecondary: "#485baa", colourTertiary: "#37478b" },
      sensor_blocks: { colourPrimary: "#168fa3", colourSecondary: "#0e7486", colourTertiary: "#0a5c69" },
      drive_blocks: { colourPrimary: "#008d58", colourSecondary: "#007247", colourTertiary: "#005b38" },
      output_blocks: { colourPrimary: "#7e5db6", colourSecondary: "#67489e", colourTertiary: "#513680" },
    },
    categoryStyles: {
      event_category: { colour: "#a96c2a" },
      logic_category: { colour: "#5b70c6" },
      sensor_category: { colour: "#168fa3" },
      drive_category: { colour: "#008d58" },
      output_category: { colour: "#7e5db6" },
    },
    componentStyles: {
      workspaceBackgroundColour: "#101b18",
      toolboxBackgroundColour: "#091310",
      toolboxForegroundColour: "#d9e5e0",
      flyoutBackgroundColour: "#13211d",
      flyoutForegroundColour: "#d9e5e0",
      flyoutOpacity: 1,
      scrollbarColour: "#3e5b50",
      scrollbarOpacity: 0.7,
      insertionMarkerColour: "#45e07f",
      insertionMarkerOpacity: 0.55,
      markerColour: "#70e1f5",
      cursorColour: "#70e1f5",
    },
    fontStyle: {
      family: "Space Grotesk, sans-serif",
      weight: "600",
      size: 12,
    },
  });

  function block(type) {
    return { kind: "block", type };
  }

  function normalizeConfiguration(configuration) {
    if (typeof configuration === "string") {
      return { front: { mode: configuration }, rear: { mode: "none" } };
    }
    return {
      front: { mode: configuration?.front?.mode || "single" },
      rear: { mode: configuration?.rear?.mode || "none" },
    };
  }

  function mountBlocks(mount, mode) {
    if (mode === "none") return [];
    if (mount === "front") {
      return mode === "dual"
        ? [block("sensor_left_line"), block("sensor_right_line")]
        : [block("sensor_line")];
    }
    return mode === "dual"
      ? [block("sensor_rear_left_line"), block("sensor_rear_right_line")]
      : [block("sensor_rear_line")];
  }

  function getToolbox(activityId, configuration) {
    const normalized = normalizeConfiguration(configuration);
    const sensorBlocks = activityId === "contact-switch"
      ? [block("sensor_contact_switch")]
      : [
          ...mountBlocks("front", normalized.front.mode),
          ...mountBlocks("rear", normalized.rear.mode),
        ];

    return {
      kind: "categoryToolbox",
      contents: [
        {
          kind: "category",
          name: "Events / Control",
          categorystyle: "event_category",
          contents: [
            block("feedback_when_started"),
            block("feedback_forever"),
            block("feedback_if"),
            block("feedback_if_else"),
          ],
        },
        {
          kind: "category",
          name: "Logic",
          categorystyle: "logic_category",
          contents: [block("feedback_and"), block("feedback_or"), block("feedback_not"), block("feedback_equals")],
        },
        {
          kind: "category",
          name: "Digital Sensors",
          categorystyle: "sensor_category",
          contents: sensorBlocks,
        },
        {
          kind: "category",
          name: "Drive",
          categorystyle: "drive_category",
          contents: [
            block("drive_forward"),
            block("drive_reverse"),
            block("drive_turn_left"),
            block("drive_turn_right"),
            block("drive_stop"),
            block("drive_set_speed"),
            block("drive_set_turn_speed"),
          ],
        },
        {
          kind: "category",
          name: "Output",
          categorystyle: "output_category",
          contents: [block("output_print_text"), block("output_print_value")],
        },
      ],
    };
  }

  function makeSingleStarter(sensorType = "sensor_line") {
    return {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "feedback_when_started",
            x: 42,
            y: 36,
            next: {
              block: {
                type: "drive_set_speed",
                fields: { SPEED: 40 },
                next: {
                  block: {
                    type: "drive_set_turn_speed",
                    fields: { SPEED: 25 },
                    next: {
                      block: {
                        type: "feedback_forever",
                        inputs: {
                          DO: {
                            block: {
                              type: "feedback_if_else",
                              inputs: {
                                IF0: { block: { type: sensorType } },
                                DO0: { block: { type: "drive_turn_left" } },
                                ELSE: { block: { type: "drive_turn_right" } },
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

  function makeDualStarter(
    leftSensorType = "sensor_left_line",
    rightSensorType = "sensor_right_line",
  ) {
    return {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "feedback_when_started",
            x: 42,
            y: 36,
            next: {
              block: {
                type: "drive_set_speed",
                fields: { SPEED: 40 },
                next: {
                  block: {
                    type: "drive_set_turn_speed",
                    fields: { SPEED: 25 },
                    next: {
                      block: {
                        type: "feedback_forever",
                        inputs: {
                          DO: {
                            block: {
                              type: "feedback_if_else",
                              inputs: {
                                IF0: {
                                  block: {
                                    type: "feedback_and",
                                    inputs: {
                                      A: { block: { type: leftSensorType } },
                                      B: {
                                        block: {
                                          type: "feedback_not",
                                          inputs: { BOOL: { block: { type: rightSensorType } } },
                                        },
                                      },
                                    },
                                  },
                                },
                                DO0: { block: { type: "drive_turn_left" } },
                                ELSE: {
                                  block: {
                                    type: "feedback_if_else",
                                    inputs: {
                                      IF0: {
                                        block: {
                                          type: "feedback_and",
                                          inputs: {
                                            A: { block: { type: rightSensorType } },
                                            B: {
                                              block: {
                                                type: "feedback_not",
                                                inputs: { BOOL: { block: { type: leftSensorType } } },
                                              },
                                            },
                                          },
                                        },
                                      },
                                      DO0: { block: { type: "drive_turn_right" } },
                                      ELSE: { block: { type: "drive_forward" } },
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
            },
          },
        ],
      },
    };
  }

  function makeNoSensorStarter() {
    return {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "feedback_when_started",
            x: 42,
            y: 36,
            next: { block: { type: "drive_stop" } },
          },
        ],
      },
    };
  }

  function makeLineStarter(configuration) {
    const normalized = normalizeConfiguration(configuration);
    if (normalized.front.mode === "single") return makeSingleStarter("sensor_line");
    if (normalized.front.mode === "dual") {
      return makeDualStarter("sensor_left_line", "sensor_right_line");
    }
    if (normalized.rear.mode === "single") return makeSingleStarter("sensor_rear_line");
    if (normalized.rear.mode === "dual") {
      return makeDualStarter("sensor_rear_left_line", "sensor_rear_right_line");
    }
    return makeNoSensorStarter();
  }

  function makeContactStarter() {
    return {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "feedback_when_started",
            x: 42,
            y: 36,
            next: {
              block: {
                type: "drive_set_speed",
                fields: { SPEED: 40 },
                next: {
                  block: {
                    type: "drive_set_turn_speed",
                    fields: { SPEED: 30 },
                    next: {
                      block: {
                        type: "feedback_forever",
                        inputs: {
                          DO: {
                            block: {
                              type: "feedback_if_else",
                              inputs: {
                                IF0: { block: { type: "sensor_contact_switch" } },
                                DO0: { block: { type: "drive_stop" } },
                                ELSE: { block: { type: "drive_forward" } },
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

  function createWorkspace(element, activityId, configuration) {
    Blockly.defineBlocksWithJsonArray(BLOCK_DEFINITIONS);
    return Blockly.inject(element, {
      toolbox: getToolbox(activityId, configuration),
      theme,
      renderer: "zelos",
      trashcan: true,
      sounds: false,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.82, maxScale: 1.3, minScale: 0.5, scaleSpeed: 1.12 },
      grid: { spacing: 20, length: 2, colour: "#30453e", snap: false },
    });
  }

  function updateToolbox(workspace, activityId, configuration) {
    workspace.updateToolbox(getToolbox(activityId, configuration));
  }

  function loadStarter(workspace, activityId, configuration) {
    workspace.clear();
    const starter = activityId === "contact-switch"
      ? makeContactStarter()
      : makeLineStarter(configuration);
    Blockly.serialization.workspaces.load(starter, workspace);
  }

  window.DigitalFeedbackBlocks = {
    createWorkspace,
    updateToolbox,
    loadStarter,
  };
})();
