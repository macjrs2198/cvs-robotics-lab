import { buildPair, parseWorkbook } from './gear.js';
import { parseDXF } from './dxf.js';
import { generateJob, generateToolpathPreview, exportJobDXF } from './engine.js';
import { MIN_PROFILE_BIT_MM, normalizeBitDiameter } from './units.js';

const MM_PER_INCH = 25.4;
const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const state = { mode: 'gear', part: 'pinion', pair: null, profiles: [], job: null, cutPreview: null,
  fileName: '', depthMode: 'passes', pendingDXF: null, lockedDiametralPitch: null,
  savedSources: {}, loadedDXF: null, readingSource: false };
const gearForm = $('gear-form');
const cutForm = $('cut-form');
const cutList = $('cut-list');
let updateTimer;
let sourceReadId = 0;

function status(element, message, kind = '') {
  element.textContent = message;
  element.classList.toggle('is-error', kind === 'error');
  element.classList.toggle('is-success', kind === 'success');
}

function invalidateSource() {
  state.profiles = [];
  state.pair = null;
  state.job = null;
  state.cutPreview = null;
  renderCutList();
  $('drawing-label').textContent = 'NO DRAWING LOADED';
  status($('drawing-status'), 'Load a drawing or edit the gear values to continue.', 'error');
  refresh();
}

function number(id) {
  const input = $(id);
  if (!input.value.trim() || !input.checkValidity()) return null;
  const result = Number(input.value);
  return Number.isFinite(result) ? result : null;
}

function gearParams() {
  const invalid = [...gearForm.querySelectorAll('input[type="number"]')]
    .find(input => !input.checkValidity());
  if (invalid) {
    const labels = {
      'pinion-teeth': 'Pinion teeth must be a whole number from 4 to 35 for this gear design.',
      'gear-teeth': 'Gear teeth must be a whole number from 4 to 150.',
      'center-distance': 'Enter a center distance greater than zero.',
      'pressure-angle': 'Enter a pressure angle greater than 0° and less than 45°.',
      'pinion-safety': 'Enter a pinion root clearance factor greater than 1.',
      'gear-safety': 'Enter a gear root clearance factor greater than 1.',
    };
    throw new Error(labels[invalid.id] ?? 'Check the gear pair values.');
  }
  return {
    pinionTeeth: number('pinion-teeth'),
    gearTeeth: number('gear-teeth'),
    centerDistance: number('center-distance'),
    pressureAngleDeg: number('pressure-angle'),
    pinionSafety: number('pinion-safety'),
    gearSafety: number('gear-safety'),
  };
}

function updateGearRelations() {
  const np = number('pinion-teeth'), ng = number('gear-teeth');
  const center = number('center-distance');
  const valid = np !== null && ng !== null && center !== null && center > 0;
  const diametralPitch = valid ? (np + ng) / (2 * center) : 0;
  $('pinion-pitch-diameter').textContent = valid ? (np / diametralPitch).toFixed(3) + ' in' : '—';
  $('gear-pitch-diameter').textContent = valid ? (ng / diametralPitch).toFixed(3) + ' in' : '—';
  $('total-pitch-diameter').textContent = valid ? (2 * center).toFixed(3) + ' in' : '—';
  $('tooth-spacing').textContent = valid ? (Math.PI * MM_PER_INCH / diametralPitch).toFixed(2) + ' mm' : '—';
  $('gear-ratio').textContent = valid ? Number((ng / np).toFixed(2)) + ':1' : '—';
  for (const input of gearForm.querySelectorAll('input[type="number"]')) {
    input.setAttribute('aria-invalid', String(!input.checkValidity()));
  }
}

function updateToothSizeLock() {
  const locked = $('lock-tooth-size').checked;
  if (locked) {
    const np = number('pinion-teeth'), ng = number('gear-teeth');
    const center = number('center-distance');
    if (np === null || ng === null || center === null || center <= 0) {
      $('lock-tooth-size').checked = false;
      status($('gear-validity'), 'Enter valid tooth counts and center distance before keeping tooth size fixed.', 'error');
      return;
    }
    state.lockedDiametralPitch = (np + ng) / (2 * center);
  } else state.lockedDiametralPitch = null;
  $('center-distance').readOnly = locked;
  $('linked-explanation').textContent = locked
    ? 'Tooth size stays fixed. Changing either tooth count moves the gear centers automatically. Uncheck to edit center distance.'
    : 'Center distance stays fixed. Changing tooth counts changes the tooth size, just like the spreadsheet.';
  updateGearRelations();
}

function syncLinkedCenter(changedId) {
  if (!state.lockedDiametralPitch || !['pinion-teeth', 'gear-teeth'].includes(changedId)) return;
  const np = number('pinion-teeth'), ng = number('gear-teeth');
  if (np === null || ng === null) return;
  $('center-distance').value = String(Number(((np + ng) / (2 * state.lockedDiametralPitch)).toFixed(6)));
}

