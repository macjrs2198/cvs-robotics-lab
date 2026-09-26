// The formulas and 40 vertices per tooth come from GearBuilder_Fixed.xlsm.
// Its source dimensions are inches; this module returns millimeter coordinates.
const MM_PER_INCH = 25.4;
const TAU = 2 * Math.PI;
const INVOLUTE_STEP = 0.0001;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

function validateParams(input) {
  const params = {
    pinionTeeth: finiteNumber(input.pinionTeeth, 'Pinion teeth'),
    gearTeeth: finiteNumber(input.gearTeeth, 'Gear teeth'),
    pressureAngleDeg: finiteNumber(input.pressureAngleDeg, 'Pressure angle'),
    centerDistance: finiteNumber(input.centerDistance, 'Center distance'),
    pinionSafety: finiteNumber(input.pinionSafety ?? 1.1, 'Pinion safety factor'),
    gearSafety: finiteNumber(input.gearSafety ?? 1.1, 'Gear safety factor'),
  };
  for (const key of ['pinionTeeth', 'gearTeeth']) {
    if (!Number.isInteger(params[key]) || params[key] < 4 || params[key] > 300) {
      throw new Error(`${key} must be a whole number from 4 to 300.`);
    }
  }
  if (params.pressureAngleDeg <= 0 || params.pressureAngleDeg >= 45) {
    throw new Error('Pressure angle must be greater than 0° and less than 45°.');
  }
  if (params.centerDistance <= 0) throw new Error('Center distance must be positive.');
  if (params.pinionSafety <= 0 || params.gearSafety <= 0) {
    throw new Error('Both dedendum safety factors must be positive.');
  }
  return params;
}

function involute(baseRadius, theta) {
  return {
    x: baseRadius * (Math.cos(theta) + theta * Math.sin(theta)),
    y: baseRadius * (Math.sin(theta) - theta * Math.cos(theta)),
  };
}

function rotate({ x, y }, angle) {
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: y * Math.cos(angle) + x * Math.sin(angle),
  };
}

function scaled({ x, y }) {
  return { x: x * MM_PER_INCH, y: y * MM_PER_INCH };
}

function buildProfile(kind, teeth, pitchRadius, outsideRadius, rootRadius,
  pressureAngle, angularThickness) {
  const baseRadius = pitchRadius * Math.cos(pressureAngle);
  if (rootRadius <= 0) throw new Error(`${kind} root radius is zero or negative; adjust the tooth counts or safety factors.`);
  if (outsideRadius <= baseRadius) throw new Error(`${kind} outside radius must exceed its base radius.`);

  const thetaPitch = Math.sqrt((pitchRadius ** 2 - baseRadius ** 2) / baseRadius ** 2);
  const pitchInvolute = involute(baseRadius, thetaPitch);
  const alphaPitch = Math.atan2(pitchInvolute.y, pitchInvolute.x);
  const flankRotation = angularThickness + 2 * alphaPitch;

  // The VBA iterates theta in 0.0001-radian increments until the involute
  // first exceeds the outside radius, then divides that theta by 18.
  const thetaOutside = Math.sqrt((outsideRadius ** 2 - baseRadius ** 2) / baseRadius ** 2);
  const sampledThetaOutside = (Math.floor(thetaOutside / INVOLUTE_STEP) + 1) * INVOLUTE_STEP;
  const first = [{ x: rootRadius, y: 0 }, { x: baseRadius, y: 0 }];
  for (let k = 1; k <= 18; k++) {
    first.push(involute(baseRadius, k * sampledThetaOutside / 18));
  }
  for (let k = 19; k >= 0; k--) {
    const { x, y } = first[k];
    first.push(rotate({ x, y: -y }, flankRotation));
  }

  const pointsInches = [];
  for (let tooth = 0; tooth < teeth; tooth++) {
    const angle = tooth * TAU / teeth;
    for (const point of first.slice(0, 40)) pointsInches.push(rotate(point, angle));
  }
  pointsInches.push({ ...pointsInches[0] });

  return {
    kind,
    teeth,
    units: 'mm',
    points: pointsInches.map(scaled),
    pitchRadius: pitchRadius * MM_PER_INCH,
    baseRadius: baseRadius * MM_PER_INCH,
    outsideRadius: outsideRadius * MM_PER_INCH,
    rootRadius: rootRadius * MM_PER_INCH,
    angularToothThickness: angularThickness,
    thetaOutside: sampledThetaOutside,
  };
}

