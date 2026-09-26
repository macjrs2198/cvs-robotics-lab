import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { buildPair, parseWorkbook } from './gear.js';

const defaults = {
  pinionTeeth: 10, gearTeeth: 30, pressureAngleDeg: 20,
  centerDistance: 7, pinionSafety: 1.1, gearSafety: 1.1,
};

test('recreates the saved GearBuilder gear coordinates', () => {
  const pair = buildPair(defaults);
  assert.equal(pair.pinion.points.length, 401);
  assert.equal(pair.gear.points.length, 1201);
  assert.ok(Math.abs(pair.diametralPitch - 2.857142857142857) < 1e-12);
  assert.ok(Math.abs(pair.gear.outsideRadius - 5.43625915 * 25.4) < 1e-9);

  // Independent values from L:M in the uploaded GearBuilder_Fixed.xlsm.
  const savedInches = [
    [1, 4.684885065, 0],
    [2, 4.93338625912602, 0],
    [3, 4.9350173293796225, 2.796656774578521e-5],
    [20, 5.4339614949042625, 0.15964335006312957],
    [21, 5.417833504966687, 0.44777632784898913],
    [40, 4.655620307681744, 0.5228265706344647],
    [41, 4.582509086043389, 0.9740423751510172],
    [80, 4.445182077581418, 1.4793594456415926],
    [1201, 4.684885065, 0],
  ];
  for (const [row, x, y] of savedInches) {
    const actual = pair.gear.points[row - 1];
    assert.ok(Math.hypot(actual.x - x * 25.4, actual.y - y * 25.4) < 1e-8,
      `row ${row} differs from workbook`);
  }
  assert.deepEqual(pair.gear.points.at(-1), pair.gear.points[0]);
  assert.deepEqual(pair.pinion.points.at(-1), pair.pinion.points[0]);
});

test('different inputs recompute both tooth counts, scale, and pitch', () => {
  const other = buildPair({ ...defaults, pinionTeeth: 12, gearTeeth: 36, centerDistance: 6 });
  assert.equal(other.pinion.points.length, 481);
  assert.equal(other.gear.points.length, 1441);
  assert.equal(other.diametralPitch, 4);
  assert.ok(Math.abs(other.pinion.pitchRadius + other.gear.pitchRadius - 6 * 25.4) < 1e-9);
  assert.throws(() => buildPair({ ...defaults, centerDistance: 0 }), /positive/);
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 9.5 }), /whole number/);
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 9, centerDistance: 500 }), /too large/);
});

test('blocks crossed tips and overlapping root spaces, with a usable 9-tooth boundary', () => {
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 8 }),
    /Pinion tooth tips cross or come to a point/);
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 7 }),
    /Pinion tooth tips cross or come to a point/);
  const justValid = buildPair({ ...defaults, pinionTeeth: 9 });
  assert.equal(justValid.pinion.points.length, 361);
  assert.ok(Math.hypot(justValid.pinion.points[19].x - justValid.pinion.points[20].x,
    justValid.pinion.points[19].y - justValid.pinion.points[20].y) > 0);
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 18, gearTeeth: 4, pressureAngleDeg: 30 }),
    /Gear tooth tips cross or come to a point/);
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 22, gearTeeth: 4, pressureAngleDeg: 40 }),
    /Pinion tooth spaces close at the roots/);
});

test('an involute starts at the root when its root circle exceeds its base circle', () => {
  const pair = buildPair({ ...defaults, pinionTeeth: 30 });
  const gear = pair.gear;
  assert.ok(gear.rootRadius > gear.baseRadius);
  assert.equal(gear.points.length, 1201);
  assert.ok(Math.hypot(gear.points[0].x, gear.points[0].y) >= gear.rootRadius - 1e-9);
  assert.ok(Math.min(...gear.points.map(p => Math.hypot(p.x, p.y))) >= gear.rootRadius - 1e-8);
  const minimumChordMidpoint = Math.min(...gear.points.slice(0, -1).map((p, i) =>
    Math.hypot((p.x + gear.points[i + 1].x) / 2, (p.y + gear.points[i + 1].y) / 2)));
  assert.ok(gear.rootRadius - minimumChordMidpoint < 0.01,
    'sampled root-circle arcs should stay within 0.01 mm of the stated root radius');
  assert.ok(Math.atan2(gear.points[0].y, gear.points[0].x) > 0);
});

