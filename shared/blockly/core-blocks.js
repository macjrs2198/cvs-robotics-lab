(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSCoreBlockly = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const COLORS = Object.freeze({
    events: "#2e9f66",
    control: "#a96c2a",
    logic: "#5b70c6",
    math: "#356bb3",
    variables: "#a64d94",
    output: "#7e5db6",
  });

  const DEFINITIONS = Object.freeze([
    {
      type: "core_when_started",
      message0: "when started",
      nextStatement: null,
      colour: COLORS.events,
      tooltip: "Run the connected blocks when RUN is pressed.",
    },
    {
      type: "core_forever",
      message0: "forever %1 %2",
      args0: [{ type: "input_dummy" }, { type: "input_statement", name: "DO" }],
      previousStatement: null,
      colour: COLORS.control,
      tooltip: "Repeat the blocks inside until the program stops.",
    },
    {
      type: "core_wait_seconds",
      message0: "wait %1 seconds",
      args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
      inputsInline: true,
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.control,
      tooltip: "Wait without freezing the simulator or browser interface.",
    },
    {
      type: "core_wait_until",
      message0: "wait until %1",
      args0: [{ type: "input_value", name: "CONDITION", check: "Boolean" }],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.control,
      tooltip: "Wait until the condition is true while the simulator continues updating.",
    },
    {
      type: "core_stop_program",
      message0: "stop program",
      previousStatement: null,
      colour: COLORS.control,
      tooltip: "End this program and stop all simulator-controlled motion without resetting position.",
    },
    {
      type: "core_print_text",
      message0: "print text %1",
      args0: [{ type: "field_input", name: "TEXT", text: "program running" }],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.output,
      tooltip: "Print text in the program output panel.",
    },
    {
      type: "core_print_value",
      message0: "print value %1",
      args0: [{ type: "input_value", name: "VALUE" }],
      previousStatement: null,
      nextStatement: null,
      colour: COLORS.output,
      tooltip: "Print a number, Boolean, sensor value, or variable.",
    },
  ]);

  let registeredBlockly = null;

  function block(type, fields, inputs, extraState) {
    const definition = { kind: "block", type };
    if (fields) definition.fields = fields;
    if (inputs) definition.inputs = inputs;
    if (extraState) definition.extraState = extraState;
    return definition;
  }

  function numberShadow(value) {
    return { shadow: { type: "math_number", fields: { NUM: value } } };
  }

  function register(Blockly) {
    if (!Blockly || registeredBlockly === Blockly) return;
    Blockly.defineBlocksWithJsonArray(DEFINITIONS);
    registeredBlockly = Blockly;
  }

  function getCoreCategories() {
    return [
      {
        kind: "category",
        name: "Events / Control",
        colour: COLORS.control,
        contents: [
          block("core_when_started"),
          block("core_forever"),
          block("controls_repeat_ext", null, { TIMES: numberShadow(10) }),
          block("core_wait_seconds", null, { SECONDS: numberShadow(1) }),
          block("core_wait_until"),
          block("controls_if"),
          block("controls_if", null, null, { elseIfCount: 0, hasElse: true }),
          block("core_stop_program"),
        ],
      },
      {
        kind: "category",
        name: "Logic",
        colour: COLORS.logic,
        contents: [
          block("logic_compare", { OP: "EQ" }),
          block("logic_compare", { OP: "NEQ" }),
          block("logic_compare", { OP: "LT" }),
          block("logic_compare", { OP: "GT" }),
          block("logic_compare", { OP: "LTE" }),
          block("logic_compare", { OP: "GTE" }),
          block("logic_operation", { OP: "AND" }),
          block("logic_operation", { OP: "OR" }),
          block("logic_negate"),
          block("logic_boolean", { BOOL: "TRUE" }),
          block("logic_boolean", { BOOL: "FALSE" }),
        ],
      },
      {
        kind: "category",
        name: "Math",
        colour: COLORS.math,
        contents: [
          block("math_number"),
          block("math_arithmetic", { OP: "ADD" }),
          block("math_arithmetic", { OP: "MINUS" }),
          block("math_arithmetic", { OP: "MULTIPLY" }),
          block("math_arithmetic", { OP: "DIVIDE" }),
        ],
      },
      {
        kind: "category",
        name: "Variables",
        colour: COLORS.variables,
        custom: "VARIABLE",
      },
      {
        kind: "category",
        name: "Output",
        colour: COLORS.output,
        contents: [block("core_print_text"), block("core_print_value")],
      },
    ];
  }

  function composeToolbox(packCategories, enabledPackIds) {
    const enabled = enabledPackIds instanceof Set ? enabledPackIds : new Set(enabledPackIds || []);
    const optionalCategories = (packCategories || [])
      .filter((pack) => enabled.has(pack.id))
      .map((pack) => typeof pack.category === "function" ? pack.category() : pack.category)
      .filter(Boolean);

    return {
      kind: "categoryToolbox",
      contents: [...getCoreCategories(), ...optionalCategories],
    };
  }

  return Object.freeze({ COLORS, register, getCoreCategories, composeToolbox, block, numberShadow });
});
