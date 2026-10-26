"use strict";

const assert = require("node:assert/strict");
const Certificate = require("../certificate.js");

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function sampleRun(overrides) {
  return Object.assign({
    studentName: "Avery Builder",
    toolLabel: "Dial Caliper",
    unitsLabel: "Inches · 0.001 in",
    difficultyLabel: "Journey",
    correct: 9,
    attempted: 10,
    bestStreak: 5,
    completedAt: "2026-10-26T18:30:00.000Z",
    achievement: "Precision Builder"
  }, overrides || {});
}

function pdfText(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

test("normalizes and deeply freezes a detached run snapshot", () => {
  const source = {
    studentName: "  Avery   Builder  ",
    setup: {
      toolLabel: "Dial Caliper",
      unitsLabel: "Inches",
      difficultyLabel: "Journey"
    },
    results: {
      correct: 7,
      attempted: 8,
      bestStreak: 4,
      completedAt: "2026-10-26T18:30:00.000Z",
      achievement: "Precision Builder"
    }
  };

  const snapshot = Certificate.createSnapshot(source);

  assert.equal(snapshot.studentName, "Avery Builder");
  assert.equal(snapshot.tool, "Dial Caliper");
  assert.equal(snapshot.units, "Inches");
  assert.equal(snapshot.difficulty, "Journey");
  assert.equal(snapshot.durationSeconds, 60);
  assert.equal(snapshot.durationLabel, "60 seconds");
  assert.equal(snapshot.correct, 7);
  assert.equal(snapshot.attempted, 8);
  assert.equal(snapshot.accuracy, 87.5);
  assert.equal(snapshot.accuracyLabel, "87.5%");
  assert.equal(snapshot.bestStreak, 4);
  assert.equal(snapshot.completionDate, "October 26, 2026");
  assert.equal(snapshot.achievement, "Precision Builder");
  assert.equal(snapshot.brand.organization, "CVS");
  assert.equal(snapshot.brand.mascot, "Stormy");
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.brand));

  source.studentName = "Changed Name";
  source.setup.toolLabel = "Tape / Ruler";
  source.results.correct = 0;
  source.results.achievement = "Changed Achievement";

  assert.equal(snapshot.studentName, "Avery Builder");
  assert.equal(snapshot.tool, "Dial Caliper");
  assert.equal(snapshot.correct, 7);
  assert.equal(snapshot.achievement, "Precision Builder");
  assert.strictEqual(Certificate.createSnapshot(snapshot), snapshot);
});

test("derives Perfect Run only from an earned non-empty perfect score", () => {
  const perfect = Certificate.createSnapshot(sampleRun({
    correct: 12,
    attempted: 12,
    bestStreak: 99,
    achievement: "Something else"
  }));
  const empty = Certificate.createSnapshot(sampleRun({
    correct: 0,
    attempted: 0,
    achievement: "Ready"
  }));

  assert.equal(perfect.perfectRun, true);
  assert.equal(perfect.achievement, "Perfect Run");
  assert.equal(perfect.accuracy, 100);
  assert.equal(perfect.bestStreak, 12);
  assert.equal(empty.perfectRun, false);
  assert.equal(empty.achievement, "Ready");
  assert.equal(empty.accuracy, 0);
});

test("maps model identifiers to student-facing certificate labels", () => {
  const snapshot = Certificate.createSnapshot(sampleRun({
    toolLabel: undefined,
    unitsLabel: undefined,
    difficultyLabel: undefined,
    tool: "speed",
    unit: "angles",
    difficulty: "master"
  }));

  assert.equal(snapshot.tool, "Speed Square");
  assert.equal(snapshot.units, "Angles & rise / run");
  assert.equal(snapshot.difficulty, "Master");
});

test("preserves the frozen run's one-decimal accuracy value", () => {
  const snapshot = Certificate.createSnapshot(sampleRun({
    correct: 2,
    attempted: 3,
    accuracy: 66.7
  }));

  assert.equal(snapshot.accuracy, 66.7);
  assert.equal(snapshot.accuracyLabel, "66.7%");
});