function clearGearWhileEditing() {
  if (state.mode !== 'gear') return;
  state.pair = null;
  state.profiles = [];
  state.job = null;
  renderCutList();
  for (const id of ['pitch-value', 'outside-value', 'root-value']) $(id).textContent = '—';
  for (const [id, value] of [['pinion-count', number('pinion-teeth')],
    ['gear-count', number('gear-teeth')]]) {
    $(id).textContent = value === null ? '—' : value + ' teeth';
  }
  $('drawing-label').textContent = 'CHECK GEAR VALUES';
  status($('gear-validity'), 'Checking both gear shapes…');
  status($('drawing-status'), 'Checking the updated gear measurements…');
  refresh();
}

function circlePoints(x, y, radius) {
  const count = 256;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = index * 2 * Math.PI / count;
    return { x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
  });
  points.push({ ...points[0] });
  return points;
}

function profile(id, name, points, side, previous, shape = {}) {
  return { id, name, points, side: previous?.side ?? side,
    tabs: previous?.tabs ?? { count: '', widthMm: '', heightMm: '' }, ...shape };
}

function rebuildGear() {
  state.pair = buildPair(gearParams());
  const old = new Map(state.profiles.map(item => [item.id, item]));
  const chosen = state.pair[state.part];
  const outline = profile('gear-outline', state.part === 'pinion' ? 'Pinion outline' : 'Gear outline',
    chosen.points, 'outside', old.get('gear-outline'));
  const boreIn = $('bore-diameter').value.trim();
  if (boreIn && number('bore-diameter') === null) throw new Error('Enter a valid center circle diameter.');
  const boreMm = boreIn ? Number(boreIn) * MM_PER_INCH : 0;
  if (boreMm && boreMm >= 2 * chosen.rootRadius) {
    throw new Error('The center circle must fit inside the gear root.');
  }
  const bore = boreMm ? profile('center-circle', 'Center circle',
    circlePoints(0, 0, boreMm / 2), 'inside', old.get('center-circle'),
    { kind: 'circle', center: { x: 0, y: 0 }, radius: boreMm / 2 }) : null;
  // Keep a student's chosen order when editing dimensions.
  const oldOrder = state.profiles.map(item => item.id);
  const available = new Map([['gear-outline', outline], ...(bore ? [['center-circle', bore]] : [])]);
  state.profiles = oldOrder.map(id => available.get(id)).filter(Boolean);
  for (const id of ['center-circle', 'gear-outline']) {
    if (!state.profiles.some(item => item.id === id) && available.has(id)) {
      if (id === 'center-circle') state.profiles.unshift(available.get(id));
      else state.profiles.push(available.get(id));
    }
  }
  $('pinion-count').textContent = state.pair.pinion.teeth + ' teeth';
  $('gear-count').textContent = state.pair.gear.teeth + ' teeth';
  $('pitch-value').textContent = state.pair.diametralPitch.toFixed(3) + ' teeth/in';
  $('outside-value').textContent = (2 * chosen.outsideRadius / MM_PER_INCH).toFixed(3) + ' in';
  $('root-value').textContent = (2 * chosen.rootRadius / MM_PER_INCH).toFixed(3) + ' in';
  $('drawing-label').textContent = state.part.toUpperCase() + ' · TOP VIEW';
}

function sideOptions(item) {
  if (item.id === 'gear-outline') {
    return '<option value="">Choose what stays</option>' +
      '<option value="outside">Keep the gear · bit outside</option>' +
      '<option value="inside">Make a gear-shaped opening · bit inside</option>' +
      '<option value="on">Bit centered on drawn line</option>';
  }
  if (item.id === 'center-circle') {
    return '<option value="">Choose what stays</option>' +
      '<option value="inside">Make the center hole · bit inside</option>' +
      '<option value="outside">Keep a round plug · bit outside</option>' +
      '<option value="on">Bit centered on drawn line</option>';
  }
  return '<option value="">Choose what stays</option>' +
    '<option value="outside">Keep shape inside line · bit outside</option>' +
    '<option value="inside">Make opening inside line · bit inside</option>' +
    '<option value="on">Bit centered on drawn line</option>';
}

function updateSideHelp(row, item) {
  const messages = item.id === 'center-circle' ? {
    inside: 'Makes a hole. The bit stays inside the green circle.',
    outside: 'Makes a round plug. The bit stays outside the green circle.',
    on: 'The bit straddles the green circle, changing the finished diameter.',
  } : {
    outside: 'Keeps the green shape. The bit removes stock outside its line.',
    inside: 'Keeps the surrounding stock. The bit removes material inside the line.',
    on: 'The bit straddles the green line, changing the finished size.',
  };
  row.querySelector('.cut-side-help').textContent = messages[item.side] ??
    'Choose which material should remain after the cut.';
}