test('blocks gear pair interference and enforces radial clearance', () => {
  assert.ok(buildPair(defaults).contactRatio > 1.3);
  // At 14.5°, a seven-tooth pinion is a simple outline but the mating gear
  // tip would reach beneath the pinion's usable involute flank.
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 7, pressureAngleDeg: 14.5 }),
    /gear teeth would jam/);
  assert.throws(() => buildPair({ ...defaults, pinionSafety: 1 }),
    /root clearance factors must be greater than 1/);
  assert.throws(() => buildPair({ ...defaults, gearSafety: 1 }),
    /root clearance factors must be greater than 1/);
  assert.throws(() => buildPair({ ...defaults, gearTeeth: 151 }),
    /Gear teeth.*4 to 150/);
  assert.throws(() => buildPair({ ...defaults, pinionTeeth: 36 }),
    /Pinion teeth.*4 to 35/);
});

// A small ZIP fixture exercises the browser importer without bundling the
// original private macro-enabled workbook in the public site repository.
function zip(definitions) {
  const files = [];
  const directory = [];
  let offset = 0;
  for (const [name, content] of Object.entries(definitions)) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(content);
    const compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(filename.length, 26);
    files.push(local, filename, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const centralSize = Buffer.concat(directory).length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(definitions).length, 8);
  end.writeUInt16LE(Object.keys(definitions).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]);
}

test('reads fixed workbook cells, including shared strings and cached formula values', async () => {
  const shared = '<sst><si><t>pinion</t></si><si><t>pressure</t></si><si><t>10</t></si></sst>';
  const sheet = `<worksheet><sheetData><row r="1">
    <c r="B1" t="s"><v>0</v></c><c r="D1" t="inlineStr"><is><t>gear</t></is></c>
    <c r="F1" t="s"><v>1</v></c><c r="H1" t="inlineStr"><is><t>Center</t></is></c></row>
    <row r="4"><c r="B4" t="s"><v>2</v></c><c r="D4" t="inlineStr"><is><t>30</t></is></c>
    <c r="F4"><v>20</v></c><c r="H4"><f>3+4</f><v>7</v></c>
    <c r="J4"><v>1.1</v></c></row><row r="9"><c r="J9"><v>1.1</v></c></row>
    <row r="14"><c r="F14"><v>25.4</v></c></row></sheetData></worksheet>`;
  const imported = await parseWorkbook(zip({
    'xl/worksheets/sheet1.xml': sheet,
    'xl/sharedStrings.xml': shared,
  }));
  assert.deepEqual(imported.params, defaults);
  assert.equal(imported.macroOutputScale, 25.4);
  assert.equal(imported.cachedTrace, null);
  await assert.rejects(() => parseWorkbook(zip({
    'xl/worksheets/sheet1.xml': sheet.replace('<t>gear</t>', '<t>budget</t>'),
    'xl/sharedStrings.xml': shared,
  })), /not a GearBuilder workbook/);
});

test('imports invalid legacy workbook inputs even when its saved contour is stale', async () => {
  const rows = Array.from({ length: 321 }, (_, i) =>
    `<row r="${i + 30}"><c r="L${i + 30}"><v>1</v></c><c r="M${i + 30}"><v>0</v></c></row>`).join('');
  const sheet = `<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>pinion</t></is></c><c r="D1" t="inlineStr"><is><t>gear</t></is></c><c r="F1" t="inlineStr"><is><t>pressure</t></is></c><c r="H1" t="inlineStr"><is><t>center</t></is></c></row><row r="4"><c r="B4"><v>8</v></c><c r="D4"><v>30</v></c><c r="F4"><v>20</v></c><c r="H4"><v>7</v></c><c r="J4"><v>1.1</v></c></row><row r="9"><c r="J9"><v>1.1</v></c></row>${rows}</sheetData></worksheet>`;
  const parsed = await parseWorkbook(zip({ 'xl/worksheets/sheet1.xml': sheet }));
  assert.equal(parsed.params.pinionTeeth, 8);
  assert.equal(parsed.cachedTrace.kind, 'pinion');
  assert.equal(parsed.cachedTrace.matchesInputs, false);
  assert.equal(parsed.cachedTrace.maxDifferenceMm, null);
});
