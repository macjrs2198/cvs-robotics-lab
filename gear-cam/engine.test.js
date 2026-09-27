import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetOutside, offsetProfile, generateJob, generateToolpathPreview, exportJobDXF } from './engine.js';
import { buildPair } from './gear.js';
import { parseDXF } from './dxf.js';

const square = [
  { x: -10, y: -10 }, { x: 10, y: -10 },
  { x: 10, y: 10 }, { x: -10, y: 10 },
];
const circle = Array.from({ length: 96 }, (_, i) => ({
  x: 5 * Math.cos(2 * Math.PI * i / 96),
  y: 5 * Math.sin(2 * Math.PI * i / 96),
}));
const settings = {
  bitDiameter: 3.175,
  materialThickness: 6,
  stepdown: 2,
  feedRate: 750,
  plungeRate: 250,
  safeZ: 8,
  spindleRPM: 12000,
  origin: 'center',
  skinMm: 0.5,
  centerCuttingConfirmed: true,
};
const bore = { id: 'hole', name: 'Bore', points: circle, side: 'inside' };
const outer = { id: 'gear', name: 'Gear', points: square, side: 'outside' };

function job(profiles, changes = {}) {
  return generateJob({ profiles, settings: { ...settings, ...changes } });
}

test('outside/inside/on profiles have explicit cutter-side paths', () => {
  assert.deepEqual(offsetOutside(square, 1), [
    { x: -11, y: -11 }, { x: 11, y: -11 },
    { x: 11, y: 11 }, { x: -11, y: 11 },
  ]);
  assert.deepEqual(offsetProfile(square, -1), [
    { x: -9, y: -9 }, { x: 9, y: -9 },
    { x: 9, y: 9 }, { x: -9, y: 9 },
  ]);
  assert.deepEqual(offsetProfile(square, 0), square);
  const on = job([{ ...outer, side: 'on' }]);
  assert.deepEqual(on.preview.profiles[0].toolCenterPath, square);
});

test('side-selection preview moves immediately and matches production compensation', () => {
  const outside = generateToolpathPreview({ profiles: [outer], bitDiameter: 3 });
  const inside = generateToolpathPreview({ profiles: [{ ...outer, side: 'inside' }], bitDiameter: 3 });
  const on = generateToolpathPreview({ profiles: [{ ...outer, side: 'on' }], bitDiameter: 3 });
  assert.deepEqual(outside.preview.profiles[0].toolCenterPath, offsetProfile(square, 1.5));
  assert.deepEqual(inside.preview.profiles[0].toolCenterPath, offsetProfile(square, -1.5));
  assert.deepEqual(on.preview.profiles[0].toolCenterPath, square);
  assert.deepEqual(outside.preview.profiles[0].toolCenterPath,
    job([outer], { bitDiameter: 3 }).preview.profiles[0].toolCenterPath);
  assert.equal(outside.metadata.bitDiameter, 3);
});

test('offset handles concave outline and blocks cutter too wide for a notch', () => {
  const l = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 },
    { x: 3, y: 3 }, { x: 3, y: 10 }, { x: 0, y: 10 },
  ];
  assert.deepEqual(offsetOutside(l, 0.25)[3], { x: 3.25, y: 3.25 });
  const notch = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    { x: 6, y: 10 }, { x: 6, y: 2 }, { x: 5, y: 2 },
    { x: 5, y: 10 }, { x: 0, y: 10 },
  ];
  assert.throws(() => offsetOutside(notch, 1), /smaller bit|diameter|compensated/i);
  assert.throws(() => offsetProfile(square, -12), /folded|crosses|disappeared|cannot clear/i);
});