/** Rebuild both spreadsheet tooth outlines. centerDistance is in inches. */
export function buildPair(input) {
  const params = validateParams(input);
  const { pinionTeeth: np, gearTeeth: ng, centerDistance: cd,
    pinionSafety, gearSafety, pressureAngleDeg } = params;
  const diametralPitch = (np + ng) / (2 * cd);
  const circularPitch = Math.PI / diametralPitch;
  const addendumPinion = (-0.058524 * np + 2.053071) / diametralPitch;
  const addendumGear = (0.058524 * np - 0.053071) / diametralPitch;
  const pinionPitchRadius = np / (2 * diametralPitch);
  const gearPitchRadius = ng / (2 * diametralPitch);
  const pinionThickness = 2 * (-0.042607 * np + 2.337321) / np;
  const gearThickness = (TAU - np * pinionThickness) / ng;
  if (addendumPinion <= 0 || addendumGear <= 0 || pinionThickness <= 0 || gearThickness <= 0) {
    throw new Error('These tooth counts do not produce a valid profile with the spreadsheet formulas.');
  }
  const pressureAngle = pressureAngleDeg * Math.PI / 180;
  const pinion = buildProfile('pinion', np, pinionPitchRadius,
    pinionPitchRadius + addendumPinion,
    pinionPitchRadius - pinionSafety * addendumGear,
    pressureAngle, pinionThickness);
  const gear = buildProfile('gear', ng, gearPitchRadius,
    gearPitchRadius + addendumGear,
    gearPitchRadius - gearSafety * addendumPinion,
    pressureAngle, gearThickness);
  return {
    params,
    units: 'mm',
    sourceUnits: 'in',
    circularPitch: circularPitch * MM_PER_INCH,
    diametralPitch, // teeth per source inch
    addendumPinion: addendumPinion * MM_PER_INCH,
    addendumGear: addendumGear * MM_PER_INCH,
    pinion,
    gear,
  };
}

function u16(bytes, offset) { return bytes[offset] | bytes[offset + 1] << 8; }
function u32(bytes, offset) { return (bytes[offset] | bytes[offset + 1] << 8 |
  bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0; }

function decodeXmlText(text) {
  return text.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (entity, numeric, named) => {
    if (numeric) return String.fromCodePoint(numeric[0].toLowerCase() === 'x' ?
      parseInt(numeric.slice(1), 16) : Number(numeric));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named.toLowerCase()] ?? entity;
  });
}

function sharedStringValues(xml) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXmlText(part[1])).join(''));
}

async function unzipEntry(zip, name) {
  let eocd = -1;
  for (let p = zip.length - 22; p >= Math.max(0, zip.length - 65557); p--) {
    if (u32(zip, p) === 0x06054b50 && p + 22 + u16(zip, p + 20) === zip.length) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) throw new Error('The uploaded file is not a readable Excel ZIP workbook.');
  const encoder = new TextDecoder();
  let p = u32(zip, eocd + 16);
  const entries = u16(zip, eocd + 10);
  for (let i = 0; i < entries; i++) {
    if (u32(zip, p) !== 0x02014b50) throw new Error('Invalid workbook ZIP directory.');
    const method = u16(zip, p + 10);
    const compressedSize = u32(zip, p + 20);
    const uncompressedSize = u32(zip, p + 24);
    const fileNameSize = u16(zip, p + 28);
    const extraSize = u16(zip, p + 30);
    const commentSize = u16(zip, p + 32);
    const filename = encoder.decode(zip.subarray(p + 46, p + 46 + fileNameSize));
    if (filename === name) {
      if (uncompressedSize > 8_000_000) throw new Error('Workbook sheet is too large to import.');
      const local = u32(zip, p + 42);
      if (u32(zip, local) !== 0x04034b50) throw new Error('Invalid workbook ZIP entry.');
      const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
      const content = zip.subarray(start, start + compressedSize);
      if (method === 0) return encoder.decode(content);
      if (method !== 8 || typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decompress the Excel workbook.');
      }
      const stream = new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const uncompressed = new Uint8Array(await new Response(stream).arrayBuffer());
      if (uncompressed.length !== uncompressedSize) throw new Error('Workbook sheet did not decompress completely.');
      return encoder.decode(uncompressed);
    }
    p += 46 + fileNameSize + extraSize + commentSize;
  }
  throw new Error(`Workbook is missing ${name}.`);
}

