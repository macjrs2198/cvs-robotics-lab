(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MeasureUpApp = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STORAGE_KEY = "cvs-measure-up-records-v1";
  const DURATION_SECONDS = 60;
  const TOOL_FALLBACK = {
    tape: { label: "Tape Measure / Ruler", summary: "Read inch fractions or metric millimeters on a shop ruler." },
    caliper: { label: "Dial Caliper", summary: "Combine the exposed beam tenth and dial thousandths." },
    framing: { label: "Framing Square", summary: "Check corners and lay out perpendicular lines and simple notches." },
    speed: { label: "Speed Square", summary: "Use the fence, pivot, degree scale, and 45-degree edge correctly." },
  };
  const UNIT_FALLBACK = {
    tape: [{ id: "inch", label: "Inches · 1/16" }, { id: "metric", label: "Metric · mm" }],
    caliper: [{ id: "inch", label: "Inches · 0.001" }],
    framing: [{ id: "inch", label: "Inches" }, { id: "metric", label: "Metric · mm" }],
    speed: [{ id: "degree", label: "Degrees / rise-run" }],
  };
  const JOBS = {
    tape: {
      title: "Robot cart cross-brace",
      description: "Measure stock, locate a fastener center, and confirm the cut length before the brace goes to the saw.",
      complete: "The cross-brace is measured and ready for a safe cut and drilling layout.",
      steps: ["Verify the stock reading", "Locate the fastener center", "Confirm the final cut mark"],
    },
    caliper: {
      title: "Drive-shaft inspection",
      description: "Read three dial-caliper setups to verify a robot drive shaft and spacer before assembly.",
      complete: "The shaft and spacer inspection record is complete.",
      steps: ["Read the shaft diameter", "Read the spacer thickness", "Confirm the finished dimension"],
    },
    framing: {
      title: "Weld-table bracket layout",
      description: "Establish a reference edge, check the stock corner, and finish a simple notch layout for a support bracket.",
      complete: "The bracket is square, marked, and ready for fabrication.",
      steps: ["Establish a square line", "Check the corner", "Lay out the notch"],
    },
    speed: {
      title: "Gusset plate layout",
      description: "Use the square fence and pivot to mark the edges of a small gusset for a shop cart.",
      complete: "The gusset plate has its square, 45-degree, and pivot-angle layout marks.",
      steps: ["Mark the square end", "Mark the 45-degree cut", "Set the pivot angle"],
    },
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  function recordKey(tool, unit, difficulty, duration = DURATION_SECONDS) {
    return [tool, unit, difficulty, Number(duration)].join("|");
  }

  function readRecords(storage) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
      return parsed && parsed.version === 1 && parsed.records && typeof parsed.records === "object" ? parsed : { version: 1, records: {} };
    } catch (_) { return { version: 1, records: {} }; }
  }

  function resolveStorage(host, suppliedStorage) {
    if (suppliedStorage && typeof suppliedStorage.getItem === "function" && typeof suppliedStorage.setItem === "function") return suppliedStorage;
    try {
      const candidate = host && host.localStorage;
      if (candidate && typeof candidate.getItem === "function" && typeof candidate.setItem === "function") return candidate;
    } catch (_) { /* privacy settings may block even reading localStorage */ }
    return {
      getItem: () => null,
      setItem: () => { throw new Error("Browser-local storage is unavailable."); },
    };
  }

  function isBetterRecord(next, previous) {
    if (!previous) return true;
    if (next.correct !== previous.correct) return next.correct > previous.correct;
    if (next.accuracy !== previous.accuracy) return next.accuracy > previous.accuracy;
    return next.bestStreak > previous.bestStreak;
  }

  function saveRecord(storage, result) {
    const database = readRecords(storage);
    const key = recordKey(result.tool, result.unit, result.difficulty, result.durationSeconds);
    const candidate = {
      correct: Number(result.correct) || 0,
      attempted: Number(result.attempted) || 0,
      accuracy: Number(result.accuracy) || 0,
      bestStreak: Number(result.bestStreak) || 0,
      completedAt: result.completedAt,
    };
    const previous = database.records[key];
    const improved = isBetterRecord(candidate, previous);
    let persisted = true;
    if (improved) {
      database.records[key] = candidate;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(database)); }
      catch (_) {
        persisted = false;
        if (previous) database.records[key] = previous;
        else delete database.records[key];
      }
    }
    return {
      improved: improved && persisted,
      persisted,
      storageFailed: improved && !persisted,
      record: database.records[key] || previous || candidate,
      key,
    };
  }

  function formatClock(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000) || 0);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function keyboardIndex(key, current, length) {
    if (!Number.isInteger(length) || length < 1) return current;
    if (key === "Home") return 0;
    if (key === "End") return length - 1;
    if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % length;
    if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + length) % length;
    return current;
  }

  function focusFirstAnswer(container) {
    if (!container || typeof container.querySelector !== "function") return false;
    const control = container.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (!control || typeof control.focus !== "function") return false;
    control.focus();
    return true;
  }

  function normalizeVerdict(verdict, model, question) {
    const correct = verdict === true || !!(verdict && verdict.correct);
    const expected = verdict && verdict.expectedText != null
      ? verdict.expectedText
      : verdict && verdict.expected != null
        ? verdict.expected
        : (model && model.formatExpected ? model.formatExpected(question) : question.answer && question.answer.value);
    return { correct, expected: String(expected == null ? "" : expected), message: verdict && verdict.message ? String(verdict.message) : "" };
  }

  class ChallengeRuntime {
    constructor({ questions, evaluate, formatExpected, now = Date.now, durationMs = 60000, metadata = {} }) {
      if (!Array.isArray(questions) || !questions.length) throw new Error("Challenge requires prepared questions.");
      this.questions = questions.slice();
      this.evaluate = evaluate;
      this.formatExpected = formatExpected;
      this.now = now;
      this.durationMs = durationMs;
      this.metadata = { ...metadata };
      this.startedAt = null;
      this.finished = null;
      this.index = 0;
      this.correct = 0;
      this.attempted = 0;
      this.currentStreak = 0;
      this.bestStreak = 0;
      this.missed = [];
    }
    start() { if (this.startedAt == null) this.startedAt = this.now(); return this.getState(); }
    remainingMs() { return this.startedAt == null ? this.durationMs : Math.max(0, this.durationMs - (this.now() - this.startedAt)); }
    currentQuestion() { return this.finished ? null : this.questions[this.index % this.questions.length]; }
    submit(raw) {
      if (this.startedAt == null) this.start();
      if (this.remainingMs() <= 0) return { accepted: false, result: this.finish() };
      const question = this.currentQuestion();
      const verdict = normalizeVerdict(this.evaluate(question, raw), { formatExpected: this.formatExpected }, question);
      this.attempted += 1;
      if (verdict.correct) {
        this.correct += 1;
        this.currentStreak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
      } else {
        this.currentStreak = 0;
        this.missed.push({ prompt: question.prompt, given: String(raw == null ? "" : raw), expected: verdict.expected });
      }
      this.index += 1;
      return { accepted: true, correct: verdict.correct, expected: verdict.expected, state: this.getState() };
    }
    getState() {
      if (!this.finished && this.startedAt != null && this.remainingMs() <= 0) this.finish();
      return {
        status: this.finished ? "finished" : this.startedAt == null ? "ready" : "running",
        remainingMs: this.finished ? 0 : this.remainingMs(),
        correct: this.correct,
        attempted: this.attempted,
        currentStreak: this.currentStreak,
        bestStreak: this.bestStreak,
        index: this.index,
      };
    }
    finish(metadata = {}) {
      if (this.finished) return this.finished;
      const accuracy = this.attempted ? Math.round((this.correct / this.attempted) * 1000) / 10 : 0;
      this.finished = deepFreeze({
        ...this.metadata,
        ...metadata,
        durationSeconds: Math.round(this.durationMs / 1000),
        correct: this.correct,
        attempted: this.attempted,
        accuracy,
        bestStreak: this.bestStreak,
        perfect: this.attempted > 0 && this.correct === this.attempted,
        missedReview: this.missed.map((entry) => ({ ...entry })),
        completedAt: metadata.completedAt || new Date().toISOString(),
      });
      return this.finished;
    }
  }

  function unitOptions(model, tool) {
    const options = model && typeof model.getUnitsForTool === "function" ? model.getUnitsForTool(tool) : UNIT_FALLBACK[tool];
    return (options || UNIT_FALLBACK[tool] || []).map((entry) => typeof entry === "string" ? { id: entry, label: entry } : { id: entry.id || entry.value, label: entry.label || entry.name || entry.id || entry.value });
  }

  function measurementLabel(question) {
    const unit = question.answer && question.answer.unit || question.unit;
    if (unit === "inch" || unit === "inch-fraction" || unit === "inch-decimal") return "in";
    if (unit === "metric" || unit === "millimeter" || unit === "mm") return "mm";
    if (unit === "degree" || unit === "degrees" || unit === "angles") return "degrees";
    return unit || "";
  }

  function questionValue(question) {
    const value = question && question.answer && question.answer.value;
    return Number.isFinite(Number(value)) ? Number(value) : undefined;
  }

  function initialPositionValue(question) {
    const range = question && question.range || {};
    const min = Number(range.min);
    const max = Number(range.max);
    const step = Math.abs(Number(range.step)) || 1;
    const target = Number(questionValue(question));
    if (![min, max, target].every(Number.isFinite) || max <= min) return Number.isFinite(min) ? min : 0;
    const offset = Math.max(step, (max - min) * 0.1);
    const raw = target - offset >= min ? target - offset : target + offset;
    const snapped = min + Math.round((raw - min) / step) * step;
    return Math.max(min, Math.min(max, Number(snapped.toFixed(6))));
  }

  function tapeSvg(question, overlay) {
    const metric = question.unit === "metric" || question.unit === "millimeter" || question.answer && (question.answer.unit === "metric" || question.answer.unit === "millimeter");
    const max = Number(question.setup.max) || (metric ? 160 : 64);
    const raw = metric ? Number(question.setup.millimeters) : Number(question.setup.sixteenths);
    const target = Number.isFinite(raw) ? raw : 0;
    const x0 = 90, width = 780, y = 220;
    const markerValue = overlay && Number.isFinite(Number(overlay.value)) ? (metric ? Number(overlay.value) : Number(overlay.value) * 16) : target;
    // Show a readable local section of a longer tape. The absolute labels and
    // highlighted position still come from the same measurement model. During
    // positioning practice, the visible section follows the student's mark.
    const totalTicks = metric ? 200 : 96;
    const majorEvery = metric ? 10 : 16;
    const totalRange = Math.max(totalTicks, max);
    const desiredStart = Math.floor((markerValue - totalTicks * 0.55) / majorEvery) * majorEvery;
    const maxStart = Math.max(0, totalRange - totalTicks);
    const startTick = Math.max(0, Math.min(maxStart, desiredStart));
    const endTick = startTick + totalTicks;
    let ticks = "";
    for (let i = 0; i <= totalTicks; i += 1) {
      const absoluteTick = startTick + i;
      const x = x0 + (i / totalTicks) * width;
      const major = absoluteTick % majorEvery === 0;
      const medium = metric ? absoluteTick % 5 === 0 : absoluteTick % 8 === 0;
      const height = major ? 74 : medium ? 52 : (metric ? 30 : absoluteTick % 4 === 0 ? 42 : absoluteTick % 2 === 0 ? 32 : 23);
      ticks += `<line x1="${x.toFixed(2)}" y1="${y}" x2="${x.toFixed(2)}" y2="${y - height}" stroke="${major ? "#1b221f" : "#34413c"}" stroke-width="${major ? 3 : 1.4}"/>`;
      if (major) ticks += `<text x="${x.toFixed(2)}" y="${y - 82}" text-anchor="middle" class="svg-label">${metric ? absoluteTick : absoluteTick / 16}</text>`;
    }
    const markerOffset = Math.max(0, Math.min(totalTicks, markerValue - startTick));
    const markerX = x0 + markerOffset / totalTicks * width;
    const markerClass = overlay && overlay.correct ? "correct-mark" : overlay ? "answer-mark" : "target-mark";
    const sectionLabel = metric
      ? `showing ${startTick}–${endTick} mm`
      : `showing ${startTick / 16}–${endTick / 16} in`;
    return `<svg viewBox="0 0 960 340" role="img" aria-label="${metric ? "Metric ruler" : "Inch ruler marked in sixteenths"}" data-range-start="${startTick}" data-range-end="${endTick}" data-marker="${markerValue}">
      <defs><linearGradient id="blade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#ffd95a"/><stop offset="1" stop-color="#dcae29"/></linearGradient></defs>
      <rect x="48" y="102" width="864" height="160" rx="10" fill="#151d1a" opacity=".65"/>
      <rect x="70" y="128" width="820" height="112" rx="4" fill="url(#blade)" stroke="#f5dd81" stroke-width="2"/>
      ${ticks}
      <line x1="${markerX.toFixed(2)}" y1="108" x2="${markerX.toFixed(2)}" y2="250" class="${markerClass}"/>
      <path d="M${markerX - 10},108 L${markerX + 10},108 L${markerX},124 Z" fill="#70e1f5"/>
      <text x="480" y="292" text-anchor="middle" class="tool-note">${metric ? "METRIC TRACK · smallest mark = 1 mm" : "INCH TRACK · smallest mark = 1/16 in"} · ${sectionLabel}</text>
    </svg>`;
  }

  function caliperSvg(question, overlay) {
    const setup = question.setup || {};
    const requestedReading = overlay && Number.isFinite(Number(overlay.value)) ? Number(overlay.value) : Number(setup.reading);
    const reading = Math.max(0, Math.min(6, Number.isFinite(requestedReading) ? requestedReading : 0));
    const totalThousandths = Math.round(reading * 1000);
    const beam = Math.floor(totalThousandths / 100);
    const dial = totalThousandths - beam * 100;
    const beamX = 205, beamWidth = 420;
    const jawX = beamX + reading / 6 * beamWidth;
    const pointer = (dial / 100) * 360 - 90;
    let beamTicks = "";
    for (let i = 0; i <= 60; i += 1) {
      const x = beamX + i / 60 * beamWidth;
      const tickBottom = i % 10 === 0 ? 194 : i % 5 === 0 ? 185 : 176;
      beamTicks += `<line x1="${x.toFixed(2)}" y1="156" x2="${x.toFixed(2)}" y2="${tickBottom}" stroke="#344047" stroke-width="${i % 10 === 0 ? 2.4 : 1.25}"/>`;
      if (i % 10 === 0) beamTicks += `<text x="${x.toFixed(2)}" y="212" text-anchor="middle" class="svg-small">${i / 10}</text>`;
    }
    let dialTicks = "";
    for (let i = 0; i < 100; i += 1) {
      const a = (i / 100) * Math.PI * 2 - Math.PI / 2;
      const inner = i % 10 === 0 ? 52 : i % 5 === 0 ? 57 : 62;
      dialTicks += `<line x1="${(760 + Math.cos(a) * 68).toFixed(1)}" y1="${(150 + Math.sin(a) * 68).toFixed(1)}" x2="${(760 + Math.cos(a) * inner).toFixed(1)}" y2="${(150 + Math.sin(a) * inner).toFixed(1)}" stroke="#18201d" stroke-width="${i % 10 === 0 ? 2.2 : 1}"/>`;
      if (i % 10 === 0) dialTicks += `<text x="${(760 + Math.cos(a) * 42).toFixed(1)}" y="${(154 + Math.sin(a) * 42).toFixed(1)}" text-anchor="middle" class="svg-small">${i}</text>`;
    }
    const rad = pointer * Math.PI / 180;
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Dial caliper with beam and dial" data-reading="${reading.toFixed(3)}" data-beam-tenths="${beam}" data-dial-thousandths="${dial}" data-beam-divisions="60" data-dial-divisions="100">
      <rect x="96" y="145" width="680" height="72" rx="8" fill="#b8c5ca" stroke="#e4ecef" stroke-width="3"/>
      ${beamTicks}
      <path d="M112 90 H205 V145 H170 V280 H112 Z" fill="#c7d2d6" stroke="#eff6f7" stroke-width="3"/>
      <path d="M${jawX} 103 H${jawX + 74} V145 H${jawX + 38} V270 H${jawX} Z" fill="#9aa9ae" stroke="#dce6e9" stroke-width="3"/>
      <line x1="${jawX.toFixed(2)}" y1="145" x2="${jawX.toFixed(2)}" y2="202" stroke="#d52e35" stroke-width="3"/>
      <circle cx="760" cy="150" r="78" fill="#e7eee9" stroke="#7d8c87" stroke-width="7"/>
      ${dialTicks}
      <line x1="760" y1="150" x2="${(760 + Math.cos(rad) * 50).toFixed(1)}" y2="${(150 + Math.sin(rad) * 50).toFixed(1)}" stroke="#d52e35" stroke-width="5" stroke-linecap="round"/>
      <circle cx="760" cy="150" r="8" fill="#26332f"/>
      <text x="760" y="245" text-anchor="middle" class="svg-small">DIAL · 100 × 0.001 in/div</text>
      <text x="450" y="310" text-anchor="middle" class="tool-note">0–6 in beam · 0.1 in divisions + dial thousandths · resolution 0.001 in</text>
    </svg>`;
  }

  function framingSvg(question, overlay) {
    const setup = question.setup || {};
    const offset = Number(setup.offset) || 8;
    const task = setup.task || "perpendicular";
    const cornerBad = setup.square === false || setup.square === "out";
    const entered = overlay && Number(overlay.value);
    const hasEntered = Number.isFinite(entered);
    const lineAngle = task === "perpendicular" && hasEntered ? Math.max(0, Math.min(90, entered)) : 90;
    const rotation = 90 - lineAngle;
    const notchValue = task === "notch" && hasEntered ? entered : Number(setup.width) || 1;
    let lineX = 240 + Math.min(500, Math.max(40, offset * 22));
    let notchX = lineX + 122;
    if (task === "notch") {
      const startValue = Math.max(0, Number(setup.start) || 0);
      const preparedEnd = Math.max(startValue, Number(setup.end) || startValue + notchValue);
      const rangeEnd = startValue + Math.max(notchValue, Number(question.range && question.range.max) || 0);
      const scaleEnd = Math.max(1, preparedEnd, rangeEnd);
      const layoutLeft = 150, layoutWidth = 640;
      lineX = layoutLeft + startValue / scaleEnd * layoutWidth - 25;
      notchX = layoutLeft + (startValue + Math.max(0, notchValue)) / scaleEnd * layoutWidth;
    }
    const reveal = !!(overlay && overlay.reveal);
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Framing square aligned to a lumber reference edge" data-position-value="${hasEntered ? entered : "prepared"}" data-line-angle="${lineAngle}" data-notch-start-x="${lineX + 25}" data-notch-x="${notchX}">
      <defs><pattern id="grain" width="48" height="18" patternUnits="userSpaceOnUse"><path d="M0 9 C12 2,35 16,48 8" fill="none" stroke="#8d552d" stroke-width="1.5" opacity=".5"/></pattern></defs>
      <rect x="74" y="82" width="812" height="184" rx="5" fill="#b9793f" stroke="#e0a267" stroke-width="3"/>
      <rect x="74" y="82" width="812" height="184" rx="5" fill="url(#grain)"/>
      <line x1="74" y1="266" x2="886" y2="266" stroke="#70e1f5" stroke-width="6"/>
      <text x="82" y="299" class="svg-label">REFERENCE EDGE</text>
      <g transform="${cornerBad && task === "corner-check" ? `rotate(3 ${lineX} 266)` : task === "perpendicular" ? `rotate(${rotation} ${lineX + 25} 266)` : ""}">
        <path d="M${lineX - 22} 104 H${lineX + 24} V242 H${lineX + 136} V267 H${lineX - 22} Z" fill="#c5cdd0" stroke="#f3f7f8" stroke-width="3" opacity=".96"/>
        <line x1="${lineX + 25}" y1="104" x2="${lineX + 25}" y2="266" stroke="${reveal ? "#45e07f" : "#ffc857"}" stroke-width="4" stroke-dasharray="${task === "notch" ? "9 6" : "none"}"/>
      </g>
      ${task === "notch" ? `<line x1="${notchX}" y1="104" x2="${notchX}" y2="266" stroke="${reveal ? "#45e07f" : "#ffc857"}" stroke-width="4" stroke-dasharray="9 6"/><text x="${(lineX + notchX) / 2}" y="126" text-anchor="middle" class="svg-small">NOTCH WIDTH</text>` : ""}
      <text x="710" y="54" class="tool-note">${task === "corner-check" ? "CORNER CHECK" : task === "notch" ? "SIMPLE NOTCH LAYOUT" : "PERPENDICULAR LINE"}</text>
    </svg>`;
  }

  function speedSvg(question, reveal, overlayValue) {
    const setup = question.setup || {};
    const task = setup.task || "square-line";
    const entered = Number(overlayValue);
    const asksSetting = /setting/i.test(question.prompt || "");
    const preparedDegree = Number(setup.degreeSetting);
    const preparedLineAngle = Number(setup.lineAngle);
    const degree = Number.isFinite(entered)
      ? (asksSetting ? entered : 90 - entered)
      : Number.isFinite(preparedDegree) ? preparedDegree : task === "forty-five" ? 45 : 0;
    const lineAngle = Number.isFinite(entered)
      ? (asksSetting ? 90 - entered : entered)
      : Number.isFinite(preparedLineAngle) ? preparedLineAngle : task === "square-line" ? 90 : 90 - degree;
    const rad = (180 - lineAngle) * Math.PI / 180;
    const x2 = 215 + Math.cos(rad) * 240, y2 = 258 - Math.sin(rad) * 240;
    const angleText = (value) => `${Number(Number(value).toFixed(1))}°`;
    let guidance;
    if (reveal) {
      guidance = [
        `SQUARE SETTING ${angleText(degree)}`,
        `MARKED LINE ${angleText(lineAngle)} TO REFERENCE`,
        task === "rise-run" ? `RISE / RUN ${setup.rise} : ${setup.run || 12}` : "SETTING + LINE ANGLE = 90°",
      ];
    } else if (task === "forty-five") {
      guidance = ["USE THE HYPOTENUSE EDGE", "IDENTIFY SETTING VS MARKED LINE"];
    } else if (question.answer && question.answer.type === "ratio") {
      guidance = [`SQUARE SETTING ${angleText(degree)}`, "FIND THE RISE : RUN RATIO"];
    } else if (task === "rise-run") {
      guidance = [`SOURCE RISE / RUN ${setup.rise} : ${setup.run || 12}`, asksSetting ? "FIND THE DEGREE SETTING" : "FIND THE MARKED-LINE ANGLE"];
    } else if (asksSetting) {
      guidance = [`MARKED LINE ${angleText(lineAngle)} TO REFERENCE`, "FIND THE SQUARE SETTING"];
    } else {
      guidance = [`SQUARE SETTING ${angleText(degree)}`, "FIND THE MARKED-LINE ANGLE"];
    }
    return `<svg viewBox="0 0 960 340" role="img" aria-label="Speed square on a workpiece with pivot and reference edge identified" data-degree-setting="${degree}" data-line-angle="${lineAngle}">
      <rect x="68" y="76" width="824" height="214" rx="5" fill="#a86737" stroke="#d59a63" stroke-width="3"/>
      <line x1="68" y1="260" x2="892" y2="260" stroke="#70e1f5" stroke-width="6"/>
      <text x="78" y="312" class="svg-label">REFERENCE EDGE / FENCE</text>
      <path d="M190 259 L190 78 L420 259 Z" fill="#c9d1d3" stroke="#f2f6f7" stroke-width="4" opacity=".95"/>
      <path d="M225 238 L225 141 L348 238 Z" fill="#56635f" stroke="#899792" stroke-width="2"/>
      <circle cx="215" cy="258" r="9" fill="#ff8b4d" stroke="#fff" stroke-width="2"/>
      <text x="225" y="282" class="svg-small">PIVOT</text>
      <path d="M250 258 A35 35 0 0 0 ${(215 + Math.cos(rad) * 35).toFixed(1)} ${(258 - Math.sin(rad) * 35).toFixed(1)}" fill="none" stroke="#b9a6ff" stroke-width="3"/>
      <line x1="215" y1="258" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${reveal ? "#45e07f" : "#ffc857"}" stroke-width="5"/>
      <text x="610" y="115" class="svg-label">${guidance[0]}</text>
      <text x="610" y="145" class="svg-small">${guidance[1]}</text>
      ${guidance[2] ? `<text x="610" y="185" class="tool-note">${guidance[2]}</text>` : ""}
    </svg>`;
  }

  function renderInstrument(question, overlay) {
    if (!question) return '<p class="loading">Preparing the workpiece…</p>';
    if (question.tool === "tape") return tapeSvg(question, overlay);
    if (question.tool === "caliper") return caliperSvg(question, overlay);
    if (question.tool === "framing") return framingSvg(question, overlay);
    return speedSvg(question, !!(overlay && overlay.reveal), overlay && overlay.value);
  }

  function initialize(doc, host = root, supplied = {}) {
    const model = supplied.model || host.MeasureModel;
    const certificate = supplied.certificate || host.MeasureUpCertificate || host.CVSMeasureUpCertificate;
    if (!model) throw new Error("Measure Up model did not load.");
    const storage = resolveStorage(host, supplied.storage);
    const byId = (id) => doc.getElementById(id);
    let tool = "tape", unit = "inch", difficulty = "apprentice", mode = "practice";
    let practiceIndex = 0, practiceQuestion = null, practiceOverlay = null;
    let jobIndex = 0, jobQuestions = [];
    let challenge = null, challengeDeck = [], challengeSeed = 1, ticker = null, frozenRun = null;

    function toolMeta(id) {
      const candidate = model.TOOLS && (model.TOOLS[id] || (Array.isArray(model.TOOLS) && model.TOOLS.find((item) => item.id === id)));
      return { ...TOOL_FALLBACK[id], ...(candidate || {}) };
    }
    function setText(id, value) { const target = byId(id); if (target) target.textContent = String(value); }
    function setHidden(id, hidden) { const target = byId(id); if (target) target.hidden = hidden; }

    function currentOptions() { return { tool, unit, difficulty }; }
    function formatExpected(question) { return model.formatExpected ? model.formatExpected(question) : String(question.answer && question.answer.value); }
    function evaluate(question, raw) { return model.evaluateAnswer(question, raw); }

    function makePractice(index = practiceIndex) {
      practiceIndex = index;
      practiceQuestion = model.createPracticeQuestion({ ...currentOptions(), index });
      practiceOverlay = null;
      setText("practice-title", practiceQuestion.title || "Read the setup");
      setText("practice-prompt", practiceQuestion.interaction === "position" ? `Position the instrument at ${formatExpected(practiceQuestion)}.` : practiceQuestion.prompt);
      byId("practice-stage").innerHTML = renderInstrument(practiceQuestion);
      buildAnswerControl(byId("practice-answer"), practiceQuestion, "practice");
      const feedback = byId("practice-feedback");
      feedback.textContent = "Enter a reading or position, then check your work.";
      feedback.dataset.state = "";
    }

    function createTextInput(container, question, prefix) {
      const wrapper = doc.createElement("div");
      wrapper.className = "answer-field";
      const label = doc.createElement("label");
      label.htmlFor = `${prefix}-value`;
      label.textContent = question.interaction === "position" ? "Set the requested position" : "Your answer";
      const input = doc.createElement("input");
      input.id = `${prefix}-value`;
      input.name = "answer";
      input.type = "text";
      input.inputMode = question.answer && question.answer.type === "ratio" ? "text" : "decimal";
      input.autocomplete = "off";
      input.placeholder = question.answer && question.answer.type === "ratio" ? "rise/run, for example 4/12" : question.tool === "tape" && question.unit === "inch" ? "for example 2 3/8" : "Enter a value";
      input.required = true;
      label.append(input);
      wrapper.append(label);
      const unitNode = doc.createElement("span");
      unitNode.className = "answer-unit";
      unitNode.textContent = measurementLabel(question);
      wrapper.append(unitNode);
      container.append(wrapper);
      if (question.tool === "tape" && question.unit === "inch-fraction") {
        const pad = doc.createElement("div");
        pad.className = "fraction-pad";
        pad.setAttribute("aria-label", "Common fraction entry buttons");
        ["1/16", "1/8", "3/16", "1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "3/4", "7/8"].forEach((fraction) => {
          const button = doc.createElement("button");
          button.type = "button";
          button.textContent = fraction;
          button.addEventListener("click", () => {
            const whole = input.value.trim().match(/^\d+$/) ? `${input.value.trim()} ` : "";
            input.value = whole + fraction;
            input.focus();
          });
          pad.append(button);
        });
        container.append(pad);
      }
    }

    function buildAnswerControl(container, question, prefix) {
      container.replaceChildren();
      const spec = question.answer || {};
      if (spec.type === "choice" && Array.isArray(spec.choices || question.choices || spec.accepted)) {
        const choices = spec.choices || question.choices || spec.accepted;
        const fieldset = doc.createElement("fieldset");
        fieldset.className = "answer-field";
        const legend = doc.createElement("legend"); legend.textContent = "Choose an answer"; fieldset.append(legend);
        choices.forEach((choice, index) => {
          const value = typeof choice === "object" ? choice.value : choice;
          const labelText = typeof choice === "object" ? choice.label : choice;
          const label = doc.createElement("label");
          const input = doc.createElement("input"); input.type = "radio"; input.name = "answer"; input.value = value; input.required = true; if (index === 0) input.checked = true;
          label.append(input, doc.createTextNode(` ${labelText}`)); fieldset.append(label);
        });
        container.append(fieldset);
      } else if (question.interaction === "position" && question.range) {
        const wrapper = doc.createElement("label"); wrapper.className = "position-control"; wrapper.textContent = "Move the mark to the requested position";
        const output = doc.createElement("output"); output.htmlFor = `${prefix}-value`;
        const input = doc.createElement("input"); input.type = "range"; input.name = "answer"; input.id = `${prefix}-value`;
        input.min = question.range.min; input.max = question.range.max; input.step = question.range.step;
        input.value = question.range.start != null ? question.range.start : initialPositionValue(question);
        const update = () => { output.value = `${input.value} ${measurementLabel(question)}`; output.textContent = output.value; byId(`${prefix}-stage`).innerHTML = renderInstrument(question, { value: Number(input.value) }); };
        input.addEventListener("input", update); wrapper.append(input, output); container.append(wrapper); update();
      } else createTextInput(container, question, prefix);
    }

    function readAnswer(form) {
      const data = new host.FormData(form);
      return data.get("answer");
    }

    function showPracticeVerdict(raw) {
      const verdict = normalizeVerdict(evaluate(practiceQuestion, raw), model, practiceQuestion);
      const feedback = byId("practice-feedback");
      if (verdict.correct) {
        feedback.dataset.state = "correct";
        feedback.innerHTML = `<strong>Correct.</strong> ${escapeHtml(verdict.message || "The reading and instrument model agree.")}`;
        practiceOverlay = { value: Number(raw), correct: true, reveal: true };
      } else {
        feedback.dataset.state = "incorrect";
        const hints = byId("hints-enabled").checked;
        feedback.innerHTML = `<strong>Not yet.</strong> ${hints ? `${escapeHtml(practiceQuestion.hint || "Compare the smallest divisions and the reference edge.")} Correct answer: <strong>${escapeHtml(verdict.expected)}</strong>.` : "Try again, or turn hints on for a visual explanation."}`;
        practiceOverlay = hints ? { value: questionValue(practiceQuestion), reveal: true } : { value: Number(raw) };
      }
      byId("practice-stage").innerHTML = renderInstrument(practiceQuestion, practiceOverlay);
    }

    function renderUnits() {
      const select = byId("unit-select");
      const options = unitOptions(model, tool);
      if (!options.some((entry) => entry.id === unit)) unit = options[0] ? options[0].id : "inch";
      select.replaceChildren(...options.map((entry) => {
        const option = doc.createElement("option"); option.value = entry.id; option.textContent = entry.label; option.selected = entry.id === unit; return option;
      }));
      select.disabled = options.length < 2;
    }

    function selectMode(next) {
      mode = next;
      for (const name of ["practice", "challenge", "job"]) {
        const button = byId(`tab-${name}`), panel = byId(`panel-${name}`), selected = name === next;
        button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1; panel.hidden = !selected;
      }
      if (next === "practice") makePractice(practiceIndex + 1);
      if (next === "challenge") renderChallengeReady();
      if (next === "job") resetJob();
    }

    function selectTool(button, moveFocus = false) {
      if (!button) return;
      tool = button.dataset.tool;
      for (const item of doc.querySelectorAll("[data-tool]")) {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-checked", String(selected));
        item.tabIndex = selected ? 0 : -1;
      }
      if (moveFocus) button.focus();
      renderUnits();
      onConfigurationChange();
    }

    function recordForCurrent() {
      return readRecords(storage).records[recordKey(tool, unit, difficulty, DURATION_SECONDS)] || null;
    }
    function renderChallengeReady() {
      stopTicker(); challenge = null; frozenRun = null;
      setHidden("challenge-ready", false); setHidden("challenge-running", true); setHidden("challenge-results", true);
      const record = recordForCurrent();
      setText("record-summary", record ? `Current-browser record: ${record.correct} correct · ${record.accuracy}% accuracy · streak ${record.bestStreak}` : "No record saved for this tool, units, difficulty, and duration yet.");
    }
    function startChallenge(seed = Date.now() >>> 0) {
      challengeSeed = seed;
      challengeDeck = model.createQuestionDeck({ ...currentOptions(), count: 120, seed });
      challenge = new ChallengeRuntime({
        questions: challengeDeck,
        evaluate,
        formatExpected: (q) => formatExpected(q),
        now: supplied.now || Date.now,
        durationMs: 60000,
        metadata: {
          ...currentOptions(),
          toolLabel: toolMeta(tool).label,
          unitLabel: unitOptions(model, tool).find((item) => item.id === unit)?.label || unit,
          difficultyLabel: difficulty[0].toUpperCase() + difficulty.slice(1),
        },
      });
      challenge.start();
      setHidden("challenge-ready", true); setHidden("challenge-running", false); setHidden("challenge-results", true);
      setText("challenge-feedback", "");
      renderChallengeQuestion(); updateChallengeStatus();
      ticker = (supplied.setInterval || host.setInterval)(tickChallenge, 100);
    }
    function stopTicker() { if (ticker != null) { (supplied.clearInterval || host.clearInterval)(ticker); ticker = null; } }
    function tickChallenge() {
      if (!challenge) return;
      const state = challenge.getState(); updateChallengeStatus(state);
      if (state.status === "finished") finishChallenge();
    }
    function updateChallengeStatus(state = challenge.getState()) {
      setText("challenge-time", formatClock(state.remainingMs));
      setText("challenge-correct", state.correct); setText("challenge-attempted", state.attempted); setText("challenge-streak", state.currentStreak);
      setText("challenge-number", state.index + 1);
      byId("timer-fill").style.width = `${Math.max(0, Math.min(100, state.remainingMs / 600))}%`;
    }
    function renderChallengeQuestion() {
      const question = challenge.currentQuestion(); if (!question) return;
      setText("challenge-title", question.title || "Read the setup"); setText("challenge-prompt", question.prompt);
      byId("challenge-stage").innerHTML = renderInstrument(question);
      const answerContainer = byId("challenge-answer");
      buildAnswerControl(answerContainer, question, "challenge");
      focusFirstAnswer(answerContainer);
    }
    function submitChallenge(raw) {
      const response = challenge.submit(raw);
      if (!response.accepted) { finishChallenge(); return; }
      setText("challenge-feedback", response.correct ? "Correct · next setup" : `Missed · ${response.expected}`);
      updateChallengeStatus(response.state);
      renderChallengeQuestion();
    }
    function finishChallenge() {
      if (!challenge) return;
      stopTicker();
      frozenRun = challenge.finish({ ...currentOptions(), toolLabel: toolMeta(tool).label, unitLabel: unitOptions(model, tool).find((item) => item.id === unit)?.label || unit, difficultyLabel: difficulty[0].toUpperCase() + difficulty.slice(1), completedAt: new Date().toISOString() });
      const saved = saveRecord(storage, frozenRun);
      setHidden("challenge-running", true); setHidden("challenge-results", false);
      setText("result-correct", frozenRun.correct); setText("result-attempted", frozenRun.attempted); setText("result-accuracy", `${frozenRun.accuracy}%`); setText("result-streak", frozenRun.bestStreak);
      setText("missed-count", frozenRun.missedReview.length);
      const list = byId("missed-list"); list.replaceChildren(...frozenRun.missedReview.map((miss) => { const li = doc.createElement("li"); li.textContent = `${miss.prompt} — answered “${miss.given || "blank"}”; expected ${miss.expected}.`; return li; }));
      const banner = byId("achievement-banner"); banner.hidden = !frozenRun.perfect; banner.textContent = frozenRun.perfect ? "★ PERFECT RUN · Every attempted setup was correct" : "";
      setText("personal-best-message", saved.storageFailed
        ? "Run complete. This browser blocked local record storage, so the personal best was not saved."
        : saved.improved
          ? `New current-browser personal best for ${frozenRun.toolLabel} · ${frozenRun.unitLabel} · ${frozenRun.difficultyLabel}.`
          : `Personal best remains ${saved.record.correct} correct with ${saved.record.accuracy}% accuracy.`);
      setText("certificate-status", "Enter a name, then download a PDF or open the print view.");
      byId("challenge-results").focus();
    }

    function jobQuestion(step) {
      return model.createPracticeQuestion({ ...currentOptions(), index: 30 + step });
    }
    function resetJob() {
      jobIndex = 0; jobQuestions = [0, 1, 2].map(jobQuestion);
      const job = JOBS[tool]; setText("job-title", job.title); setText("job-description", job.description); setText("job-complete-message", job.complete);
      const list = byId("job-step-list"); list.replaceChildren(...job.steps.map((label, index) => { const li = doc.createElement("li"); li.textContent = label; li.className = index === 0 ? "is-current" : ""; return li; }));
      setHidden("job-active", false); setHidden("job-complete", true); renderJobStep();
    }
    function renderJobStep() {
      const q = jobQuestions[jobIndex]; setText("job-progress", `Step ${jobIndex + 1} of ${jobQuestions.length}`); setText("job-prompt", `${JOBS[tool].steps[jobIndex]}: ${q.prompt}`);
      byId("job-stage").innerHTML = renderInstrument(q); buildAnswerControl(byId("job-answer"), q, "job");
      const feedback = byId("job-feedback"); feedback.textContent = "Complete this inspection before moving to the next operation."; feedback.dataset.state = "";
    }
    function submitJob(raw) {
      const q = jobQuestions[jobIndex]; const verdict = normalizeVerdict(evaluate(q, raw), model, q); const feedback = byId("job-feedback");
      if (!verdict.correct) { feedback.dataset.state = "incorrect"; feedback.innerHTML = `<strong>Inspection did not pass.</strong> ${escapeHtml(q.hint || "Recheck the reference marks.")} Expected ${escapeHtml(verdict.expected)}.`; byId("job-stage").innerHTML = renderInstrument(q, { reveal: true, value: questionValue(q) }); return; }
      feedback.dataset.state = "correct"; feedback.innerHTML = "<strong>Inspection passed.</strong> Advancing to the next shop operation.";
      const steps = [...byId("job-step-list").children]; steps[jobIndex].className = "is-complete"; jobIndex += 1;
      if (jobIndex >= jobQuestions.length) { setHidden("job-active", true); setHidden("job-complete", false); setText("job-progress", "Complete"); return; }
      steps[jobIndex].className = "is-current"; renderJobStep();
    }

    function onConfigurationChange() {
      setText("tool-summary", toolMeta(tool).summary || TOOL_FALLBACK[tool].summary);
      makePractice(practiceIndex + 1);
      if (mode === "challenge") renderChallengeReady();
      if (mode === "job") resetJob();
    }

    const toolButtons = [...doc.querySelectorAll("[data-tool]")];
    for (const button of toolButtons) {
      button.tabIndex = button.dataset.tool === tool ? 0 : -1;
      button.addEventListener("click", () => selectTool(button));
      button.addEventListener("keydown", (event) => {
        const current = toolButtons.indexOf(button);
        const next = keyboardIndex(event.key, current, toolButtons.length);
        if (next === current && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        selectTool(toolButtons[next], true);
      });
    }
    const modeButtons = [...doc.querySelectorAll("[data-mode]")];
    for (const button of modeButtons) {
      button.addEventListener("click", () => selectMode(button.dataset.mode));
      button.addEventListener("keydown", (event) => {
        const current = modeButtons.indexOf(button);
        const next = keyboardIndex(event.key, current, modeButtons.length);
        if (next === current && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        selectMode(modeButtons[next].dataset.mode);
        modeButtons[next].focus();
      });
    }
    byId("unit-select").addEventListener("change", (event) => { unit = event.target.value; onConfigurationChange(); });
    byId("difficulty-select").addEventListener("change", (event) => { difficulty = event.target.value; onConfigurationChange(); });
    byId("practice-form").addEventListener("submit", (event) => { event.preventDefault(); showPracticeVerdict(readAnswer(event.currentTarget)); });
    byId("practice-hint").addEventListener("click", () => { byId("hints-enabled").checked = true; const feedback = byId("practice-feedback"); feedback.dataset.state = "incorrect"; feedback.innerHTML = `<strong>Hint:</strong> ${escapeHtml(practiceQuestion.hint || "Start from the highlighted reference edge and count the smallest divisions.")} Expected ${escapeHtml(formatExpected(practiceQuestion))}.`; byId("practice-stage").innerHTML = renderInstrument(practiceQuestion, { reveal: true, value: questionValue(practiceQuestion) }); });
    byId("practice-new").addEventListener("click", () => makePractice(practiceIndex + 1));
    byId("challenge-start").addEventListener("click", () => startChallenge());
    byId("challenge-form").addEventListener("submit", (event) => { event.preventDefault(); submitChallenge(readAnswer(event.currentTarget)); });
    byId("challenge-replay").addEventListener("click", () => startChallenge(challengeSeed));
    byId("challenge-done").addEventListener("click", renderChallengeReady);
    byId("job-form").addEventListener("submit", (event) => { event.preventDefault(); submitJob(readAnswer(event.currentTarget)); });
    byId("job-reset").addEventListener("click", resetJob);
    byId("certificate-download").addEventListener("click", async () => {
      if (!frozenRun || !certificate) return setText("certificate-status", "Certificate generator is unavailable.");
      try { await certificate.downloadPdf(certificate.createSnapshot(frozenRun, byId("student-name").value)); setText("certificate-status", "PDF certificate downloaded."); }
      catch (error) { setText("certificate-status", `Could not create the PDF: ${error.message}`); }
    });
    byId("certificate-print").addEventListener("click", () => {
      if (!frozenRun || !certificate) return setText("certificate-status", "Certificate generator is unavailable.");
      try { certificate.printCertificate(certificate.createSnapshot(frozenRun, byId("student-name").value), host); setText("certificate-status", "Print view opened."); }
      catch (error) { setText("certificate-status", `Could not open the print view: ${error.message}`); }
    });

    renderUnits(); onConfigurationChange(); selectMode("practice");
    return { getState: () => ({ tool, unit, difficulty, mode, frozenRun }), startChallenge, finishChallenge, resetJob };
  }

  if (root.document) root.document.addEventListener("DOMContentLoaded", () => {
    try { initialize(root.document, root); }
    catch (error) { const target = root.document.querySelector("main"); if (target) target.insertAdjacentHTML("afterbegin", `<p class="feedback" data-state="incorrect">Measure Up could not start: ${escapeHtml(error.message)}</p>`); }
  });

  return { STORAGE_KEY, DURATION_SECONDS, JOBS, escapeHtml, deepFreeze, recordKey, readRecords, resolveStorage, isBetterRecord, saveRecord, formatClock, keyboardIndex, focusFirstAnswer, questionValue, initialPositionValue, normalizeVerdict, ChallengeRuntime, unitOptions, renderInstrument, initialize };
});