function renderCutList() {
  cutList.replaceChildren();
  state.profiles.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'cut-row';
    row.dataset.id = item.id;
    row.innerHTML = '<div class="cut-row-top"><span class="cut-row-number"></span><span class="cut-row-name"></span>' +
      '<button class="row-order-button" type="button" data-move="-1" aria-label="Move profile earlier">↑</button>' +
      '<button class="row-order-button" type="button" data-move="1" aria-label="Move profile later">↓</button></div>' +
      '<div class="cut-row-fields"><label>Cut result<select data-side>' + sideOptions(item) + '</select></label>' +
      '<p class="cut-side-help"></p></div>' +
      '<div class="tabs-fields"><label>Tabs<input data-tab="count" type="number" min="0" max="24" step="1" inputmode="numeric" placeholder="Count"></label>' +
      '<label>Width <span class="unit">mm</span><input data-tab="widthMm" type="number" min="0.01" step="any" inputmode="decimal" placeholder="mm"></label>' +
      '<label>Height <span class="unit">mm</span><input data-tab="heightMm" type="number" min="0.01" step="any" inputmode="decimal" placeholder="mm"></label></div>';
    row.querySelector('.cut-row-number').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('.cut-row-name').textContent = item.name;
    row.querySelector('[data-move="-1"]').disabled = index === 0;
    row.querySelector('[data-move="1"]').disabled = index === state.profiles.length - 1;
    row.querySelector('[data-side]').value = item.side;
    updateSideHelp(row, item);
    row.querySelector('.tabs-fields').hidden = item.side !== 'outside';
    for (const input of row.querySelectorAll('[data-tab]')) {
      input.value = item.tabs[input.dataset.tab] ?? '';
    }
    cutList.append(row);
  });
}

function showMode() {
  const imported = state.mode === 'dxf';
  for (const mode of ['gear', 'dxf']) {
    $('mode-' + mode).classList.toggle('is-active', state.mode === mode);
    $('mode-' + mode).setAttribute('aria-pressed', String(state.mode === mode));
  }
  $('workbook-import').hidden = imported;
  $('dxf-import').hidden = !imported;
  $('drawing-heading').textContent = imported ? 'Drawing preview' : 'Choose a part';
  gearForm.hidden = imported;
  $('part-switch').hidden = imported;
  $('bore-field').hidden = imported;
  $('bore-hint').hidden = imported;
  $('drawing-summary').hidden = imported;
  $('imported-summary').hidden = !imported;
  $('dxf-units-prompt').hidden = !imported || !state.pendingDXF;
  $('origin-instructions').textContent = originInstructions();
}

function originInstructions() {
  if ($('work-origin').value === 'lower-left') {
    return 'I will set X0/Y0 at the lower-left limit of the bit-center path and Z0 at the stock top.';
  }
  return state.mode === 'gear'
    ? 'I will set X0/Y0 at the gear center and Z0 at the stock top.'
    : 'I will set X0/Y0 at the DXF drawing origin and Z0 at the stock top.';
}

function boundsOf(paths) {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const path of paths) for (const point of path ?? []) {
    b.minX = Math.min(b.minX, point.x);
    b.maxX = Math.max(b.maxX, point.x);
    b.minY = Math.min(b.minY, point.y);
    b.maxY = Math.max(b.maxY, point.y);
  }
  return Number.isFinite(b.minX) ? b : null;
}

function pathData(points) {
  if (!points?.length) return '';
  return 'M ' + points.map(point => point.x.toFixed(5) + ' ' + (-point.y).toFixed(5)).join(' L ') + ' Z';
}

