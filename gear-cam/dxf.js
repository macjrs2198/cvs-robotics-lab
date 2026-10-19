/** Import closed 2D DXF profiles as millimeter point arrays for CAM. */
import { flattenSpline } from './spline.js';

const MM_PER_INCH = 25.4;
const MAX_PROFILES = 100;
const MAX_POINTS = 6000;
// Legacy POLYLINE uses one VERTEX entity for every point, so the raw entity
// count can exceed the profile count by thousands even in a small drawing.
const MAX_ENTITIES = 200000;
const TOLERANCE_MM = 0.02;
const JOIN_TOLERANCE_MM = 0.0001;
const ANNOTATIONS = new Set(['TEXT', 'MTEXT', 'DIMENSION', 'LEADER', 'MULTILEADER']);

function number(value, description) {
  if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value))) {
    throw new Error(`DXF ${description} is missing or invalid.`);
  }
  return Number(value);
}

function first(groups, code, fallback) {
  return groups.find((g) => g.code === code)?.value ?? fallback;
}

function planar(groups, type) {
  for (const [code, expected] of [[30, 0], [38, 0], [39, 0], [210, 0], [220, 0], [230, 1]]) {
    const value = first(groups, code);
    if (value != null && Math.abs(number(value, `${type} coordinate ${code}`) - expected) > 1e-9) {
      throw new Error(`DXF ${type} is not flat in the XY plane (group ${code}).`);
    }
  }
}

function pointDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function arcPoints(a, b, bulge, tolerance = TOLERANCE_MM) {
  if (Math.abs(bulge) < 1e-12) return [{ x: b.x, y: b.y }];
  const dx = b.x - a.x, dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-6) throw new Error('DXF bulge arc has identical endpoints.');
  const centerOffset = chord * (1 - bulge * bulge) / (4 * bulge);
  const center = { x: (a.x + b.x) / 2 - dy / chord * centerOffset,
    y: (a.y + b.y) / 2 + dx / chord * centerOffset };
  const radius = pointDistance(a, center);
  const sweep = 4 * Math.atan(bulge);
  const maxStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)));
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / maxStep));
  if (steps > MAX_POINTS) throw new Error('DXF bulge arc needs too many vertices; simplify the drawing.');
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  const result = [];
  for (let i = 1; i < steps; i++) {
    const angle = start + sweep * i / steps;
    result.push({ x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle) });
  }
  result.push({ x: b.x, y: b.y });
  return result;
}

function close(points, description) {
  const distinct = pointDistance(points[0], points.at(-1)) <= 1e-6 ? points.length - 1 : points.length;
  if (distinct < 3 || distinct > MAX_POINTS) {
    throw new Error(`DXF ${description} must have 3 to ${MAX_POINTS} vertices.`);
  }
  if (pointDistance(points[0], points.at(-1)) > 1e-6) points.push({ ...points[0] });
  return points;
}

function samplePolyline(vertices, layer, flags, type, id) {
  const coincident = vertices.length >= 2 && pointDistance(vertices[0], vertices.at(-1)) < 1e-6;
  const closed = Boolean(flags & 1) || coincident;
  if (coincident) vertices.pop();
  if (vertices.length < 2) throw new Error(`DXF ${type} needs at least two distinct vertices.`);
  let points = [{ x: vertices[0].x, y: vertices[0].y }];
  for (let i = 0; i < vertices.length - (closed ? 0 : 1); i++) {
    const v = vertices[i], next = vertices[(i + 1) % vertices.length];
    points.push(...arcPoints(v, next, v.bulge));
    if (points.length > MAX_POINTS + 1) throw new Error('DXF profile exceeds the vertex limit.');
  }
  if (closed) points = close(points, type);
  return { id, layer, kind: 'polyline', sourceEntity: type, closed, points };
}