test('generates ordered profile-only G21 program with safe travel and skin', () => {
  const result = job([bore, outer]);
  const { gcode, preview, metadata } = result;
  assert.match(gcode, /G21 G17 G90 G94 G54 G40/);
  assert.match(gcode, /\(Bit 3\.175 mm = 0\.125 in;/);
  assert.match(gcode, /M3 S12000/);
  assert.doesNotMatch(gcode, /\bG2\b|\bG3\b/);
  assert.match(gcode, /G1 Z-5\.5 F250/);
  assert.doesNotMatch(gcode, /G1 Z-6(?:\.0+)?(?:\s|$)/m);
  assert.ok(gcode.indexOf('PROFILE 1: Bore; inside') < gcode.indexOf('PROFILE 2: Gear; outside'));
  assert.ok(gcode.trimEnd().endsWith('M5\nM2'));
  assert.deepEqual(preview.sequence, ['Bore', 'Gear']);
  assert.deepEqual(metadata.passDepths, [-2, -4, -5.5]);
  const lines = gcode.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('G0 X')) assert.equal(lines[i - 1], 'G0 Z8');
  }
  const reversed = job([outer, bore]);
  assert.deepEqual(reversed.preview.sequence, ['Gear', 'Bore']);
  assert.ok(reversed.gcode.indexOf('PROFILE 1: Gear') < reversed.gcode.indexOf('PROFILE 2: Bore'));
});

test('tabs retain exact material height only on final deep passes and appear in preview', () => {
  const tabs = { count: 4, widthMm: 5, heightMm: 1.5 };
  const result = job([{ ...outer, tabs }], { skinMm: 0 });
  const p = result.preview.profiles[0];
  assert.equal(p.tabs.length, 4);
  assert.ok(p.tabs.every(t => t.endMm > t.startMm && t.path.length >= 2));
  assert.equal((result.gcode.match(/G1 Z-4\.5 F250/g) ?? []).length, 4);
  assert.equal((result.gcode.match(/G1 Z-6 F250/g) ?? []).length, 5); // initial plunge + after each tab
  assert.deepEqual(result.metadata.passDepths, [-2, -4, -6]);
  assert.match(result.gcode, /G1 Z-4\.5 F250\nG1 X/);
});

test('tabs are rejected for inside profile or overlapping intervals', () => {
  assert.throws(() => job([{ ...bore, tabs: { count: 2, widthMm: 5, heightMm: 1 } }]), /outside profiles only/);
  assert.throws(() => job([{ ...outer, tabs: { count: 20, widthMm: 5, heightMm: 1 } }]), /overlap|little space/);
  assert.throws(() => job([{ ...outer, tabs: { count: 4, widthMm: 2, heightMm: 1 } }]), /Tab width/);
});

test('full-depth un-tabbed profiles need hold-down and every pass needs plunge-capable bit', () => {
  assert.throws(() => job([outer], { centerCuttingConfirmed: false }), /plunge/);
  assert.throws(() => job([bore, { ...outer, tabs: { count: 4, widthMm: 5, heightMm: 1 } }], { skinMm: 0 }), /hold-down|loose cutouts/);
  const result = job([bore, outer], { skinMm: 0, partHoldDownConfirmed: true });
  assert.deepEqual(result.metadata.passDepths, [-2, -4, -6]);
});

test('lower-left origin translates all profiles; travel bounds are enforced', () => {
  const travelBounds = { minX: 0, maxX: 24, minY: 0, maxY: 24, minZ: -6, maxZ: 9 };
  const result = job([bore, outer], { origin: 'lower-left', travelBounds });
  assert.equal(result.metadata.bounds.minX, 0);
  assert.equal(result.metadata.bounds.minY, 0);
  assert.ok(result.preview.profiles[0].toolCenterPath[0].x > 0);
  assert.throws(() => job([bore, outer], { origin: 'lower-left', travelBounds: {
    ...travelBounds, maxX: 20,
  } }), /travel bounds/);
});