test("builds a valid searchable one-page PDF with the complete certificate data", () => {
  const bytes = Certificate.buildPdfBytes(sampleRun());
  const text = pdfText(bytes);

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/Type \/Page\b/);
  assert.match(text, /CVS Measure Up/);
  assert.match(text, /CVS/);
  assert.match(text, /STORMY/);
  assert.match(text, /Avery Builder/);
  assert.match(text, /Dial Caliper/);
  assert.match(text, /Inches \/ 0\.001 in/);
  assert.match(text, /Journey/);
  assert.match(text, /60 seconds/);
  assert.match(text, /\(Correct\)/i);
  assert.match(text, /\(9\)/);
  assert.match(text, /\(10\)/);
  assert.match(text, /90%/);
  assert.match(text, /\(5\)/);
  assert.match(text, /October 26, 2026/);
  assert.match(text, /Precision Builder/);
  assert.ok(text.endsWith("%%EOF\n"));

  const startXrefMatch = text.match(/startxref\n(\d+)\n%%EOF/);
  assert.ok(startXrefMatch, "PDF must include a startxref pointer");
  assert.ok(text.slice(Number(startXrefMatch[1])).startsWith("xref\n"));

  const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  assert.equal(offsets.length, 7);
  offsets.forEach((offset, index) => {
    assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj\n`), `xref entry ${index + 1} points to its object`);
  });
});

test("escapes PDF literal delimiters without losing certificate content", () => {
  const text = pdfText(Certificate.buildPdfBytes(sampleRun({
    studentName: "Sam (Shop) \\ Team",
    toolLabel: "Tape (Long)"
  })));

  assert.ok(text.includes("(Sam \\(Shop\\) \\\\ Team) Tj"));
  assert.ok(text.includes("(Tape \\(Long\\)) Tj"));
});

test("fits an 80-character student name within the PDF name area", () => {
  const longName = "Alexandria Montgomery-Sanchez Christopher-James Washington the Third of Colorado".slice(0, 80);
  const text = pdfText(Certificate.buildPdfBytes(sampleRun({ studentName: longName })));
  const nameRegion = text.match(/\(This certificate recognizes\) Tj[\s\S]*?ET\n([\s\S]*?)\n0\.74 0\.05 0\.10 RG 1 w 54 \d+ m 738 \d+ l S/);

  assert.ok(nameRegion, "PDF exposes a bounded student-name region");
  const nameCommands = [...nameRegion[1].matchAll(/\/F2 (\d+) Tf[\s\S]*?\(([^()]*)\) Tj/g)];
  assert.equal(nameCommands.length, 2, "long name wraps to two lines");
  assert.ok(nameCommands.every((match) => Number(match[1]) >= 16), "wrapped name remains readable");
  assert.equal(nameCommands.map((match) => match[2]).join(" "), longName);
  assert.match(nameRegion[0], /RG 1 w 54 \d+ m 738 \d+ l S/);
});

test("fits a worst-case wide 80-character name using Helvetica-Bold metrics", () => {
  const longName = "w".repeat(80);
  const text = pdfText(Certificate.buildPdfBytes(sampleRun({ studentName: longName })));
  const nameRegion = text.match(/\(This certificate recognizes\) Tj[\s\S]*?ET\n([\s\S]*?)\n0\.74 0\.05 0\.10 RG 1 w 54 \d+ m 738 \d+ l S/);
  assert.ok(nameRegion);
  const commands = [...nameRegion[1].matchAll(/\/F2 (\d+) Tf[\s\S]*?\(([^()]*)\) Tj/g)];
  assert.ok(commands.length <= 2);
  assert.equal(commands.map((match) => match[2]).join(""), longName);
  for (const command of commands) {
    const fontSize = Number(command[1]);
    const actualHelveticaBoldWidth = command[2].length * 0.722 * fontSize;
    assert.ok(actualHelveticaBoldWidth <= 660, `wide name line must fit: ${actualHelveticaBoldWidth}`);
  }
});

test("builds printable HTML with all values and escapes untrusted text", () => {
  const html = Certificate.buildPrintHtml(sampleRun({
    studentName: "<script>alert('name')</script>",
    toolLabel: "Tape & <Ruler>",
    achievement: "Accuracy \"Ace\""
  }));

  assert.ok(html.startsWith("<!doctype html>"));
  assert.match(html, /CVS Measure Up/);
  assert.match(html, /STORMY/);
  assert.match(html, /60-Second Measurement &amp; Layout Challenge/);
  assert.match(html, /&lt;script&gt;alert\(&#39;name&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Tape &amp; &lt;Ruler&gt;/);
  assert.match(html, /Accuracy &quot;Ace&quot;/);
  assert.match(html, />Correct</);
  assert.match(html, />9</);
  assert.match(html, />Attempted</);
  assert.match(html, />10</);
  assert.match(html, />90%</);
  assert.match(html, />5</);
  assert.match(html, /October 26, 2026/);
  assert.match(html, /frozen snapshot/);
});

test("print certificate wraps long student names without clipping", () => {
  const longName = "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
  const html = Certificate.buildPrintHtml(sampleRun({ studentName: longName }));

  assert.equal(Certificate.createSnapshot(sampleRun({ studentName: longName })).studentName.length, 80);
  assert.match(html, new RegExp(`<h2 class="student">${longName.slice(0, 80)}</h2>`));
  assert.match(html, /max-width:100%/);
  assert.match(html, /font-size:clamp\(22px,3vw,34px\)/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /word-break:break-word/);
});

test("prints escaped HTML through a supplied browser window", () => {
  const calls = [];
  const document = {
    open() { calls.push("open"); },
    write(html) { calls.push(["write", html]); },
    close() { calls.push("close"); }
  };
  const printWindow = {
    document,
    focus() { calls.push("focus"); },
    print() { calls.push("print"); }
  };
  const result = Certificate.printCertificate(sampleRun(), { printWindow });

  assert.deepEqual(calls.map((entry) => Array.isArray(entry) ? entry[0] : entry), [
    "open", "write", "close", "focus", "print"
  ]);
  assert.match(calls[1][1], /Avery Builder/);
  assert.equal(result.snapshot.studentName, "Avery Builder");
  assert.ok(Object.isFrozen(result));
});

test("downloads an application/pdf Blob and revokes its object URL", () => {
  const events = [];
  let createdBlob;

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
      createdBlob = this;
    }
  }

  const urlApi = {
    createObjectURL(blob) {
      events.push(["create-url", blob]);
      return "blob:certificate-test";
    },
    revokeObjectURL(url) {
      events.push(["revoke-url", url]);
    }
  };
  const anchor = {
    click() { events.push("click"); },
    remove() { events.push("remove"); }
  };
  const document = {
    body: {
      appendChild(node) { events.push(["append", node]); }
    },
    createElement(tag) {
      assert.equal(tag, "a");
      return anchor;
    }
  };
  const result = Certificate.downloadPdf(sampleRun(), {
    document,
    Blob: FakeBlob,
    URL: urlApi,
    setTimeout(callback, delay) {
      events.push(["timeout", delay]);
      callback();
    }
  });

  assert.equal(createdBlob.type, "application/pdf");
  assert.ok(createdBlob.parts[0] instanceof Uint8Array);
  assert.equal(anchor.href, "blob:certificate-test");
  assert.equal(anchor.download, "CVS-Measure-Up-avery-builder-2026-10-26.pdf");
  assert.equal(anchor.hidden, true);
  assert.ok(events.includes("click"));
  assert.ok(events.includes("remove"));
  assert.deepEqual(events.find((event) => Array.isArray(event) && event[0] === "timeout"), ["timeout", 1000]);
  assert.deepEqual(events.find((event) => Array.isArray(event) && event[0] === "revoke-url"), ["revoke-url", "blob:certificate-test"]);
  assert.strictEqual(result.blob, createdBlob);
  assert.equal(result.filename, anchor.download);
});

test("a bound normalized snapshot remains stable after later source mutation", () => {
  const source = sampleRun();
  const snapshot = Certificate.createSnapshot(source);
  const before = pdfText(Certificate.buildPdfBytes(snapshot));
  source.studentName = "Different Student";
  source.correct = 0;
  source.attempted = 99;
  source.bestStreak = 0;
  source.achievement = "Different Achievement";
  const after = pdfText(Certificate.buildPdfBytes(snapshot));

  assert.equal(after, before);
  assert.match(after, /Avery Builder/);
  assert.match(after, /Precision Builder/);
  assert.doesNotMatch(after, /Different Student/);
  assert.doesNotMatch(after, /Different Achievement/);
});

(async () => {
  let failures = 0;
  for (const entry of tests) {
    try {
      await entry.callback();
      console.log(`✓ ${entry.name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${entry.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }

  if (failures) {
    console.error(`\n${failures} certificate test${failures === 1 ? "" : "s"} failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\n${tests.length} certificate tests passed.`);
  }
})()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