function polyline(groups, scale, id) {
  planar(groups, 'LWPOLYLINE');
  const layer = first(groups, 8, '0');
  const flags = number(first(groups, 70, '0'), 'LWPOLYLINE flags');
  const declared = number(first(groups, 90), 'LWPOLYLINE vertex count');
  const vertices = [];
  let current;
  for (const { code, value } of groups) {
    if (code === 10) {
      current = { x: number(value, 'LWPOLYLINE X') * scale, y: null, bulge: 0 };
      vertices.push(current);
    } else if (code === 20 && current) current.y = number(value, 'LWPOLYLINE Y') * scale;
    else if (code === 42 && current) current.bulge = number(value, 'LWPOLYLINE bulge');
    else if ([40, 41, 43].includes(code) && Math.abs(number(value, 'LWPOLYLINE width')) > 1e-12) {
      throw new Error('DXF LWPOLYLINE has nonzero width; convert it to a closed centerline profile first.');
    }
  }
  if (vertices.length !== declared || vertices.some((v) => v.y == null)) {
    throw new Error('DXF LWPOLYLINE has incomplete or mismatched XY vertices.');
  }
  return samplePolyline(vertices, layer, flags, 'LWPOLYLINE', id);
}

function legacyPolyline(header, vertexEntities, scale, id) {
  planar(header.groups, 'POLYLINE');
  const layer = first(header.groups, 8, '0');
  const flags = number(first(header.groups, 70, '0'), 'POLYLINE flags');
  if (flags & ~129) {
    throw new Error('DXF POLYLINE is a mesh, 3D, or curve-fit entity; only closed 2D profiles are supported.');
  }
  const vertices = vertexEntities.map(entity => {
    planar(entity.groups, 'VERTEX');
    if (number(first(entity.groups, 70, '0'), 'VERTEX flags') !== 0) {
      throw new Error('DXF POLYLINE contains curve-fit, mesh, or 3D vertices; convert it to a closed 2D profile.');
    }
    for (const code of [40, 41]) {
      const value = first(entity.groups, code);
      if (value != null && Math.abs(number(value, 'VERTEX width')) > 1e-12) {
        throw new Error('DXF POLYLINE has nonzero width; convert it to a closed centerline profile first.');
      }
    }
    return {
      x: number(first(entity.groups, 10), 'VERTEX X') * scale,
      y: number(first(entity.groups, 20), 'VERTEX Y') * scale,
      bulge: number(first(entity.groups, 42, '0'), 'VERTEX bulge'),
    };
  });
  return samplePolyline(vertices, layer, flags, 'POLYLINE', id);
}

function circle(groups, scale, id) {
  planar(groups, 'CIRCLE');
  const center = { x: number(first(groups, 10), 'CIRCLE center X') * scale,
    y: number(first(groups, 20), 'CIRCLE center Y') * scale };
  const radius = number(first(groups, 40), 'CIRCLE radius') * scale;
  if (radius <= 0) throw new Error('DXF CIRCLE radius must be positive.');
  const angularStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - TOLERANCE_MM / radius)));
  const segments = Math.max(48, Math.ceil(2 * Math.PI / angularStep));
  if (segments > MAX_POINTS) throw new Error('DXF circle is too large to sample at the required accuracy.');
  const points = Array.from({ length: segments }, (_, i) => ({
    x: center.x + radius * Math.cos(2 * Math.PI * i / segments),
    y: center.y + radius * Math.sin(2 * Math.PI * i / segments),
  }));
  return { id, layer: first(groups, 8, '0'), kind: 'circle', sourceEntity: 'CIRCLE',
    closed: true, center, radius, points: close(points, 'CIRCLE') };
}

function line(groups, scale, order) {
  planar(groups, 'LINE');
  const endZ = first(groups, 31);
  if (endZ != null && Math.abs(number(endZ, 'LINE end Z')) > 1e-9) {
    throw new Error('DXF LINE is not flat in the XY plane (group 31).');
  }
  const start = { x: number(first(groups, 10), 'LINE start X') * scale,
    y: number(first(groups, 20), 'LINE start Y') * scale };
  const end = { x: number(first(groups, 11), 'LINE end X') * scale,
    y: number(first(groups, 21), 'LINE end Y') * scale };
  if (pointDistance(start, end) < 1e-5) throw new Error('DXF LINE is too short to cut.');
  return { points: [start, end], layer: first(groups, 8, '0'), sourceEntity: 'LINE', order };
}