function svgElement(type, attributes) {
  const node = document.createElementNS(SVG_NS, type);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function drawPreview() {
  const preview = state.job ?? state.cutPreview;
  const shown = preview?.preview?.profiles;
  const designProfiles = shown
    ? shown.map(item => ({ points: item.designPath, side: item.side }))
    : state.profiles.map(item => ({ points: item.points, side: item.side }));
  const design = designProfiles.map(item => item.points);
  const tools = shown ? shown.map(item => item.toolCenterPath) : [];
  const b = boundsOf([...design, ...tools]);
  const svg = $('gear-preview');
  for (const id of ['preview-kept', 'preview-removed', 'preview-cutarea', 'preview-toolpaths',
    'preview-contours', 'preview-tabpaths', 'preview-order']) $(id).replaceChildren();
  $('kept-legend').hidden = !designProfiles.some(item => item.side === 'outside');
  $('removed-legend').hidden = !designProfiles.some(item => item.side === 'inside');
  $('cutarea-legend').hidden = !shown;
  $('toolpath-legend').hidden = !shown;
  $('tab-legend').hidden = true;
  if (!b) return;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 10);
  const pad = Math.max(span * .09, 2);
  const width = b.maxX - b.minX + pad * 2;
  const height = b.maxY - b.minY + pad * 2;
  svg.setAttribute('viewBox', [b.minX - pad, -b.maxY - pad, width, height].join(' '));
  const mark = Math.max(span * .018, .8);
  $('origin-mark').setAttribute('d', 'M' + (-mark) + ' 0H' + mark + ' M0 ' + (-mark) + 'V' + mark);
  const outside = designProfiles.filter(item => item.side === 'outside' && item.points?.length);
  const openings = designProfiles.filter(item => item.side === 'inside' && item.points?.length);
  for (const item of outside) {
    $('preview-kept').append(svgElement('path', {
      d: pathData(item.points), fill: 'currentColor', stroke: 'none',
    }));
  }
  for (const item of openings) {
    $('preview-removed').append(svgElement('path', {
      d: pathData(item.points), fill: 'currentColor', stroke: 'none',
    }));
  }
  designProfiles.forEach((item, index) => {
    const points = item.points;
    if (!points?.length) return;
    $('preview-contours').append(svgElement('path', {
      d: pathData(points), fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke',
    }));
    const first = points[0];
    const r = Math.max(span * .015, 1.5);
    const badge = svgElement('g', {});
    badge.append(svgElement('circle', {
      cx: first.x, cy: -first.y, r, fill: '#ffc857',
      stroke: '#07100e', 'stroke-width': .6, 'vector-effect': 'non-scaling-stroke',
    }));
    const label = svgElement('text', {
      x: first.x, y: -first.y + r * .35, 'text-anchor': 'middle',
      fill: '#07100e', 'font-size': r * .95, 'font-family': 'Space Mono, monospace',
      'font-weight': '700',
    });
    label.textContent = String(index + 1);
    badge.append(label);
    $('preview-order').append(badge);
  });
  let hasTabs = false;
  shown?.forEach(item => {
    if (item.toolCenterPath?.length) {
      $('preview-cutarea').append(svgElement('path', {
        d: pathData(item.toolCenterPath), fill: 'none', stroke: 'currentColor',
        'stroke-width': preview.metadata.bitDiameter,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }));
      $('preview-toolpaths').append(svgElement('path', {
        d: pathData(item.toolCenterPath), fill: 'none', stroke: 'currentColor',
        'stroke-width': 1.45, 'stroke-dasharray': '4 3',
        'vector-effect': 'non-scaling-stroke',
      }));
    }
    for (const tab of item.tabs ?? []) {
      const segment = tab.path ?? [tab.from, tab.to].filter(Boolean);
      if (segment.length < 2) continue;
      hasTabs = true;
      $('preview-tabpaths').append(svgElement('path', {
        d: 'M ' + segment.map(point => point.x.toFixed(5) + ' ' + (-point.y).toFixed(5)).join(' L '),
        fill: 'none', stroke: 'currentColor', 'stroke-width': 4,
        'vector-effect': 'non-scaling-stroke',
      }));
    }
  });
  $('tab-legend').hidden = !hasTabs;
}

function updateImportedSummary() {
  const b = boundsOf(state.profiles.map(item => item.points));
  $('profile-count').textContent = state.profiles.length;
  $('drawing-width').textContent = b ? (b.maxX - b.minX).toFixed(2) + ' mm' : '—';
  $('drawing-height').textContent = b ? (b.maxY - b.minY).toFixed(2) + ' mm' : '—';
  $('drawing-label').textContent = 'IMPORTED DXF · TOP VIEW';
}

function cutProfiles() {
  return state.profiles.map(item => {
    if (!['inside', 'on', 'outside'].includes(item.side)) throw new Error('Choose a bit side for every profile.');
    const output = { id: item.id, name: item.name, points: item.points, side: item.side };
    const rawCount = item.tabs.count;
    if (item.side === 'outside' && rawCount !== '' &&
        (!Number.isInteger(Number(rawCount)) || Number(rawCount) < 0 || Number(rawCount) > 24)) {
      throw new Error('Tabs for ' + item.name + ' must be a whole count from 0 to 24.');
    }
    if (item.side === 'outside' && rawCount !== '' && Number(rawCount) > 0) {
      const count = Number(rawCount);
      const widthMm = Number(item.tabs.widthMm);
      const heightMm = Number(item.tabs.heightMm);
      if (!Number.isInteger(count) || count < 1 || !Number.isFinite(widthMm) || widthMm <= 0 ||
          !Number.isFinite(heightMm) || heightMm <= 0) {
        throw new Error('Enter a whole tab count, width, and height for ' + item.name + '.');
      }
      output.tabs = { count, widthMm, heightMm };
    } else if (item.side === 'outside' && (item.tabs.widthMm || item.tabs.heightMm)) {
      throw new Error('Enter a tab count for ' + item.name + ', or clear its tab dimensions.');
    }
    return output;
  });
}

