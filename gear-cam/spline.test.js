import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenSpline } from './spline.js';

const cubic = { degree: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1],
  controlPoints: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }] };

function distanceToPolyline(p, points) {
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)) : 0;
    distance = Math.min(distance, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return distance;
}

// Independent Cox-de Boor basis evaluation checks knot-refinement/subdivision
// results without sharing their control-point insertion algorithm.
function reference(spline, t) {
  const { knots: u, degree: p, controlPoints: cp } = spline;
  if (t === u[cp.length]) return cp.at(-1);
  let basis = u.slice(0, -1).map((k, i) => t >= k && t < u[i + 1] ? 1 : 0);
  for (let degree = 1; degree <= p; degree++) {
    basis = basis.slice(0, -1).map((v, i) => {
      const left = u[i + degree] - u[i], right = u[i + degree + 1] - u[i + 1];
      return (left ? (t - u[i]) * v / left : 0) + (right ? (u[i + degree + 1] - t) * basis[i + 1] / right : 0);
    });
  }
  const result = { x: 0, y: 0 }; let total = 0;
  cp.forEach((point, i) => {
    const coefficient = basis[i] * (spline.weights?.[i] ?? 1);
    result.x += coefficient * point.x; result.y += coefficient * point.y; total += coefficient;
  });
  return { x: result.x / total, y: result.y / total };
}

test('cubic spline flattening preserves endpoints and bounds analytic curve error', () => {
  const points = flattenSpline(cubic);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  assert.deepEqual(points.at(-1), { x: 10, y: 0 });
  assert.ok(points.length > 8);
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000;
    const p = { x: 30 * (1 - t) * t * t + 10 * t ** 3, y: 30 * (1 - t) * t };
    assert.ok(distanceToPolyline(p, points) <= 0.02000001);
  }
});

test('rational quadratic weights preserve a true quarter-circle and chord accuracy', () => {
  const spline = { degree: 2, knots: [0, 0, 0, 1, 1, 1],
    controlPoints: [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    weights: [1, Math.SQRT1_2, 1] };
  const points = flattenSpline(spline);
  for (const point of points) assert.ok(Math.abs(Math.hypot(point.x, point.y) - 10) < 1e-10);
  for (let i = 0; i <= 1000; i++) {
    const angle = Math.PI * i / 2000;
    assert.ok(distanceToPolyline({ x: 10 * Math.cos(angle), y: 10 * Math.sin(angle) }, points) <= 0.02000001);
  }
  const scaled = flattenSpline({ ...spline, weights: spline.weights.map(w => w * 1e100) });
  assert.equal(scaled.length, points.length);
  scaled.forEach((p, i) => assert.ok(Math.hypot(p.x - points[i].x, p.y - points[i].y) < 1e-10));
});

test('nonuniform, repeated knots agree with independent basis evaluation', () => {
  const spline = { degree: 3, knots: [0, 0, 0, 0, 0.2, 0.5, 0.5, 1, 1, 1, 1],
    controlPoints: [{ x: 0, y: 0 }, { x: 2, y: 8 }, { x: 4, y: -4 },
      { x: 6, y: 10 }, { x: 8, y: -6 }, { x: 10, y: 4 }, { x: 12, y: 0 }],
    weights: [1, 0.5, 1, 2, 0.7, 1, 1] };
  const points = flattenSpline(spline);
  for (let i = 0; i <= 4000; i++) assert.ok(distanceToPolyline(reference(spline, i / 4000), points) <= 0.02000001);
});

test('subdivision retains symmetric cubic bends whose midpoint falls on the chord', () => {
  const spline = { ...cubic, controlPoints: [{ x: 0, y: 0 }, { x: 0, y: 100 },
    { x: 100, y: -100 }, { x: 100, y: 0 }] };
  const points = flattenSpline(spline);
  assert.ok(Math.max(...points.map(p => p.y)) > 28);
  assert.ok(Math.min(...points.map(p => p.y)) < -28);
  for (let i = 0; i <= 1000; i++) assert.ok(distanceToPolyline(reference(spline, i / 1000), points) <= 0.02000001);
});

test('spline flattening rejects malformed, discontinuous, unstable, and excessive representations', () => {
  assert.throws(() => flattenSpline({ ...cubic, degree: 0 }), /degree/);
  assert.throws(() => flattenSpline({ ...cubic, controlPoints: cubic.controlPoints.slice(1) }), /control points/);
  assert.throws(() => flattenSpline({ ...cubic, knots: [0, 0, 0, 0, 1, 0.5, 1, 1] }), /unsorted/);
  assert.throws(() => flattenSpline({ ...cubic, knots: [-1, 0, 0, 0, 1, 1, 1, 2] }), /clamped/);
  for (const weights of [[1], [1, 0, 1, 1], [1, -1, 1, 1], [1, Infinity, 1, 1]]) {
    assert.throws(() => flattenSpline({ ...cubic, weights }), /positive weight/);
  }
  assert.throws(() => flattenSpline({ ...cubic, maxPoints: 4 }), /vertex limit/);
  assert.throws(() => flattenSpline({ ...cubic, controlPoints: [{ x: Infinity, y: 0 }, ...cubic.controlPoints.slice(1)] }), /coordinates/);
  const discontinuous = { degree: 2, knots: [0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1],
    controlPoints: Array.from({ length: 6 }, (_, i) => ({ x: i, y: i % 2 })) };
  assert.throws(() => flattenSpline(discontinuous), /discontinuous/);
});