function arc(groups, scale, order) {
  planar(groups, 'ARC');
  const center = { x: number(first(groups, 10), 'ARC center X') * scale,
    y: number(first(groups, 20), 'ARC center Y') * scale };
  const radius = number(first(groups, 40), 'ARC radius') * scale;
  if (radius <= 0) throw new Error('DXF ARC radius must be positive.');
  const start = number(first(groups, 50), 'ARC start angle') * Math.PI / 180;
  const end = number(first(groups, 51), 'ARC end angle') * Math.PI / 180;
  const sweep = ((end - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (sweep < 1e-12) throw new Error('DXF ARC has equal start and end angles; use CIRCLE for a full circle.');
  const maxStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - TOLERANCE_MM / radius)));
  const count = Math.max(2, Math.ceil(sweep / maxStep));
  if (count > MAX_POINTS) throw new Error('DXF arc needs too many vertices; simplify the drawing.');
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const angle = start + sweep * i / count;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
  return { points, layer: first(groups, 8, '0'), sourceEntity: 'ARC', order };
}

function spline(groups, scale) {
  planar(groups, 'SPLINE');
  const values = code => groups.filter(g => g.code === code).map(g => number(g.value, `SPLINE group ${code}`));
  for (const code of [30, 31, 32, 33]) {
    if (values(code).some(z => Math.abs(z) > 1e-9)) throw new Error('DXF SPLINE is not flat in the XY plane.');
  }
  const flags = number(first(groups, 70, '0'), 'SPLINE flags');
  if (!Number.isInteger(flags) || flags < 0 || flags > 31) throw new Error('DXF SPLINE flags are invalid.');
  if (flags & 2) throw new Error('DXF SPLINE is periodic; export it as a closed 2D polyline.');
  const xs = values(10), ys = values(20), zs = values(30), knots = values(40), weights = values(41);
  if (xs.length !== number(first(groups, 73), 'SPLINE control count') || ys.length !== xs.length ||
      (zs.length && zs.length !== xs.length) || knots.length !== number(first(groups, 72), 'SPLINE knot count')) {
    throw new Error('DXF SPLINE has incomplete or mismatched control points or knots.');
  }
  const points = flattenSpline({ degree: number(first(groups, 71), 'SPLINE degree'), knots, weights,
    controlPoints: xs.map((x, i) => ({ x: x * scale, y: ys[i] * scale })), tolerance: TOLERANCE_MM, maxPoints: MAX_POINTS });
  const closed = pointDistance(points[0], points.at(-1)) <= JOIN_TOLERANCE_MM;
  if (flags & 1 && !closed) throw new Error('DXF SPLINE is marked closed but its endpoints do not meet; re-export a closed contour.');
  if (closed) { points[points.length - 1] = { ...points[0] }; close(points, 'SPLINE'); }
  return { layer: first(groups, 8, '0'), kind: 'polyline', sourceEntity: 'SPLINE', closed, points };
}