function readSettings() {
  const fields = [
    ['stock-thickness', 'stock thickness'],
    ['pass-count', 'number of passes'], ['step-down', 'depth per pass'], ['safe-z', 'safe Z'],
    ['feed-rate', 'XY feed'], ['plunge-rate', 'plunge feed'],
    ['spindle-rpm', 'spindle speed'],
  ];
  for (const [id, label] of fields) {
    if (number(id) === null) throw new Error('Enter a valid ' + label + ' to preview the cut.');
  }
  const skinRaw = $('skin-thickness').value.trim();
  const skin = skinRaw ? number('skin-thickness') : 0;
  if (skin === null) throw new Error('Enter a valid bottom skin thickness.');
  const thickness = number('stock-thickness');
  if (skin >= thickness) throw new Error('Bottom skin must be thinner than the stock.');
  const bit = readBitDiameter();
  return {
    bitDiameter: bit.mm,
    materialThickness: thickness,
    stepdown: number('step-down'),
    ...(state.depthMode === 'passes' ? { passCount: number('pass-count') } : {}),
    safeZ: number('safe-z'),
    feedRate: number('feed-rate'),
    plungeRate: number('plunge-rate'),
    spindleRPM: number('spindle-rpm'),
    skinMm: skin,
    origin: $('work-origin').value,
    centerCuttingConfirmed: $('confirm-center-bit').checked,
    partHoldDownConfirmed: $('confirm-hold-down').checked,
  };
}

function readBitDiameter() {
  return normalizeBitDiameter($('tool-diameter').value.trim(), $('tool-unit').value);
}

function decimal(value, places) {
  return String(Number(value.toFixed(places)));
}

function updateToolDiameter() {
  const input = $('tool-diameter');
  const unit = $('tool-unit').value;
  input.min = unit === 'in' ? String(MIN_PROFILE_BIT_MM / MM_PER_INCH) : String(MIN_PROFILE_BIT_MM);
  input.max = unit === 'in' ? String(100 / MM_PER_INCH) : '100';
  input.placeholder = unit === 'in' ? 'e.g. 0.125' : 'e.g. 3';
  if (!input.value.trim() || !unit) {
    status($('tool-diameter-summary'), 'Enter the number printed on the bit, then choose its units.');
    return;
  }
  try {
    const bit = normalizeBitDiameter(input.value.trim(), unit);
    status($('tool-diameter-summary'), `Cutter compensation: ${decimal(bit.mm, 4)} mm (${decimal(bit.inches, 5)} in). The G-code will use this metric diameter.`, 'success');
  } catch (error) {
    status($('tool-diameter-summary'), error.message, 'error');
  }
}

function updateSafety() {
  updateToolDiameter();
  const stock = number('stock-thickness');
  const skinRaw = $('skin-thickness').value.trim();
  const skin = skinRaw ? number('skin-thickness') : 0;
  $('final-depth').textContent = stock !== null && skin !== null && skin < stock
    ? (stock - skin).toFixed(2) : '—';
  if (stock !== null && skin !== null && skin < stock && number('pass-count') !== null &&
      number('step-down') !== null) {
    const depth = stock - skin;
    const count = number('pass-count');
    const step = number('step-down');
    const finalPass = depth - step * (count - 1);
    $('pass-summary').textContent = state.depthMode === 'passes'
      ? count + ' equal passes · ' + (depth / count).toFixed(3) + ' mm each.'
      : count + ' passes · up to ' + step.toFixed(3) + ' mm, last ' + Math.max(0, finalPass).toFixed(3) + ' mm.';
  } else {
    $('pass-summary').textContent = 'Enter a pass count or depth per pass; the other value updates.';
  }
  $('through-cut-check').hidden = !(stock !== null && skin === 0);
  $('origin-instructions').textContent = originInstructions();
}

