(function () {
  "use strict";

  if (!window.Blockly) {
    window.VisionBlocks = {
      error: "Blockly did not load."
    };
    return;
  }

  window.CVSCoreBlockly.register(Blockly);

  const COLORS = {
    events: 28,
    control: 205,
    logic: 272,
    vision: 164,
    drivetrain: "#008d58",
    output: 328
  };

  Blockly.defineBlocksWithJsonArray([
    {
      type: "event_when_started",
      message0: "when started",
      nextStatement: null,
      colour: COLORS.events,
      tooltip: "Runs the connected blocks when RUN is pressed.",
      helpUrl: ""
    },
    {
      type: "control_forever",
      message0: "forever %1 %2",
      args0: [
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" }
      ],
      previousStatement: null,
      colour: COLORS.control,
      tooltip: "Continuously repeats the blocks inside while the program is running.",
      helpUrl: ""
    },
    {
      type: "control_if",
      message0: "if %1 then %2 %3",
      args0: [
        { type: "input_value", name: "CONDITION", check: "Boolean" },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.control,
      tooltip: "Runs the enclosed blocks when the condition is true.",
      helpUrl: ""
    },
    {
      type: "control_if_else",
      message0: "if %1 then %2 %3 else %4 %5",
      args0: [
        { type: "input_value", name: "CONDITION", check: "Boolean" },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" },
        { type: "input_dummy" },
        { type: "input_statement", name: "ELSE" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.control,
      tooltip: "Chooses between two groups of blocks.",
      helpUrl: ""
    },
    {
      type: "logic_equals",
      message0: "%1 equals %2",
      args0: [
        { type: "input_value", name: "LEFT", check: "Number" },
        { type: "field_number", name: "RIGHT", value: 1, min: 0, max: 999, precision: 1 }
      ],
      inputsInline: true,
      output: "Boolean",
      colour: COLORS.logic,
      tooltip: "True when the sensor value equals the number.",
      helpUrl: ""
    },
    {
      type: "logic_less_than",
      message0: "%1 less than %2",
      args0: [
        { type: "input_value", name: "LEFT", check: "Number" },
        { type: "field_number", name: "RIGHT", value: 140, min: 0, max: 999, precision: 1 }
      ],
      inputsInline: true,
      output: "Boolean",
      colour: COLORS.logic,
      tooltip: "True when the sensor value is less than the number.",
      helpUrl: ""
    },
    {
      type: "logic_greater_than",
      message0: "%1 greater than %2",
      args0: [
        { type: "input_value", name: "LEFT", check: "Number" },
        { type: "field_number", name: "RIGHT", value: 180, min: 0, max: 999, precision: 1 }
      ],
      inputsInline: true,
      output: "Boolean",
      colour: COLORS.logic,
      tooltip: "True when the sensor value is greater than the number.",
      helpUrl: ""
    },
    {
      type: "logic_and",
      message0: "%1 and %2",
      args0: [
        { type: "input_value", name: "LEFT", check: "Boolean" },
        { type: "input_value", name: "RIGHT", check: "Boolean" }
      ],
      inputsInline: true,
      output: "Boolean",
      colour: COLORS.logic,
      tooltip: "True when both conditions are true.",
      helpUrl: ""
    },
    {
      type: "logic_or",
      message0: "%1 or %2",
      args0: [
        { type: "input_value", name: "LEFT", check: "Boolean" },
        { type: "input_value", name: "RIGHT", check: "Boolean" }
      ],
      inputsInline: true,
      output: "Boolean",
      colour: COLORS.logic,
      tooltip: "True when either condition is true.",
      helpUrl: ""
    },
    {
      type: "logic_not",
      message0: "not %1",
      args0: [
        { type: "input_value", name: "VALUE", check: "Boolean" }
      ],
      inputsInline: true,
      output: "Boolean",
      colour: COLORS.logic,
      tooltip: "Reverses a true or false condition.",
      helpUrl: ""
    },
    {
      type: "vision_take_snapshot",
      message0: "Take Snapshot of %1",
      args0: [
        {
          type: "field_dropdown",
          name: "SIGNATURE",
          options: [
            ["Target", "TARGET"],
            ["Fiducial IDs", "FIDUCIAL_IDS"]
          ]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.vision,
      tooltip: "Capture the selected kind of visible object. Vision reporters keep these Last Snapshot readings until Take Snapshot runs again.",
      helpUrl: ""
    },
    {
      type: "vision_set_object_item",
      message0: "Set Object Item to %1",
      args0: [
        { type: "input_value", name: "ITEM", check: "Number" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.vision,
      tooltip: "Select a Last Snapshot object by its VEX-style item number. Item 1 is the first object.",
      helpUrl: ""
    },
    {
      type: "vision_look_forward",
      message0: "Look Forward",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.vision,
      tooltip: "Point the camera head outward from its selected mounting side without changing the chassis or drive command.",
      helpUrl: ""
    },
    {
      type: "vision_look_down",
      message0: "Look Down 60\u00b0",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.vision,
      tooltip: "Tilt the camera head 60 degrees downward and outward without changing the chassis, drive command, or Last Snapshot.",
      helpUrl: ""
    },
    {
      type: "vision_look_down_45",
      message0: "Look Down 45\u00b0",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.vision,
      tooltip: "Tilt the camera head 45 degrees downward and outward without changing the chassis, drive command, or Last Snapshot.",
      helpUrl: ""
    },
    {
      type: "vision_exists",
      message0: "object exists",
      output: "Boolean",
      colour: COLORS.vision,
      tooltip: "True when the Last Snapshot contains at least one object.",
      helpUrl: ""
    },
    {
      type: "vision_object_count",
      message0: "object count",
      output: "Number",
      colour: COLORS.vision,
      tooltip: "The number of objects in the Last Snapshot.",
      helpUrl: ""
    },
    {
      type: "vision_is_fiducial_id",
      message0: "object is Fiducial ID %1",
      args0: [
        { type: "input_value", name: "ID", check: "Number" }
      ],
      inputsInline: true,
      output: "Boolean",
      colour: COLORS.vision,
      tooltip: "True when the selected Last Snapshot object is the specified Fiducial ID.",
      helpUrl: ""
    },
    {
      type: "vision_center_x",
      message0: "object center X",
      output: "Number",
      colour: COLORS.vision,
      tooltip: "The selected object's horizontal center from 0 to 320 in the Last Snapshot; 0 when unavailable.",
      helpUrl: ""
    },
    {
      type: "vision_center_y",
      message0: "object center Y",
      output: "Number",
      colour: COLORS.vision,
      tooltip: "The selected object's vertical center from 0 to 240 in the Last Snapshot; 0 when unavailable.",
      helpUrl: ""
    },
    {
      type: "vision_width",
      message0: "object width",
      output: "Number",
      colour: COLORS.vision,
      tooltip: "The selected object's width in the Last Snapshot; 0 when unavailable.",
      helpUrl: ""
    },
    {
      type: "vision_height",
      message0: "object height",
      output: "Number",
      colour: COLORS.vision,
      tooltip: "The selected object's height in the Last Snapshot; 0 when unavailable.",
      helpUrl: ""
    },
    {
      type: "vision_id",
      message0: "object ID",
      output: "Number",
      colour: COLORS.vision,
      tooltip: "The selected object's ID in the Last Snapshot. Fiducials report their tag ID; unavailable objects report -1.",
      helpUrl: ""
    },
    {
      type: "vision_confidence",
      message0: "object confidence",
      output: "Number",
      colour: COLORS.vision,
      tooltip: "Target confidence from the Last Snapshot. Fiducials do not expose confidence and report 0.",
      helpUrl: ""
    },
    {
      type: "drive_forward",
      message0: "Drive Forward",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Run both drive sides forward at the drive speed.",
      helpUrl: ""
    },
    {
      type: "drive_reverse",
      message0: "Drive Reverse",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Run both drive sides in reverse at the drive speed.",
      helpUrl: ""
    },
    {
      type: "drive_turn_left",
      message0: "Turn Left",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Turn left using separate left and right drive outputs.",
      helpUrl: ""
    },
    {
      type: "drive_turn_right",
      message0: "Turn Right",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Turn right using separate left and right drive outputs.",
      helpUrl: ""
    },
    {
      type: "drive_stop",
      message0: "Stop Driving",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Set both drive outputs to zero.",
      helpUrl: ""
    },
    {
      type: "drive_set_speed",
      message0: "Set Drive Speed to %1 %%",
      args0: [
        { type: "field_number", name: "SPEED", value: 50, min: 0, max: 100, precision: 1 }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Set the forward and reverse speed percentage.",
      helpUrl: ""
    },
    {
      type: "drive_set_turn_speed",
      message0: "Set Turn Speed to %1 %%",
      args0: [
        { type: "field_number", name: "SPEED", value: 30, min: 0, max: 100, precision: 1 }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Set the turning speed percentage.",
      helpUrl: ""
    },
    {
      type: "motor_spin",
      message0: "spin %1 %2",
      args0: [
        {
          type: "field_dropdown",
          name: "DEVICE",
          options: [["LeftDrive", "LeftDrive"], ["RightDrive", "RightDrive"]]
        },
        {
          type: "field_dropdown",
          name: "DIRECTION",
          options: [["forward", "forward"], ["reverse", "reverse"]]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Start the selected drive motor in the chosen chassis-relative direction at its stored velocity.",
      helpUrl: ""
    },
    {
      type: "motor_stop",
      message0: "stop %1",
      args0: [
        {
          type: "field_dropdown",
          name: "DEVICE",
          options: [["LeftDrive", "LeftDrive"], ["RightDrive", "RightDrive"]]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Stop only the selected drive motor.",
      helpUrl: ""
    },
    {
      type: "motor_set_velocity",
      message0: "set %1 velocity to %2 %%",
      args0: [
        {
          type: "field_dropdown",
          name: "DEVICE",
          options: [["LeftDrive", "LeftDrive"], ["RightDrive", "RightDrive"]]
        },
        { type: "input_value", name: "VELOCITY", check: "Number" }
      ],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Set the selected motor's stored velocity from 0 to 100 percent. A stopped motor stays stopped.",
      helpUrl: ""
    },
    {
      type: "drivetrain_forward",
      message0: "drive forward %1 %%",
      args0: [
        { type: "field_number", name: "SPEED", value: 50, min: 0, max: 100, precision: 1 }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Legacy drive block retained for previously saved programs.",
      helpUrl: ""
    },
    {
      type: "drivetrain_reverse",
      message0: "drive reverse %1 %%",
      args0: [
        { type: "field_number", name: "SPEED", value: 50, min: 0, max: 100, precision: 1 }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Legacy drive block retained for previously saved programs.",
      helpUrl: ""
    },
    {
      type: "drivetrain_turn_left",
      message0: "turn left %1 %%",
      args0: [
        { type: "field_number", name: "SPEED", value: 30, min: 0, max: 100, precision: 1 }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Legacy drive block retained for previously saved programs.",
      helpUrl: ""
    },
    {
      type: "drivetrain_turn_right",
      message0: "turn right %1 %%",
      args0: [
        { type: "field_number", name: "SPEED", value: 30, min: 0, max: 100, precision: 1 }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Legacy drive block retained for previously saved programs.",
      helpUrl: ""
    },
    {
      type: "drivetrain_stop",
      message0: "stop drivetrain",
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.drivetrain,
      tooltip: "Legacy drive block retained for previously saved programs.",
      helpUrl: ""
    },
    {
      type: "output_print_value",
      message0: "print value %1",
      args0: [
        { type: "input_value", name: "VALUE" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.output,
      tooltip: "Prints a sensor value or condition to the output console.",
      helpUrl: ""
    },
    {
      type: "output_print_text",
      message0: "print text %1",
      args0: [
        { type: "field_input", name: "TEXT", text: "TARGET CENTERED" }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.output,
      tooltip: "Prints the entered text to the output console.",
      helpUrl: ""
    }
  ]);

  const PACKS = [
    {
      id: "vision-sensors",
      label: "AI Vision Sensors",
      description: "Take an explicit snapshot, select an object, and read its captured visibility, count, identity, and image-space measurements.",
      defaultEnabled: true,
      category: {
        kind: "category",
        name: "AI Vision",
        colour: COLORS.vision,
        contents: [
          { kind: "block", type: "vision_take_snapshot" },
          {
            kind: "block",
            type: "vision_set_object_item",
            inputs: {
              ITEM: {
                shadow: {
                  type: "math_number",
                  fields: { NUM: 1 }
                }
              }
            }
          },
          { kind: "block", type: "vision_look_forward" },
          { kind: "block", type: "vision_look_down_45" },
          { kind: "block", type: "vision_look_down" },
          { kind: "block", type: "vision_exists" },
          { kind: "block", type: "vision_object_count" },
          {
            kind: "block",
            type: "vision_is_fiducial_id",
            inputs: {
              ID: {
                shadow: {
                  type: "math_number",
                  fields: { NUM: 0 }
                }
              }
            }
          },
          { kind: "block", type: "vision_center_x" },
          { kind: "block", type: "vision_center_y" },
          { kind: "block", type: "vision_width" },
          { kind: "block", type: "vision_height" },
          { kind: "block", type: "vision_id" },
          { kind: "block", type: "vision_confidence" }
        ]
      }
    },
    {
      id: "drive",
      label: "Drive",
      description: "Forward, reverse, turning, stopping, and speed controls.",
      defaultEnabled: true,
      category: {
        kind: "category",
        name: "Drive",
        colour: COLORS.drivetrain,
        contents: [
          { kind: "block", type: "drive_forward" },
          { kind: "block", type: "drive_reverse" },
          { kind: "block", type: "drive_turn_left" },
          { kind: "block", type: "drive_turn_right" },
          { kind: "block", type: "drive_stop" },
          { kind: "block", type: "drive_set_speed" },
          { kind: "block", type: "drive_set_turn_speed" }
        ]
      }
    },
    {
      id: "motors",
      label: "Motors",
      description: "Control LeftDrive and RightDrive independently with spin, stop, and stored velocity commands.",
      defaultEnabled: true,
      category: {
        kind: "category",
        name: "Motors",
        colour: COLORS.drivetrain,
        contents: [
          { kind: "block", type: "motor_spin" },
          { kind: "block", type: "motor_stop" },
          {
            kind: "block",
            type: "motor_set_velocity",
            inputs: {
              VELOCITY: {
                shadow: {
                  type: "math_number",
                  fields: { NUM: 50 }
                }
              }
            }
          }
        ]
      }
    }
  ];

  function getToolbox(preferences) {
    const enabled = preferences
      ? window.CVSCoreToolbox.enabledPackIds(preferences)
      : new Set(PACKS.map((pack) => pack.id));
    return window.CVSCoreBlockly.composeToolbox(PACKS, enabled);
  }

  const theme = Blockly.Theme.defineTheme("visionTheme", {
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: "#09141a",
      toolboxBackgroundColour: "#0b171e",
      toolboxForegroundColour: "#d7e7e2",
      flyoutBackgroundColour: "#12212a",
      flyoutForegroundColour: "#d7e7e2",
      flyoutOpacity: 1,
      scrollbarColour: "#3b5960",
      insertionMarkerColour: "#18c99a",
      insertionMarkerOpacity: 0.42,
      markerColour: "#67e5c0",
      cursorColour: "#67e5c0"
    },
    fontStyle: {
      family: "Space Grotesk, Inter, system-ui, sans-serif",
      weight: "600",
      size: 12
    }
  });

  function createWorkspace(container, preferences) {
    return Blockly.inject(container, {
      toolbox: getToolbox(preferences),
      theme,
      renderer: "zelos",
      trashcan: true,
      sounds: false,
      move: {
        scrollbars: true,
        drag: true,
        wheel: true
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 0.92,
        maxScale: 1.4,
        minScale: 0.5,
        scaleSpeed: 1.1,
        pinch: true
      },
      grid: {
        spacing: 20,
        length: 2,
        colour: "#20343b",
        snap: true
      }
    });
  }

  function addStarterBlock(workspace) {
    if (workspace.getAllBlocks(false).length > 0) {
      return;
    }

    const startBlock = workspace.newBlock("event_when_started");
    startBlock.initSvg();
    startBlock.render();
    startBlock.moveBy(36, 30);
  }

  window.VisionBlocks = {
    createWorkspace,
    addStarterBlock,
    getToolbox,
    getPacks: () => PACKS
  };
})();