/** Read the six input cells and the saved (possibly stale) chart contour. */
export async function parseWorkbook(file) {
  let bytes;
  if (file instanceof Uint8Array) bytes = file;
  else if (file instanceof ArrayBuffer) bytes = new Uint8Array(file);
  else if (file && typeof file.arrayBuffer === 'function') bytes = new Uint8Array(await file.arrayBuffer());
  else throw new Error('Upload the GearBuilder .xlsm or .xlsx file.');
  // Remove empty styled cells before scanning; otherwise a regex can pair an
  // empty <c .../> with the next populated cell's </c>.
  const xml = (await unzipEntry(bytes, 'xl/worksheets/sheet1.xml'))
    .replace(/<c\b[^>]*\/>/g, '');
  let sharedStrings = [];
  try { sharedStrings = sharedStringValues(await unzipEntry(bytes, 'xl/sharedStrings.xml')); }
  catch (error) {
    if (!String(error.message).includes('missing xl/sharedStrings.xml')) throw error;
  }
  const wanted = new Set(['B4', 'D4', 'F4', 'H4', 'J4', 'J9', 'F14']);
  const headings = new Set(['B1', 'D1', 'F1', 'H1']);
  const cells = new Map();
  const labelsFound = new Map();
  const rows = new Map();
  const cellPattern = /<c\b([^>]*\br="([A-Z]+\d+)"[^>]*)>([\s\S]*?)<\/c>/g;
  for (const match of xml.matchAll(cellPattern)) {
    const ref = match[2];
    if (!wanted.has(ref) && !headings.has(ref) && !/^[LM]\d+$/.test(ref)) continue;
    const value = /<v>([^<]+)<\/v>/.exec(match[3]);
    const inline = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(match[3]);
    const type = /\bt="([^"]+)"/.exec(match[1])?.[1];
    const content = type === 's' ? sharedStrings[Number(value?.[1])] :
      type === 'inlineStr' ? decodeXmlText(inline?.[1] ?? '') : value?.[1];
    if (headings.has(ref)) labelsFound.set(ref, String(content ?? '').toLowerCase());
    if (content == null || String(content).trim() === '') continue;
    const numeric = Number(content);
    if (!Number.isFinite(numeric)) continue;
    if (wanted.has(ref)) cells.set(ref, numeric);
    if (/^[LM]\d+$/.test(ref)) {
      const row = Number(ref.slice(1));
      if (!rows.has(row)) rows.set(row, {});
      rows.get(row)[ref[0]] = numeric;
    }
  }
  const headingWords = { B1: 'pinion', D1: 'gear', F1: 'pressure', H1: 'center' };
  if (Object.entries(headingWords).some(([ref, word]) => !labelsFound.get(ref)?.includes(word))) {
    throw new Error('This is not a GearBuilder workbook (expected pinion, gear, pressure, and center headings).');
  }
  const labels = { B4: 'pinion teeth', D4: 'gear teeth', F4: 'pressure angle',
    H4: 'center distance', J4: 'pinion safety factor', J9: 'gear safety factor' };
  for (const [ref, label] of Object.entries(labels)) {
    if (!cells.has(ref)) throw new Error(`Workbook is missing ${label} (${ref}).`);
  }
  const params = validateParams({
    pinionTeeth: cells.get('B4'), gearTeeth: cells.get('D4'),
    pressureAngleDeg: cells.get('F4'), centerDistance: cells.get('H4'),
    pinionSafety: cells.get('J4'), gearSafety: cells.get('J9'),
  });
  const contour = [...rows.entries()].sort((a, b) => a[0] - b[0])
    .filter(([, row]) => Number.isFinite(row.L) && Number.isFinite(row.M))
    .map(([, row]) => ({ x: row.L * MM_PER_INCH, y: row.M * MM_PER_INCH }));
  const kind = contour.length === params.pinionTeeth * 40 + 1 ? 'pinion' :
    contour.length === params.gearTeeth * 40 + 1 ? 'gear' : null;
  let maxDifference = null;
  if (kind) {
    const regenerated = buildPair(params)[kind].points;
    maxDifference = Math.max(...contour.map((p, i) =>
      Math.hypot(p.x - regenerated[i].x, p.y - regenerated[i].y)));
  }
  return {
    params,
    inputCells: Object.fromEntries(cells),
    macroOutputScale: cells.get('F14') ?? null,
    cachedTrace: contour.length ? {
      kind, points: contour, units: 'mm',
      matchesInputs: kind !== null && maxDifference < 0.001,
      maxDifferenceMm: maxDifference,
    } : null,
  };
}