function refresh() {
  updateSafety();
  $('download-dxf').disabled = !state.profiles.length;
  state.job = null;
  state.cutPreview = null;
  if (!state.profiles.length) {
    status($('validation-messages'), 'Load a drawing or enter valid gear pair values.', 'error');
    drawPreview();
    $('download-gcode').disabled = true;
    return;
  }
  let profiles;
  try {
    profiles = cutProfiles();
    const settings = readSettings();
    state.job = generateJob({ profiles, settings });
    const passes = state.job.metadata?.passDepths?.length;
    const prefix = passes ? passes + ' depth pass' + (passes === 1 ? '' : 'es') : 'Toolpath';
    const confirmations = [];
    if (!$('confirm-tool-size').checked) confirmations.push('installed bit size');
    if (!$('confirm-origin').checked) confirmations.push('work origin');
    if (!$('confirm-cut-side').checked) confirmations.push('orange band is on the waste side');
    const ack = confirmations.length ? ' · confirm ' + confirmations.join(' and ') + ' to download' : '';
    status($('validation-messages'), prefix + ' · ' + profiles.length + ' profile' +
      (profiles.length === 1 ? '' : 's') + ' in order' + ack, 'success');
  } catch (error) {
    status($('validation-messages'), error.message, 'error');
  }
  if (!state.job) {
    try {
      profiles ??= cutProfiles();
      const bit = readBitDiameter();
      state.cutPreview = generateToolpathPreview({
        profiles,
        bitDiameter: bit.mm,
        origin: $('work-origin').value,
      });
    } catch {
      // The filled part still updates immediately. The cutter path appears once
      // every profile has a side and a valid bit diameter with explicit units.
    }
  }
  $('download-gcode').disabled = !state.job || !$('confirm-tool-size').checked || !$('confirm-origin').checked ||
    !$('confirm-cut-side').checked;
  drawPreview();
}

function scheduleRefresh() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(refresh, 100);
}

function syncPassControls(changedId) {
  if (changedId === 'pass-count') state.depthMode = 'passes';
  if (changedId === 'step-down') state.depthMode = 'stepdown';
  const stock = number('stock-thickness');
  const skinRaw = $('skin-thickness').value.trim();
  const skin = skinRaw ? number('skin-thickness') : 0;
  if (stock === null || skin === null || stock <= skin) return;
  const depth = stock - skin;
  if (state.depthMode === 'passes') {
    const passes = number('pass-count');
    if (passes !== null) $('step-down').value = (depth / passes).toFixed(4);
  } else {
    const step = number('step-down');
    if (step !== null) $('pass-count').value = Math.ceil(depth / step);
  }
}

function applyGearInput() {
  if (state.mode !== 'gear') return;
  updateGearRelations();
  try {
    rebuildGear();
    renderCutList();
    status($('drawing-status'), '');
    status($('gear-validity'), 'Both gear outlines pass the shape check. Check bit size and material fit before cutting.', 'success');
  } catch (error) {
    state.pair = null;
    state.profiles = [];
    for (const id of ['pitch-value', 'outside-value', 'root-value']) $(id).textContent = '—';
    $('drawing-label').textContent = 'CHECK GEAR VALUES';
    renderCutList();
    status($('drawing-status'), error.message, 'error');
    status($('gear-validity'), error.message, 'error');
  }
  refresh();
}

function selectPart(part) {
  state.part = part;
  $('confirm-cut-side').checked = false;
  for (const choice of ['pinion', 'gear']) {
    const button = $('select-' + choice);
    button.classList.toggle('is-active', choice === part);
    button.setAttribute('aria-pressed', String(choice === part));
  }
  applyGearInput();
}

function setSourceMode(mode) {
  if (state.mode === mode) return;
  clearTimeout(updateTimer);
  sourceReadId++;
  state.savedSources[state.mode] = {
    profiles: state.profiles, fileName: state.fileName,
    origin: $('work-origin').value, pendingDXF: state.pendingDXF,
    message: state.readingSource ? 'File reading was interrupted. Choose the file again.' : $('source-status').textContent,
    kind: state.readingSource || $('source-status').classList.contains('is-error') ? 'error' : '',
  };
  state.readingSource = false;
  const saved = state.savedSources[mode];
  state.mode = mode;
  state.profiles = saved?.profiles ?? [];
  state.fileName = saved?.fileName ?? '';
  state.pair = null;
  state.job = null;
  state.cutPreview = null;
  state.pendingDXF = null;
  if (mode === 'dxf') state.pendingDXF = saved?.pendingDXF ?? null;
  $('work-origin').value = saved?.origin ?? (mode === 'gear' ? 'center' : 'lower-left');
  $('confirm-origin').checked = false;
  $('confirm-cut-side').checked = false;
  showMode();
  if (mode === 'gear') {
    status($('source-status'), saved?.message ?? 'Using the gear pair values below.', saved?.kind);
    applyGearInput();
  } else {
    renderCutList();
    updateImportedSummary();
    refresh();
    status($('source-status'), saved?.message ?? 'Open a DXF drawing of the part you want to cut.', saved?.kind);
    status($('drawing-status'), state.profiles.length
      ? 'Check the cut side and order for every imported profile.' : 'Open a DXF to preview its outlines.');
    if (!state.profiles.length) $('drawing-label').textContent = 'OPEN A DXF DRAWING';
  }
}

