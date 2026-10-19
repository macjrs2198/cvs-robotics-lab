import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDXF } from './dxf.js';
import { exportDXF } from './engine.js';
import { buildPair } from './gear.js';

function document(entities, unit = 4) {
  return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(unit),
    '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities,
    '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
}

const edge = (ax, ay, bx, by, layer = 'CUT') => ['0', 'LINE', '8', layer,
  '10', String(ax), '20', String(ay), '11', String(bx), '21', String(by)];
const arc = (x, y, radius, start, end, layer = 'CUT') => ['0', 'ARC', '8', layer,
  '10', String(x), '20', String(y), '40', String(radius), '50', String(start), '51', String(end)];

test('imports the supplied 11-spline cutting board as one closed millimeter contour', () => {
  const result = parseDXF(readFileSync(new URL('./fixtures/cutting-board-splines.dxf', import.meta.url), 'utf8'));
  assert.equal(result.sourceUnits, 'mm');
  assert.equal(result.profiles.length, 1);
  const { points, sourceEntity, closed } = result.profiles[0];
  assert.equal(sourceEntity, 'SPLINE'); assert.equal(closed, true);
  assert.deepEqual(points[0], points.at(-1));
  assert.ok(points.length > 200 && points.length <= 6001);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 263.8032512) < 0.02);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 628.3844) < 0.02);
  assert.ok(points.some(p => Math.abs(p.x - 58.7639928) < 1e-6 && Math.abs(p.y + 151.7366234) < 1e-6));
});

test('spline segments join other entity types and validate every control Z coordinate', () => {
  const curve = ['0', 'SPLINE', '8', 'CUT', '70', '4', '71', '2', '72', '6', '73', '3',
    ...[0, 0, 0, 1, 1, 1].flatMap(k => ['40', String(k)]),
    ...[1, Math.SQRT1_2, 1].flatMap(w => ['41', String(w)]),
    '10', '10', '20', '0', '30', '0', '10', '10', '20', '10', '30', '0', '10', '0', '20', '10', '30', '0'];
  const lines = edge(0, 10, 10, 0);
  const result = parseDXF(document([...curve, ...lines]));
  assert.equal(result.profiles.length, 1);
  assert.match(result.profiles[0].sourceEntity, /SPLINE/);
  assert.match(result.profiles[0].sourceEntity, /LINE/);
  assert.throws(() => parseDXF(document(curve)), /is open/);
  const nonplanar = [...curve]; nonplanar[nonplanar.length - 1] = '1';
  assert.throws(() => parseDXF(document([...nonplanar, ...lines])), /not flat/);
  const periodic = [...curve]; periodic[5] = '6';
  assert.throws(() => parseDXF(document([...periodic, ...lines])), /periodic/);
  const falseClosed = [...curve]; falseClosed[5] = '5';
  assert.throws(() => parseDXF(document([...falseClosed, ...lines])), /endpoints do not meet/);
  const missingY = curve.slice(0, -4).concat(curve.slice(-2));
  assert.throws(() => parseDXF(document([...missingY, ...lines])), /incomplete|mismatched/);
});

test('imports a non-gear part with shuffled, reversed lines and wrapped semicircle arcs in inches', () => {
  const result = parseDXF(readFileSync(new URL('./fixtures/rounded-slot-inches.dxf', import.meta.url), 'utf8'));
  assert.equal(result.sourceUnits, 'in');
  assert.equal(result.profiles.length, 2);
  const [slot, hole] = result.profiles;
  assert.equal(slot.layer, 'OUTLINE');
  assert.match(slot.sourceEntity, /ARC/);
  assert.deepEqual(slot.points[0], slot.points.at(-1));
  assert.ok(slot.points.length > 60, 'arcs retain their curves instead of becoming chords');
  const xs = slot.points.map(p => p.x), ys = slot.points.map(p => p.y);
  assert.ok(Math.abs(Math.min(...xs)) < 0.02);
  assert.ok(Math.abs(Math.max(...xs) - 101.6) < 0.02);
  assert.ok(Math.abs(Math.max(...ys) - 50.8) < 1e-8);
  assert.equal(hole.radius, 6.35);
  for (let i = 1; i < slot.points.length; i++) {
    const [a, b] = [slot.points[i - 1], slot.points[i]];
    if (Math.abs(a.y - b.y) < 1e-10) continue;
    const centerX = (a.x + b.x) / 2 < 50.8 ? 25.4 : 76.2;
    const radiusAtMidpoint = Math.hypot((a.x + b.x) / 2 - centerX, (a.y + b.y) / 2 - 25.4);
    assert.ok(25.4 - radiusAtMidpoint <= 0.020001, 'arc chord deviation stays within 0.02 mm');
  }
});

