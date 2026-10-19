import { BLANK_DXF_2018 } from './dxf-template.js';

/**
 * Geometry-to-CAM engine for ordered, closed 2D profiles.
 *
 * All input geometry and machining settings are in millimeters. The exported
 * DXF can optionally be expressed in inches; G-code always uses G21 (mm).
 * There is deliberately no G41/G42: Grbl does not implement those modes.
 *
 * This module makes explicit mitered inside and outside offsets. Source contours
 * must be simple. Compensated passes may overlap or retrace in waste when every
 * swept cutter disk remains on the chosen side and clears all finished edges.
 */

const EPS = 1e-8;
const MAX_VERTICES = 6000;
const CLEARANCE_TOLERANCE_MM = 0.000001;

function requireFinite(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number from ${min} to ${max}.`);
  }
  return value;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function dot(a, b) { return a.x * b.x + a.y * b.y; }
function sq(value) { return value * value; }
function distanceSq(a, b) { return sq(a.x - b.x) + sq(a.y - b.y); }

function signedArea(points) {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    twice += p.x * q.y - q.x * p.y;
  }
  return twice / 2;
}

function onSegment(p, a, b, tol = EPS) {
  return Math.abs(cross(a, b, p)) <= tol &&
    p.x >= Math.min(a.x, b.x) - tol && p.x <= Math.max(a.x, b.x) + tol &&
    p.y >= Math.min(a.y, b.y) - tol && p.y <= Math.max(a.y, b.y) + tol;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
      ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))) return true;
  return (Math.abs(abC) <= EPS && onSegment(c, a, b)) ||
    (Math.abs(abD) <= EPS && onSegment(d, a, b)) ||
    (Math.abs(cdA) <= EPS && onSegment(a, c, d)) ||
    (Math.abs(cdB) <= EPS && onSegment(b, c, d));
}

function validateSimplePolygon(points, label) {
  const n = points.length;
  // Cheap bounding-box rejection keeps the dense involute traces practical.
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j], d = points[(j + 1) % n];
      if (Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x) ||
          Math.max(c.x, d.x) + EPS < Math.min(a.x, b.x) ||
          Math.max(a.y, b.y) + EPS < Math.min(c.y, d.y) ||
          Math.max(c.y, d.y) + EPS < Math.min(a.y, b.y)) continue;
      if (segmentsIntersect(a, b, c, d)) {
        throw new Error(`${label} crosses or touches itself near segments ${i + 1} and ${j + 1}; no cut file was generated.`);
      }
    }
  }
}

function validateProfilesDoNotCross(profiles) {
  const boxes = profiles.map(profile => bounds(profile.design));
  for (let i = 0; i < profiles.length; i++) {
    const a = profiles[i].design;
    for (let j = i + 1; j < profiles.length; j++) {
      const u = boxes[i], v = boxes[j];
      if (u.maxX + EPS < v.minX || v.maxX + EPS < u.minX ||
          u.maxY + EPS < v.minY || v.maxY + EPS < u.minY) continue;
      const b = profiles[j].design;
      for (let x = 0; x < a.length; x++) {
        const p = a[x], q = a[(x + 1) % a.length];
        for (let y = 0; y < b.length; y++) {
          const r = b[y], t = b[(y + 1) % b.length];
          if (Math.max(p.x, q.x) + EPS < Math.min(r.x, t.x) ||
              Math.max(r.x, t.x) + EPS < Math.min(p.x, q.x) ||
              Math.max(p.y, q.y) + EPS < Math.min(r.y, t.y) ||
              Math.max(r.y, t.y) + EPS < Math.min(p.y, q.y)) continue;
          if (segmentsIntersect(p, q, r, t)) {
            throw new Error(`Profiles ${i + 1} and ${j + 1} cross or touch; separate their contours before generating G-code.`);
          }
        }
      }
    }
  }
}

function validateCrossProfileClearance(profiles, toolRadius) {
  const tolerance = CLEARANCE_TOLERANCE_MM;
  const limit = sq(toolRadius - tolerance);
  const designBoxes = profiles.map(p => bounds(p.design));
  const pathBoxes = profiles.map(p => bounds(p.path));
  for (let i = 0; i < profiles.length; i++) {
    const path = profiles[i].path, pathBox = pathBoxes[i];
    for (let j = 0; j < profiles.length; j++) {
      if (i === j) continue;
      const design = profiles[j].design, box = designBoxes[j];
      if (pathBox.maxX + toolRadius < box.minX || box.maxX + toolRadius < pathBox.minX ||
          pathBox.maxY + toolRadius < box.minY || box.maxY + toolRadius < pathBox.minY) continue;
      for (let x = 0; x < path.length; x++) {
        const a = path[x], b = path[(x + 1) % path.length];
        for (let y = 0; y < design.length; y++) {
          const c = design[y], d = design[(y + 1) % design.length];
          if (Math.max(a.x, b.x) + toolRadius < Math.min(c.x, d.x) ||
              Math.max(c.x, d.x) + toolRadius < Math.min(a.x, b.x) ||
              Math.max(a.y, b.y) + toolRadius < Math.min(c.y, d.y) ||
              Math.max(c.y, d.y) + toolRadius < Math.min(a.y, b.y)) continue;
          if (segmentDistSq(a, b, c, d) < limit) {
            throw new Error(`Bit cutting profile ${i + 1} would reach profile ${j + 1}; move the contours apart or use a smaller bit. No cut file was generated.`);
          }
        }
      }
    }
  }
}

function prepareOutline(input) {
  if (!Array.isArray(input) || input.length < 3 || input.length > MAX_VERTICES + 1) {
    throw new Error(`Outline must have 3 to ${MAX_VERTICES} XY vertices.`);
  }
  const points = input.map((p, i) => {
    if (!p || typeof p !== 'object') throw new Error(`Outline vertex ${i + 1} has no X/Y coordinates.`);
    return { x: requireFinite(p.x, `Outline X at vertex ${i + 1}`, -10000, 10000),
      y: requireFinite(p.y, `Outline Y at vertex ${i + 1}`, -10000, 10000) };
  });
  // A duplicate closing vertex is common in spreadsheet exports.
  if (distanceSq(points[0], points.at(-1)) <= sq(1e-6)) points.pop();
  if (points.length < 3 || points.length > MAX_VERTICES) throw new Error('Outline needs at least three distinct vertices.');
  for (let i = 0; i < points.length; i++) {
    if (distanceSq(points[i], points[(i + 1) % points.length]) < sq(1e-5)) {
      throw new Error(`Outline has duplicate or extremely short edge at vertex ${i + 1}.`);
    }
  }
  const area = signedArea(points);
  if (Math.abs(area) < 1e-5) throw new Error('Outline has zero or negligible enclosed area.');
  validateSimplePolygon(points, 'Outline');
  return area > 0 ? points : points.reverse();
}

function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pointSegmentDistSq(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return sq(p.x - (a.x + t * dx)) + sq(p.y - (a.y + t * dy));
}

function segmentDistSq(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistSq(a, c, d), pointSegmentDistSq(b, c, d),
    pointSegmentDistSq(c, a, b), pointSegmentDistSq(d, a, b));
}

function distanceToOutline(p, outline) {
  let min = Infinity;
  for (let i = 0; i < outline.length; i++) {
    min = Math.min(min, pointSegmentDistSq(p, outline[i], outline[(i + 1) % outline.length]));
  }
  return Math.sqrt(min);
}

/** Return a verified tool-center offset: positive outside, negative inside. */
export function offsetProfile(inputOutline, signedOffset) {
  const outline = prepareOutline(inputOutline);
  requireFinite(signedOffset, 'Signed tool offset', -50, 50);
  if (signedOffset === 0) return outline;
  const toolRadius = Math.abs(signedOffset);
  if (toolRadius < 0.025) throw new Error('Tool radius must be at least 0.025 mm.');
  const n = outline.length;
  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = outline[(i + n - 1) % n], here = outline[i], next = outline[(i + 1) % n];
    const aLength = Math.hypot(here.x - prev.x, here.y - prev.y);
    const bLength = Math.hypot(next.x - here.x, next.y - here.y);
    const na = { x: (here.y - prev.y) / aLength, y: -(here.x - prev.x) / aLength };
    const nb = { x: (next.y - here.y) / bLength, y: -(next.x - here.x) / bLength };
    const denominator = 1 + dot(na, nb);
    if (denominator < 0.0032) {
      throw new Error(`Tool offset folds at outline vertex ${i + 1}; inspect the drawing or use a smaller bit. No cut file was generated.`);
    }
    const displacement = { x: signedOffset * (na.x + nb.x) / denominator,
      y: signedOffset * (na.y + nb.y) / denominator };
    if (Math.hypot(displacement.x, displacement.y) > 25 * toolRadius) {
      throw new Error(`Tool offset spikes at outline vertex ${i + 1}; inspect the drawing or use a smaller bit. No cut file was generated.`);
    }
    result.push({ x: here.x + displacement.x, y: here.y + displacement.y });
  }
  // An exactly one-bit-wide channel produces coincident offset vertices and
  // a retraced centerline. Remove zero-length moves, keeping the return pass.
  const compact = [];
  for (const point of result) {
    if (!compact.length || distanceSq(point, compact.at(-1)) >= sq(1e-5)) compact.push(point);
  }
  if (compact.length > 1 && distanceSq(compact[0], compact.at(-1)) < sq(1e-5)) compact.pop();
  result.splice(0, result.length, ...compact);
  if (result.length < 2) throw new Error('Compensated path collapses to a point; use a smaller bit for this profile workflow.');
  if (signedOffset > 0) {
    if (signedArea(result) <= signedArea(outline)) {
      throw new Error('Outside tool-center path does not surround the profile; no cut file was generated.');
    }
    for (let i = 0; i < outline.length; i++) {
      if (!pointInPolygon(outline[i], result)) {
        throw new Error(`Outside path misses profile vertex ${i + 1}; use a smaller bit or fix the drawing. No cut file was generated.`);
      }
    }
  } else {
    for (let i = 0; i < result.length; i++) {
      if (!pointInPolygon(result[i], outline)) {
        throw new Error(`Inside path leaves the profile near vertex ${i + 1}; use a smaller bit. No cut file was generated.`);
      }
    }
  }
  // Test the full swept cutter, not spacing between passes. Waste kerfs may
  // overlap, and one bit diameter of channel width is enough. Folded offsets
  // that would gouge the retained part still fail this segment-distance test.
  const tolerance = CLEARANCE_TOLERANCE_MM;
  const limit = sq(toolRadius - tolerance);
  for (let i = 0; i < result.length; i++) {
    const a = result[i], b = result[(i + 1) % result.length];
    if (distanceSq(a, b) < sq(1e-5)) throw new Error(`Compensated path has a collapsed edge at vertex ${i + 1}.`);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pointInPolygon(midpoint, outline) !== (signedOffset < 0)) {
      throw new Error(`Compensated path is on the wrong side near edge ${i + 1}; use a smaller bit. No cut file was generated.`);
    }
    for (let j = 0; j < n; j++) {
      const c = outline[j], d = outline[(j + 1) % n];
      if (Math.max(a.x, b.x) + toolRadius < Math.min(c.x, d.x) ||
          Math.max(c.x, d.x) + toolRadius < Math.min(a.x, b.x) ||
          Math.max(a.y, b.y) + toolRadius < Math.min(c.y, d.y) ||
          Math.max(c.y, d.y) + toolRadius < Math.min(a.y, b.y)) continue;
      if (segmentDistSq(a, b, c, d) < limit) {
        throw new Error(`Bit diameter cannot clear the outline near segment ${j + 1}; the cutter would enter retained material. Use a smaller bit or adjust the drawing. No cut file was generated.`);
      }
    }
  }
  return result;
}

/** Return the verified outside tool-center path. */
export function offsetOutside(inputOutline, toolRadius) {
  return offsetProfile(inputOutline, toolRadius);
}

function validateBore(outline, boreDiameter, minimumWeb = 0) {
  requireFinite(boreDiameter, 'Bore diameter', 0, 10000);
  if (!boreDiameter) return;
  const center = { x: 0, y: 0 };
  if (!pointInPolygon(center, outline) || distanceToOutline(center, outline) <= boreDiameter / 2 + 0.001) {
    throw new Error('Center bore crosses the gear outline or the geometry is not centered at X0 Y0. No cut file was generated.');
  }
  const web = distanceToOutline(center, outline) - boreDiameter / 2;
  if (minimumWeb && web < minimumWeb - 0.001) {
    throw new Error(`Only ${fmt(web)} mm of material remains between bore and outline, less than the ${fmt(minimumWeb)} mm bit diameter; use a smaller bore or bit. No cut file was generated.`);
  }
}

function bounds(points) {
  return points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function fmt(n) {
  const result = Number(n.toFixed(4));
  return String(Object.is(result, -0) ? 0 : result);
}

function fmtDxf(n) {
  const result = Number(n.toFixed(8));
  return String(Object.is(result, -0) ? 0 : result);
}

function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') throw new Error('Machine settings are required; no cut file was generated.');
  const s = {
    bitDiameter: requireFinite(settings.bitDiameter, 'bitDiameter', 0.05, 100),
    materialThickness: requireFinite(settings.materialThickness, 'materialThickness', 0.05, 1000),
    stepdown: settings.stepdown == null && settings.passCount != null ? null :
      requireFinite(settings.stepdown, 'stepdown', 0.01, 100),
    passCount: settings.passCount ?? null,
    feedRate: requireFinite(settings.feedRate, 'feedRate', 1, 100000),
    plungeRate: requireFinite(settings.plungeRate, 'plungeRate', 1, 100000),
    safeZ: requireFinite(settings.safeZ, 'safeZ', 0.1, 1000),
    spindleRPM: requireFinite(settings.spindleRPM, 'spindleRPM', 1, 100000),
    throughCutAllowance: requireFinite(settings.throughCutAllowance ?? 0, 'throughCutAllowance', 0, 10),
    skinMm: requireFinite(settings.skinMm ?? 0, 'skinMm', 0, 1000),
    partHoldDownConfirmed: settings.partHoldDownConfirmed === true,
    centerCuttingConfirmed: settings.centerCuttingConfirmed === true,
    origin: settings.origin ?? 'center',
    workOffsetX: requireFinite(settings.workOffsetX ?? 0, 'workOffsetX', -10000, 10000),
    workOffsetY: requireFinite(settings.workOffsetY ?? 0, 'workOffsetY', -10000, 10000),
    spindleDwell: requireFinite(settings.spindleDwell ?? 0, 'spindleDwell', 0, 60),
    travelBounds: settings.travelBounds,
  };
  if (!['center', 'lower-left'].includes(s.origin)) throw new Error('origin must be "center" or "lower-left".');
  if (settings.tabs && (settings.tabs.count || settings.tabs === true)) {
    throw new Error('Tabs have not been validated for this gear outline. Secure the stock and leave tabs disabled; no cut file was generated.');
  }
  if (s.plungeRate > s.feedRate) throw new Error('plungeRate must not exceed feedRate.');
  if (s.skinMm >= s.materialThickness) throw new Error('skinMm must be less than materialThickness.');
  if (s.passCount != null && (!Number.isInteger(s.passCount) || s.passCount < 1 || s.passCount > 2000)) {
    throw new Error('passCount must be a whole number from 1 to 2000.');
  }
  return s;
}

function checkTravelBounds(path, bore, cutDepth, s) {
  if (s.travelBounds == null) return;
  const t = s.travelBounds;
  if (typeof t !== 'object') throw new Error('travelBounds must provide minX/maxX/minY/maxY/minZ/maxZ in work coordinates.');
  for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ']) {
    if (!Number.isFinite(t[key])) throw new Error(`travelBounds.${key} is required.`);
  }
  const b = bounds(path);
  if (b.minX < t.minX || b.maxX > t.maxX || b.minY < t.minY || b.maxY > t.maxY ||
      bore && (bore.x - bore.radius < t.minX || bore.x + bore.radius > t.maxX ||
        bore.y - bore.radius < t.minY || bore.y + bore.radius > t.maxY) ||
      -cutDepth < t.minZ || s.safeZ > t.maxZ) {
    throw new Error('Toolpath exceeds the provided X/Y/Z travel bounds; no cut file was generated.');
  }
}

/** Fill an entity-free AutoCAD 2018 scaffold with the current design contours.
 * The bundled scaffold has complete standard tables, classes, layouts and
 * object dictionaries, but no source drawing or user metadata. No DXF library
 * or network request is needed when the browser exports a job.
 */
function dxfGuid() {
  if (globalThis.crypto?.randomUUID) return `{${globalThis.crypto.randomUUID().toUpperCase()}}`;
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const digits = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `{${digits.slice(0, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}-${digits.slice(16, 20)}-${digits.slice(20)}}`;
}

function dxfDocument(entities, unit) {
  const scale = unit === 'in' ? 1 / 25.4 : 1;
  const templateLines = BLANK_DXF_2018.trimEnd().split('\n');
  if (templateLines.length % 2 !== 0) throw new Error('DXF template has an incomplete group pair.');
  const groups = [];
  for (let i = 0; i < templateLines.length; i += 2) {
    groups.push({ code: templateLines[i], value: templateLines[i + 1] });
  }
  const makeGroups = (...values) => {
    const result = [];
    for (let i = 0; i < values.length; i += 2) {
      result.push({ code: String(values[i]), value: String(values[i + 1]) });
    }
    return result;
  };
  const findModelSpace = () => {
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].code !== '0' || groups[i].value !== 'BLOCK_RECORD') continue;
      let name, id;
      for (let j = i + 1; j < groups.length && groups[j].code !== '0'; j++) {
        if (groups[j].code === '2') name = groups[j].value;
        if (groups[j].code === '5') id = groups[j].value;
      }
      if (name === '*Model_Space' && id) return id;
    }
    throw new Error('DXF template has no model-space block record.');
  };
  const modelHandle = findModelSpace();
  let nextHandle = Math.max(0x100, ...groups
    .filter(group => group.code === '5' || group.code === '105')
    .map(group => Number.parseInt(group.value, 16) + 1));
  const handle = () => (nextHandle++).toString(16).toUpperCase();
  const entityGroups = [];
  const emit = (...values) => entityGroups.push(...makeGroups(...values));
  const drawingBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const addPoint = (x, y) => {
    drawingBounds.minX = Math.min(drawingBounds.minX, x);
    drawingBounds.minY = Math.min(drawingBounds.minY, y);
    drawingBounds.maxX = Math.max(drawingBounds.maxX, x);
    drawingBounds.maxY = Math.max(drawingBounds.maxY, y);
  };
  for (const entity of entities) {
    if (entity.kind === 'circle') {
      addPoint(entity.center.x - entity.radius, entity.center.y - entity.radius);
      addPoint(entity.center.x + entity.radius, entity.center.y + entity.radius);
      emit('0', 'CIRCLE', '5', handle(), '330', modelHandle,
        '100', 'AcDbEntity', '8', '0', '100', 'AcDbCircle',
        '10', fmtDxf(entity.center.x * scale), '20', fmtDxf(entity.center.y * scale),
        '30', '0', '40', fmtDxf(entity.radius * scale));
    } else {
      const polylineHandle = handle();
      emit('0', 'POLYLINE', '5', polylineHandle, '330', modelHandle,
        '100', 'AcDbEntity', '8', '0', '100', 'AcDb2dPolyline',
        '66', '1', '10', '0', '20', '0', '30', '0', '70', '1');
      for (const p of entity.points) {
        addPoint(p.x, p.y);
        emit('0', 'VERTEX', '5', handle(), '330', polylineHandle,
          '100', 'AcDbEntity', '8', '0', '100', 'AcDbVertex', '100', 'AcDb2dVertex',
          '10', fmtDxf(p.x * scale), '20', fmtDxf(p.y * scale), '30', '0');
      }
      emit('0', 'SEQEND', '5', handle(), '330', polylineHandle,
        '100', 'AcDbEntity', '8', '0');
    }
  }
  const setHeader = (name, ...values) => {
    const index = groups.findIndex((group, i) => group.code === '9' &&
      group.value === name && groups.slice(0, i).some(g => g.code === '2' && g.value === 'HEADER'));
    if (index < 0) throw new Error(`DXF template is missing ${name}.`);
    let end = index + 1;
    while (end < groups.length && groups[end].code !== '9' && groups[end].code !== '0') end++;
    groups.splice(index + 1, end - index - 1, ...makeGroups(...values));
  };
  setHeader('$HANDSEED', '5', nextHandle.toString(16).toUpperCase());
  setHeader('$EXTMIN', '10', fmtDxf(drawingBounds.minX * scale),
    '20', fmtDxf(drawingBounds.minY * scale), '30', '0');
  setHeader('$EXTMAX', '10', fmtDxf(drawingBounds.maxX * scale),
    '20', fmtDxf(drawingBounds.maxY * scale), '30', '0');
  setHeader('$INSUNITS', '70', unit === 'in' ? '1' : '4');
  setHeader('$MEASUREMENT', '70', unit === 'in' ? '0' : '1');
  setHeader('$FINGERPRINTGUID', '2', dxfGuid());
  setHeader('$VERSIONGUID', '2', dxfGuid());
  const entitiesSection = groups.findIndex((group, i) => group.code === '0' &&
    group.value === 'SECTION' && groups[i + 1]?.code === '2' && groups[i + 1].value === 'ENTITIES');
  if (entitiesSection < 0 || groups[entitiesSection + 2]?.value !== 'ENDSEC') {
    throw new Error('DXF template must have an empty ENTITIES section.');
  }
  groups.splice(entitiesSection + 2, 0, ...entityGroups);
  return groups.map(group => `${group.code}\r\n${group.value}`).join('\r\n') + '\r\n';
}

/** Export the source drawing as a closed DXF polyline plus optional circle. */
export function exportDXF({ outline: inputOutline, boreDiameter = 0, unit = 'mm' } = {}) {
  const outline = prepareOutline(inputOutline);
  validateBore(outline, boreDiameter);
  if (!['mm', 'in'].includes(unit)) throw new Error('DXF unit must be "mm" or "in".');
  const entities = [{ kind: 'polyline', points: outline }];
  if (boreDiameter) entities.push({ kind: 'circle',
    center: { x: 0, y: 0 }, radius: boreDiameter / 2 });
  return dxfDocument(entities, unit);
}

function perimeterData(points) {
  const cumulative = [0];
  for (let i = 0; i < points.length; i++) {
    cumulative.push(cumulative.at(-1) + Math.hypot(
      points[(i + 1) % points.length].x - points[i].x,
      points[(i + 1) % points.length].y - points[i].y));
  }
  return cumulative;
}

function pointAtDistance(points, cumulative, distance) {
  const total = cumulative.at(-1);
  if (Math.abs(distance - total) < 1e-7) return { ...points[0] };
  let low = 0, high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (cumulative[mid + 1] <= distance) low = mid + 1;
    else high = mid;
  }
  const a = points[low], b = points[(low + 1) % points.length];
  const t = Math.max(0, Math.min(1, (distance - cumulative[low]) / (cumulative[low + 1] - cumulative[low])));
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

function createTabs(points, cumulative, options, side, thickness, finalDepth, bitDiameter) {
  if (options == null || options.count === 0) return [];
  if (typeof options !== 'object' || !Number.isInteger(options.count) || options.count < 0 || options.count > 24) {
    throw new Error('Tab count must be an integer from 0 to 24.');
  }
  if (side !== 'outside') throw new Error('Tabs are supported on outside profiles only.');
  const width = requireFinite(options.widthMm, 'Tab width (mm)', bitDiameter, 100);
  const height = requireFinite(options.heightMm, 'Tab height (mm)', 0.2, thickness - 0.001);
  if (finalDepth <= thickness - height + EPS) {
    throw new Error('Tab height does not rise above the final cut depth; reduce skinMm or increase tab height.');
  }
  const perimeter = cumulative.at(-1);
  const spacing = perimeter / options.count;
  if (width > 0.5 * spacing) {
    throw new Error('Tabs overlap or leave too little space between them; reduce tab width/count. No cut file was generated.');
  }
  const tabs = [];
  for (let i = 0; i < options.count; i++) {
    const center = (i + 0.5) * spacing;
    const startMm = center - width / 2, endMm = center + width / 2;
    const path = [pointAtDistance(points, cumulative, startMm)];
    for (let j = 1; j < cumulative.length - 1; j++) {
      if (cumulative[j] > startMm + EPS && cumulative[j] < endMm - EPS) path.push({ ...points[j] });
    }
    path.push(pointAtDistance(points, cumulative, endMm));
    tabs.push({ startMm, endMm, from: path[0], to: path.at(-1), path, heightMm: height });
  }
  return tabs;
}

/**
 * Produce G-code for explicitly ordered closed contours. The original drawing
 * and every cutter-center path are returned for review. Profiles are not
 * silently reordered by shape nesting or side selection.
 */
export function generateJob({ profiles, settings } = {}) {
  const s = validateSettings(settings);
  if (!Array.isArray(profiles) || profiles.length < 1 || profiles.length > 32) {
    throw new Error('A job needs 1 to 32 ordered closed profiles.');
  }
  if (!s.centerCuttingConfirmed) {
    throw new Error('Each profile plunges into stock. Confirm the installed bit can safely plunge in this material before generating G-code.');
  }
  const depth = s.materialThickness - s.skinMm + s.throughCutAllowance;
  const passCount = s.passCount ?? Math.ceil(depth / s.stepdown);
  if (passCount > 2000) throw new Error('Too many depth passes; increase stepdown or correct material thickness.');
  const effectiveStepdown = s.passCount ? depth / passCount : s.stepdown;
  const depths = Array.from({ length: passCount }, (_, i) =>
    -(i === passCount - 1 ? depth : Math.min((i + 1) * effectiveStepdown, depth)));
  const prepared = profiles.map((profile, index) => {
    if (!profile || typeof profile !== 'object') throw new Error(`Profile ${index + 1} is missing.`);
    const side = profile.side;
    if (!['inside', 'on', 'outside'].includes(side)) {
      throw new Error(`Profile ${index + 1} must specify side: inside, on, or outside.`);
    }
    const design = prepareOutline(profile.points);
    const signedOffset = side === 'inside' ? -s.bitDiameter / 2 : side === 'outside' ? s.bitDiameter / 2 : 0;
    const path = signedOffset ? offsetProfile(design, signedOffset) : design.map(p => ({ ...p }));
    const direction = profile.direction ?? settings.cutDirection ?? 'ccw';
    if (!['cw', 'ccw'].includes(direction)) throw new Error(`Profile ${index + 1} direction must be cw or ccw.`);
    const orderedPath = direction === 'cw' ? [path[0], ...path.slice(1).reverse()] : path;
    const cumulative = perimeterData(orderedPath);
    const tabs = createTabs(orderedPath, cumulative, profile.tabs, side, s.materialThickness, depth, s.bitDiameter);
    return {
      id: String(profile.id ?? `profile-${index + 1}`),
      name: String(profile.name ?? `Profile ${index + 1}`).replace(/[^\x20-\x7E]|[()]/g, ' ').slice(0, 80),
      side, design, path: orderedPath, cumulative, tabs,
    };
  });
  if (prepared.reduce((total, p) => total + p.design.length, 0) > 12000) {
    throw new Error('Job exceeds 12,000 total profile vertices; simplify the drawing before generating G-code.');
  }
  validateProfilesDoNotCross(prepared);
  validateCrossProfileClearance(prepared, s.bitDiameter / 2);
  if (depth >= s.materialThickness - 0.0001 &&
      prepared.some(profile => profile.tabs.length === 0) && !s.partHoldDownConfirmed) {
    throw new Error('At least one full-depth profile has no tabs and may release a cutout. Confirm secure hold-down for loose cutouts, add tabs to outside profiles, or leave a bottom skin.');
  }
  const allPath = prepared.flatMap(p => p.path);
  const rawBounds = bounds(allPath);
  const originShift = s.origin === 'lower-left' ? { x: -rawBounds.minX, y: -rawBounds.minY } : { x: 0, y: 0 };
  const shift = { x: originShift.x + s.workOffsetX, y: originShift.y + s.workOffsetY };
  for (const p of prepared) {
    p.design = p.design.map(q => ({ x: q.x + shift.x, y: q.y + shift.y }));
    p.path = p.path.map(q => ({ x: q.x + shift.x, y: q.y + shift.y }));
    p.tabs = p.tabs.map(tab => ({ ...tab,
      from: { x: tab.from.x + shift.x, y: tab.from.y + shift.y },
      to: { x: tab.to.x + shift.x, y: tab.to.y + shift.y },
      path: tab.path.map(q => ({ x: q.x + shift.x, y: q.y + shift.y })),
    }));
  }
  const shiftedAll = prepared.flatMap(p => p.path);
  checkTravelBounds(shiftedAll, null, depth, s);
  const lines = [
    '(CVS Robotics Lab gear CAM - verify setup and simulate before cutting)',
    `(Bit ${fmt(s.bitDiameter)} mm = ${fmt(s.bitDiameter / 25.4)} in; stock ${fmt(s.materialThickness)} mm; passes ${passCount}; ${fmt(effectiveStepdown)} mm per pass${s.passCount ? '' : ' maximum'})`,
    `(Work zero X/Y: ${s.origin}; stock top Z0; final depth ${fmt(depth)} mm)`,
    'G21 G17 G90 G94 G54 G40',
    `G0 Z${fmt(s.safeZ)}`,
    `M3 S${fmt(s.spindleRPM)}`,
  ];
  if (s.spindleDwell) lines.push(`G4 P${fmt(s.spindleDwell)}`);
  for (let profileIndex = 0; profileIndex < prepared.length; profileIndex++) {
    const p = prepared[profileIndex];
    const cutResult = p.side === 'outside'
      ? `KEEP INSIDE SHAPE; BIT CENTER ${fmt(s.bitDiameter / 2)} MM OUTSIDE`
      : p.side === 'inside'
        ? `MAKE OPENING; BIT CENTER ${fmt(s.bitDiameter / 2)} MM INSIDE`
        : 'BIT CENTER ON DRAWN LINE';
    lines.push(`(PROFILE ${profileIndex + 1}: ${p.name}; ${p.side}; ${cutResult}; ${p.tabs.length} tabs)`);
    const eventDistances = [...p.cumulative];
    for (const tab of p.tabs) eventDistances.push(tab.startMm, tab.endMm);
    eventDistances.sort((a, b) => a - b);
    const events = eventDistances.filter((d, i) => i === 0 || d - eventDistances[i - 1] > 1e-7);
    for (const z of depths) {
      lines.push(`G0 Z${fmt(s.safeZ)}`);
      lines.push(`G0 X${fmt(p.path[0].x)} Y${fmt(p.path[0].y)}`);
      lines.push(`G1 Z${fmt(z)} F${fmt(s.plungeRate)}`);
      let currentZ = z;
      for (let i = 0; i < events.length - 1; i++) {
        const midpoint = (events[i] + events[i + 1]) / 2;
        const tab = p.tabs.find(t => midpoint > t.startMm && midpoint < t.endMm);
        const targetZ = tab ? Math.max(z, -(s.materialThickness - tab.heightMm)) : z;
        if (targetZ > currentZ + 1e-7 || targetZ < currentZ - 1e-7) {
          lines.push(`G1 Z${fmt(targetZ)} F${fmt(s.plungeRate)}`);
          currentZ = targetZ;
        }
        const q = pointAtDistance(p.path, p.cumulative, events[i + 1]);
        lines.push(`G1 X${fmt(q.x)} Y${fmt(q.y)} F${fmt(s.feedRate)}`);
      }
    }
  }
  lines.push(`G0 Z${fmt(s.safeZ)}`, 'M5', 'M2');
  if (lines.length > 300000) throw new Error('Generated program exceeds 300,000 lines; simplify profiles or reduce depth passes.');
  return {
    gcode: lines.join('\n') + '\n',
    preview: {
      profiles: prepared.map(p => ({ id: p.id, name: p.name, side: p.side,
        designPath: p.design, toolCenterPath: p.path, tabs: p.tabs,
        bounds: bounds(p.path) })),
      sequence: prepared.map(p => p.name), origin: shift,
    },
    metadata: { unit: 'mm', bounds: bounds(shiftedAll), passDepths: depths,
      passCount, effectiveStepdownMm: effectiveStepdown,
      lineCount: lines.length, spindleRPM: s.spindleRPM, bitDiameter: s.bitDiameter,
      origin: s.origin, finalDepth: depth },
    warnings: [
      depth >= s.materialThickness ? 'Full-depth cutting can release cutouts; verify stock and any loose pieces are secured.' :
        `Leaves ${fmt(s.materialThickness - depth)} mm bottom skin for all profiles.`,
      'All profiles use a straight plunge at each pass; verify the bit can plunge in this material.',
      'Verify work zero, clearance, feeds, spindle control, tab placement, and path preview in UGS before cutting.',
    ],
  };
}

/**
 * Calculate the same compensated XY geometry used by generateJob without
 * requiring feeds, depths, hold-down acknowledgements, or other machine setup.
 * This keeps the side-selection preview responsive while still using the exact
 * production offset and clearance checks.
 */
export function generateToolpathPreview({ profiles, bitDiameter, origin = 'center' } = {}) {
  const previewProfiles = Array.isArray(profiles)
    ? profiles.map(profile => ({ ...profile, tabs: undefined }))
    : profiles;
  const result = generateJob({
    profiles: previewProfiles,
    settings: {
      bitDiameter,
      materialThickness: 1,
      passCount: 1,
      safeZ: 1,
      feedRate: 1,
      plungeRate: 1,
      spindleRPM: 1,
      skinMm: 0.5,
      origin,
      centerCuttingConfirmed: true,
    },
  });
  return {
    preview: result.preview,
    metadata: {
      unit: 'mm',
      bounds: result.metadata.bounds,
      bitDiameter: result.metadata.bitDiameter,
      origin: result.metadata.origin,
    },
  };
}

/** Export original profiles, preserving a true DXF CIRCLE when metadata agrees. */
export function exportJobDXF({ profiles, unit = 'mm' } = {}) {
  if (!Array.isArray(profiles) || !profiles.length || profiles.length > 32) {
    throw new Error('DXF export needs 1 to 32 profiles.');
  }
  if (!['mm', 'in'].includes(unit)) throw new Error('DXF unit must be "mm" or "in".');
  const entities = profiles.map((profile, i) => {
    const points = prepareOutline(profile.points);
    if (profile.kind === 'circle' && profile.center && profile.radius != null) {
      const center = {
        x: requireFinite(profile.center.x, 'Circle center X', -10000, 10000),
        y: requireFinite(profile.center.y, 'Circle center Y', -10000, 10000),
      };
      const radius = requireFinite(profile.radius, 'Circle radius', 0.025, 10000);
      const areaRatio = signedArea(points) / (Math.PI * radius * radius);
      if (points.length < 24 || areaRatio < 0.99 || areaRatio > 1.01 ||
          points.some(p => Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius) > Math.max(0.005, radius * 1e-5))) {
        throw new Error(`Profile ${i + 1} circle metadata does not match its sampled contour; cannot export an exact CIRCLE.`);
      }
      return { kind: 'circle', center, radius };
    }
    return { kind: 'polyline', points };
  });
  return dxfDocument(entities, unit);
}