function download(text, name, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function fileStem() {
  if (state.mode === 'dxf') return (state.fileName.replace(/\.[^.]+$/, '') || 'drawing')
    .replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 50);
  return 'CVS-' + state.part + '-' + state.pair[state.part].teeth + 'T';
}

gearForm.addEventListener('input', event => {
  if (event.target.id === 'lock-tooth-size') return;
  $('confirm-cut-side').checked = false;
  syncLinkedCenter(event.target.id);
  updateGearRelations();
  clearGearWhileEditing();
  status($('source-status'), 'Using the values entered below.');
  clearTimeout(updateTimer);
  updateTimer = setTimeout(applyGearInput, 100);
});
// The checkbox sits inside the form, but its change sets the relationship
// rather than changing a numeric gear input.
$('lock-tooth-size').addEventListener('change', () => {
  updateToothSizeLock();
  if (state.mode === 'gear') applyGearInput();
});
gearForm.addEventListener('submit', event => event.preventDefault());
cutForm.addEventListener('submit', event => event.preventDefault());
$('bore-diameter').addEventListener('input', () => {
  $('confirm-cut-side').checked = false;
  clearGearWhileEditing();
  clearTimeout(updateTimer);
  updateTimer = setTimeout(applyGearInput, 100);
});
cutForm.addEventListener('input', event => {
  if (event.target.id === 'tool-diameter') {
    $('confirm-tool-size').checked = false;
    $('confirm-cut-side').checked = false;
  }
  syncPassControls(event.target.id);
  scheduleRefresh();
});
cutForm.addEventListener('change', event => {
  if (event.target.id === 'tool-unit') {
    $('confirm-tool-size').checked = false;
    $('confirm-cut-side').checked = false;
    updateToolDiameter();
  }
  scheduleRefresh();
});
$('confirm-tool-size').addEventListener('change', refresh);
$('confirm-origin').addEventListener('change', refresh);
$('confirm-cut-side').addEventListener('change', refresh);
$('confirm-center-bit').addEventListener('change', refresh);
$('confirm-hold-down').addEventListener('change', refresh);
$('work-origin').addEventListener('change', () => {
  $('confirm-origin').checked = false;
  refresh();
});
$('select-pinion').addEventListener('click', () => selectPart('pinion'));
$('select-gear').addEventListener('click', () => selectPart('gear'));
$('mode-gear').addEventListener('click', () => setSourceMode('gear'));
$('mode-dxf').addEventListener('click', () => setSourceMode('dxf'));

cutList.addEventListener('click', event => {
  const button = event.target.closest('[data-move]');
  if (!button) return;
  const row = button.closest('[data-id]');
  const index = state.profiles.findIndex(item => item.id === row.dataset.id);
  const next = index + Number(button.dataset.move);
  if (index < 0 || next < 0 || next >= state.profiles.length) return;
  [state.profiles[index], state.profiles[next]] = [state.profiles[next], state.profiles[index]];
  renderCutList();
  refresh();
});

function updateRow(event) {
  const row = event.target.closest('[data-id]');
  if (!row) return;
  const item = state.profiles.find(profileItem => profileItem.id === row.dataset.id);
  if (!item) return;
  if (event.target.matches('[data-side]')) {
    item.side = event.target.value;
    $('confirm-cut-side').checked = false;
    row.querySelector('.tabs-fields').hidden = item.side !== 'outside';
    updateSideHelp(row, item);
  } else if (event.target.matches('[data-tab]')) {
    item.tabs[event.target.dataset.tab] = event.target.value;
  }
  scheduleRefresh();
}
cutList.addEventListener('input', updateRow);
cutList.addEventListener('change', updateRow);

$('workbook-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  setSourceMode('gear');
  const readId = ++sourceReadId;
  state.readingSource = true;
  clearTimeout(updateTimer);
  invalidateSource();
  status($('source-status'), 'Reading ' + file.name + '…');
  try {
    const result = await parseWorkbook(file);
    if (readId !== sourceReadId) return;
    for (const [key, id] of Object.entries({
      pinionTeeth: 'pinion-teeth', gearTeeth: 'gear-teeth',
      pressureAngleDeg: 'pressure-angle', centerDistance: 'center-distance',
      pinionSafety: 'pinion-safety', gearSafety: 'gear-safety',
    })) $(id).value = result.params[key];
    $('lock-tooth-size').checked = false;
    updateToothSizeLock();
    state.mode = 'gear';
    state.profiles = [];
    state.fileName = file.name;
    $('work-origin').value = 'center';
    $('confirm-origin').checked = false;
    $('confirm-cut-side').checked = false;
    showMode();
    applyGearInput();
    const trace = result.cachedTrace?.matchesInputs === false
      ? state.pair
        ? ' The saved drawing differs from the inputs; the preview uses freshly generated values.'
        : ' The saved drawing was not used because this pair fails the shape check.' : '';
    status($('source-status'), 'Loaded six gear inputs from ' + file.name + '.' + trace +
      (state.pair ? '' : ' Fix the gear shape before exporting.'), state.pair ? 'success' : 'error');
  } catch (error) {
    if (readId === sourceReadId) status($('source-status'), error.message, 'error');
  } finally {
    if (readId === sourceReadId) state.readingSource = false;
    event.target.value = '';
  }
});