test('workbook default gear with 3.175 mm bit has a verified outside offset', () => {
  const pair = buildPair({ pinionTeeth: 10, gearTeeth: 30, pressureAngleDeg: 20,
    centerDistance: 7, pinionSafety: 1.1, gearSafety: 1.1 });
  const result = job([{ name: '30 tooth gear', points: pair.gear.points,
    side: 'outside', tabs: { count: 4, widthMm: 8, heightMm: 2 } }]);
  assert.equal(result.preview.profiles[0].toolCenterPath.length, 1200);
  assert.equal(result.preview.profiles[0].tabs.length, 4);
  const pinion = job([{ name: '10 tooth pinion', points: pair.pinion.points,
    side: 'outside', tabs: { count: 4, widthMm: 6, heightMm: 2 } }], {
    skinMm: 0, passCount: 3,
  });
  assert.equal(pinion.preview.profiles[0].toolCenterPath.length, 400);
  assert.equal(pinion.preview.profiles[0].tabs.length, 4);
  assert.equal((pinion.gcode.match(/G1 Z-4 F250/g) ?? []).length, 5); // pass 2 plunge + four tab lifts at final depth
  assert.deepEqual(pinion.metadata.passDepths, [-2, -4, -6]);
});

test('outside cut for a 9-tooth pinion keeps the gear inside the cutter path', () => {
  const pair = buildPair({ pinionTeeth: 9, gearTeeth: 30, pressureAngleDeg: 20,
    centerDistance: 4.75, pinionSafety: 1.1, gearSafety: 1.1 });
  const result = job([{ name: 'Pinion outline', points: pair.pinion.points,
    side: 'outside' }], { bitDiameter: 3 });
  const { designPath, toolCenterPath } = result.preview.profiles[0];
  const width = points => Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
  const height = points => Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  assert.ok(width(toolCenterPath) - width(designPath) > 2.9);
  assert.ok(height(toolCenterPath) - height(designPath) > 2.9);
  assert.match(result.gcode,
    /Pinion outline; outside; KEEP INSIDE SHAPE; BIT CENTER 1\.5 MM OUTSIDE/);
});

test('exact pass count yields equal depths and clear failure for undersized circular hole', () => {
  const result = job([outer], { stepdown: undefined, passCount: 4 });
  assert.deepEqual(result.metadata.passDepths, [-1.375, -2.75, -4.125, -5.5]);
  assert.equal(result.metadata.effectiveStepdownMm, 1.375);
  const tiny = circle.map(p => ({ x: p.x * 0.1, y: p.y * 0.1 }));
  assert.throws(() => job([{ name: 'Tiny bore', points: tiny, side: 'inside' }]),
    /smaller bit|cannot clear|folded|crosses|disappeared/i);
});

test('crossing source contours are blocked while nested hole and gear are allowed', () => {
  const translated = square.map(p => ({ x: p.x + 15, y: p.y }));
  assert.throws(() => job([outer, { name: 'Overlapping', points: translated, side: 'outside' }]),
    /cross or touch/);
  assert.equal(job([bore, outer]).preview.profiles.length, 2);
});

test('cutter disk cannot gouge a neighboring disjoint profile', () => {
  const left = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ];
  const right = left.map(p => ({ x: p.x + 12, y: p.y }));
  const profiles = [
    { name: 'Left', points: left, side: 'outside' },
    { name: 'Right', points: right, side: 'outside' },
  ];
  assert.throws(() => generateJob({ profiles, settings: { ...settings, bitDiameter: 3 } }),
    /would reach profile 2|would reach profile 1/);
  assert.equal(generateJob({ profiles, settings: { ...settings, bitDiameter: 1 } }).preview.profiles.length, 2);
});

test('combined DXF exports original closed contours in mm or inches and roundtrips', () => {
  const profiles = [bore, outer];
  const rawMetric = exportJobDXF({ profiles, unit: 'mm' });
  assert.match(rawMetric, /\r\n/);
  const metric = rawMetric.replace(/\r\n?/g, '\n');
  const imperial = exportJobDXF({ profiles, unit: 'in' }).replace(/\r\n?/g, '\n');
  assert.match(metric, /\$ACADVER\n1\nAC1032\n/);
  assert.match(metric, /\$INSUNITS\n70\n4\n/);
  assert.equal((metric.match(/\nPOLYLINE\n/g) ?? []).length, 2);
  assert.equal((metric.match(/\nVERTEX\n/g) ?? []).length, circle.length + square.length);
  assert.equal((metric.match(/\nSEQEND\n/g) ?? []).length, 2);
  assert.match(metric, /8\n0\n100\nAcDb2dPolyline\n66\n1\n10\n0\n20\n0\n30\n0\n70\n1/);
  assert.match(imperial, /\$INSUNITS\n70\n1\n/);
  const parsed = parseDXF(metric);
  assert.equal(parsed.profiles.length, 2);
  assert.equal(parsed.profiles[1].points.length, square.length + 1);
  const parsedInches = parseDXF(imperial);
  assert.ok(Math.abs(parsedInches.profiles[1].points[0].x - square[0].x) < 0.000001);
  assert.throws(() => exportJobDXF({ profiles: [{ points: [square[0], square[1]] }] }), /3 to/);
});