test('joins open polylines with arcs without closing each segment across the part', () => {
  const poly = ['0', 'LWPOLYLINE', '8', 'CUT', '90', '2', '70', '0',
    '10', '0', '20', '-10', '10', '0', '20', '10'];
  const result = parseDXF(document([...poly, ...arc(0, 0, 10, 270, 90)]));
  assert.equal(result.profiles.length, 1);
  assert.ok(result.profiles[0].points.some(p => p.x > 9.9));
  assert.ok(result.profiles[0].points.every(p => p.x >= -1e-8));
  const circle = ['0', 'LWPOLYLINE', '90', '2', '70', '1',
    '10', '-10', '20', '0', '42', '1', '10', '10', '20', '0', '42', '1'];
  const { points } = parseDXF(document(circle)).profiles[0];
  assert.ok(points.length > 40);
  assert.ok(points.every(p => Math.abs(Math.hypot(p.x, p.y) - 10) < 1e-8));
});

test('arcs must close unambiguously on their own layer and cannot bridge real gaps', () => {
  assert.throws(() => parseDXF(document(arc(0, 0, 10, 0, 180))), /is open/);
  assert.throws(() => parseDXF(document([...arc(0, 0, 10, 0, 180),
    ...edge(-10, 0, 10.01, 0)])), /is open/);
  assert.throws(() => parseDXF(document([...arc(0, 0, 10, 0, 180),
    ...edge(-10, 0, 10, 0, 'OTHER')])), /is open/);
  assert.throws(() => parseDXF(document([...arc(0, 0, 10, 0, 180),
    ...edge(-10, 0, 10, 0), ...edge(-10, 0, 10, 0)])), /branched/);
  assert.throws(() => parseDXF(document(arc(0, 0, -1, 0, 180))), /radius must be positive/);
  assert.throws(() => parseDXF(document(arc(0, 0, 10, 0, 360))), /use CIRCLE/);
  assert.throws(() => parseDXF(document([...arc(0, 0, 10, 0, 180), '30', '1'])), /not flat/);
  assert.throws(() => parseDXF(document(arc(0, 0, 1e12, 0, 180))), /too many vertices/);
});

test('two standalone semicircle arcs form a closed circular contour', () => {
  const { points } = parseDXF(document([...arc(3, 4, 10, 0, 180),
    ...arc(3, 4, 10, 180, 360)])).profiles[0];
  assert.deepEqual(points[0], points.at(-1));
  assert.ok(points.every(p => Math.abs(Math.hypot(p.x - 3, p.y - 4) - 10) < 1e-8));
});

test('annotation omission requires an explicit option and reports every skipped type', () => {
  const circle = ['0', 'CIRCLE', '10', '0', '20', '0', '40', '10'];
  const notes = ['0', 'TEXT', '1', 'PART A', '0', 'DIMENSION', '1', '20', '0', 'TEXT', '1', 'NOTE'];
  assert.throws(() => parseDXF(document([...circle, ...notes])), /Skip text and dimensions/);
  const result = parseDXF(document([...circle, ...notes]), { ignoreAnnotations: true });
  assert.equal(result.profiles.length, 1);
  assert.deepEqual(result.ignoredEntities, [{ type: 'TEXT', count: 2 }, { type: 'DIMENSION', count: 1 }]);
  assert.throws(() => parseDXF(document(notes), { ignoreAnnotations: true }), /No closed 2D profiles/);
  assert.throws(() => parseDXF(document([...circle, '0', 'ELLIPSE']),
    { ignoreAnnotations: true }), /Unsupported DXF entities: ELLIPSE/);
});

test('imports gear DXF and centered bore exported by the CAM engine', () => {
  const gear = buildPair({ pinionTeeth: 10, gearTeeth: 30,
    pressureAngleDeg: 20, centerDistance: 7, pinionSafety: 1.1, gearSafety: 1.1 }).gear;
  for (const unit of ['mm', 'in']) {
    const dxf = exportDXF({ outline: gear.points, boreDiameter: 12, unit });
    const result = parseDXF(dxf);
    assert.equal(result.sourceUnits, unit);
    assert.equal(result.profiles.length, 2);
    const [outside, bore] = result.profiles;
    assert.equal(outside.layer, '0');
    assert.equal(outside.sourceEntity, 'POLYLINE');
    assert.equal(outside.points.length, gear.points.length);
    assert.equal(outside.closed, true);
    // The exporter rounds to four decimal places in the selected units.
    assert.ok(Math.hypot(outside.points[20].x - gear.points[20].x,
      outside.points[20].y - gear.points[20].y) < (unit === 'in' ? 0.002 : 0.0001));
    assert.equal(bore.kind, 'circle');
    assert.equal(bore.layer, '0');
    assert.ok(Math.abs(bore.radius - 6) < (unit === 'in' ? 0.002 : 0.0001));
    assert.deepEqual(bore.center, { x: 0, y: 0 });
    assert.deepEqual(bore.points[0], bore.points.at(-1));
  }
});