function loadDXF(text, fileName, unitOverride) {
  setSourceMode('dxf');
  clearTimeout(updateTimer);
  state.loadedDXF = { text, fileName, unitOverride };
  $('dxf-import-notes').textContent = '';
  invalidateSource();
  try {
    const result = parseDXF(text, {
      unitOverride, ignoreAnnotations: $('dxf-ignore-annotations').checked,
    });
    if (!result.profiles.length) throw new Error('No closed 2D profiles found in this DXF.');
    if (result.profiles.length > 32) throw new Error('This DXF has more than 32 closed profiles; split it into smaller jobs.');
    state.mode = 'dxf';
    state.fileName = fileName;
    state.pendingDXF = null;
    $('dxf-units-prompt').hidden = true;
    state.pair = null;
    state.profiles = result.profiles.map((item, index) => profile(
      String(item.id ?? 'profile-' + index), item.layer ? item.layer + ' · ' + (index + 1) : 'Profile ' + (index + 1),
      item.points, '', null, { kind: item.kind, center: item.center, radius: item.radius }));
    $('work-origin').value = 'lower-left';
    $('confirm-origin').checked = false;
    $('confirm-cut-side').checked = false;
    showMode();
    renderCutList();
    updateImportedSummary();
    $('dxf-import-notes').textContent = result.ignoredEntities.length
      ? 'Skipped ' + result.ignoredEntities.map(item => item.count + ' ' + item.type).join(', ') +
        '. These annotations will not be cut.' : '';
    refresh();
    status($('drawing-status'), 'Choose the bit side for every imported profile.');
    status($('source-status'), 'Loaded ' + state.profiles.length + ' closed profile' +
      (state.profiles.length === 1 ? '' : 's') + ' from ' + fileName + ' (' +
      (result.sourceUnits === 'in' ? 'inches' : 'millimeters') + ').', 'success');
  } catch (error) {
    if (error.message.includes('$INSUNITS')) {
      state.pendingDXF = { text, fileName };
      $('dxf-units-prompt').hidden = false;
    } else {
      state.pendingDXF = null;
      $('dxf-units-prompt').hidden = true;
    }
    status($('source-status'), error.message, 'error');
  }
}

$('dxf-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  setSourceMode('dxf');
  const readId = ++sourceReadId;
  state.readingSource = true;
  state.loadedDXF = null;
  state.pendingDXF = null;
  $('dxf-units-prompt').hidden = true;
  $('dxf-import-notes').textContent = '';
  clearTimeout(updateTimer);
  invalidateSource();
  status($('source-status'), 'Reading ' + file.name + '…');
  try {
    const text = await file.text();
    if (readId === sourceReadId) loadDXF(text, file.name);
  } catch (error) {
    if (readId === sourceReadId) status($('source-status'), 'Could not read ' + file.name + ': ' + error.message, 'error');
  } finally {
    if (readId === sourceReadId) state.readingSource = false;
    event.target.value = '';
  }
});

$('dxf-ignore-annotations').addEventListener('change', () => {
  if (state.mode !== 'dxf' || !state.loadedDXF) return;
  const { text, fileName, unitOverride } = state.loadedDXF;
  loadDXF(text, fileName, unitOverride);
});

$('retry-dxf').addEventListener('click', () => {
  if (!state.pendingDXF) return;
  loadDXF(state.pendingDXF.text, state.pendingDXF.fileName, $('dxf-unit-override').value);
});

$('download-dxf').addEventListener('click', () => {
  if (!state.profiles.length) return;
  try {
    const dxf = exportJobDXF({ profiles: state.profiles, unit: 'mm' });
    download(dxf, fileStem() + '.dxf', 'application/dxf');
  } catch (error) {
    status($('validation-messages'), error.message, 'error');
  }
});

$('download-gcode').addEventListener('click', () => {
  refresh();
  if (!state.job || !$('confirm-tool-size').checked || !$('confirm-origin').checked ||
      !$('confirm-cut-side').checked) return;
  download(state.job.gcode, fileStem() + '-GRBL.nc', 'text/plain');
});

showMode();
applyGearInput();