test('exact circle metadata exports a DXF CIRCLE; stale metadata is rejected', () => {
  const withCircle = { ...bore, kind: 'circle', center: { x: 0, y: 0 }, radius: 5 };
  const dxf = exportJobDXF({ profiles: [withCircle, outer] }).replace(/\r\n?/g, '\n');
  assert.equal((dxf.match(/\nCIRCLE\n/g) ?? []).length, 1);
  assert.equal((dxf.match(/\nPOLYLINE\n/g) ?? []).length, 1);
  const imported = parseDXF(dxf);
  assert.equal(imported.profiles[0].kind, 'circle');
  assert.equal(imported.profiles[0].radius, 5);
  assert.throws(() => exportJobDXF({ profiles: [{ ...withCircle, radius: 4 }] }),
    /metadata does not match/);
});

test('Inventor-style DXF owns its POLYLINE vertices and uses layer 0', () => {
  const withCircle = { ...bore, kind: 'circle', center: { x: 0, y: 0 }, radius: 5 };
  const dxf = exportJobDXF({ profiles: [withCircle, outer] }).replace(/\r\n?/g, '\n');
  const lines = dxf.trimEnd().split('\n');
  assert.equal(lines.length % 2, 0);
  const records = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (lines[i] === '0') records.push({ type: lines[i + 1], fields: new Map() });
    else records.at(-1).fields.set(lines[i], lines[i + 1]);
  }
  const field = (r, group) => r.fields.get(group);
  const layerNames = new Set(records.filter(r => r.type === 'LAYER').map(r => field(r, '2')));
  assert.deepEqual(layerNames, new Set(['0', 'Defpoints']));
  const model = records.find(r => r.type === 'BLOCK_RECORD' && field(r, '2') === '*Model_Space');
  assert.ok(model);
  assert.ok(records.some(r => r.type === 'BLOCK' && field(r, '330') === field(model, '5')));
  const entities = records.filter(r => ['CIRCLE', 'POLYLINE'].includes(r.type));
  assert.deepEqual(entities.map(r => r.type), ['CIRCLE', 'POLYLINE']);
  for (const entity of entities) {
    assert.ok(layerNames.has(field(entity, '8')));
    assert.equal(field(entity, '330'), field(model, '5'));
  }
  const polyline = entities.find(r => r.type === 'POLYLINE');
  const owned = records.filter(r => ['VERTEX', 'SEQEND'].includes(r.type));
  assert.equal(owned.length, square.length + 1);
  assert.ok(owned.every(r => field(r, '330') === field(polyline, '5')));
  const handles = records.map(r => field(r, '5')).filter(Boolean);
  assert.equal(new Set(handles).size, handles.length);
  assert.match(dxf, /\$ACADVER\n1\nAC1032\n/);
  assert.match(dxf, /\$HANDSEED\n5\n[0-9A-F]+\n/);
  const guid = (document, key) => document.match(new RegExp(`\\${key}\\n2\\n(\\{[0-9A-F-]+\\})\\n`))?.[1];
  const second = exportJobDXF({ profiles: [withCircle, outer] }).replace(/\r\n?/g, '\n');
  for (const key of ['$FINGERPRINTGUID', '$VERSIONGUID']) {
    assert.match(guid(dxf, key), /^\{[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\}$/);
    assert.notEqual(guid(dxf, key), guid(second, key));
  }
  assert.equal(records.at(-1).type, 'EOF');
});