test('imports closed legacy POLYLINE with VERTEX bulge and rejects incomplete sequences', () => {
  const vertex = (x, y, bulge = 0) => ['0', 'VERTEX', '10', String(x), '20', String(y), '30', '0',
    ...(bulge ? ['42', String(bulge)] : [])];
  const header = ['0', 'POLYLINE', '8', '0', '66', '1', '70', '1',
    '10', '0', '20', '0', '30', '0'];
  const data = [...header, ...vertex(0, 0, 1), ...vertex(10, 0), ...vertex(5, -5), '0', 'SEQEND'];
  const { profiles } = parseDXF(document(data));
  assert.equal(profiles[0].sourceEntity, 'POLYLINE');
  assert.ok(profiles[0].points.length > 10);
  assert.deepEqual(profiles[0].points[0], profiles[0].points.at(-1));
  assert.throws(() => parseDXF(document(data.slice(0, -2))), /missing SEQEND/);
  assert.throws(() => parseDXF(document(['0', 'VERTEX', '10', '0', '20', '0'])), /without a preceding POLYLINE/);
  assert.throws(() => parseDXF(document([...header.slice(0, 6), '70', '8', ...header.slice(8),
    ...vertex(0, 0), ...vertex(10, 0), ...vertex(0, 10), '0', 'SEQEND'])), /mesh, 3D/);
});

test('stitches shuffled LibreCAD LINE entities into a closed loop in inches', () => {
  const edge = (ax, ay, bx, by) => ['0', 'LINE', '8', 'CUT',
    '10', String(ax), '20', String(ay), '11', String(bx), '21', String(by)];
  const dxf = document([
    ...edge(1, 1, 0, 1), ...edge(0, 0, 1, 0),
    ...edge(0, 1, 0, 0), ...edge(1, 0, 1, 1),
  ], 1);
  const result = parseDXF(dxf);
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].sourceEntity, 'LINE');
  assert.equal(result.profiles[0].layer, 'CUT');
  assert.equal(result.profiles[0].points.length, 5);
  assert.deepEqual(result.profiles[0].points[0], result.profiles[0].points.at(-1));
  assert.ok(result.profiles[0].points.some((p) => p.x === 25.4 && p.y === 25.4));
});

test('samples bulge arcs and preserves separate closed profiles', () => {
  const entities = [
    '0', 'LWPOLYLINE', '8', 'arc-profile', '90', '3', '70', '1',
    '10', '0', '20', '0', '42', '1', '10', '10', '20', '0',
    '10', '5', '20', '-5',
    '0', 'CIRCLE', '8', 'hole', '10', '5', '20', '5', '40', '1',
  ];
  const { profiles } = parseDXF(document(entities));
  assert.equal(profiles.length, 2);
  assert.ok(profiles[0].points.length > 10);
  assert.deepEqual(profiles[0].points[0], profiles[0].points.at(-1));
  assert.equal(profiles[1].radius, 1);
});

test('reports unsupported, open, branched, nonplanar, and ambiguous-unit drawings', () => {
  assert.throws(() => parseDXF(document(['0', 'ELLIPSE', '8', '0'])), /Unsupported DXF entities: ELLIPSE/);
  const openPoly = ['0', 'LWPOLYLINE', '90', '3', '70', '0',
    '10', '0', '20', '0', '10', '1', '20', '0', '10', '1', '20', '1'];
  assert.throws(() => parseDXF(document(openPoly)), /is open/);
  const openLines = ['0', 'LINE', '10', '0', '20', '0', '11', '1', '21', '0'];
  assert.throws(() => parseDXF(document(openLines)), /is open/);
  assert.throws(() => parseDXF(document(['0', 'CIRCLE', '10', '0', '20', '0',
    '30', '5', '40', '1'])), /not flat/);
  assert.throws(() => parseDXF(document(['0', 'CIRCLE', '10', '0', '20', '0',
    '40', '1'], 0)), /confirm the drawing units/);
  assert.equal(parseDXF(document(['0', 'CIRCLE', '10', '0', '20', '0',
    '40', '1'], 0), { unitOverride: 'mm' }).profiles.length, 1);
});
