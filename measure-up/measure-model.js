(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MeasureModel = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_CHALLENGE_MS = 60_000;
  const DIFFICULTIES = Object.freeze(["apprentice", "journey", "master"]);

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  const UNIT_OPTIONS = deepFreeze({
    "inch-fraction": {
      id: "inch-fraction",
      label: "Inches · fractions",
      shortLabel: "in fractions",
      inputMode: "text",
    },
    millimeter: {
      id: "millimeter",
      label: "Metric · millimeters",
      shortLabel: "mm",
      inputMode: "decimal",
    },
    "inch-decimal": {
      id: "inch-decimal",
      label: "Decimal inches",
      shortLabel: "decimal in",
      inputMode: "decimal",
    },
    layout: {
      id: "layout",
      label: "Layout setups",
      shortLabel: "layout",
      inputMode: "mixed",
    },
    angles: {
      id: "angles",
      label: "Angles & rise / run",
      shortLabel: "angles",
      inputMode: "mixed",
    },
    degrees: {
      id: "degrees",
      label: "Degrees",
      shortLabel: "°",
      inputMode: "decimal",
      answerOnly: true,
    },
    ratio: {
      id: "ratio",
      label: "Rise : run",
      shortLabel: "rise:run",
      inputMode: "text",
      answerOnly: true,
    },
    choice: {
      id: "choice",
      label: "Choice",
      shortLabel: "choice",
      inputMode: "choice",
      answerOnly: true,
    },
  });

  const TOOLS = deepFreeze({
    tape: {
      id: "tape",
      label: "Tape / Ruler",
      shortLabel: "Tape",
      summary: "Read inch fractions through sixteenths or metric millimeters.",
      unitIds: ["inch-fraction", "millimeter"],
      assumptions: [
        "Imperial marks resolve to 1/16 inch.",
        "Metric marks resolve to 1 millimeter.",
      ],
    },
    caliper: {
      id: "caliper",
      label: "Dial Caliper",
      shortLabel: "Caliper",
      summary: "Combine the beam tenths and dial thousandths for one reading.",
      unitIds: ["inch-decimal"],
      assumptions: [
        "The modeled caliper has a documented 0–6 inch range.",
        "The beam supplies 0.1 inch and the dial supplies 0.001 inch, for 0.001 inch resolution.",
      ],
    },
    framing: {
      id: "framing",
      label: "Framing Square",
      shortLabel: "Framing square",
      summary: "Practice perpendicular lines, corner checks, and simple notch layouts.",
      unitIds: ["layout"],
      assumptions: ["Setups model a straight stock edge and a square with undamaged working edges."],
    },
    speed: {
      id: "speed",
      label: "Speed Square",
      shortLabel: "Speed square",
      summary: "Practice square, 45°, pivot-angle, and rise/run setups.",
      unitIds: ["angles"],
      assumptions: [
        "Degree setting means rotation away from a square (90°) line.",
        "Line angle is measured from the reference edge, so line angle = 90° − degree setting.",
        "Rise/run setting uses atan(rise ÷ run); it is distinct from the marked line angle.",
      ],
    },
  });

  const TOOL_LIST = Object.freeze(Object.values(TOOLS));

  function assertTool(tool) {
    const id = String(tool || "").toLowerCase();
    if (!TOOLS[id]) throw new RangeError(`Unknown Measure Up tool: ${String(tool)}.`);
    return id;
  }

  function assertDifficulty(difficulty) {
    const value = String(difficulty || "apprentice").toLowerCase();
    if (!DIFFICULTIES.includes(value)) {
      throw new RangeError(`Unknown Measure Up difficulty: ${String(difficulty)}.`);
    }
    return value;
  }

  function getUnitsForTool(tool) {
    const metadata = TOOLS[assertTool(tool)];
    return Object.freeze(metadata.unitIds.map((id) => UNIT_OPTIONS[id]));
  }

  function gcd(left, right) {
    let a = Math.abs(Math.trunc(left));
    let b = Math.abs(Math.trunc(right));
    while (b) [a, b] = [b, a % b];
    return a || 1;
  }

  function reduceFraction(numerator, denominator) {
    const n = Math.trunc(Number(numerator));
    const d = Math.trunc(Number(denominator));
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    const sign = d < 0 ? -1 : 1;
    const divisor = gcd(n, d);
    return Object.freeze({ numerator: (n / divisor) * sign, denominator: Math.abs(d / divisor) });
  }

  const UNICODE_FRACTIONS = Object.freeze({
    "½": "1/2",
    "⅓": "1/3",
    "⅔": "2/3",
    "¼": "1/4",
    "¾": "3/4",
    "⅕": "1/5",
    "⅖": "2/5",
    "⅗": "3/5",
    "⅘": "4/5",
    "⅙": "1/6",
    "⅚": "5/6",
    "⅛": "1/8",
    "⅜": "3/8",
    "⅝": "5/8",
    "⅞": "7/8",
  });

  function normalizeImperialText(raw) {
    let text = String(raw == null ? "" : raw)
      .trim()
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/\b(?:inches|inch|in)\b\.?/g, "")
      .replace(/["′]/g, "")
      .trim();
    Object.entries(UNICODE_FRACTIONS).forEach(([glyph, fraction]) => {
      text = text.replaceAll(glyph, ` ${fraction}`);
    });
    return text.replace(/(\d)\s*-\s*(\d+\s*\/\s*\d+)/g, "$1 $2").replace(/\s+/g, " ").trim();
  }

  function parseInchFraction(raw) {
    if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
    const text = normalizeImperialText(raw);
    if (!text) return null;

    if (/^\d+(?:\.\d+)?$/.test(text)) {
      const decimal = Number(text);
      return Number.isFinite(decimal) && decimal >= 0 ? decimal : null;
    }

    const match = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
    if (!match) return null;
    const whole = Number(match[1] || 0);
    const numerator = Number(match[2]);
    const denominator = Number(match[3]);
    if (!denominator) return null;
    return whole + numerator / denominator;
  }

  function formatInchFraction(inches, denominator = 16) {
    const value = Number(inches);
    const resolution = Math.max(1, Math.trunc(Number(denominator) || 16));
    if (!Number.isFinite(value)) return "—";
    const sign = value < 0 ? "−" : "";
    const totalUnits = Math.round(Math.abs(value) * resolution);
    const whole = Math.floor(totalUnits / resolution);
    const numerator = totalUnits % resolution;
    if (!numerator) return `${sign}${whole} in`;
    const reduced = reduceFraction(numerator, resolution);
    return `${sign}${whole ? `${whole} ` : ""}${reduced.numerator}/${reduced.denominator} in`;
  }

  function parseMillimeters(raw) {
    if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
    const text = String(raw == null ? "" : raw).trim().toLowerCase().replace(/,/g, "");
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(mm|millimeters?|cm|centimeters?)?$/);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    return /^c/.test(match[2] || "") ? amount * 10 : amount;
  }

  function parseDecimalInches(raw) {
    if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
    const text = normalizeImperialText(raw);
    if (!text) return null;
    const value = Number(text);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function parseDegrees(raw) {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const text = String(raw == null ? "" : raw)
      .trim()
      .toLowerCase()
      .replace(/degrees?|deg\.?|°/g, "")
      .trim();
    if (!text) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  function parseRatio(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const rise = Number(raw.rise);
      const run = Number(raw.run);
      return Number.isFinite(rise) && Number.isFinite(run) && run > 0
        ? Object.freeze({ rise, run, slope: rise / run })
        : null;
    }
    const text = String(raw == null ? "" : raw).trim().toLowerCase();
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(?::|\/|in\s+)\s*(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const rise = Number(match[1]);
    const run = Number(match[2]);
    return run > 0 ? Object.freeze({ rise, run, slope: rise / run }) : null;
  }

  function trimNumber(value, digits = 1) {
    const fixed = Number(value).toFixed(digits);
    return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  }

  function formatMeasurement(value, unit, options = {}) {
    if (unit === "inch-fraction") return formatInchFraction(value, options.denominator || 16);
    if (unit === "millimeter") return `${trimNumber(value, options.digits ?? 0)} mm`;
    if (unit === "inch-decimal") return `${Number(value).toFixed(options.digits ?? 3)} in`;
    if (unit === "degrees") return `${trimNumber(value, options.digits ?? 1)}°`;
    if (unit === "ratio") {
      const ratio = value && typeof value === "object" ? value : { rise: value, run: 12 };
      return `${trimNumber(ratio.rise, 2)}:${trimNumber(ratio.run, 2)}`;
    }
    return String(value);
  }

  function caliperComponents(valueInches) {
    const thousandths = Math.round(Number(valueInches) * 1000);
    if (!Number.isFinite(thousandths) || thousandths < 0 || thousandths > 6000) {
      throw new RangeError("The modeled dial caliper range is 0.000–6.000 inches.");
    }
    const beamTenths = Math.floor(thousandths / 100);
    const dialThousandths = thousandths - beamTenths * 100;
    return deepFreeze({
      beamTenths,
      beamInches: beamTenths / 10,
      dialThousandths,
      dialInches: dialThousandths / 1000,
      reading: thousandths / 1000,
      rangeInches: 6,
      resolutionInches: 0.001,
    });
  }

  function combineCaliperReading(beamTenths, dialThousandths) {
    const beam = Math.trunc(Number(beamTenths));
    const dial = Math.trunc(Number(dialThousandths));
    if (!Number.isFinite(beam) || !Number.isFinite(dial) || beam < 0 || dial < 0 || dial > 99) {
      throw new RangeError("Caliper beam tenths must be nonnegative and dial thousandths must be 0–99.");
    }
    return caliperComponents((beam * 100 + dial) / 1000).reading;
  }

  function speedSquareSetup(task, values = {}) {
    let degreeSetting;
    let lineAngle;
    let rise = null;
    let run = null;
    if (task === "square-line") {
      degreeSetting = 0;
      lineAngle = 90;
    } else if (task === "forty-five") {
      degreeSetting = 45;
      lineAngle = 45;
    } else if (task === "pivot-angle") {
      degreeSetting = Number(values.degreeSetting);
      if (!Number.isFinite(degreeSetting) || degreeSetting < 0 || degreeSetting > 90) {
        throw new RangeError("Pivot degree setting must be between 0 and 90 degrees.");
      }
      lineAngle = 90 - degreeSetting;
    } else if (task === "rise-run") {
      rise = Number(values.rise);
      run = Number(values.run || 12);
      if (!Number.isFinite(rise) || !Number.isFinite(run) || rise < 0 || run <= 0) {
        throw new RangeError("Rise/run requires a nonnegative rise and positive run.");
      }
      degreeSetting = Math.atan(rise / run) * 180 / Math.PI;
      lineAngle = 90 - degreeSetting;
    } else {
      throw new RangeError(`Unknown speed-square task: ${String(task)}.`);
    }
    return deepFreeze({ task, degreeSetting, lineAngle, rise, run });
  }

  const PREPARED_VALUES = deepFreeze({
    tape: {
      apprentice: [
        ["inch-fraction", 1.5], ["millimeter", 25], ["inch-fraction", 2.25], ["millimeter", 42],
        ["inch-fraction", 3.75], ["millimeter", 68], ["inch-fraction", 5.125], ["millimeter", 93],
      ],
      journey: [
        ["inch-fraction", 2.375], ["millimeter", 137], ["inch-fraction", 4.6875], ["millimeter", 246],
        ["inch-fraction", 7.3125], ["millimeter", 319], ["inch-fraction", 9.5625], ["millimeter", 384],
      ],
      master: [
        ["inch-fraction", 11.9375], ["millimeter", 487], ["inch-fraction", 18.4375], ["millimeter", 763],
        ["inch-fraction", 23.8125], ["millimeter", 914], ["inch-fraction", 31.0625], ["millimeter", 1197],
      ],
    },
    caliper: {
      apprentice: [0.125, 0.48, 1.234, 1.507, 2.05, 2.675, 3.1, 3.842],
      journey: [0.099, 1.019, 2.347, 3.682, 4.005, 4.919, 5.204, 5.555],
      master: [0.001, 0.999, 2.999, 4.099, 5.009, 5.9, 5.999, 6],
    },
    framing: {
      apprentice: [
        ["perpendicular"], ["corner-check", true], ["notch", 1, 2.5, "inch-fraction"],
        ["corner-check", false], ["notch", 25, 60, "millimeter"], ["perpendicular"],
      ],
      journey: [
        ["notch", 1.375, 3.125, "inch-fraction"], ["corner-check", false], ["perpendicular"],
        ["notch", 72, 119, "millimeter"], ["corner-check", true], ["notch", 4.0625, 5.6875, "inch-fraction"],
      ],
      master: [
        ["notch", 2.9375, 6.8125, "inch-fraction"], ["corner-check", true], ["notch", 113, 287, "millimeter"],
        ["perpendicular"], ["corner-check", false], ["notch", 8.1875, 11.9375, "inch-fraction"],
      ],
    },
    speed: {
      apprentice: [
        ["square-line", "line"], ["forty-five", "line"], ["pivot-angle", "line", 15],
        ["pivot-angle", "setting", 30], ["rise-run", "setting", 6, 12], ["rise-run", "line", 3, 12],
      ],
      journey: [
        ["pivot-angle", "line", 22.5], ["pivot-angle", "setting", 37], ["rise-run", "setting", 4, 12],
        ["rise-run", "line", 8, 12], ["forty-five", "setting"], ["square-line", "setting"],
      ],
      master: [
        ["rise-run", "setting", 7, 12], ["rise-run", "line", 11, 12], ["pivot-angle", "line", 12.5],
        ["pivot-angle", "setting", 63.5], ["rise-run", "ratio", 5, 12], ["rise-run", "line", 2.5, 12],
      ],
    },
  });

  function commonQuestion(id, tool, difficulty, kind, title, prompt, track, unit, value, setup, answer, hint, range = null) {
    const interaction = answer.type === "choice" ? "choice" : answer.type === "ratio" ? "ratio" : "read";
    return deepFreeze({
      id,
      sourceId: id,
      tool,
      difficulty,
      kind,
      title,
      prompt,
      track,
      unit,
      value,
      setup,
      answer,
      hint,
      interaction,
      range,
    });
  }

  function makeTapeQuestion(difficulty, index, spec) {
    const [unit, value] = spec;
    const imperial = unit === "inch-fraction";
    const sixteenths = imperial ? Math.round(value * 16) : null;
    const millimeters = imperial ? null : value;
    const max = imperial ? Math.max(1, Math.ceil(value)) * 16 : Math.max(10, Math.ceil(value / 10) * 10);
    return commonQuestion(
      `tape-${difficulty}-${index + 1}`,
      "tape",
      difficulty,
      imperial ? "tape-imperial" : "tape-metric",
      imperial ? "Read the inch mark" : "Read the millimeter mark",
      imperial ? "Enter the indicated tape/ruler reading as inches and a fraction." : "Enter the indicated tape/ruler reading in millimeters.",
      unit,
      unit,
      value,
      { scale: imperial ? "imperial" : "metric", sixteenths, millimeters, max },
      { type: "measurement", unit, value, tolerance: imperial ? 1 / 32_000 : 0.001 },
      imperial ? "Count whole inches, then reduce the sixteenth-inch ticks." : "Each small metric division represents 1 mm.",
      imperial ? { min: 0, max: max / 16, step: 1 / 16 } : { min: 0, max, step: 1 },
    );
  }

  function makeCaliperQuestion(difficulty, index, value) {
    const setup = caliperComponents(value);
    return commonQuestion(
      `caliper-${difficulty}-${index + 1}`,
      "caliper",
      difficulty,
      "dial-caliper",
      "Combine beam and dial",
      "Enter the dial-caliper reading in decimal inches.",
      "inch-decimal",
      "inch-decimal",
      setup.reading,
      setup,
      { type: "measurement", unit: "inch-decimal", value: setup.reading, tolerance: 0.0005 },
      `Beam ${setup.beamInches.toFixed(1)} in + dial ${setup.dialThousandths} thousandths.`,
      { min: 0, max: 6, step: 0.001 },
    );
  }

  function makeFramingQuestion(difficulty, index, spec) {
    const [task] = spec;
    const id = `framing-${difficulty}-${index + 1}`;
    if (task === "perpendicular") {
      return commonQuestion(
        id, "framing", difficulty, "framing-perpendicular", "Mark a perpendicular line",
        "The square is seated against a straight reference edge. What line angle is marked from that edge?",
        "layout", "degrees", 90,
        { task: "perpendicular", offset: 0, square: true, lineAngle: 90 },
        { type: "measurement", unit: "degrees", value: 90, tolerance: 0.1 },
        "A properly seated framing square makes a 90° line.",
        { min: 0, max: 90, step: 1 },
      );
    }
    if (task === "corner-check") {
      const square = Boolean(spec[1]);
      const expected = square ? "square" : "out-of-square";
      return commonQuestion(
        id, "framing", difficulty, "framing-corner", "Check a corner",
        square
          ? "Both legs touch the inside corner with no gap. How should the corner be classified?"
          : "One leg touches but the other shows a gap. How should the corner be classified?",
        "layout", "choice", expected,
        { task: "corner-check", offset: square ? 0 : 0.125, square },
        {
          type: "choice",
          unit: "choice",
          value: expected,
          accepted: square ? ["square", "in-square", "90", "90-degrees"] : ["out-of-square", "not-square", "unsquare"],
          choices: ["square", "out-of-square"],
        },
        "No gap means square; any consistent gap means the corner is out of square.",
      );
    }
    const start = Number(spec[1]);
    const end = Number(spec[2]);
    const unit = spec[3];
    const width = end - start;
    return commonQuestion(
      id, "framing", difficulty, "framing-notch", "Lay out a notch",
      `A notch is marked from ${formatMeasurement(start, unit)} to ${formatMeasurement(end, unit)}. What is its width?`,
      "layout", unit, width,
      { task: "notch", offset: start, square: true, start, end, width, unit },
      { type: "measurement", unit, value: width, tolerance: unit === "millimeter" ? 0.001 : 1 / 32_000 },
      "Subtract the first square line from the second square line.",
      unit === "millimeter"
        ? { min: 0, max: Math.max(100, Math.ceil(width / 10) * 10), step: 1 }
        : { min: 0, max: Math.max(6, Math.ceil(width)), step: 1 / 16 },
    );
  }

  function makeSpeedQuestion(difficulty, index, spec) {
    const [task, ask] = spec;
    const values = task === "pivot-angle"
      ? { degreeSetting: spec[2] }
      : task === "rise-run" ? { rise: spec[2], run: spec[3] } : {};
    const setup = speedSquareSetup(task, values);
    let value;
    let unit;
    let prompt;
    let answer;
    if (ask === "ratio") {
      value = { rise: setup.rise, run: setup.run };
      unit = "ratio";
      prompt = "Enter the rise:run ratio shown by this roof-pitch setup.";
      answer = { type: "ratio", unit, value, tolerance: 0.0001 };
    } else {
      const asksSetting = ask === "setting";
      value = asksSetting ? setup.degreeSetting : setup.lineAngle;
      unit = "degrees";
      prompt = asksSetting
        ? "Enter the degree setting (rotation away from a square line)."
        : "Enter the angle of the marked line measured from the reference edge.";
      answer = { type: "measurement", unit, value, tolerance: 0.11 };
    }
    const taskTitles = {
      "square-line": "Square line setup",
      "forty-five": "45° line setup",
      "pivot-angle": "Pivot-degree setup",
      "rise-run": "Rise / run setup",
    };
    return commonQuestion(
      `speed-${difficulty}-${index + 1}`,
      "speed",
      difficulty,
      `speed-${task}`,
      taskTitles[task],
      prompt,
      "angles",
      unit,
      value,
      setup,
      answer,
      "Keep the quantities separate: setting is rotation away from square; the marked line angle is 90° minus that setting.",
      unit === "degrees" ? { min: 0, max: 90, step: 0.1 } : null,
    );
  }

  function materializeBaseDeck(tool, difficulty) {
    const specs = PREPARED_VALUES[tool][difficulty];
    return specs.map((spec, index) => {
      if (tool === "tape") return makeTapeQuestion(difficulty, index, spec);
      if (tool === "caliper") return makeCaliperQuestion(difficulty, index, spec);
      if (tool === "framing") return makeFramingQuestion(difficulty, index, spec);
      return makeSpeedQuestion(difficulty, index, spec);
    });
  }

  function seedNumber(seed) {
    if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
    const text = String(seed == null ? "" : seed);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = seedNumber(seed) || 0x9e3779b9;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(items, random) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function cloneQuestion(question, instance) {
    if (instance === 1) return question;
    return deepFreeze({ ...question, id: `${question.sourceId}-r${instance}` });
  }

  function createQuestionDeck(options = {}) {
    const tool = assertTool(options.tool || "tape");
    const difficulty = assertDifficulty(options.difficulty);
    const selectedUnit = options.unit || TOOLS[tool].unitIds[0];
    if (!TOOLS[tool].unitIds.includes(selectedUnit)) {
      throw new RangeError(`${selectedUnit} is not an available track for ${tool}.`);
    }
    const base = materializeBaseDeck(tool, difficulty).filter((question) => question.track === selectedUnit);
    const numericCount = Number(options.count);
    const requestedCount = options.count == null
      ? base.length
      : Number.isFinite(numericCount) ? Math.max(0, Math.trunc(numericCount)) : 0;
    if (!base.length || requestedCount === 0) return Object.freeze([]);

    const hasSeed = options.seed !== undefined && options.seed !== null;
    const random = seededRandom(options.seed);
    const deck = [];
    let round = 0;
    while (deck.length < requestedCount) {
      const ordered = hasSeed ? shuffled(base, random) : base;
      round += 1;
      for (const question of ordered) {
        if (deck.length >= requestedCount) break;
        deck.push(cloneQuestion(question, round));
      }
    }
    return Object.freeze(deck);
  }

  function createPracticeQuestion(options = {}) {
    const deck = createQuestionDeck({ ...options, count: undefined });
    if (!deck.length) throw new RangeError("No prepared questions match this setup.");
    const index = Math.trunc(Number(options.index) || 0);
    const question = deck[((index % deck.length) + deck.length) % deck.length];
    const requestedInteraction = options.interaction;
    const canPosition = question.answer.type === "measurement" && question.range;
    const interaction = requestedInteraction === "position" && canPosition
      ? "position"
      : requestedInteraction === "read" ? "read"
        : canPosition && Math.abs(index) % 2 === 1 ? "position" : question.interaction;
    if (interaction === question.interaction) return question;
    return deepFreeze({ ...question, id: `${question.id}-position`, interaction });
  }

  function normalizeChoice(raw) {
    return String(raw == null ? "" : raw)
      .trim()
      .toLowerCase()
      .replace(/°/g, "-degrees")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function formatExpected(question) {
    const answer = question && question.answer;
    if (!answer) return "—";
    if (answer.type === "choice") return String(answer.value).replaceAll("-", " ");
    return formatMeasurement(answer.value, answer.unit);
  }

  function evaluateAnswer(question, raw) {
    if (!question || !question.answer) {
      throw new TypeError("A Measure Up question with an answer specification is required.");
    }
    const answer = question.answer;
    let parsed = null;
    let correct = false;

    if (answer.type === "choice") {
      parsed = normalizeChoice(raw);
      const accepted = (answer.accepted || [answer.value]).map(normalizeChoice);
      correct = parsed !== "" && accepted.includes(parsed);
    } else if (answer.type === "ratio") {
      parsed = parseRatio(raw);
      const expectedSlope = answer.value.rise / answer.value.run;
      correct = Boolean(parsed) && Math.abs(parsed.slope - expectedSlope) <= (answer.tolerance || 0.0001);
    } else {
      if (answer.unit === "inch-fraction") parsed = parseInchFraction(raw);
      else if (answer.unit === "millimeter") parsed = parseMillimeters(raw);
      else if (answer.unit === "inch-decimal") parsed = parseDecimalInches(raw);
      else if (answer.unit === "degrees") parsed = parseDegrees(raw);
      const tolerance = Number(answer.tolerance) || 0;
      correct = parsed !== null && Math.abs(parsed - Number(answer.value)) <= tolerance;
    }

    return deepFreeze({
      correct,
      parsed,
      expected: answer.value,
      expectedText: formatExpected(question),
      message: correct ? "Correct." : `Not yet. Expected ${formatExpected(question)}.`,
    });
  }

  class ChallengeSession {
    constructor(options = {}) {
      if (Array.isArray(options)) options = { questions: options };
      const questions = options.questions;
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new TypeError("ChallengeSession requires a nonempty questions array.");
      }
      this._questions = Object.freeze(questions.slice());
      const requestedDuration = Number(options.durationMs);
      this._durationMs = Number.isFinite(requestedDuration) && requestedDuration > 0
        ? requestedDuration
        : DEFAULT_CHALLENGE_MS;
      this._clock = typeof options.now === "function"
        ? options.now
        : typeof options.clock === "function"
          ? options.clock
        : options.clock && typeof options.clock.now === "function"
          ? () => options.clock.now()
          : () => Date.now();
      this._status = "ready";
      this._startedAt = null;
      this._endedAt = null;
      this._index = 0;
      this._attempted = 0;
      this._firstAttemptCorrect = 0;
      this._streak = 0;
      this._bestStreak = 0;
      this._missed = [];
      this._results = null;
    }

    start() {
      if (this._status === "ready") {
        this._startedAt = Number(this._clock());
        this._status = "running";
      }
      return this.getState();
    }

    _now() {
      return Number(this._clock());
    }

    _expireIfNeeded() {
      if (this._status === "running" && this._now() - this._startedAt >= this._durationMs) {
        this._finish("expired", this._startedAt + this._durationMs);
      }
    }

    _finish(reason, endedAt = this._now()) {
      if (this._results) return this._results;
      this._status = reason;
      this._endedAt = endedAt;
      const elapsedMs = this._startedAt == null
        ? 0
        : Math.min(this._durationMs, Math.max(0, this._endedAt - this._startedAt));
      const accuracy = this._attempted ? (this._firstAttemptCorrect / this._attempted) * 100 : 0;
      this._results = deepFreeze({
        status: reason,
        reason,
        correct: this._firstAttemptCorrect,
        firstAttemptCorrect: this._firstAttemptCorrect,
        attempted: this._attempted,
        accuracy,
        bestStreak: this._bestStreak,
        elapsedMs,
        durationMs: this._durationMs,
        missedReview: this._missed.slice(),
      });
      return this._results;
    }

    submit(raw) {
      if (this._status === "ready") this.start();
      this._expireIfNeeded();
      if (this._status !== "running") {
        return deepFreeze({ accepted: false, expired: this._status === "expired", results: this._results });
      }

      const question = this._questions[this._index];
      const evaluation = evaluateAnswer(question, raw);
      this._attempted += 1;
      if (evaluation.correct) {
        this._firstAttemptCorrect += 1;
        this._streak += 1;
        this._bestStreak = Math.max(this._bestStreak, this._streak);
      } else {
        this._streak = 0;
        this._missed.push(deepFreeze({
          id: question.id,
          tool: question.tool,
          kind: question.kind,
          prompt: question.prompt,
          submitted: String(raw == null ? "" : raw),
          expected: evaluation.expectedText,
          question,
        }));
      }
      this._index += 1;
      if (this._index >= this._questions.length) this._finish("completed");
      return deepFreeze({
        accepted: true,
        question,
        evaluation,
        state: this.getState(),
        results: this._results,
      });
    }

    currentQuestion() {
      this._expireIfNeeded();
      return this._status === "running" ? this._questions[this._index] || null : null;
    }

    getCurrentQuestion() {
      return this.currentQuestion();
    }

    getState() {
      this._expireIfNeeded();
      const elapsedMs = this._startedAt == null ? 0 : Math.max(0, this._now() - this._startedAt);
      const remainingMs = this._status === "ready"
        ? this._durationMs
        : this._status === "running" ? Math.max(0, this._durationMs - elapsedMs) : 0;
      return deepFreeze({
        status: this._status,
        running: this._status === "running",
        questionIndex: this._index,
        questionNumber: Math.min(this._index + 1, this._questions.length),
        totalQuestions: this._questions.length,
        currentQuestion: this._status === "running" ? this._questions[this._index] || null : null,
        correct: this._firstAttemptCorrect,
        firstAttemptCorrect: this._firstAttemptCorrect,
        attempted: this._attempted,
        accuracy: this._attempted ? (this._firstAttemptCorrect / this._attempted) * 100 : 0,
        streak: this._streak,
        currentStreak: this._streak,
        bestStreak: this._bestStreak,
        elapsedMs: Math.min(this._durationMs, elapsedMs),
        durationMs: this._durationMs,
        remainingMs,
        remainingSeconds: Math.ceil(remainingMs / 1000),
        results: this._results,
      });
    }

    finish(reason = "finished") {
      return this._finish(reason);
    }

    getResults() {
      this._expireIfNeeded();
      return this._results;
    }
  }

  return deepFreeze({
    DEFAULT_CHALLENGE_MS,
    DIFFICULTIES,
    TOOLS,
    TOOL_LIST,
    UNIT_OPTIONS,
    getUnitsForTool,
    reduceFraction,
    parseInchFraction,
    formatInchFraction,
    parseMillimeters,
    parseDecimalInches,
    parseDegrees,
    parseRatio,
    formatMeasurement,
    caliperComponents,
    combineCaliperReading,
    speedSquareSetup,
    createQuestionDeck,
    createPracticeQuestion,
    evaluateAnswer,
    formatExpected,
    ChallengeSession,
  });
});
