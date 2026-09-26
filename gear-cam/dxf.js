/** Import closed 2D DXF profiles as millimeter point arrays for CAM. */
const MM_PER_INCH = 25.4;
const MAX_PROFILES = 100;
const MAX_POINTS = 6000;
const MAX_ENTITIES = 20000;
const TOLERANCE_MM = 0.02;
const JOIN_TOLERANCE_MM = 0.0001;

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
  const coincident = vertices.length >= 2 && pointDistance(vertices[0], vertices.at(-1)) < 1e-6;
  if (!(flags & 1) && !coincident) throw new Error(`DXF LWPOLYLINE on layer "${layer}" is open; close it before cutting.`);
  if (coincident) vertices.pop();
  if (vertices.length < 3) throw new Error('DXF LWPOLYLINE needs at least three distinct vertices.');
  let points = [{ x: vertices[0].x, y: vertices[0].y }];
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i], next = vertices[(i + 1) % vertices.length];
    points.push(...arcPoints(v, next, v.bulge));
    if (points.length > MAX_POINTS + 1) throw new Error('DXF profile exceeds the vertex limit.');
  }
  points = close(points, 'LWPOLYLINE');
  return { id, layer, kind: 'polyline', sourceEntity: 'LWPOLYLINE', closed: true, points };
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
  return { start, end, layer: first(groups, 8, '0'), order };
}

function stitchLines(lines) {
  const byLayer = new Map();
  for (const segment of lines) {
    if (!byLayer.has(segment.layer)) byLayer.set(segment.layer, []);
    byLayer.get(segment.layer).push(segment);
  }
  const loops = [];
  for (const [layer, segments] of byLayer) {
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
      const a = nodeFor(segment.start), b = nodeFor(segment.end);
      if (a === b) throw new Error(`DXF LINE on layer "${layer}" collapses at its endpoints.`);
      const id = edges.length;
      edges.push({ a, b, order: segment.order });
      nodes[a].edges.push(id); nodes[b].edges.push(id);
    }
    for (const node of nodes) {
      if (node.edges.length !== 2) {
        throw new Error(`DXF LINE path on layer "${layer}" is ${node.edges.length < 2 ? 'open' : 'branched'} near ` +
          `(${node.point.x.toFixed(3)}, ${node.point.y.toFixed(3)}) mm. Make separate closed contours.`);
      }
    }
    const visited = new Set();
    for (let initial = 0; initial < edges.length; initial++) {
      if (visited.has(initial)) continue;
      const startNode = edges[initial].a;
      let current = startNode, edgeId = initial;
      const points = [{ ...nodes[startNode].point }];
      let firstOrder = Infinity;
      do {
        if (visited.has(edgeId)) throw new Error(`DXF LINE path on layer "${layer}" is ambiguous.`);
        visited.add(edgeId);
        const edge = edges[edgeId];
        firstOrder = Math.min(firstOrder, edge.order);
        current = edge.a === current ? edge.b : edge.a;
        points.push({ ...nodes[current].point });
        if (points.length > MAX_POINTS + 1) throw new Error('DXF LINE loop exceeds the vertex limit.');
        if (current === startNode) break;
        edgeId = nodes[current].edges.find((id) => !visited.has(id));
        if (edgeId == null) throw new Error(`DXF LINE path on layer "${layer}" is open.`);
      } while (true);
      if (points.length < 4) throw new Error(`DXF LINE loop on layer "${layer}" has fewer than three edges.`);
      loops.push({ order: firstOrder, layer, kind: 'polyline', sourceEntity: 'LINE',
        closed: true, points });
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
 * Read closed LWPOLYLINE and CIRCLE profiles, including polyline bulge arcs.
 * `$INSUNITS` 1 (inches) and 4 (mm) are supported. For unitless files, pass
 * `{ unitOverride: 'mm' }` or `'in'` after confirming the drawing's units.
 */
export function parseDXF(text, { unitOverride } = {}) {
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
  const unsupported = [...new Set(entities.map((e) => e.type)
    .filter((type) => !['LWPOLYLINE', 'CIRCLE', 'LINE'].includes(type)))];
  if (unsupported.length) {
    throw new Error(`Unsupported DXF entities: ${unsupported.join(', ')}. Convert them to closed LWPOLYLINE, CIRCLE, or connected LINE profiles.`);
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
  const lines = [];
  const indexed = [];
  for (const [index, entity] of entities.entries()) {
    if (entity.type === 'LINE') lines.push(line(entity.groups, scale, index));
    else indexed.push({ order: index, ...(entity.type === 'LWPOLYLINE' ?
      polyline(entity.groups, scale, '') : circle(entity.groups, scale, '')) });
  }
  indexed.push(...stitchLines(lines));
  indexed.sort((a, b) => a.order - b.order);
  if (indexed.length > MAX_PROFILES) throw new Error(`DXF exceeds ${MAX_PROFILES} closed profiles; simplify it.`);
  const profiles = indexed.map(({ order, ...profile }, index) => ({ ...profile, id: `profile-${index + 1}` }));
  return { units: 'mm', sourceUnits, profiles };
}
