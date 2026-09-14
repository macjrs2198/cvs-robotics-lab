(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.CVSDiningRoomModel = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SCENE_ID = "byte-to-bite-dining-room";
  const SENSOR_WIDTH = 320;
  const SENSOR_HEIGHT = 240;
  const CAMERA_HORIZONTAL_FOV_DEGREES = 60;
  const CAMERA_HORIZONTAL_FOV_RADIANS = CAMERA_HORIZONTAL_FOV_DEGREES * Math.PI / 180;
  const CAMERA_FOCAL_LENGTH = (SENSOR_WIDTH / 2) / Math.tan(CAMERA_HORIZONTAL_FOV_RADIANS / 2);
  const CAMERA_VERTICAL_FOV_RADIANS = 2 * Math.atan((SENSOR_HEIGHT / 2) / CAMERA_FOCAL_LENGTH);
  const CAMERA_VERTICAL_FOV_DEGREES = CAMERA_VERTICAL_FOV_RADIANS * 180 / Math.PI;
  const CAMERA_MIN_HEIGHT = 5.5;
  const CAMERA_MAX_HEIGHT = 24;
  const CAMERA_DEFAULT_HEIGHT = 12;
  const CAMERA_HEIGHT_STEP = 0.5;
  const CAMERA_DOWN_45_PITCH_DEGREES = 45;
  const CAMERA_DOWN_PITCH_DEGREES = 60;
  const CAMERA_NEAR_PLANE = 0.05;
  const MIN_PROJECTED_PATTERN_PIXELS = 8;
  const PATTERN_SIDE = 7.6388889;
  const PAPER_SIDE = 8.5;
  const TABLE_SIDE = 12;
  const TABLE_TOP_Z = 3.625;
  const TABLE_MARKER_PLANE_Z = 3.6281;
  const WALL_HEIGHT = 18;
  const WALL_INNER_HALF_SPAN = 66;
  const WALL_LONG_HALF_LENGTH = 69.625;
  const WALL_SHORT_HALF_LENGTH = 42;
  const WALL_MARKER_PLANE = 65.9969;
  const WALL_MARKER_CENTER_Z = 9;
  const ROBOT_DEFAULT_LENGTH = 18;
  const ROBOT_DEFAULT_WIDTH = 18;
  const ROBOT_DIMENSION_MIN = 6;
  const ROBOT_DIMENSION_MAX = 36;
  const ROBOT_DIMENSION_STEP = 0.5;
  const ROBOT_CORNER_RADIUS = 2;
  const ROBOT_TOP_Z = 4.5;
  const ROBOT_CORNER_SEGMENTS = 8;
  const MAX_LINEAR_SPEED = 100;
  const DRIVE_TRACK_WIDTH = 70;
  const MAX_TRANSLATION_SUBSTEP = 0.5;
  const MAX_ROTATION_SUBSTEP_DEGREES = 2;
  const MAX_ROTATION_SUBSTEP_RADIANS = MAX_ROTATION_SUBSTEP_DEGREES * Math.PI / 180;
  const MAX_DELTA_SECONDS = 1;
  const DEFAULT_START_POSE_ID = "table-4-north";
  const DEFAULT_MOUNT = "front";
  const DEFAULT_HEAD = "forward";
  const WORLD_VIEW_WIDTH = 320;
  const WORLD_VIEW_HEIGHT = 220;
  const WORLD_VIEW_PADDING = 14;
  const WORLD_VIEW_MAX_RAY_LENGTH = 120;
  const EPSILON = 1e-7;

  const MOUNTS = Object.freeze({
    front: Object.freeze({ id: "front", label: "Front", yaw: 0 }),
    rear: Object.freeze({ id: "rear", label: "Rear", yaw: Math.PI }),
    left: Object.freeze({ id: "left", label: "Left", yaw: Math.PI / 2 }),
    right: Object.freeze({ id: "right", label: "Right", yaw: -Math.PI / 2 })
  });

  const HEADS = Object.freeze({
    forward: Object.freeze({ id: "forward", label: "Look Forward", pitchDegrees: 0 }),
    down45: Object.freeze({ id: "down45", label: "Look Down 45°", pitchDegrees: CAMERA_DOWN_45_PITCH_DEGREES }),
    down: Object.freeze({ id: "down", label: "Look Down", pitchDegrees: CAMERA_DOWN_PITCH_DEGREES })
  });

  const OUTER_BOUNDARY = Object.freeze({
    minimumX: -90,
    maximumX: 90,
    minimumY: -90,
    maximumY: 90,
    kind: "simulation-boundary"
  });

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function finiteNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function normalizeAngle(angle) {
    let normalized = finiteNumber(angle, 0);
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized <= -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

  function copyPoint(point) {
    return {
      x: finiteNumber(point && point.x, 0),
      y: finiteNumber(point && point.y, 0),
      z: finiteNumber(point && point.z, 0)
    };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function scale(vector, factor) {
    return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function magnitude(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function normalizeVector(vector) {
    const length = magnitude(vector);
    if (length <= EPSILON) return { x: 0, y: 0, z: 0 };
    return scale(vector, 1 / length);
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function normalizePose(pose) {
    const source = pose && pose.robot ? pose.robot : pose;
    return {
      x: finiteNumber(source && source.x, 0),
      y: finiteNumber(source && source.y, 0),
      heading: normalizeAngle(source && source.heading)
    };
  }

  function normalizeChassis(candidate) {
    const source = candidate && candidate.chassis ? candidate.chassis : candidate || {};
    const unclampedLength = finiteNumber(source.length, ROBOT_DEFAULT_LENGTH);
    const unclampedWidth = finiteNumber(source.width, ROBOT_DEFAULT_WIDTH);
    const steppedLength = Math.round(unclampedLength / ROBOT_DIMENSION_STEP) * ROBOT_DIMENSION_STEP;
    const steppedWidth = Math.round(unclampedWidth / ROBOT_DIMENSION_STEP) * ROBOT_DIMENSION_STEP;

    return {
      length: clamp(steppedLength, ROBOT_DIMENSION_MIN, ROBOT_DIMENSION_MAX),
      width: clamp(steppedWidth, ROBOT_DIMENSION_MIN, ROBOT_DIMENSION_MAX)
    };
  }

  function resolveChassis(stateOrPose, options) {
    if (options && options.chassis) return normalizeChassis(options.chassis);
    if (stateOrPose && stateOrPose.chassis) return normalizeChassis(stateOrPose.chassis);
    return normalizeChassis();
  }

  function normalizeCameraSettings(camera) {
    const source = camera || {};
    const mount = Object.prototype.hasOwnProperty.call(MOUNTS, source.mount)
      ? source.mount
      : DEFAULT_MOUNT;
    const headCandidate = source.head || source.pitch;
    const head = Object.prototype.hasOwnProperty.call(HEADS, headCandidate)
      ? headCandidate
      : DEFAULT_HEAD;
    const unclampedHeight = finiteNumber(source.height, CAMERA_DEFAULT_HEIGHT);
    const steppedHeight = Math.round(unclampedHeight / CAMERA_HEIGHT_STEP) * CAMERA_HEIGHT_STEP;

    return {
      mount,
      height: clamp(steppedHeight, CAMERA_MIN_HEIGHT, CAMERA_MAX_HEIGHT),
      head
    };
  }

  function wall(id, start, end, normal) {
    return deepFreeze({
      id,
      kind: "competition-wall",
      start: { x: start.x, y: start.y, z: 0 },
      end: { x: end.x, y: end.y, z: 0 },
      normal: { x: normal.x, y: normal.y, z: 0 },
      height: WALL_HEIGHT
    });
  }

  const WALLS = Object.freeze([
    wall("wall-top", { x: -WALL_SHORT_HALF_LENGTH, y: WALL_INNER_HALF_SPAN }, { x: WALL_SHORT_HALF_LENGTH, y: WALL_INNER_HALF_SPAN }, { x: 0, y: -1 }),
    wall("wall-right", { x: WALL_INNER_HALF_SPAN, y: WALL_LONG_HALF_LENGTH }, { x: WALL_INNER_HALF_SPAN, y: -WALL_LONG_HALF_LENGTH }, { x: -1, y: 0 }),
    wall("wall-bottom", { x: WALL_SHORT_HALF_LENGTH, y: -WALL_INNER_HALF_SPAN }, { x: -WALL_SHORT_HALF_LENGTH, y: -WALL_INNER_HALF_SPAN }, { x: 0, y: 1 }),
    wall("wall-left", { x: -WALL_INNER_HALF_SPAN, y: -WALL_LONG_HALF_LENGTH }, { x: -WALL_INNER_HALF_SPAN, y: WALL_LONG_HALF_LENGTH }, { x: 1, y: 0 })
  ]);

  const TABLES = Object.freeze((function () {
    const centers = [-36, 0, 36];
    const tables = [];
    let markerId = 0;

    for (let row = 0; row < centers.length; row += 1) {
      const y = centers[centers.length - 1 - row];
      for (let column = 0; column < centers.length; column += 1) {
        const x = centers[column];
        tables.push(deepFreeze({
          id: `table-${markerId}`,
          kind: "table",
          markerId,
          center: { x, y, z: TABLE_TOP_Z },
          width: TABLE_SIDE,
          depth: TABLE_SIDE,
          topZ: TABLE_TOP_Z,
          bounds: {
            minimumX: x - TABLE_SIDE / 2,
            maximumX: x + TABLE_SIDE / 2,
            minimumY: y - TABLE_SIDE / 2,
            maximumY: y + TABLE_SIDE / 2,
            minimumZ: 0,
            maximumZ: TABLE_TOP_Z
          }
        }));
        markerId += 1;
      }
    }

    return tables;
  })());

  function marker(id, surface, ownerId, center, normal, up) {
    const normalizedNormal = normalizeVector(normal);
    const normalizedUp = normalizeVector(up);
    const right = normalizeVector(cross(normalizedUp, normalizedNormal));
    const half = PATTERN_SIDE / 2;
    const corners = [
      add(add(center, scale(right, -half)), scale(normalizedUp, half)),
      add(add(center, scale(right, half)), scale(normalizedUp, half)),
      add(add(center, scale(right, half)), scale(normalizedUp, -half)),
      add(add(center, scale(right, -half)), scale(normalizedUp, -half))
    ];

    return deepFreeze({
      id,
      kind: "fiducial",
      surface,
      ownerId,
      center: copyPoint(center),
      normal: normalizedNormal,
      up: normalizedUp,
      right,
      patternSide: PATTERN_SIDE,
      paperSide: PAPER_SIDE,
      corners
    });
  }

  const FIDUCIALS = Object.freeze((function () {
    const markers = TABLES.map((table) => marker(
      table.markerId,
      "table",
      table.id,
      { x: table.center.x, y: table.center.y, z: TABLE_MARKER_PLANE_Z },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 }
    ));

    [
      [9, -18, WALL_MARKER_PLANE, "wall-top", { x: 0, y: -1, z: 0 }],
      [10, 18, WALL_MARKER_PLANE, "wall-top", { x: 0, y: -1, z: 0 }]
    ].forEach(([id, x, y, ownerId, normal]) => {
      markers.push(marker(id, "wall", ownerId, { x, y, z: WALL_MARKER_CENTER_Z }, normal, { x: 0, y: 0, z: 1 }));
    });

    [
      [11, 54], [12, 18], [13, -18], [14, -54]
    ].forEach(([id, y]) => {
      markers.push(marker(id, "wall", "wall-right", { x: WALL_MARKER_PLANE, y, z: WALL_MARKER_CENTER_Z }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }));
    });

    [
      [16, -18], [15, 18]
    ].forEach(([id, x]) => {
      markers.push(marker(id, "wall", "wall-bottom", { x, y: -WALL_MARKER_PLANE, z: WALL_MARKER_CENTER_Z }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }));
    });

    [
      [20, 54], [19, 18], [18, -18], [17, -54]
    ].forEach(([id, y]) => {
      markers.push(marker(id, "wall", "wall-left", { x: -WALL_MARKER_PLANE, y, z: WALL_MARKER_CENTER_Z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }));
    });

    return markers.sort((a, b) => a.id - b.id);
  })());

  const START_POSES = Object.freeze([
    deepFreeze({ id: "table-4-north", label: "Center table — north side", x: 0, y: 16, heading: -Math.PI / 2 }),
    deepFreeze({ id: "center-lane-northwest", label: "Northwest lane intersection", x: -18, y: 18, heading: -Math.PI / 2 }),
    deepFreeze({ id: "center-lane-southeast", label: "Southeast lane intersection", x: 18, y: -18, heading: Math.PI / 2 }),
    deepFreeze({ id: "top-opening-right", label: "Top-right opening", x: 54, y: 48, heading: -Math.PI / 2 }),
    deepFreeze({ id: "bottom-opening-left", label: "Bottom-left opening", x: -54, y: -48, heading: Math.PI / 2 })
  ]);

  const START_POSE_BY_ID = Object.freeze(START_POSES.reduce((result, pose) => {
    result[pose.id] = pose;
    return result;
  }, {}));

  const scene = deepFreeze({
    id: SCENE_ID,
    label: "Byte to Bite — Dining Room",
    units: "inches",
    coordinateFrame: {
      x: "+X points right on the World View",
      y: "+Y points toward the Blue/Red side at the top of the World View",
      z: "+Z points up from the floor"
    },
    floorZ: 0,
    competitionInterior: {
      minimumX: -WALL_INNER_HALF_SPAN,
      maximumX: WALL_INNER_HALF_SPAN,
      minimumY: -WALL_INNER_HALF_SPAN,
      maximumY: WALL_INNER_HALF_SPAN
    },
    outerBoundary: OUTER_BOUNDARY,
    walls: WALLS,
    tables: TABLES,
    fiducials: FIDUCIALS,
    startPoses: START_POSES
  });

  function createState(options) {
    const source = options || {};
    const chassis = normalizeChassis(source.chassis);
    const startPoseId = Object.prototype.hasOwnProperty.call(START_POSE_BY_ID, source.startPoseId)
      ? source.startPoseId
      : DEFAULT_START_POSE_ID;
    const selectedStart = START_POSE_BY_ID[startPoseId];
    const requestedRobot = source.robot ? normalizePose(source.robot) : null;
    const selectedRobot = normalizePose(selectedStart);
    if (!isPoseValid({ robot: selectedRobot, chassis })) {
      throw new Error(`Start pose ${startPoseId} does not fit the ${chassis.length} × ${chassis.width}-inch chassis.`);
    }
    const robot = requestedRobot && isPoseValid({ robot: requestedRobot, chassis })
      ? requestedRobot
      : selectedRobot;
    const cameraSource = source.camera || source;

    return {
      sceneId: SCENE_ID,
      startPoseId,
      robot,
      chassis,
      camera: normalizeCameraSettings(cameraSource)
    };
  }

  function applyStartPose(state, startPoseId) {
    let sourceState = state;
    let requestedId = startPoseId;

    if (typeof state === "string" && startPoseId === undefined) {
      requestedId = state;
      sourceState = createState();
    }

    const current = sourceState && sourceState.robot ? sourceState : createState();
    const validId = Object.prototype.hasOwnProperty.call(START_POSE_BY_ID, requestedId)
      ? requestedId
      : DEFAULT_START_POSE_ID;
    const selected = START_POSE_BY_ID[validId];
    const chassis = normalizeChassis(current.chassis);
    const robot = normalizePose(selected);

    if (!isPoseValid({ robot, chassis })) {
      throw new Error(`Start pose ${validId} does not fit the ${chassis.length} × ${chassis.width}-inch chassis.`);
    }

    return {
      ...current,
      sceneId: SCENE_ID,
      startPoseId: validId,
      robot,
      chassis,
      camera: normalizeCameraSettings(current.camera)
    };
  }

  function roundedRectangleLocalPoints(chassis) {
    const halfLength = chassis.length / 2;
    const halfWidth = chassis.width / 2;
    const arcCenterX = halfLength - ROBOT_CORNER_RADIUS;
    const arcCenterY = halfWidth - ROBOT_CORNER_RADIUS;
    const centers = [
      { x: arcCenterX, y: arcCenterY, startAngle: 0 },
      { x: -arcCenterX, y: arcCenterY, startAngle: Math.PI / 2 },
      { x: -arcCenterX, y: -arcCenterY, startAngle: Math.PI },
      { x: arcCenterX, y: -arcCenterY, startAngle: Math.PI * 1.5 }
    ];
    const points = [];

    centers.forEach((center) => {
      for (let index = 0; index <= ROBOT_CORNER_SEGMENTS; index += 1) {
        const angle = center.startAngle + (index / ROBOT_CORNER_SEGMENTS) * Math.PI / 2;
        points.push({
          x: center.x + Math.cos(angle) * ROBOT_CORNER_RADIUS,
          y: center.y + Math.sin(angle) * ROBOT_CORNER_RADIUS
        });
      }
    });

    return points;
  }

  const ROBOT_LOCAL_FOOTPRINTS = new Map();

  function getRobotLocalFootprint(chassis) {
    const normalized = normalizeChassis(chassis);
    const key = `${normalized.length}:${normalized.width}`;
    if (!ROBOT_LOCAL_FOOTPRINTS.has(key)) {
      ROBOT_LOCAL_FOOTPRINTS.set(
        key,
        Object.freeze(roundedRectangleLocalPoints(normalized).map((point) => Object.freeze(point)))
      );
    }
    return ROBOT_LOCAL_FOOTPRINTS.get(key);
  }

  function getRobotFootprint(stateOrPose, chassisSettings) {
    const robot = normalizePose(stateOrPose);
    const chassis = chassisSettings
      ? normalizeChassis(chassisSettings)
      : resolveChassis(stateOrPose);
    const cosine = Math.cos(robot.heading);
    const sine = Math.sin(robot.heading);

    return getRobotLocalFootprint(chassis).map((point) => ({
      x: robot.x + point.x * cosine - point.y * sine,
      y: robot.y + point.x * sine + point.y * cosine
    }));
  }

  function projectPolygonOnAxis(polygon, axis) {
    let minimum = Infinity;
    let maximum = -Infinity;

    polygon.forEach((point) => {
      const projection = point.x * axis.x + point.y * axis.y;
      minimum = Math.min(minimum, projection);
      maximum = Math.max(maximum, projection);
    });

    return { minimum, maximum };
  }

  function polygonsOverlap(first, second) {
    const polygons = [first, second];

    for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex += 1) {
      const polygon = polygons[polygonIndex];
      for (let index = 0; index < polygon.length; index += 1) {
        const current = polygon[index];
        const next = polygon[(index + 1) % polygon.length];
        const edge = { x: next.x - current.x, y: next.y - current.y };
        const axisLength = Math.hypot(edge.x, edge.y);
        if (axisLength <= EPSILON) continue;
        const axis = { x: -edge.y / axisLength, y: edge.x / axisLength };
        const firstProjection = projectPolygonOnAxis(first, axis);
        const secondProjection = projectPolygonOnAxis(second, axis);
        if (
          firstProjection.maximum < secondProjection.minimum - EPSILON ||
          secondProjection.maximum < firstProjection.minimum - EPSILON
        ) {
          return false;
        }
      }
    }

    return true;
  }

  function tableFootprint(table) {
    return [
      { x: table.bounds.minimumX, y: table.bounds.minimumY },
      { x: table.bounds.maximumX, y: table.bounds.minimumY },
      { x: table.bounds.maximumX, y: table.bounds.maximumY },
      { x: table.bounds.minimumX, y: table.bounds.maximumY }
    ];
  }

  function pointOnSegment(point, start, end) {
    const crossValue = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
    if (Math.abs(crossValue) > EPSILON) return false;
    const dotValue = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
    if (dotValue < -EPSILON) return false;
    const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    return dotValue <= squaredLength + EPSILON;
  }

  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function segmentsIntersect(a, b, c, d) {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);

    if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
        ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) {
      return true;
    }

    return (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b)) ||
      (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b)) ||
      (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d)) ||
      (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d));
  }

  function pointInConvexPolygon(point, polygon) {
    let sign = 0;

    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const value = orientation(current, next, point);
      if (Math.abs(value) <= EPSILON) continue;
      const nextSign = Math.sign(value);
      if (sign !== 0 && sign !== nextSign) return false;
      sign = nextSign;
    }

    return true;
  }

  function polygonIntersectsSegment(polygon, start, end) {
    if (pointInConvexPolygon(start, polygon) || pointInConvexPolygon(end, polygon)) return true;

    for (let index = 0; index < polygon.length; index += 1) {
      if (segmentsIntersect(polygon[index], polygon[(index + 1) % polygon.length], start, end)) {
        return true;
      }
    }

    return false;
  }

  function resolveBoundary(options) {
    const requested = options && options.outerBoundary;
    if (!requested) return OUTER_BOUNDARY;

    const boundary = {
      minimumX: finiteNumber(requested.minimumX, OUTER_BOUNDARY.minimumX),
      maximumX: finiteNumber(requested.maximumX, OUTER_BOUNDARY.maximumX),
      minimumY: finiteNumber(requested.minimumY, OUTER_BOUNDARY.minimumY),
      maximumY: finiteNumber(requested.maximumY, OUTER_BOUNDARY.maximumY)
    };

    if (boundary.minimumX >= boundary.maximumX || boundary.minimumY >= boundary.maximumY) {
      return OUTER_BOUNDARY;
    }

    return boundary;
  }

  function collisionForPose(stateOrPose, options) {
    const source = stateOrPose && stateOrPose.robot ? stateOrPose.robot : stateOrPose;
    if (!source || ![Number(source.x), Number(source.y), Number(source.heading)].every(Number.isFinite)) {
      return { kind: "invalid-pose" };
    }
    const robot = normalizePose(stateOrPose);
    const chassis = resolveChassis(stateOrPose, options);

    const footprint = getRobotFootprint(robot, chassis);
    const boundary = resolveBoundary(options);
    const outsideBoundary = footprint.some((point) =>
      point.x < boundary.minimumX - EPSILON ||
      point.x > boundary.maximumX + EPSILON ||
      point.y < boundary.minimumY - EPSILON ||
      point.y > boundary.maximumY + EPSILON
    );
    if (outsideBoundary) return { kind: "simulation-boundary" };

    for (let index = 0; index < TABLES.length; index += 1) {
      if (polygonsOverlap(footprint, tableFootprint(TABLES[index]))) {
        return { kind: "table", id: TABLES[index].id };
      }
    }

    for (let index = 0; index < WALLS.length; index += 1) {
      if (polygonIntersectsSegment(footprint, WALLS[index].start, WALLS[index].end)) {
        return { kind: "wall", id: WALLS[index].id };
      }
    }

    return null;
  }

  function isPoseValid(stateOrPose, options) {
    if (!stateOrPose) return false;
    const source = stateOrPose && stateOrPose.robot ? stateOrPose.robot : stateOrPose;
    if (![Number(source.x), Number(source.y), Number(source.heading)].every(Number.isFinite)) return false;
    return collisionForPose(stateOrPose, options) === null;
  }

  function normalizedDriveOutput(value) {
    return clamp(finiteNumber(value, 0), -100, 100) / 100;
  }

  function advancePose(pose, linearSpeed, angularSpeed, deltaSeconds) {
    const next = normalizePose(pose);
    const rotation = angularSpeed * deltaSeconds;

    if (Math.abs(angularSpeed) <= EPSILON) {
      next.x += Math.cos(next.heading) * linearSpeed * deltaSeconds;
      next.y += Math.sin(next.heading) * linearSpeed * deltaSeconds;
    } else {
      const radius = linearSpeed / angularSpeed;
      const finalHeading = next.heading + rotation;
      next.x += radius * (Math.sin(finalHeading) - Math.sin(next.heading));
      next.y -= radius * (Math.cos(finalHeading) - Math.cos(next.heading));
    }

    next.heading = normalizeAngle(next.heading + rotation);
    return next;
  }

  function integrateRobot(poseOrState, drivetrain, deltaSeconds, options) {
    const initialPose = normalizePose(poseOrState);
    const chassis = resolveChassis(poseOrState, options);
    const dt = clamp(finiteNumber(deltaSeconds, 0), 0, MAX_DELTA_SECONDS);
    const leftSpeed = normalizedDriveOutput(drivetrain && drivetrain.leftOutput) * MAX_LINEAR_SPEED;
    const rightSpeed = normalizedDriveOutput(drivetrain && drivetrain.rightOutput) * MAX_LINEAR_SPEED;
    const linearSpeed = (leftSpeed + rightSpeed) / 2;
    const angularSpeed = (rightSpeed - leftSpeed) / DRIVE_TRACK_WIDTH;
    const translation = Math.abs(linearSpeed * dt);
    const rotation = Math.abs(angularSpeed * dt);
    const substeps = dt === 0
      ? 0
      : Math.max(
          1,
          Math.ceil(translation / MAX_TRANSLATION_SUBSTEP),
          Math.ceil(rotation / MAX_ROTATION_SUBSTEP_RADIANS)
        );
    const attemptedPose = advancePose(initialPose, linearSpeed, angularSpeed, dt);
    let pose = initialPose;
    let collision = null;
    let completedSubsteps = 0;

    for (let index = 0; index < substeps; index += 1) {
      const candidate = advancePose(pose, linearSpeed, angularSpeed, dt / substeps);
      collision = collisionForPose({ robot: candidate, chassis }, options);
      if (collision) break;
      pose = candidate;
      completedSubsteps += 1;
    }

    return {
      pose,
      blocked: Boolean(collision),
      collision: collision ? { ...collision } : null,
      attemptedPose,
      substeps,
      completedSubsteps
    };
  }

  function getCameraPose(stateOrPose, cameraSettings) {
    const state = stateOrPose && stateOrPose.robot ? stateOrPose : null;
    const robot = normalizePose(state || stateOrPose);
    const chassis = resolveChassis(state || stateOrPose);
    const camera = normalizeCameraSettings(cameraSettings || (state && state.camera));
    const mount = MOUNTS[camera.mount];
    const mountOffset = {
      front: { x: chassis.length / 2, y: 0 },
      rear: { x: -chassis.length / 2, y: 0 },
      left: { x: 0, y: chassis.width / 2 },
      right: { x: 0, y: -chassis.width / 2 }
    }[camera.mount];
    const cosine = Math.cos(robot.heading);
    const sine = Math.sin(robot.heading);
    const position = {
      x: robot.x + mountOffset.x * cosine - mountOffset.y * sine,
      y: robot.y + mountOffset.x * sine + mountOffset.y * cosine,
      z: camera.height
    };
    const yaw = normalizeAngle(robot.heading + mount.yaw);
    const pitchDegrees = HEADS[camera.head].pitchDegrees;
    const pitch = pitchDegrees * Math.PI / 180;
    const horizontalForward = { x: Math.cos(yaw), y: Math.sin(yaw), z: 0 };
    const forward = normalizeVector({
      x: horizontalForward.x * Math.cos(pitch),
      y: horizontalForward.y * Math.cos(pitch),
      z: -Math.sin(pitch)
    });
    const right = normalizeVector({ x: Math.sin(yaw), y: -Math.cos(yaw), z: 0 });
    const up = normalizeVector(cross(right, forward));

    return {
      position,
      mount: camera.mount,
      head: camera.head,
      height: camera.height,
      yaw,
      pitch,
      pitchDegrees,
      forward,
      right,
      up,
      basis: { forward: { ...forward }, right: { ...right }, up: { ...up } }
    };
  }

  function resolveCameraPose(cameraOrState, cameraSettings) {
    if (cameraOrState && cameraOrState.position && cameraOrState.forward && cameraOrState.right && cameraOrState.up) {
      return cameraOrState;
    }
    return getCameraPose(cameraOrState, cameraSettings);
  }

  function projectPoint(point, cameraOrState, cameraSettings) {
    const camera = resolveCameraPose(cameraOrState, cameraSettings);
    const relative = subtract(copyPoint(point), camera.position);
    const depth = dot(relative, camera.forward);
    const safeDepth = depth >= CAMERA_NEAR_PLANE ? depth : CAMERA_NEAR_PLANE;
    const cameraX = dot(relative, camera.right);
    const cameraY = dot(relative, camera.up);
    const x = SENSOR_WIDTH / 2 + (cameraX / safeDepth) * CAMERA_FOCAL_LENGTH;
    const y = SENSOR_HEIGHT / 2 - (cameraY / safeDepth) * CAMERA_FOCAL_LENGTH;

    return {
      x: Number.isFinite(x) ? x : SENSOR_WIDTH / 2,
      y: Number.isFinite(y) ? y : SENSOR_HEIGHT / 2,
      depth,
      cameraX,
      cameraY,
      inFront: depth >= CAMERA_NEAR_PLANE,
      finite: Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(depth)
    };
  }

  function polygonArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  }

  function projectedBounds(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      minimumX: Math.min(...xs),
      maximumX: Math.max(...xs),
      minimumY: Math.min(...ys),
      maximumY: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }

  function minimumEdgeLength(points) {
    let minimum = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      minimum = Math.min(minimum, Math.hypot(next.x - current.x, next.y - current.y));
    }
    return minimum;
  }

  function segmentIntersectsAabb(origin, target, bounds) {
    const direction = subtract(target, origin);
    let minimumT = 0;
    let maximumT = 1;

    [
      ["x", bounds.minimumX, bounds.maximumX],
      ["y", bounds.minimumY, bounds.maximumY],
      ["z", bounds.minimumZ, bounds.maximumZ]
    ].forEach(([axis, minimum, maximum]) => {
      if (minimumT > maximumT) return;
      const component = direction[axis];
      if (Math.abs(component) <= EPSILON) {
        if (origin[axis] < minimum - EPSILON || origin[axis] > maximum + EPSILON) {
          minimumT = 1;
          maximumT = 0;
        }
        return;
      }
      let enter = (minimum - origin[axis]) / component;
      let exit = (maximum - origin[axis]) / component;
      if (enter > exit) [enter, exit] = [exit, enter];
      minimumT = Math.max(minimumT, enter);
      maximumT = Math.min(maximumT, exit);
    });

    return minimumT <= maximumT && maximumT > EPSILON && minimumT < 1 - EPSILON;
  }

  function clipLowerBound(valueAtOrigin, valueDelta, interval) {
    if (Math.abs(valueDelta) <= EPSILON) return valueAtOrigin >= -EPSILON;
    const crossing = -valueAtOrigin / valueDelta;
    if (valueDelta > 0) interval.minimum = Math.max(interval.minimum, crossing);
    else interval.maximum = Math.min(interval.maximum, crossing);
    return interval.minimum <= interval.maximum;
  }

  function segmentIntersectsConvexPrism(origin, target, polygon, minimumZ, maximumZ) {
    const direction = subtract(target, origin);
    const interval = { minimum: 0, maximum: 1 };

    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const edgeX = next.x - current.x;
      const edgeY = next.y - current.y;
      const originValue = edgeX * (origin.y - current.y) - edgeY * (origin.x - current.x);
      const deltaValue = edgeX * direction.y - edgeY * direction.x;
      if (!clipLowerBound(originValue, deltaValue, interval)) return false;
    }

    if (!clipLowerBound(origin.z - minimumZ, direction.z, interval)) return false;
    if (!clipLowerBound(maximumZ - origin.z, -direction.z, interval)) return false;

    return interval.maximum > EPSILON && interval.minimum < 1 - EPSILON;
  }

  function segmentIntersectsWall(origin, target, candidateWall) {
    const direction = subtract(target, origin);
    const wallPoint = candidateWall.start;
    const denominator = direction.x * candidateWall.normal.x + direction.y * candidateWall.normal.y;
    if (Math.abs(denominator) <= EPSILON) return false;
    const numerator = (wallPoint.x - origin.x) * candidateWall.normal.x +
      (wallPoint.y - origin.y) * candidateWall.normal.y;
    const t = numerator / denominator;
    if (t <= EPSILON || t >= 1 - EPSILON) return false;

    const intersection = {
      x: origin.x + direction.x * t,
      y: origin.y + direction.y * t,
      z: origin.z + direction.z * t
    };
    if (intersection.z < -EPSILON || intersection.z > candidateWall.height + EPSILON) return false;
    return pointOnSegment(intersection, candidateWall.start, candidateWall.end);
  }

  function interpolateMarkerPoint(candidateMarker, horizontal, vertical) {
    const half = candidateMarker.patternSide / 2;
    return add(
      add(candidateMarker.center, scale(candidateMarker.right, horizontal * half)),
      scale(candidateMarker.up, vertical * half)
    );
  }

  function lineOfSightBlocked(cameraPosition, target, candidateMarker, robotState) {
    for (let index = 0; index < TABLES.length; index += 1) {
      const table = TABLES[index];
      if (table.id === candidateMarker.ownerId) continue;
      if (segmentIntersectsAabb(cameraPosition, target, table.bounds)) return true;
    }

    for (let index = 0; index < WALLS.length; index += 1) {
      const candidateWall = WALLS[index];
      if (candidateWall.id === candidateMarker.ownerId) continue;
      if (segmentIntersectsWall(cameraPosition, target, candidateWall)) return true;
    }

    const footprint = getRobotFootprint(robotState);
    return segmentIntersectsConvexPrism(cameraPosition, target, footprint, 0, ROBOT_TOP_Z);
  }

  function markerOccluded(candidateMarker, camera, robotState) {
    const sampleCoordinates = [-1, -0.5, 0, 0.5, 1];
    for (let verticalIndex = 0; verticalIndex < sampleCoordinates.length; verticalIndex += 1) {
      for (let horizontalIndex = 0; horizontalIndex < sampleCoordinates.length; horizontalIndex += 1) {
        const target = interpolateMarkerPoint(
          candidateMarker,
          sampleCoordinates[horizontalIndex],
          sampleCoordinates[verticalIndex]
        );
        if (lineOfSightBlocked(camera.position, target, candidateMarker, robotState)) return true;
      }
    }
    return false;
  }

  function projectMarker(candidateMarker, camera, robotState) {
    const cameraFromMarker = subtract(camera.position, candidateMarker.center);
    const frontFacing = dot(candidateMarker.normal, cameraFromMarker) > EPSILON;
    const corners = candidateMarker.corners.map((corner) => projectPoint(corner, camera));
    const allInFront = corners.every((corner) => corner.inFront && corner.finite);
    const projectedCorners = corners.map((corner) => ({ x: corner.x, y: corner.y, depth: corner.depth }));
    const bounds = projectedBounds(projectedCorners);
    const fullyInFrame = allInFront && projectedCorners.every((corner) =>
      corner.x >= 0 && corner.x <= SENSOR_WIDTH && corner.y >= 0 && corner.y <= SENSOR_HEIGHT
    );
    const minimumProjectedEdge = minimumEdgeLength(projectedCorners);
    const projectedArea = polygonArea(projectedCorners);
    const sufficientlyLarge = minimumProjectedEdge >= MIN_PROJECTED_PATTERN_PIXELS &&
      projectedArea >= MIN_PROJECTED_PATTERN_PIXELS ** 2;
    const occluded = frontFacing && allInFront && fullyInFrame && sufficientlyLarge
      ? markerOccluded(candidateMarker, camera, robotState)
      : false;
    const rejectionReasons = [];

    if (!frontFacing) rejectionReasons.push("backface");
    if (!allInFront) rejectionReasons.push("behind-camera");
    if (allInFront && !fullyInFrame) rejectionReasons.push("cut-off");
    if (allInFront && fullyInFrame && !sufficientlyLarge) rejectionReasons.push("too-small");
    if (occluded) rejectionReasons.push("occluded");

    return {
      marker: candidateMarker,
      id: candidateMarker.id,
      surface: candidateMarker.surface,
      corners: projectedCorners,
      bounds,
      minimumProjectedEdge,
      projectedArea,
      frontFacing,
      allInFront,
      fullyInFrame,
      sufficientlyLarge,
      occluded,
      eligible: rejectionReasons.length === 0,
      rejectionReasons
    };
  }

  function projectScene(stateOrPose, cameraSettings) {
    const state = stateOrPose && stateOrPose.robot ? stateOrPose : null;
    const robot = normalizePose(state || stateOrPose);
    const chassis = resolveChassis(state || stateOrPose);
    const robotState = { robot, chassis };
    const camera = getCameraPose(state || robot, cameraSettings || (state && state.camera));
    const markers = FIDUCIALS.map((candidateMarker) => projectMarker(candidateMarker, camera, robotState));
    const detections = markers
      .filter((candidate) => candidate.eligible)
      .sort((a, b) => a.id - b.id)
      .map(detectionFromProjection);

    return deepFreeze({ camera, robot, chassis, markers, detections });
  }

  function detectionFromProjection(projection) {
    const bounds = projection.bounds;
    const corners = Object.freeze(projection.corners.map((corner) => Object.freeze({
      x: corner.x,
      y: corner.y,
      depth: corner.depth
    })));

    return Object.freeze({
      type: "fiducial",
      objectType: "fiducial",
      exists: true,
      id: projection.id,
      tagID: projection.id,
      originX: Math.round(bounds.minimumX),
      originY: Math.round(bounds.minimumY),
      centerX: Math.round((bounds.minimumX + bounds.maximumX) / 2),
      centerY: Math.round((bounds.minimumY + bounds.maximumY) / 2),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
      corners
    });
  }

  function detectFiducials(stateOrProjection, cameraSettings) {
    const projection = stateOrProjection && Array.isArray(stateOrProjection.markers)
      ? stateOrProjection
      : projectScene(stateOrProjection, cameraSettings);
    const detections = projection.markers
      .filter((candidate) => candidate.eligible)
      .sort((a, b) => a.id - b.id)
      .map(detectionFromProjection);
    return Object.freeze(detections);
  }

  function rayEndpointOnFloorOrBoundary(camera, direction, boundary) {
    const horizontalLength = Math.hypot(direction.x, direction.y);
    if (horizontalLength <= EPSILON) return { x: camera.position.x, y: camera.position.y };

    let maximumT = WORLD_VIEW_MAX_RAY_LENGTH / horizontalLength;
    if (direction.x > EPSILON) maximumT = Math.min(maximumT, (boundary.maximumX - camera.position.x) / direction.x);
    if (direction.x < -EPSILON) maximumT = Math.min(maximumT, (boundary.minimumX - camera.position.x) / direction.x);
    if (direction.y > EPSILON) maximumT = Math.min(maximumT, (boundary.maximumY - camera.position.y) / direction.y);
    if (direction.y < -EPSILON) maximumT = Math.min(maximumT, (boundary.minimumY - camera.position.y) / direction.y);

    let selectedT = maximumT;
    if (direction.z < -EPSILON) {
      const floorT = -camera.position.z / direction.z;
      if (floorT > 0) selectedT = Math.min(selectedT, floorT);
    }
    selectedT = Math.max(0, selectedT);

    return {
      x: camera.position.x + direction.x * selectedT,
      y: camera.position.y + direction.y * selectedT
    };
  }

  function cameraRay(camera, sensorX, sensorY) {
    const horizontal = (sensorX - SENSOR_WIDTH / 2) / CAMERA_FOCAL_LENGTH;
    const vertical = (SENSOR_HEIGHT / 2 - sensorY) / CAMERA_FOCAL_LENGTH;
    return normalizeVector(add(add(camera.forward, scale(camera.right, horizontal)), scale(camera.up, vertical)));
  }

  function layoutWorldView(stateOrPose, width, height) {
    const state = stateOrPose && stateOrPose.robot ? stateOrPose : createState({ robot: stateOrPose });
    const robot = normalizePose(state);
    const chassis = resolveChassis(state);
    const camera = getCameraPose(state);
    const mapWidth = Math.max(finiteNumber(width, WORLD_VIEW_WIDTH), WORLD_VIEW_PADDING * 2 + 1);
    const mapHeight = Math.max(finiteNumber(height, WORLD_VIEW_HEIGHT), WORLD_VIEW_PADDING * 2 + 1);
    const boundary = OUTER_BOUNDARY;
    const scaleFactor = Math.min(
      (mapWidth - WORLD_VIEW_PADDING * 2) / (boundary.maximumX - boundary.minimumX),
      (mapHeight - WORLD_VIEW_PADDING * 2) / (boundary.maximumY - boundary.minimumY)
    );

    function toScreen(point) {
      return {
        x: mapWidth / 2 + point.x * scaleFactor,
        y: mapHeight / 2 - point.y * scaleFactor
      };
    }

    const robotPoint = toScreen(robot);
    const cameraPoint = toScreen(camera.position);
    const sensorCorners = [
      [0, 0],
      [SENSOR_WIDTH, 0],
      [SENSOR_WIDTH, SENSOR_HEIGHT],
      [0, SENSOR_HEIGHT]
    ];
    const footprintWorld = sensorCorners.map(([sensorX, sensorY]) =>
      rayEndpointOnFloorOrBoundary(camera, cameraRay(camera, sensorX, sensorY), boundary)
    );
    const axisWorld = rayEndpointOnFloorOrBoundary(camera, camera.forward, boundary);
    const leftWorld = rayEndpointOnFloorOrBoundary(camera, cameraRay(camera, 0, SENSOR_HEIGHT / 2), boundary);
    const rightWorld = rayEndpointOnFloorOrBoundary(camera, cameraRay(camera, SENSOR_WIDTH, SENSOR_HEIGHT / 2), boundary);

    return {
      width: mapWidth,
      height: mapHeight,
      scale: scaleFactor,
      bounds: { ...boundary },
      competitionInterior: {
        x: toScreen({ x: -WALL_INNER_HALF_SPAN, y: WALL_INNER_HALF_SPAN }).x,
        y: toScreen({ x: -WALL_INNER_HALF_SPAN, y: WALL_INNER_HALF_SPAN }).y,
        width: WALL_INNER_HALF_SPAN * 2 * scaleFactor,
        height: WALL_INNER_HALF_SPAN * 2 * scaleFactor
      },
      outerBoundary: {
        x: toScreen({ x: boundary.minimumX, y: boundary.maximumY }).x,
        y: toScreen({ x: boundary.minimumX, y: boundary.maximumY }).y,
        width: (boundary.maximumX - boundary.minimumX) * scaleFactor,
        height: (boundary.maximumY - boundary.minimumY) * scaleFactor,
        kind: boundary.kind
      },
      walls: WALLS.map((candidateWall) => ({
        id: candidateWall.id,
        start: toScreen(candidateWall.start),
        end: toScreen(candidateWall.end),
        kind: candidateWall.kind
      })),
      tables: TABLES.map((table) => ({
        id: table.id,
        markerId: table.markerId,
        x: toScreen(table.center).x,
        y: toScreen(table.center).y,
        width: table.width * scaleFactor,
        height: table.depth * scaleFactor
      })),
      fiducials: FIDUCIALS.map((candidateMarker) => ({
        id: candidateMarker.id,
        surface: candidateMarker.surface,
        ...toScreen(candidateMarker.center)
      })),
      robot: {
        x: robotPoint.x,
        y: robotPoint.y,
        length: chassis.length,
        width: chassis.width,
        heading: robot.heading,
        headingDegrees: (robot.heading * 180 / Math.PI + 360) % 360,
        rotationDegrees: -robot.heading * 180 / Math.PI,
        footprint: getRobotFootprint({ robot, chassis }).map(toScreen)
      },
      camera: {
        x: cameraPoint.x,
        y: cameraPoint.y,
        mount: camera.mount,
        head: camera.head,
        height: camera.height,
        pitchDegrees: camera.pitchDegrees,
        direction: toScreen(axisWorld),
        viewFootprint: footprintWorld.map(toScreen),
        fov: {
          left: toScreen(leftWorld),
          right: toScreen(rightWorld),
          direction: toScreen(axisWorld)
        }
      }
    };
  }

  const config = deepFreeze({
    sceneId: SCENE_ID,
    sensorWidth: SENSOR_WIDTH,
    sensorHeight: SENSOR_HEIGHT,
    cameraHorizontalFovDegrees: CAMERA_HORIZONTAL_FOV_DEGREES,
    cameraVerticalFovDegrees: CAMERA_VERTICAL_FOV_DEGREES,
    cameraNearPlane: CAMERA_NEAR_PLANE,
    cameraMinHeight: CAMERA_MIN_HEIGHT,
    cameraMaxHeight: CAMERA_MAX_HEIGHT,
    cameraDefaultHeight: CAMERA_DEFAULT_HEIGHT,
    cameraHeightStep: CAMERA_HEIGHT_STEP,
    cameraDown45PitchDegrees: CAMERA_DOWN_45_PITCH_DEGREES,
    cameraDownPitchDegrees: CAMERA_DOWN_PITCH_DEGREES,
    minimumProjectedPatternPixels: MIN_PROJECTED_PATTERN_PIXELS,
    mounts: MOUNTS,
    heads: HEADS,
    patternSide: PATTERN_SIDE,
    paperSide: PAPER_SIDE,
    tableSide: TABLE_SIDE,
    tableTopZ: TABLE_TOP_Z,
    tableMarkerPlaneZ: TABLE_MARKER_PLANE_Z,
    wallHeight: WALL_HEIGHT,
    wallInnerHalfSpan: WALL_INNER_HALF_SPAN,
    wallLongHalfLength: WALL_LONG_HALF_LENGTH,
    wallShortHalfLength: WALL_SHORT_HALF_LENGTH,
    robotDefaultLength: ROBOT_DEFAULT_LENGTH,
    robotDefaultWidth: ROBOT_DEFAULT_WIDTH,
    robotDimensionMin: ROBOT_DIMENSION_MIN,
    robotDimensionMax: ROBOT_DIMENSION_MAX,
    robotDimensionStep: ROBOT_DIMENSION_STEP,
    robotSide: ROBOT_DEFAULT_LENGTH,
    robotCornerRadius: ROBOT_CORNER_RADIUS,
    robotTopZ: ROBOT_TOP_Z,
    maxLinearSpeed: MAX_LINEAR_SPEED,
    driveTrackWidth: DRIVE_TRACK_WIDTH,
    maxTranslationSubstep: MAX_TRANSLATION_SUBSTEP,
    maxRotationSubstepDegrees: MAX_ROTATION_SUBSTEP_DEGREES,
    maxDeltaSeconds: MAX_DELTA_SECONDS,
    outerBoundary: OUTER_BOUNDARY,
    defaultStartPoseId: DEFAULT_START_POSE_ID,
    defaultMount: DEFAULT_MOUNT,
    defaultHead: DEFAULT_HEAD,
    detectionModel: "analytic projected fiducial geometry; not hardware-validated decoding",
    detectionOrdering: "ascending fiducial ID",
    cutoffPolicy: "the complete recognition pattern must be inside the image",
    occlusionPolicy: "reject when modeled walls, tables, or the chassis block sampled pattern sightlines"
  });

  return Object.freeze({
    SCENE_ID,
    SENSOR_WIDTH,
    SENSOR_HEIGHT,
    CAMERA_HORIZONTAL_FOV_DEGREES,
    config,
    scene,
    startPoses: START_POSES,
    createState,
    applyStartPose,
    normalizePose,
    normalizeChassis,
    normalizeCameraSettings,
    getRobotFootprint,
    collisionForPose,
    isPoseValid,
    integrateRobot,
    getCameraPose,
    projectPoint,
    projectScene,
    detectFiducials,
    layoutWorldView,
    normalizeAngle
  });
});
