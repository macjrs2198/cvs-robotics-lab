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
  // Approximate practice-meal dimensions; these are not official game specifications.
  const MEAL_PLATE_RADIUS = 4.25;
  const MEAL_PLATE_THICKNESS = 0.35;
  const MEAL_PLATE_SEGMENTS = 16;
  const MEAL_FOOD_SEGMENTS = 10;
  const MEAL_POST_RADIUS = 0.28;
  const MEAL_POST_HEIGHT = 1.5;
  const MEAL_FOOD_PIECES = Object.freeze([
    deepFreeze({ x: -1.35, y: 0.55, radius: 0.85, height: 0.6 }),
    deepFreeze({ x: 1.35, y: 0.5, radius: 0.95, height: 0.75 }),
    deepFreeze({ x: 0, y: -1.35, radius: 0.8, height: 0.55 })
  ]);
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
  const PRACTICE_FRUIT_COUNT = 4;
  const PRACTICE_FRUIT_RADIUS = 2;
  const PRACTICE_FRUIT_HEIGHT = 4;
  const PRACTICE_FRUIT_SEGMENTS = 12;
  const PRACTICE_ROBOT_LENGTH = 18;
  const PRACTICE_ROBOT_WIDTH = 18;
  const PRACTICE_ROBOT_CORNER_RADIUS = 2;
  const PRACTICE_ROBOT_TOP_Z = 4.5;
  const PRACTICE_START_CLEARANCE = 4;
  const PRACTICE_PLACEMENT_ATTEMPTS = 120;
  const PRACTICE_POSITION_STEP = 0.5;
  const PRACTICE_DEFAULT_SEED = 0x43565331;
  const PRACTICE_FORWARD_OUTPUT = 8;
  const PRACTICE_TURN_OUTPUT = 10;
  const PRACTICE_REVERSE_OUTPUT = 6;
  const PRACTICE_FORWARD_MIN_SECONDS = 1.5;
  const PRACTICE_FORWARD_MAX_SECONDS = 3.5;
  const PRACTICE_WAIT_MIN_SECONDS = 0.2;
  const PRACTICE_WAIT_MAX_SECONDS = 0.55;
  const PRACTICE_REVERSE_MIN_SECONDS = 0.3;
  const PRACTICE_REVERSE_MAX_SECONDS = 0.7;
  const PRACTICE_TURN_MIN_DEGREES = 35;
  const PRACTICE_TURN_MAX_DEGREES = 115;
  const PRACTICE_MAX_CONTROLLER_TRANSITIONS = 12;
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

  const PRACTICE_BOUNDARY = Object.freeze({
    minimumX: -WALL_INNER_HALF_SPAN,
    maximumX: WALL_INNER_HALF_SPAN,
    minimumY: -WALL_INNER_HALF_SPAN,
    maximumY: WALL_INNER_HALF_SPAN,
    kind: "practice-boundary"
  });

  const PRACTICE_ENTRANCE_CLEARANCES = Object.freeze([
    deepFreeze({
      id: "top-left-opening-clearance",
      minimumX: -WALL_INNER_HALF_SPAN,
      maximumX: -WALL_SHORT_HALF_LENGTH + PRACTICE_START_CLEARANCE,
      minimumY: WALL_SHORT_HALF_LENGTH - PRACTICE_START_CLEARANCE,
      maximumY: WALL_INNER_HALF_SPAN
    }),
    deepFreeze({
      id: "top-opening-clearance",
      minimumX: WALL_SHORT_HALF_LENGTH - PRACTICE_START_CLEARANCE,
      maximumX: WALL_INNER_HALF_SPAN,
      minimumY: WALL_SHORT_HALF_LENGTH - PRACTICE_START_CLEARANCE,
      maximumY: WALL_INNER_HALF_SPAN
    }),
    deepFreeze({
      id: "bottom-opening-clearance",
      minimumX: -WALL_INNER_HALF_SPAN,
      maximumX: -WALL_SHORT_HALF_LENGTH + PRACTICE_START_CLEARANCE,
      minimumY: -WALL_INNER_HALF_SPAN,
      maximumY: -WALL_SHORT_HALF_LENGTH + PRACTICE_START_CLEARANCE
    }),
    deepFreeze({
      id: "bottom-right-opening-clearance",
      minimumX: WALL_SHORT_HALF_LENGTH - PRACTICE_START_CLEARANCE,
      maximumX: WALL_INNER_HALF_SPAN,
      minimumY: -WALL_INNER_HALF_SPAN,
      maximumY: -WALL_SHORT_HALF_LENGTH + PRACTICE_START_CLEARANCE
    })
  ]);

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
    normalized %= Math.PI * 2;
    if (normalized > Math.PI) normalized -= Math.PI * 2;
    if (normalized <= -Math.PI) normalized += Math.PI * 2;
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
    const practiceObstructions = normalizePracticeObstructions(
      source.practiceObstructions,
      { robot: selectedRobot, chassis }
    );
    const tableMeals = normalizeTableMeals(source.tableMeals);

    return {
      sceneId: SCENE_ID,
      startPoseId,
      robot,
      chassis,
      camera: normalizeCameraSettings(cameraSource),
      tableMeals,
      practiceObstructions,
      practiceRuntime: initialPracticeRuntime(practiceObstructions)
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
    const practiceObstructions = normalizePracticeObstructions(
      current.practiceObstructions,
      { robot, chassis }
    );
    const tableMeals = normalizeTableMeals(current.tableMeals);

    return {
      ...current,
      sceneId: SCENE_ID,
      startPoseId: validId,
      robot,
      chassis,
      camera: normalizeCameraSettings(current.camera),
      tableMeals,
      practiceObstructions,
      practiceRuntime: initialPracticeRuntime(practiceObstructions)
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

  function rectangleFootprint(bounds) {
    return [
      { x: bounds.minimumX, y: bounds.minimumY },
      { x: bounds.maximumX, y: bounds.minimumY },
      { x: bounds.maximumX, y: bounds.maximumY },
      { x: bounds.minimumX, y: bounds.maximumY }
    ];
  }

  function circularFootprint(x, y, radius = PRACTICE_FRUIT_RADIUS, segments = PRACTICE_FRUIT_SEGMENTS) {
    const points = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      points.push({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius });
    }
    return points;
  }

  function practiceRobotFootprint(pose) {
    return getRobotFootprint(
      pose,
      { length: PRACTICE_ROBOT_LENGTH, width: PRACTICE_ROBOT_WIDTH }
    );
  }

  function footprintCollision(footprint, options) {
    const boundary = resolveBoundary(options);
    const outsideBoundary = footprint.some((point) =>
      point.x < boundary.minimumX - EPSILON ||
      point.x > boundary.maximumX + EPSILON ||
      point.y < boundary.minimumY - EPSILON ||
      point.y > boundary.maximumY + EPSILON
    );
    if (outsideBoundary) return { kind: boundary.kind || "simulation-boundary" };

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

    const ignoredIds = new Set(options && Array.isArray(options.ignoreIds) ? options.ignoreIds : []);
    const obstructions = options && Array.isArray(options.obstructions) ? options.obstructions : [];
    for (let index = 0; index < obstructions.length; index += 1) {
      const obstruction = obstructions[index];
      if (!obstruction || ignoredIds.has(obstruction.id) || !Array.isArray(obstruction.footprint)) continue;
      if (polygonsOverlap(footprint, obstruction.footprint)) {
        return { kind: obstruction.collisionKind || obstruction.kind || "practice-obstruction", id: obstruction.id };
      }
    }

    return null;
  }

  function resolveBoundary(options) {
    const requested = options && options.outerBoundary;
    if (!requested) return OUTER_BOUNDARY;

    const boundary = {
      minimumX: finiteNumber(requested.minimumX, OUTER_BOUNDARY.minimumX),
      maximumX: finiteNumber(requested.maximumX, OUTER_BOUNDARY.maximumX),
      minimumY: finiteNumber(requested.minimumY, OUTER_BOUNDARY.minimumY),
      maximumY: finiteNumber(requested.maximumY, OUTER_BOUNDARY.maximumY),
      kind: typeof requested.kind === "string" ? requested.kind : OUTER_BOUNDARY.kind
    };

    if (boundary.minimumX >= boundary.maximumX || boundary.minimumY >= boundary.maximumY) {
      return OUTER_BOUNDARY;
    }

    return boundary;
  }

  function canonicalPracticeSeed(value, fallback = PRACTICE_DEFAULT_SEED) {
    if (value === undefined) return fallback >>> 0;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error("Practice obstruction seed must be an unsigned 32-bit integer.");
    }
    return value >>> 0;
  }

  function advanceRandomState(randomState) {
    return (Math.imul(randomState >>> 0, 1664525) + 1013904223) >>> 0;
  }

  function randomStep(randomState) {
    const state = advanceRandomState(randomState);
    return { state, value: state / 0x100000000 };
  }

  function mixPracticeSeed(seed, salt) {
    let mixed = (seed ^ salt) >>> 0;
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d) >>> 0;
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b) >>> 0;
    return (mixed ^ (mixed >>> 16)) >>> 0;
  }

  function boundsForFootprint(footprint, padding) {
    const xs = footprint.map((point) => point.x);
    const ys = footprint.map((point) => point.y);
    const inset = finiteNumber(padding, 0);
    return {
      minimumX: Math.min(...xs) - inset,
      maximumX: Math.max(...xs) + inset,
      minimumY: Math.min(...ys) - inset,
      maximumY: Math.max(...ys) + inset
    };
  }

  function practiceReservedSolids(robot, chassis) {
    const studentFootprint = getRobotFootprint({ robot, chassis });
    const startBounds = boundsForFootprint(studentFootprint, PRACTICE_START_CLEARANCE);
    return [
      {
        id: "student-start-clearance",
        kind: "practice-clearance",
        collisionKind: "practice-clearance",
        footprint: rectangleFootprint(startBounds)
      },
      ...PRACTICE_ENTRANCE_CLEARANCES.map((clearance) => ({
        id: clearance.id,
        kind: "practice-clearance",
        collisionKind: "practice-clearance",
        footprint: rectangleFootprint(clearance)
      }))
    ];
  }

  function validatePracticeFootprint(footprint, occupied, reserved) {
    return footprintCollision(footprint, {
      outerBoundary: PRACTICE_BOUNDARY,
      obstructions: [...occupied, ...reserved]
    }) === null;
  }

  function normalizeTableMeals(candidate) {
    if (candidate === undefined || candidate === null) {
      return { enabled: false, selectedIds: [] };
    }
    if (typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Table Meals settings must be an object.");
    }
    if (candidate.enabled !== undefined && typeof candidate.enabled !== "boolean") {
      throw new Error("Table Meals enabled must be true or false.");
    }
    const selectedIds = candidate.selectedIds === undefined ? [] : candidate.selectedIds;
    if (!Array.isArray(selectedIds)) {
      throw new Error("Table Meals selected IDs must be an array.");
    }
    const seen = new Set();
    selectedIds.forEach((id) => {
      if (!Number.isInteger(id) || id < 0 || id >= TABLES.length) {
        throw new Error("Table Meals IDs must be integers from 0 through 8.");
      }
      if (seen.has(id)) {
        throw new Error(`Table Meals ID ${id} is duplicated.`);
      }
      seen.add(id);
    });
    return { enabled: candidate.enabled === true, selectedIds: [...selectedIds].sort((a, b) => a - b) };
  }

  function mealGeometryForState(state) {
    const settings = normalizeTableMeals(state && state.tableMeals);
    if (!settings.enabled) return [];
    return settings.selectedIds.map((tableId) => {
      const table = TABLES[tableId];
      const x = table.center.x;
      const y = table.center.y;
      const plateTopZ = TABLE_TOP_Z + MEAL_PLATE_THICKNESS;
      const components = [{
        id: `meal-table-${tableId}-plate`,
        kind: "plate",
        x,
        y,
        radius: MEAL_PLATE_RADIUS,
        minimumZ: TABLE_TOP_Z,
        maximumZ: plateTopZ,
        footprint: circularFootprint(x, y, MEAL_PLATE_RADIUS, MEAL_PLATE_SEGMENTS)
      }];

      MEAL_FOOD_PIECES.forEach((piece, index) => {
        const foodX = x + piece.x;
        const foodY = y + piece.y;
        components.push({
          id: `meal-table-${tableId}-food-${index + 1}`,
          kind: "food",
          x: foodX,
          y: foodY,
          radius: piece.radius,
          minimumZ: plateTopZ,
          maximumZ: plateTopZ + piece.height,
          footprint: circularFootprint(foodX, foodY, piece.radius, MEAL_FOOD_SEGMENTS)
        });
      });

      components.push({
        id: `meal-table-${tableId}-post`,
        kind: "post",
        x,
        y,
        radius: MEAL_POST_RADIUS,
        minimumZ: plateTopZ,
        maximumZ: plateTopZ + MEAL_POST_HEIGHT,
        footprint: circularFootprint(x, y, MEAL_POST_RADIUS, MEAL_FOOD_SEGMENTS)
      });

      return {
        id: `meal-table-${tableId}`,
        kind: "table-meal",
        tableId,
        tableOwnerId: table.id,
        x,
        y,
        z: TABLE_TOP_Z,
        components
      };
    });
  }

  function normalizePracticeObstructions(candidate, context) {
    const sourceContext = context || {};
    const chassis = normalizeChassis(sourceContext.chassis);
    const robotSource = sourceContext.robot || START_POSE_BY_ID[DEFAULT_START_POSE_ID];
    if (!robotSource || ![Number(robotSource.x), Number(robotSource.y), Number(robotSource.heading)].every(Number.isFinite)) {
      throw new Error("Practice obstruction validation requires a valid student starting pose.");
    }
    const robot = normalizePose(robotSource);

    if (candidate === undefined || candidate === null) {
      return {
        fruitClutter: false,
        roamingRobot: false,
        seed: PRACTICE_DEFAULT_SEED >>> 0,
        fruit: [],
        roamingStart: null
      };
    }
    if (typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Practice obstruction settings must be an object.");
    }
    ["fruitClutter", "roamingRobot"].forEach((key) => {
      if (candidate[key] !== undefined && typeof candidate[key] !== "boolean") {
        throw new Error(`${key} must be true or false.`);
      }
    });

    const fruitClutter = candidate.fruitClutter === true;
    const roamingRobot = candidate.roamingRobot === true;
    const enabled = fruitClutter || roamingRobot;
    if (enabled && candidate.seed === undefined) {
      throw new Error("Enabled practice obstructions require a saved seed.");
    }
    const seed = canonicalPracticeSeed(candidate.seed);
    const reserved = practiceReservedSolids(robot, chassis);
    const occupied = [];
    const fruit = [];

    if (fruitClutter) {
      if (!Array.isArray(candidate.fruit)) {
        throw new Error("Enabled Fruit Clutter requires a saved fruit layout.");
      }
      if (candidate.fruit.length > PRACTICE_FRUIT_COUNT) {
        throw new Error(`Fruit Clutter supports at most ${PRACTICE_FRUIT_COUNT} fruit props.`);
      }
      candidate.fruit.forEach((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error(`Fruit prop ${index + 1} must be an object.`);
        }
        const expectedId = `fruit-${index + 1}`;
        if (item.id !== expectedId || item.kind !== "practice-fruit") {
          throw new Error(`Fruit prop ${index + 1} must use ID ${expectedId} and kind practice-fruit.`);
        }
        if (typeof item.x !== "number" || typeof item.y !== "number" ||
            !Number.isFinite(item.x) || !Number.isFinite(item.y)) {
          throw new Error(`Fruit prop ${expectedId} must have finite coordinates.`);
        }
        const canonical = {
          id: expectedId,
          kind: "practice-fruit",
          x: item.x,
          y: item.y
        };
        const solid = {
          id: canonical.id,
          kind: canonical.kind,
          collisionKind: "fruit",
          footprint: circularFootprint(canonical.x, canonical.y)
        };
        if (!validatePracticeFootprint(solid.footprint, occupied, reserved)) {
          throw new Error(`Fruit prop ${expectedId} overlaps the field, another prop, or the reserved start clearance.`);
        }
        fruit.push(canonical);
        occupied.push(solid);
      });
    }

    let roamingStart = null;
    if (roamingRobot) {
      if (!Object.prototype.hasOwnProperty.call(candidate, "roamingStart")) {
        throw new Error("Enabled Roaming Robot requires a saved starting placement.");
      }
      if (candidate.roamingStart !== null) {
        const start = candidate.roamingStart;
        if (!start || typeof start !== "object" || Array.isArray(start) ||
            typeof start.x !== "number" || typeof start.y !== "number" ||
            typeof start.heading !== "number" || !Number.isFinite(start.x) ||
            !Number.isFinite(start.y) || !Number.isFinite(start.heading)) {
          throw new Error("Roaming Robot start must contain finite x, y, and heading values.");
        }
        roamingStart = {
          x: start.x,
          y: start.y,
          heading: normalizeAngle(start.heading)
        };
        const solid = {
          id: "roaming-robot",
          kind: "roaming-robot",
          collisionKind: "roaming-robot",
          footprint: practiceRobotFootprint(roamingStart)
        };
        if (!validatePracticeFootprint(solid.footprint, occupied, reserved)) {
          throw new Error("Roaming Robot start overlaps the field, another prop, or the reserved start clearance.");
        }
      }
    }

    return { fruitClutter, roamingRobot, seed, fruit, roamingStart };
  }

  function createPracticeObstructions(options, context) {
    const source = options || {};
    if (typeof source !== "object" || Array.isArray(source)) {
      throw new Error("Practice obstruction options must be an object.");
    }
    const fruitClutter = source.fruitClutter === true;
    const roamingRobot = source.roamingRobot === true;
    const sourceContext = context || {};
    const seed = canonicalPracticeSeed(sourceContext.seed === undefined ? source.seed : sourceContext.seed);
    const chassis = normalizeChassis(sourceContext.chassis);
    const robot = normalizePose(sourceContext.robot || START_POSE_BY_ID[DEFAULT_START_POSE_ID]);
    const reserved = practiceReservedSolids(robot, chassis);
    const occupied = [];
    const fruit = [];
    let randomState = mixPracticeSeed(seed, 0x46525549);

    function nextRandom() {
      const next = randomStep(randomState);
      randomState = next.state;
      return next.value;
    }

    function steppedCoordinate(minimum, maximum) {
      const slots = Math.floor((maximum - minimum) / PRACTICE_POSITION_STEP);
      return minimum + Math.floor(nextRandom() * (slots + 1)) * PRACTICE_POSITION_STEP;
    }

    if (fruitClutter) {
      for (let fruitIndex = 0; fruitIndex < PRACTICE_FRUIT_COUNT; fruitIndex += 1) {
        let placed = null;
        for (let attempt = 0; attempt < PRACTICE_PLACEMENT_ATTEMPTS; attempt += 1) {
          const x = steppedCoordinate(
            PRACTICE_BOUNDARY.minimumX + PRACTICE_FRUIT_RADIUS,
            PRACTICE_BOUNDARY.maximumX - PRACTICE_FRUIT_RADIUS
          );
          const y = steppedCoordinate(
            PRACTICE_BOUNDARY.minimumY + PRACTICE_FRUIT_RADIUS,
            PRACTICE_BOUNDARY.maximumY - PRACTICE_FRUIT_RADIUS
          );
          const footprint = circularFootprint(x, y);
          if (!validatePracticeFootprint(footprint, occupied, reserved)) continue;
          placed = { id: `fruit-${fruit.length + 1}`, kind: "practice-fruit", x, y };
          occupied.push({
            id: placed.id,
            kind: placed.kind,
            collisionKind: "fruit",
            footprint
          });
          break;
        }
        if (!placed) break;
        fruit.push(placed);
      }
    }

    let roamingStart = null;
    if (roamingRobot) {
      for (let attempt = 0; attempt < PRACTICE_PLACEMENT_ATTEMPTS; attempt += 1) {
        const x = steppedCoordinate(
          PRACTICE_BOUNDARY.minimumX + PRACTICE_ROBOT_LENGTH / 2,
          PRACTICE_BOUNDARY.maximumX - PRACTICE_ROBOT_LENGTH / 2
        );
        const y = steppedCoordinate(
          PRACTICE_BOUNDARY.minimumY + PRACTICE_ROBOT_WIDTH / 2,
          PRACTICE_BOUNDARY.maximumY - PRACTICE_ROBOT_WIDTH / 2
        );
        const heading = Math.floor(nextRandom() * 24) * Math.PI / 12;
        const pose = { x, y, heading: normalizeAngle(heading) };
        const footprint = practiceRobotFootprint(pose);
        if (!validatePracticeFootprint(footprint, occupied, reserved)) continue;
        roamingStart = pose;
        break;
      }
    }

    return normalizePracticeObstructions(
      { fruitClutter, roamingRobot, seed, fruit, roamingStart },
      { robot, chassis }
    );
  }

  function initialPracticeRuntime(practiceObstructions) {
    if (!practiceObstructions.roamingRobot || !practiceObstructions.roamingStart) {
      return { roaming: null };
    }
    let randomState = mixPracticeSeed(practiceObstructions.seed, 0x57414e44);
    const durationRandom = randomStep(randomState);
    randomState = durationRandom.state;
    return {
      roaming: {
        pose: { ...practiceObstructions.roamingStart },
        mode: "forward",
        remainingSeconds: PRACTICE_FORWARD_MIN_SECONDS +
          durationRandom.value * (PRACTICE_FORWARD_MAX_SECONDS - PRACTICE_FORWARD_MIN_SECONDS),
        randomState
      }
    };
  }

  function practiceSolidsForState(state) {
    if (!state || !state.practiceObstructions) return [];
    const practice = state.practiceObstructions;
    const solids = practice.fruit.map((item) => ({
      id: item.id,
      kind: item.kind,
      collisionKind: "fruit",
      x: item.x,
      y: item.y,
      heading: 0,
      radius: PRACTICE_FRUIT_RADIUS,
      height: PRACTICE_FRUIT_HEIGHT,
      minimumZ: 0,
      maximumZ: PRACTICE_FRUIT_HEIGHT,
      footprint: circularFootprint(item.x, item.y)
    }));
    const roaming = state.practiceRuntime && state.practiceRuntime.roaming;
    const roamingPose = roaming && roaming.pose
      ? roaming.pose
      : practice.roamingRobot && practice.roamingStart
        ? practice.roamingStart
        : null;
    if (roamingPose) {
      solids.push({
        id: "roaming-robot",
        kind: "roaming-robot",
        collisionKind: "roaming-robot",
        x: roamingPose.x,
        y: roamingPose.y,
        heading: roamingPose.heading,
        length: PRACTICE_ROBOT_LENGTH,
        width: PRACTICE_ROBOT_WIDTH,
        height: PRACTICE_ROBOT_TOP_Z,
        minimumZ: 0,
        maximumZ: PRACTICE_ROBOT_TOP_Z,
        footprint: practiceRobotFootprint(roamingPose)
      });
    }
    return solids;
  }

  function collisionForPose(stateOrPose, options) {
    const source = stateOrPose && stateOrPose.robot ? stateOrPose.robot : stateOrPose;
    if (!source || ![Number(source.x), Number(source.y), Number(source.heading)].every(Number.isFinite)) {
      return { kind: "invalid-pose" };
    }
    const robot = normalizePose(stateOrPose);
    const chassis = resolveChassis(stateOrPose, options);
    const footprint = getRobotFootprint(robot, chassis);
    const collisionOptions = { ...(options || {}) };
    if (!Array.isArray(collisionOptions.obstructions) && stateOrPose && stateOrPose.practiceObstructions) {
      collisionOptions.obstructions = practiceSolidsForState(stateOrPose);
    }
    return footprintCollision(footprint, collisionOptions);
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
    const collisionOptions = { ...(options || {}) };
    if (!Array.isArray(collisionOptions.obstructions) && poseOrState && poseOrState.practiceObstructions) {
      collisionOptions.obstructions = practiceSolidsForState(poseOrState);
    }

    for (let index = 0; index < substeps; index += 1) {
      const candidate = advancePose(pose, linearSpeed, angularSpeed, dt / substeps);
      collision = collisionForPose({ robot: candidate, chassis }, collisionOptions);
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

  function driveKinematics(drivetrain) {
    const leftSpeed = normalizedDriveOutput(drivetrain && drivetrain.leftOutput) * MAX_LINEAR_SPEED;
    const rightSpeed = normalizedDriveOutput(drivetrain && drivetrain.rightOutput) * MAX_LINEAR_SPEED;
    return {
      linearSpeed: (leftSpeed + rightSpeed) / 2,
      angularSpeed: (rightSpeed - leftSpeed) / DRIVE_TRACK_WIDTH
    };
  }

  function substepsForMotions(motions, deltaSeconds) {
    if (deltaSeconds <= 0) return 0;
    let substeps = 1;
    motions.forEach((motion) => {
      substeps = Math.max(
        substeps,
        Math.ceil(Math.abs(motion.linearSpeed * deltaSeconds) / MAX_TRANSLATION_SUBSTEP),
        Math.ceil(Math.abs(motion.angularSpeed * deltaSeconds) / MAX_ROTATION_SUBSTEP_RADIANS)
      );
    });
    return substeps;
  }

  function roamingCommand(mode) {
    if (mode === "forward") {
      return { leftOutput: PRACTICE_FORWARD_OUTPUT, rightOutput: PRACTICE_FORWARD_OUTPUT };
    }
    if (mode === "reverse") {
      return { leftOutput: -PRACTICE_REVERSE_OUTPUT, rightOutput: -PRACTICE_REVERSE_OUTPUT };
    }
    if (mode === "turn-left") {
      return { leftOutput: -PRACTICE_TURN_OUTPUT, rightOutput: PRACTICE_TURN_OUTPUT };
    }
    if (mode === "turn-right") {
      return { leftOutput: PRACTICE_TURN_OUTPUT, rightOutput: -PRACTICE_TURN_OUTPUT };
    }
    return { leftOutput: 0, rightOutput: 0 };
  }

  function nextRoamingRandom(roaming) {
    const next = randomStep(roaming.randomState);
    roaming.randomState = next.state;
    return next.value;
  }

  function roamingDuration(roaming, minimum, maximum) {
    return minimum + nextRoamingRandom(roaming) * (maximum - minimum);
  }

  function chooseRoamingTurn(roaming) {
    const mode = nextRoamingRandom(roaming) < 0.5 ? "turn-left" : "turn-right";
    const degrees = roamingDuration(roaming, PRACTICE_TURN_MIN_DEGREES, PRACTICE_TURN_MAX_DEGREES);
    const angularSpeed = 2 * PRACTICE_TURN_OUTPUT / DRIVE_TRACK_WIDTH;
    roaming.mode = mode;
    roaming.remainingSeconds = degrees * Math.PI / 180 / angularSpeed;
  }

  function transitionRoaming(roaming, blocked) {
    if (blocked) {
      if (nextRoamingRandom(roaming) < 0.35) {
        roaming.mode = "reverse";
        roaming.remainingSeconds = roamingDuration(
          roaming,
          PRACTICE_REVERSE_MIN_SECONDS,
          PRACTICE_REVERSE_MAX_SECONDS
        );
      } else {
        chooseRoamingTurn(roaming);
      }
      return;
    }

    if (roaming.mode === "forward") {
      roaming.mode = "wait";
      roaming.remainingSeconds = roamingDuration(
        roaming,
        PRACTICE_WAIT_MIN_SECONDS,
        PRACTICE_WAIT_MAX_SECONDS
      );
      return;
    }
    if (roaming.mode === "wait" || roaming.mode === "reverse") {
      chooseRoamingTurn(roaming);
      return;
    }
    roaming.mode = "forward";
    roaming.remainingSeconds = roamingDuration(
      roaming,
      PRACTICE_FORWARD_MIN_SECONDS,
      PRACTICE_FORWARD_MAX_SECONDS
    );
  }

  function integrateRobotPair(studentPose, chassis, studentDrive, roamingPose, roamingDrive, fruitSolids, deltaSeconds) {
    const studentMotion = driveKinematics(studentDrive);
    const roamingMotion = driveKinematics(roamingDrive);
    const studentMoving = Math.abs(studentMotion.linearSpeed) > EPSILON ||
      Math.abs(studentMotion.angularSpeed) > EPSILON;
    const roamingMoving = Math.abs(roamingMotion.linearSpeed) > EPSILON ||
      Math.abs(roamingMotion.angularSpeed) > EPSILON;
    const substeps = substepsForMotions([studentMotion, roamingMotion], deltaSeconds);
    let student = normalizePose(studentPose);
    let roaming = normalizePose(roamingPose);
    let studentBlocked = false;
    let roamingBlocked = false;
    let studentCollision = null;
    let roamingCollision = null;
    let elapsedSeconds = 0;

    for (let index = 0; index < substeps; index += 1) {
      const stepSeconds = deltaSeconds / substeps;
      const studentCandidate = studentBlocked || !studentMoving
        ? student
        : advancePose(student, studentMotion.linearSpeed, studentMotion.angularSpeed, stepSeconds);
      const roamingCandidate = roamingBlocked || !roamingMoving
        ? roaming
        : advancePose(roaming, roamingMotion.linearSpeed, roamingMotion.angularSpeed, stepSeconds);
      let acceptedStudent = studentCandidate;
      let acceptedRoaming = roamingCandidate;

      if (!studentBlocked && studentMoving) {
        const collision = collisionForPose(
          { robot: studentCandidate, chassis },
          { obstructions: fruitSolids }
        );
        if (collision) {
          studentBlocked = true;
          studentCollision = collision;
          acceptedStudent = student;
        }
      }
      if (!roamingBlocked && roamingMoving) {
        const collision = collisionForPose(
          {
            robot: roamingCandidate,
            chassis: { length: PRACTICE_ROBOT_LENGTH, width: PRACTICE_ROBOT_WIDTH }
          },
          { outerBoundary: PRACTICE_BOUNDARY, obstructions: fruitSolids }
        );
        if (collision) {
          roamingBlocked = true;
          roamingCollision = collision;
          acceptedRoaming = roaming;
        }
      }

      if (polygonsOverlap(
        getRobotFootprint(acceptedStudent, chassis),
        practiceRobotFootprint(acceptedRoaming)
      )) {
        acceptedStudent = student;
        acceptedRoaming = roaming;
        if (!studentBlocked && studentMoving) {
          studentBlocked = true;
          studentCollision = { kind: "roaming-robot", id: "roaming-robot" };
        }
        if (!roamingBlocked && roamingMoving) {
          roamingBlocked = true;
          roamingCollision = { kind: "student-robot", id: "student-robot" };
        }
      }

      student = acceptedStudent;
      roaming = acceptedRoaming;
      elapsedSeconds += stepSeconds;
      if (roamingBlocked) break;
    }

    return {
      student,
      roaming,
      studentBlocked,
      roamingBlocked,
      studentCollision,
      roamingCollision,
      substeps,
      elapsedSeconds
    };
  }

  function integrateScene(state, drivetrain, deltaSeconds, options) {
    const source = state && state.robot ? state : createState(state);
    const dt = clamp(finiteNumber(deltaSeconds, 0), 0, MAX_DELTA_SECONDS);
    const advanceRoaming = Boolean(options && options.advanceRoaming);
    const practiceObstructions = source.practiceObstructions || normalizePracticeObstructions(
      null,
      { robot: source.robot, chassis: source.chassis }
    );
    const runtimeSource = source.practiceRuntime || initialPracticeRuntime(practiceObstructions);
    const runtime = {
      roaming: runtimeSource.roaming
        ? {
            pose: normalizePose(runtimeSource.roaming.pose),
            mode: runtimeSource.roaming.mode,
            remainingSeconds: Math.max(0, finiteNumber(runtimeSource.roaming.remainingSeconds, 0)),
            randomState: canonicalPracticeSeed(runtimeSource.roaming.randomState)
          }
        : null
    };
    const baseState = {
      ...source,
      practiceObstructions,
      practiceRuntime: runtime
    };
    const allSolids = practiceSolidsForState(baseState);
    const fruitSolids = allSolids.filter((solid) => solid.kind === "practice-fruit");

    if (!runtime.roaming || !advanceRoaming || dt <= 0) {
      const movement = integrateRobot(
        baseState,
        drivetrain,
        dt,
        { obstructions: allSolids }
      );
      return {
        state: { ...baseState, robot: movement.pose },
        blocked: movement.blocked,
        collision: movement.collision,
        roamingBlocked: false,
        roamingCollision: null
      };
    }

    let studentPose = normalizePose(baseState.robot);
    let remainingSeconds = dt;
    let studentBlocked = false;
    let studentCollision = null;
    let roamingBlocked = false;
    let roamingCollision = null;
    let transitions = 0;

    while (remainingSeconds > EPSILON && transitions <= PRACTICE_MAX_CONTROLLER_TRANSITIONS) {
      if (runtime.roaming.remainingSeconds <= EPSILON) {
        transitionRoaming(runtime.roaming, false);
        transitions += 1;
        continue;
      }
      const chunkSeconds = Math.min(remainingSeconds, runtime.roaming.remainingSeconds);
      const pair = integrateRobotPair(
        studentPose,
        resolveChassis(baseState),
        drivetrain,
        runtime.roaming.pose,
        roamingCommand(runtime.roaming.mode),
        fruitSolids,
        chunkSeconds
      );
      studentPose = pair.student;
      runtime.roaming.pose = pair.roaming;
      if (pair.studentBlocked) {
        studentBlocked = true;
        if (!studentCollision) studentCollision = pair.studentCollision;
      }
      if (pair.roamingBlocked) {
        roamingBlocked = true;
        if (!roamingCollision) roamingCollision = pair.roamingCollision;
        transitionRoaming(runtime.roaming, true);
        transitions += 1;
      } else {
        runtime.roaming.remainingSeconds = Math.max(
          0,
          runtime.roaming.remainingSeconds - pair.elapsedSeconds
        );
      }
      remainingSeconds -= pair.elapsedSeconds;
    }

    return {
      state: {
        ...baseState,
        robot: studentPose,
        practiceRuntime: runtime
      },
      blocked: studentBlocked,
      collision: studentCollision ? { ...studentCollision } : null,
      roamingBlocked,
      roamingCollision: roamingCollision ? { ...roamingCollision } : null
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

  function lineOfSightBlocked(cameraPosition, target, candidateMarker, robotState, obstructions) {
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

    for (let index = 0; index < obstructions.length; index += 1) {
      const obstruction = obstructions[index];
      if (segmentIntersectsConvexPrism(
        cameraPosition,
        target,
        obstruction.footprint,
        obstruction.minimumZ,
        obstruction.maximumZ
      )) return true;
    }

    const footprint = getRobotFootprint(robotState);
    return segmentIntersectsConvexPrism(cameraPosition, target, footprint, 0, ROBOT_TOP_Z);
  }

  function markerOccluded(candidateMarker, camera, robotState, obstructions) {
    const sampleCoordinates = [-1, -0.5, 0, 0.5, 1];
    for (let verticalIndex = 0; verticalIndex < sampleCoordinates.length; verticalIndex += 1) {
      for (let horizontalIndex = 0; horizontalIndex < sampleCoordinates.length; horizontalIndex += 1) {
        const target = interpolateMarkerPoint(
          candidateMarker,
          sampleCoordinates[horizontalIndex],
          sampleCoordinates[verticalIndex]
        );
        if (lineOfSightBlocked(camera.position, target, candidateMarker, robotState, obstructions)) return true;
      }
    }
    return false;
  }

  function projectMarker(candidateMarker, camera, robotState, obstructions) {
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
      ? markerOccluded(candidateMarker, camera, robotState, obstructions)
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
    const obstructions = state ? practiceSolidsForState(state) : [];
    const meals = mealGeometryForState(state);
    const occludingGeometry = [
      ...obstructions,
      ...meals.flatMap((meal) => meal.components)
    ];
    const markers = FIDUCIALS.map((candidateMarker) =>
      projectMarker(candidateMarker, camera, robotState, occludingGeometry)
    );
    const detections = markers
      .filter((candidate) => candidate.eligible)
      .sort((a, b) => a.id - b.id)
      .map(detectionFromProjection);

    return deepFreeze({ camera, robot, chassis, obstructions, meals, markers, detections });
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
      obstructions: practiceSolidsForState(state).map((obstruction) => {
        const center = toScreen(obstruction);
        return {
          ...obstruction,
          x: center.x,
          y: center.y,
          footprint: obstruction.footprint.map(toScreen)
        };
      }),
      meals: mealGeometryForState(state).map((meal) => {
        const center = toScreen(meal);
        return {
          ...meal,
          x: center.x,
          y: center.y,
          components: meal.components.map((component) => {
            const componentCenter = toScreen(component);
            return {
              ...component,
              x: componentCenter.x,
              y: componentCenter.y,
              footprint: component.footprint.map(toScreen)
            };
          })
        };
      }),
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
    mealPlateRadius: MEAL_PLATE_RADIUS,
    mealPlateThickness: MEAL_PLATE_THICKNESS,
    mealPlateSegments: MEAL_PLATE_SEGMENTS,
    mealFoodSegments: MEAL_FOOD_SEGMENTS,
    mealFoodPieces: MEAL_FOOD_PIECES,
    mealPostRadius: MEAL_POST_RADIUS,
    mealPostHeight: MEAL_POST_HEIGHT,
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
    practiceFruitCount: PRACTICE_FRUIT_COUNT,
    practiceFruitRadius: PRACTICE_FRUIT_RADIUS,
    practiceFruitHeight: PRACTICE_FRUIT_HEIGHT,
    practiceRobotLength: PRACTICE_ROBOT_LENGTH,
    practiceRobotWidth: PRACTICE_ROBOT_WIDTH,
    practiceRobotCornerRadius: PRACTICE_ROBOT_CORNER_RADIUS,
    practiceRobotTopZ: PRACTICE_ROBOT_TOP_Z,
    practiceStartClearance: PRACTICE_START_CLEARANCE,
    practicePlacementAttempts: PRACTICE_PLACEMENT_ATTEMPTS,
    practicePositionStep: PRACTICE_POSITION_STEP,
    practiceDefaultSeed: PRACTICE_DEFAULT_SEED,
    practiceForwardOutput: PRACTICE_FORWARD_OUTPUT,
    practiceTurnOutput: PRACTICE_TURN_OUTPUT,
    practiceReverseOutput: PRACTICE_REVERSE_OUTPUT,
    practiceBoundary: PRACTICE_BOUNDARY,
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
    occlusionPolicy: "reject when modeled walls, tables, the chassis, practice obstructions, or table-meal geometry block sampled pattern sightlines"
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
    normalizeTableMeals,
    normalizePracticeObstructions,
    createPracticeObstructions,
    getRobotFootprint,
    collisionForPose,
    isPoseValid,
    integrateRobot,
    integrateScene,
    getCameraPose,
    projectPoint,
    projectScene,
    detectFiducials,
    layoutWorldView,
    normalizeAngle
  });
});
