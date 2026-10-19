/** Flatten clamped, positive-weight 2D B-splines without changing their shape first.
 * Internal knots are raised to degree multiplicity (Boehm knot insertion), then
 * rational Bezier pieces are split using homogeneous de Casteljau subdivision.
 * A piece is replaced by a chord only when its entire projected control hull
 * lies within tolerance of the chord. Positive weights make that a curve bound.
 */

function blend(a, b, alpha) {
  return { x: (1 - alpha) * a.x + alpha * b.x,
    y: (1 - alpha) * a.y + alpha * b.y, w: (1 - alpha) * a.w + alpha * b.w };
}

function project(point) {
  const p = { x: point.x / point.w, y: point.y / point.w };
  if (!(point.w > 0) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new Error('DXF SPLINE weights are numerically unstable; export it as a 2D polyline.');
  }
  return p;
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

export function flattenSpline({ degree, knots, controlPoints, weights = [],
  tolerance = 0.02, maxPoints = 6000 }) {
  if (!Number.isInteger(degree) || degree < 1 || degree > 8) {
    throw new Error('DXF SPLINE degree must be 1 to 8; export other curves as 2D polylines.');
  }
  if (!Array.isArray(controlPoints) || controlPoints.length < degree + 1 || controlPoints.length > maxPoints) {
    throw new Error('DXF SPLINE needs a valid set of control points; export fit-only splines as 2D polylines.');
  }
  if (!Array.isArray(knots) || knots.length !== controlPoints.length + degree + 1 ||
      knots.some((u, i) => !Number.isFinite(u) || (i > 0 && u < knots[i - 1]))) {
    throw new Error('DXF SPLINE has invalid, unsorted, or mismatched knots.');
  }
  if (controlPoints.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y) ||
      Math.abs(p.x) > 10000 || Math.abs(p.y) > 10000)) {
    throw new Error('DXF SPLINE control coordinates must be finite and within +/-10000 mm.');
  }
  const start = knots[degree], end = knots[controlPoints.length];
  const range = end - start;
  if (!(range > 0) || !Number.isFinite(range) ||
      !knots.slice(0, degree + 1).every(u => u === start) ||
      !knots.slice(-degree - 1).every(u => u === end)) {
    throw new Error('DXF SPLINE must have clamped endpoints; export periodic or unclamped splines as 2D polylines.');
  }
  if (!Array.isArray(weights) || (weights.length && weights.length !== controlPoints.length) ||
      weights.some(w => !Number.isFinite(w) || w <= 0)) {
    throw new Error('DXF SPLINE needs one positive weight per control point, or no weights.');
  }
  if (!(Number.isFinite(tolerance) && tolerance > 0) || !Number.isInteger(maxPoints) || maxPoints < 3 || maxPoints > 6000) {
    throw new Error('DXF SPLINE sampling limits are invalid.');
  }
  let u = knots.map(k => (k - start) / range);
  const runs = [];
  for (const k of u.slice(degree + 1, -degree - 1)) {
    if (runs.at(-1)?.value === k) runs.at(-1).count++;
    else runs.push({ value: k, count: 1 });
  }
  if (runs.some(k => k.value <= 0 || k.value >= 1 || k.count > degree)) {
    throw new Error('DXF SPLINE has invalid or discontinuous internal knots; split or simplify it in CAD.');
  }
  const expandedCount = controlPoints.length + runs.reduce((sum, k) => sum + degree - k.count, 0);
  if (expandedCount > 6000) throw new Error('DXF SPLINE needs too many Bezier controls; simplify the drawing.');
  const w = weights.length ? weights : controlPoints.map(() => 1);
  const largest = Math.max(...w);
  let controls = controlPoints.map((p, i) => {
    const weight = w[i] / largest;
    if (!(weight > 0)) throw new Error('DXF SPLINE weight range is too large; export it as a 2D polyline.');
    return { x: p.x * weight, y: p.y * weight, w: weight };
  });
  for (const run of runs) {
    for (let multiplicity = run.count; multiplicity < degree; multiplicity++) {
      let span = degree;
      while (u[span + 1] <= run.value) span++;
      const n = controls.length - 1;
      const next = new Array(controls.length + 1);
      for (let i = 0; i <= span - degree; i++) next[i] = controls[i];
      for (let i = span - multiplicity; i <= n; i++) next[i + 1] = controls[i];
      for (let i = span - degree + 1; i <= span - multiplicity; i++) {
        const alpha = (run.value - u[i]) / (u[i + degree] - u[i]);
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
          throw new Error('DXF SPLINE knot refinement is unstable; export it as a 2D polyline.');
        }
        next[i] = blend(controls[i - 1], controls[i], alpha);
      }
      u = [...u.slice(0, span + 1), run.value, ...u.slice(span + 1)];
      controls = next;
    }
  }
  const points = [project(controls[0])];
  function sample(piece, depth = 0) {
    const projected = piece.map(project);
    const a = projected[0], b = projected.at(-1);
    if (projected.every(p => segmentDistance(p, a, b) <= tolerance)) {
      points.push(b);
      if (points.length > maxPoints + 1) throw new Error('DXF SPLINE exceeds the vertex limit; simplify the drawing.');
      return;
    }
    if (depth >= 24) throw new Error('DXF SPLINE cannot reach the curve tolerance; simplify the drawing.');
    let level = piece;
    const left = [level[0]], right = [level.at(-1)];
    while (level.length > 1) {
      level = level.slice(0, -1).map((point, i) => blend(point, level[i + 1], 0.5));
      left.push(level[0]); right.push(level.at(-1));
    }
    sample(left, depth + 1);
    sample(right.reverse(), depth + 1);
  }
  for (let i = 0; i < controls.length - 1; i += degree) sample(controls.slice(i, i + degree + 1));
  return points;
}
