import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDXF } from './dxf.js';
import { exportDXF } from './engine.js';
import { buildPair } from './gear.js';

function document(entities, unit = 4) {
  return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(unit),
    '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities,
    '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
}

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
  assert.throws(() => parseDXF(document(['0', 'SPLINE', '8', '0'])), /Unsupported DXF entities: SPLINE/);
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