// Join entire sampled segments, including reversed curves. Never replace an arc
// with its chord or bridge a gap beyond the endpoint matching tolerance.
function stitchSegments(segmentsToJoin) {
  const byLayer = new Map();
  for (const segment of segmentsToJoin) {
    if (!byLayer.has(segment.layer)) byLayer.set(segment.layer, []);
    byLayer.get(segment.layer).push(segment);
  }
  const loops = [];
  for (const [layer, segments] of byLayer) {
    const description = [...new Set(segments.map(s => s.sourceEntity))].join('/');
    const nodes = [], buckets = new Map(), edges = [];
    function nodeFor(point) {
      const x = Math.round(point.x / JOIN_TOLERANCE_MM);
      const y = Math.round(point.y / JOIN_TOLERANCE_MM);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const id of buckets.get(`${x + dx},${y + dy}`) ?? []) {
          if (pointDistance(nodes[id].point, point) <= JOIN_TOLERANCE_MM) return id;
        }
      }
      const id = nodes.length;
      nodes.push({ point, edges: [] });
      const key = `${x},${y}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(id);
      return id;
    }
    for (const segment of segments) {
      const a = nodeFor(segment.points[0]), b = nodeFor(segment.points.at(-1));
      if (a === b) throw new Error(`DXF ${description} on layer "${layer}" collapses at its endpoints.`);
      const id = edges.length;
      edges.push({ a, b, order: segment.order, points: segment.points, sourceEntity: segment.sourceEntity });
      nodes[a].edges.push(id); nodes[b].edges.push(id);
    }
    for (const node of nodes) {
      if (node.edges.length !== 2) {
        throw new Error(`DXF ${description} path on layer "${layer}" is ${node.edges.length < 2 ? 'open' : 'branched'} near ` +
          `(${node.point.x.toFixed(3)}, ${node.point.y.toFixed(3)}) mm. Make separate closed contours.`);
      }
    }
    const visited = new Set();
    for (let initial = 0; initial < edges.length; initial++) {
      if (visited.has(initial)) continue;
      const startNode = edges[initial].a;
      let current = startNode, edgeId = initial;
      const points = [{ ...nodes[startNode].point }];
      const types = new Set();
      let firstOrder = Infinity;
      do {
        if (visited.has(edgeId)) throw new Error(`DXF ${description} path on layer "${layer}" is ambiguous.`);
        visited.add(edgeId);
        const edge = edges[edgeId];
        firstOrder = Math.min(firstOrder, edge.order);
        types.add(edge.sourceEntity);
        const forward = edge.a === current;
        const sampled = forward ? edge.points : [...edge.points].reverse();
        for (const point of sampled.slice(1, -1)) points.push({ ...point });
        current = forward ? edge.b : edge.a;
        points.push({ ...nodes[current].point });
        if (points.length > MAX_POINTS + 1) throw new Error('DXF joined contour exceeds the vertex limit.');
        if (current === startNode) break;
        edgeId = nodes[current].edges.find((id) => !visited.has(id));
        if (edgeId == null) throw new Error(`DXF ${description} path on layer "${layer}" is open.`);
      } while (true);
      loops.push({ order: firstOrder, layer, kind: 'polyline', sourceEntity: [...types].join('/'),
        closed: true, points: close(points, 'joined contour') });
    }
  }
  return loops;
}

function groupsFromText(text) {
  if (typeof text !== 'string' || text.length > 10_000_000) throw new Error('DXF must be text and under 10 MB.');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.at(-1) === '') lines.pop();
  if (lines.length % 2 !== 0) throw new Error('DXF has an incomplete group code/value pair.');
  const groups = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\s*\d+\s*$/.test(lines[i])) throw new Error(`DXF group code is invalid near line ${i + 1}.`);
    groups.push({ code: Number(lines[i]), value: lines[i + 1].trim() });
  }
  return groups;
}

/**
 * Read closed profiles and join LINE, ARC, SPLINE, and open 2D polylines on each layer.
 * `$INSUNITS` 1 (inches) and 4 (mm) are supported. For unitless files, pass
 * `{ unitOverride: 'mm' }` or `'in'` after confirming the drawing's units.
 */
export function parseDXF(text, { unitOverride, ignoreAnnotations = false } = {}) {
  const groups = groupsFromText(text);
  let section = '', headerVariable = '', insUnits = null;
  const entities = [];
  let entity = null;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.code === 0 && group.value.toUpperCase() === 'SECTION') {
      if (groups[i + 1]?.code !== 2) throw new Error('DXF section name is missing.');
      section = groups[++i].value.toUpperCase();
      entity = null;
      continue;
    }
    if (group.code === 0 && group.value.toUpperCase() === 'ENDSEC') {
      if (section === 'ENTITIES' && entity) entities.push(entity);
      entity = null; section = '';
      continue;
    }
    if (section === 'HEADER') {
      if (group.code === 9) headerVariable = group.value.toUpperCase();
      else if (headerVariable === '$INSUNITS' && group.code === 70) insUnits = number(group.value, '$INSUNITS');
    }
    if (section === 'ENTITIES') {
      if (group.code === 0) {
        if (entity) entities.push(entity);
        entity = { type: group.value.toUpperCase(), groups: [] };
      } else if (entity) entity.groups.push(group);
    }
  }
  if (section === 'ENTITIES' && entity) entities.push(entity);
  if (!entities.length) throw new Error('DXF has no drawing entities to cut.');
  if (entities.length > MAX_ENTITIES) throw new Error(`DXF exceeds ${MAX_ENTITIES} drawing entities; simplify it.`);
  const ignoredEntities = [];
  const cutEntities = entities.filter(entity => {
    if (!ignoreAnnotations || !ANNOTATIONS.has(entity.type)) return true;
    const entry = ignoredEntities.find(item => item.type === entity.type);
    if (entry) entry.count++;
    else ignoredEntities.push({ type: entity.type, count: 1 });
    return false;
  });
  const unsupported = [...new Set(cutEntities.map((e) => e.type)
    .filter((type) => !['LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'CIRCLE', 'LINE', 'ARC', 'SPLINE'].includes(type)))];
  if (unsupported.length) {
    const advice = unsupported.every(type => ANNOTATIONS.has(type))
      ? 'Enable "Skip text and dimensions" to leave these notes out of the cut.'
      : 'In CAD, explode blocks and convert unsupported curves to 2D polylines. Supported contours use LINE, ARC, SPLINE, POLYLINE, LWPOLYLINE, or CIRCLE.';
    throw new Error(`Unsupported DXF entities: ${unsupported.join(', ')}. ${advice}`);
  }
  if (unitOverride != null && !['mm', 'in'].includes(unitOverride)) {
    throw new Error('DXF unit override must be mm or in.');
  }
  let sourceUnits;
  if (insUnits === 4) sourceUnits = 'mm';
  else if (insUnits === 1) sourceUnits = 'in';
  else if (unitOverride) sourceUnits = unitOverride;
  else throw new Error(`DXF $INSUNITS is ${insUnits ?? 'missing'}; confirm the drawing units and choose mm or in.`);
  const scale = sourceUnits === 'in' ? MM_PER_INCH : 1;
  const segments = [];
  const indexed = [];
  function addProfile(profile, order) {
    if (profile.closed) indexed.push({ order, ...profile });
    else segments.push({ ...profile, order });
  }
  for (let index = 0; index < cutEntities.length; index++) {
    const entity = cutEntities[index];
    if (entity.type === 'LINE') segments.push(line(entity.groups, scale, index));
    else if (entity.type === 'ARC') segments.push(arc(entity.groups, scale, index));
    else if (entity.type === 'SPLINE') addProfile(spline(entity.groups, scale), index);
    else if (entity.type === 'POLYLINE') {
      const vertexEntities = [];
      let cursor = index + 1;
      while (cutEntities[cursor]?.type === 'VERTEX') vertexEntities.push(cutEntities[cursor++]);
      if (cutEntities[cursor]?.type !== 'SEQEND') {
        throw new Error('DXF POLYLINE is missing SEQEND after its vertices.');
      }
      addProfile(legacyPolyline(entity, vertexEntities, scale, ''), index);
      index = cursor;
    } else if (entity.type === 'VERTEX' || entity.type === 'SEQEND') {
      throw new Error(`DXF ${entity.type} appears without a preceding POLYLINE.`);
    }
    else addProfile(entity.type === 'LWPOLYLINE' ?
      polyline(entity.groups, scale, '') : circle(entity.groups, scale, ''), index);
  }
  indexed.push(...stitchSegments(segments));
  indexed.sort((a, b) => a.order - b.order);
  if (indexed.length > MAX_PROFILES) throw new Error(`DXF exceeds ${MAX_PROFILES} closed profiles; simplify it.`);
  const profiles = indexed.map(({ order, ...profile }, index) => ({ ...profile, id: `profile-${index + 1}` }));
  if (!profiles.length) throw new Error('No closed 2D profiles found in this DXF. Export the part outlines from a sketch.');
  return { units: 'mm', sourceUnits, profiles, ignoredEntities };
}
