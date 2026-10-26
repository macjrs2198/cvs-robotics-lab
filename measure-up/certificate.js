(function certificateModule(root, factory) {
  "use strict";

  var api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.MeasureUpCertificate = api;
    root.CVSMeasureUpCertificate = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createCertificateApi(root) {
  "use strict";

  var normalizedSnapshots = typeof WeakSet === "function" ? new WeakSet() : null;
  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var TOOL_LABELS = Object.freeze({
    tape: "Tape / Ruler",
    caliper: "Dial Caliper",
    framing: "Framing Square",
    speed: "Speed Square"
  });
  var UNIT_LABELS = Object.freeze({
    "inch-fraction": "Inches · fractions",
    millimeter: "Metric · millimeters",
    "inch-decimal": "Decimal inches",
    layout: "Layout setups",
    angles: "Angles & rise / run",
    degrees: "Degrees",
    ratio: "Rise : run",
    choice: "Choice"
  });
  var DIFFICULTY_LABELS = Object.freeze({
    apprentice: "Apprentice",
    journey: "Journey",
    master: "Master"
  });

  function firstValue() {
    for (var index = 0; index < arguments.length; index += 1) {
      var value = arguments[index];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return undefined;
  }

  function plainText(value, fallback, maximumLength) {
    var text = value === undefined || value === null ? "" : String(value);
    text = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!text) {
      text = fallback;
    }
    return text.slice(0, maximumLength || 160);
  }

  function nonNegativeInteger(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback || 0;
    }
    return Math.max(0, Math.floor(number));
  }

  function normalizedAccuracy(value, fallback) {
    var raw = String(value === undefined || value === null ? "" : value).replace(/%$/, "").trim();
    var number = raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(number)) {
      number = fallback;
    }
    return Math.round(Math.max(0, Math.min(100, number)) * 10) / 10;
  }

  function percentageLabel(value) {
    return (Number.isInteger(value) ? String(value) : value.toFixed(1)) + "%";
  }

  function mappedLabel(value, labels, fallback, maximumLength) {
    var raw = value === undefined || value === null ? "" : String(value);
    var mapped = labels[raw.toLowerCase()] || raw;
    return plainText(mapped, fallback, maximumLength);
  }

  function dateParts(value) {
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
    var year = date.getFullYear();
    var month = date.getMonth();
    var day = date.getDate();
    return {
      iso: date.toISOString(),
      label: MONTHS[month] + " " + day + ", " + year,
      fileDate: year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0")
    };
  }

  function sourceParts(source) {
    var outer = source && typeof source === "object" ? source : {};
    var run = outer.run && typeof outer.run === "object"
      ? outer.run
      : (outer.results && typeof outer.results === "object" ? outer.results : outer);
    var setup = outer.setup && typeof outer.setup === "object"
      ? outer.setup
      : (run.setup && typeof run.setup === "object" ? run.setup : {});
    return { outer: outer, run: run, setup: setup };
  }

  function createSnapshot(source, studentName) {
    if (normalizedSnapshots && normalizedSnapshots.has(source) && studentName === undefined) {
      return source;
    }

    var parts = sourceParts(source);
    var outer = parts.outer;
    var run = parts.run;
    var setup = parts.setup;
    var attempted = nonNegativeInteger(firstValue(run.attempted, outer.attempted), 0);
    var correct = Math.min(attempted, nonNegativeInteger(firstValue(run.correct, outer.correct), 0));
    var bestStreak = Math.min(correct, nonNegativeInteger(firstValue(
      run.bestStreak,
      run.best_streak,
      run.streak,
      outer.bestStreak,
      outer.best_streak
    ), 0));
    var derivedAccuracy = attempted ? (correct / attempted) * 100 : 0;
    var accuracy = normalizedAccuracy(firstValue(run.accuracy, outer.accuracy), derivedAccuracy);
    var perfectRun = attempted > 0 && correct === attempted;
    var completion = dateParts(firstValue(
      run.completedAt,
      run.completionDate,
      run.endedAt,
      outer.completedAt,
      outer.completionDate,
      outer.endedAt,
      new Date()
    ));
    var achievement = perfectRun
      ? "Perfect Run"
      : plainText(firstValue(run.achievement, outer.achievement), "Challenge Complete", 100);

    var snapshot = {
      version: 1,
      title: "CVS Measure Up",
      studentName: plainText(firstValue(studentName, outer.studentName, run.studentName, outer.name), "Student", 80),
      tool: mappedLabel(firstValue(
        run.toolLabel,
        run.toolName,
        run.tool,
        setup.toolLabel,
        setup.toolName,
        setup.tool,
        outer.toolLabel,
        outer.tool
      ), TOOL_LABELS, "Measurement Tool", 100),
      units: mappedLabel(firstValue(
        run.unitsLabel,
        run.unitLabel,
        run.units,
        run.unit,
        setup.unitsLabel,
        setup.unitLabel,
        setup.units,
        setup.unit,
        outer.unitsLabel,
        outer.units,
        outer.unit
      ), UNIT_LABELS, "Not specified", 80),
      difficulty: mappedLabel(firstValue(
        run.difficultyLabel,
        run.difficulty,
        setup.difficultyLabel,
        setup.difficulty,
        outer.difficultyLabel,
        outer.difficulty
      ), DIFFICULTY_LABELS, "Not specified", 80),
      durationSeconds: 60,
      durationLabel: "60 seconds",
      correct: correct,
      attempted: attempted,
      accuracy: accuracy,
      accuracyLabel: percentageLabel(accuracy),
      bestStreak: bestStreak,
      completedAt: completion.iso,
      completionDate: completion.label,
      fileDate: completion.fileDate,
      achievement: achievement,
      perfectRun: perfectRun,
      brand: Object.freeze({ organization: "CVS", mascot: "Stormy" })
    };

    Object.freeze(snapshot);
    if (normalizedSnapshots) {
      normalizedSnapshots.add(snapshot);
    }
    return snapshot;
  }

  function printableAscii(value) {
    return String(value)
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, "\"")
      .replace(/\u2026/g, "...")
      .replace(/\u00b0/g, " deg")
      .replace(/\s*\u00b7\s*/g, " / ")
      .replace(/[^\x20-\x7e]/g, "?");
  }

  function pdfLiteral(value) {
    return "(" + printableAscii(value)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)") + ")";
  }

  function textCommand(font, size, x, y, text, color) {
    return [
      "BT",
      "/" + font + " " + size + " Tf",
      color || "0.10 0.13 0.17 rg",
      "1 0 0 1 " + x + " " + y + " Tm",
      pdfLiteral(text) + " Tj",
      "ET"
    ].join("\n");
  }

  function estimatedPdfTextWidth(value, fontSize) {
    var text = printableAscii(value);
    var ems = 0;

    for (var index = 0; index < text.length; index += 1) {
      var character = text.charAt(index);
      if (character === " ") {
        ems += 0.278;
      } else if (/[ilI.,'!:;|]/.test(character)) {
        ems += 0.278;
      } else if (/[W@%&]/.test(character)) {
        ems += 0.95;
      } else if (/[Mm]/.test(character)) {
        ems += 0.90;
      } else if (character === "w") {
        ems += 0.75;
      } else if (/[A-Z]/.test(character)) {
        ems += 0.80;
      } else if (/[a-z]/.test(character)) {
        ems += 0.65;
      } else {
        ems += 0.60;
      }
    }
    return ems * fontSize;
  }

  function wrappedPdfLines(value, maximumWidth, fontSize) {
    var words = printableAscii(value).split(/\s+/).filter(Boolean);
    var lines = [];
    var current = "";

    function pushLongWord(word) {
      var remainder = word;
      while (remainder && estimatedPdfTextWidth(remainder, fontSize) > maximumWidth) {
        var splitAt = 1;
        while (
          splitAt < remainder.length &&
          estimatedPdfTextWidth(remainder.slice(0, splitAt + 1), fontSize) <= maximumWidth
        ) {
          splitAt += 1;
        }
        lines.push(remainder.slice(0, splitAt));
        remainder = remainder.slice(splitAt);
      }
      return remainder;
    }

    words.forEach(function addWord(word) {
      var candidate = current ? current + " " + word : word;
      if (estimatedPdfTextWidth(candidate, fontSize) <= maximumWidth) {
        current = candidate;
        return;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      current = pushLongWord(word);
    });
    if (current) {
      lines.push(current);
    }
    return lines.length ? lines : [""];
  }

  function studentNameLayout(studentName) {
    var maximumWidth = 660;
    var fontSize = 29;
    var lines = wrappedPdfLines(studentName, maximumWidth, fontSize);

    while (lines.length > 2 && fontSize > 16) {
      fontSize -= 1;
      lines = wrappedPdfLines(studentName, maximumWidth, fontSize);
    }

    var baselines;
    if (lines.length === 1) {
      baselines = [426];
    } else {
      var lineHeight = fontSize + 4;
      baselines = lines.map(function nameBaseline(line, index) {
        return 438 - (index * lineHeight);
      });
    }
    var underlineY = lines.length === 1
      ? 417
      : Math.round(baselines[baselines.length - 1] - (fontSize * 0.25) - 6);

    return {
      fontSize: fontSize,
      lines: lines,
      baselines: baselines,
      underlineY: underlineY,
      detailsShift: Math.min(0, underlineY - 417)
    };
  }

  function certificateContent(snapshot) {
    var nameLayout = studentNameLayout(snapshot.studentName);
    var rows = [
      ["Tool", snapshot.tool, 390],
      ["Units / Track", snapshot.units, 354],
      ["Difficulty", snapshot.difficulty, 318],
      ["Duration", snapshot.durationLabel, 282],
      ["Correct", String(snapshot.correct), 246],
      ["Attempted", String(snapshot.attempted), 210],
      ["Accuracy", snapshot.accuracyLabel, 174],
      ["Best streak", String(snapshot.bestStreak), 138]
    ];
    var commands = [
      "q",
      "0.97 0.96 0.92 rg 0 0 792 612 re f",
      "0.74 0.05 0.10 RG 4 w 24 24 744 564 re S",
      "0.74 0.05 0.10 rg 54 490 88 70 re f",
      "Q",
      textCommand("F2", 27, 69, 525, "CVS", "1 1 1 rg"),
      textCommand("F2", 10, 71, 505, "STORMY", "1 1 1 rg"),
      textCommand("F2", 25, 164, 535, "CVS Measure Up"),
      textCommand("F1", 11, 166, 515, "60-Second Measurement & Layout Challenge", "0.33 0.36 0.40 rg"),
      textCommand("F1", 14, 54, 462, "This certificate recognizes")
    ];

    nameLayout.lines.forEach(function addStudentNameLine(line, index) {
      commands.push(textCommand(
        "F2",
        nameLayout.fontSize,
        54,
        nameLayout.baselines[index],
        line,
        "0.74 0.05 0.10 rg"
      ));
    });
    commands.push("0.74 0.05 0.10 RG 1 w 54 " + nameLayout.underlineY + " m 738 " + nameLayout.underlineY + " l S");

    rows.forEach(function addRow(row) {
      var rowY = row[2] + nameLayout.detailsShift;
      commands.push(textCommand("F2", 10, 54, rowY, row[0].toUpperCase(), "0.33 0.36 0.40 rg"));
      commands.push(textCommand("F1", 13, 170, rowY, row[1]));
    });

    commands.push(textCommand("F2", 10, 410, 390 + nameLayout.detailsShift, "COMPLETION DATE", "0.33 0.36 0.40 rg"));
    commands.push(textCommand("F1", 13, 548, 390 + nameLayout.detailsShift, snapshot.completionDate));
    commands.push("0.74 0.05 0.10 rg 410 " + (300 + nameLayout.detailsShift) + " 328 72 re f");
    commands.push(textCommand("F2", 11, 430, 344 + nameLayout.detailsShift, "ACHIEVEMENT", "1 1 1 rg"));
    commands.push(textCommand("F2", 20, 430, 318 + nameLayout.detailsShift, snapshot.achievement, "1 1 1 rg"));
    commands.push(textCommand("F1", 10, 410, 90, "Generated locally by CVS Measure Up with Stormy.", "0.33 0.36 0.40 rg"));
    commands.push(textCommand("F1", 9, 410, 72, "Performance values are a frozen snapshot of this completed run.", "0.33 0.36 0.40 rg"));
    return commands.join("\n") + "\n";
  }

  function latin1Bytes(text) {
    var bytes = new Uint8Array(text.length);
    for (var index = 0; index < text.length; index += 1) {
      bytes[index] = text.charCodeAt(index) & 255;
    }
    return bytes;
  }

  function buildPdfBytes(source, studentName) {
    var snapshot = createSnapshot(source, studentName);
    var content = certificateContent(snapshot);
    var objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "<< /Length " + content.length + " >>\nstream\n" + content + "endstream",
      "<< /Title " + pdfLiteral("CVS Measure Up Certificate") + " /Author " + pdfLiteral("CVS / Stormy") + " /Producer " + pdfLiteral("CVS Measure Up browser PDF engine") + " >>"
    ];
    var pdf = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
    var offsets = [0];

    objects.forEach(function appendObject(object, index) {
      offsets[index + 1] = pdf.length;
      pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
    });

    var xrefOffset = pdf.length;
    pdf += "xref\n0 " + (objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    offsets.slice(1).forEach(function appendOffset(offset) {
      pdf += String(offset).padStart(10, "0") + " 00000 n \n";
    });
    pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R /Info 7 0 R >>\n";
    pdf += "startxref\n" + xrefOffset + "\n%%EOF\n";
    return latin1Bytes(pdf);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildPrintHtml(source, studentName) {
    var snapshot = createSnapshot(source, studentName);
    var rows = [
      ["Tool", snapshot.tool],
      ["Units / Track", snapshot.units],
      ["Difficulty", snapshot.difficulty],
      ["Duration", snapshot.durationLabel],
      ["Correct", snapshot.correct],
      ["Attempted", snapshot.attempted],
      ["Accuracy", snapshot.accuracyLabel],
      ["Best streak", snapshot.bestStreak],
      ["Completion date", snapshot.completionDate]
    ].map(function rowMarkup(row) {
      return "<div><dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd></div>";
    }).join("");

    return "<!doctype html>" +
      "<html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>CVS Measure Up Certificate — " + escapeHtml(snapshot.studentName) + "</title>" +
      "<style>" +
      "@page{size:letter landscape;margin:.35in}*{box-sizing:border-box}" +
      "body{margin:0;background:#f7f4eb;color:#18202a;font-family:Arial,sans-serif}" +
      ".certificate{min-height:7.7in;border:5px solid #bd0d1d;padding:30px 38px;position:relative}" +
      ".brand{display:flex;align-items:center;gap:18px}.mark{display:grid;place-items:center;width:88px;height:70px;background:#bd0d1d;color:#fff;font-weight:800;font-size:28px}.mark small{display:block;font-size:10px;letter-spacing:.14em}" +
      ".brand h1{margin:0;font-size:30px}.brand p,.intro,.footer{color:#525b65}" +
      ".student{margin:28px 0 5px;max-width:100%;color:#bd0d1d;font-size:clamp(22px,3vw,34px);line-height:1.08;overflow-wrap:anywhere;word-break:break-word;border-bottom:1px solid #bd0d1d;padding-bottom:8px}" +
      ".body{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:18px}dl{margin:0}dl div{display:grid;grid-template-columns:140px 1fr;padding:7px 0;border-bottom:1px solid #d9d5ca}dt{font-size:11px;font-weight:700;text-transform:uppercase;color:#525b65}dd{margin:0;font-size:15px}" +
      ".achievement{align-self:start;background:#bd0d1d;color:#fff;padding:24px}.achievement span{display:block;font-size:11px;font-weight:700;letter-spacing:.12em}.achievement strong{display:block;margin-top:8px;font-size:25px}.footer{position:absolute;right:38px;bottom:28px;font-size:11px;text-align:right}" +
      "@media print{body{background:#fff}.certificate{break-inside:avoid}}" +
      "</style></head><body><main class=\"certificate\">" +
      "<header class=\"brand\"><div class=\"mark\">CVS<small>STORMY</small></div><div><h1>CVS Measure Up</h1><p>60-Second Measurement &amp; Layout Challenge</p></div></header>" +
      "<p class=\"intro\">This certificate recognizes</p><h2 class=\"student\">" + escapeHtml(snapshot.studentName) + "</h2>" +
      "<section class=\"body\"><dl>" + rows + "</dl><div class=\"achievement\"><span>ACHIEVEMENT</span><strong>" + escapeHtml(snapshot.achievement) + "</strong></div></section>" +
      "<p class=\"footer\">Generated locally by CVS Measure Up with Stormy.<br>Performance values are a frozen snapshot of this completed run.</p>" +
      "</main></body></html>";
  }

  function optionObject(options) {
    return typeof options === "string" ? { studentName: options } : (options || {});
  }

  function certificateFilename(snapshot) {
    var name = printableAscii(snapshot.studentName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "student";
    return "CVS-Measure-Up-" + name + "-" + snapshot.fileDate + ".pdf";
  }

  function downloadPdf(source, options) {
    var settings = optionObject(options);
    var snapshot = createSnapshot(source, settings.studentName);
    var bytes = buildPdfBytes(snapshot);
    var scope = settings.window || root;
    var documentObject = settings.document || (scope && scope.document);
    var BlobConstructor = settings.Blob || (scope && scope.Blob);
    var urlApi = settings.URL || (scope && scope.URL);

    if (!documentObject || !documentObject.createElement || !BlobConstructor || !urlApi || !urlApi.createObjectURL) {
      throw new Error("PDF download requires browser Blob, URL, and document APIs.");
    }

    var blob = new BlobConstructor([bytes], { type: "application/pdf" });
    var objectUrl = urlApi.createObjectURL(blob);
    var anchor = documentObject.createElement("a");
    var filename = settings.filename || certificateFilename(snapshot);
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;

    if (documentObject.body && documentObject.body.appendChild) {
      documentObject.body.appendChild(anchor);
    }
    anchor.click();
    if (anchor.remove) {
      anchor.remove();
    } else if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }

    var schedule = settings.setTimeout || (scope && scope.setTimeout);
    if (typeof schedule === "function") {
      schedule(function revokeDownloadUrl() {
        urlApi.revokeObjectURL(objectUrl);
      }, 1000);
    } else if (urlApi.revokeObjectURL) {
      urlApi.revokeObjectURL(objectUrl);
    }

    return Object.freeze({ snapshot: snapshot, bytes: bytes, blob: blob, filename: filename });
  }

  function printCertificate(source, options) {
    var settings = optionObject(options);
    var snapshot = createSnapshot(source, settings.studentName);
    var html = buildPrintHtml(snapshot);
    var scope = settings.window || root;
    var printWindow = settings.printWindow || (scope && scope.open && scope.open("", "_blank"));

    if (!printWindow || !printWindow.document) {
      throw new Error("The printable certificate window could not be opened.");
    }
    if (printWindow.document.open) {
      printWindow.document.open();
    }
    printWindow.document.write(html);
    if (printWindow.document.close) {
      printWindow.document.close();
    }
    if (printWindow.focus) {
      printWindow.focus();
    }
    printWindow.print();
    return Object.freeze({ snapshot: snapshot, html: html });
  }

  return Object.freeze({
    createSnapshot: createSnapshot,
    createRunSnapshot: createSnapshot,
    normalizeSnapshot: createSnapshot,
    buildPdfBytes: buildPdfBytes,
    generatePdf: buildPdfBytes,
    buildPrintHtml: buildPrintHtml,
    buildPrintableHtml: buildPrintHtml,
    downloadPdf: downloadPdf,
    downloadCertificate: downloadPdf,
    printCertificate: printCertificate,
    escapeHtml: escapeHtml
  });
}));
