(function () {
  "use strict";

  if (typeof window === "undefined") return;

  const ballModel = window.VisionWorld;
  const diningModel = window.CVSDiningRoomModel;
  if (!ballModel || !diningModel) {
    throw new Error("The AI Vision scene models are unavailable.");
  }

  const BALL_SCENE_ID = "ball";
  const DINING_SCENE_ID = diningModel.SCENE_ID;
  const BALL_START_POSE_ID = "ball-default";
  const VALID_SCENES = new Set([BALL_SCENE_ID, DINING_SCENE_ID]);
  const VALID_MOUNTS = new Set(Object.keys(diningModel.config.mounts));
  const VALID_HEADS = new Set(Object.keys(diningModel.config.heads));
  const VALID_STARTS = new Set(diningModel.startPoses.map((pose) => pose.id));
  const CAMERA_NEAR = diningModel.config.cameraNearPlane;
  const SENSOR_WIDTH = ballModel.SENSOR_WIDTH;
  const SENSOR_HEIGHT = ballModel.SENSOR_HEIGHT;

  const ballWorld = ballModel.createWorldState();
  let settings = null;
  let diningState = null;
  let headPreset = "forward";
  let ballProjection = ballModel.projectTarget(ballWorld);
  let diningProjection = null;
  let capturedSnapshot = ballModel.createEmptySnapshot();
  let currentSnapshot = capturedSnapshot;
  let selectedItem = 1;
  let motionBlocked = false;
  let collisionDetail = null;
  let cameraElement = null;
  let targetElement = null;
  let diningCameraCanvas = null;
  let worldStageElement = null;
  let worldMapElement = null;
  let diningWorldCanvas = null;
  let worldMapBackgroundElement = null;
  let worldMapGridElement = null;
  let worldMapFovElement = null;
  let worldMapCameraAxisElement = null;
  let worldMapRobotElement = null;
  let worldMapRobotLabelElement = null;
  let worldMapTargetElement = null;
  let worldMapTargetLabelElement = null;
  let worldMapDistanceElement = null;
  let worldMapBearingElement = null;
  let worldMapHeadingElement = null;
  let worldMapMotionElement = null;
  let sceneSelectElement = null;
  let startPoseSelectElement = null;
  let chassisLengthInputElement = null;
  let chassisWidthInputElement = null;
  let cameraMountSelectElement = null;
  let cameraHeightInputElement = null;
  let lookForwardButton = null;
  let lookDown45Button = null;
  let lookDownButton = null;
  let practiceObstructionsFieldset = null;
  let fruitClutterToggle = null;
  let roamingRobotToggle = null;
  let randomizeObstructionsButton = null;
  let practiceObstructionsStatus = null;
  let setupStatusElement = null;
  let cameraModeHintElement = null;
  let cameraHeadingElement = null;
  let worldHeadingElement = null;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let animationFrameId = null;
  let previousFrameTime = null;
  let worldResizeFrameId = null;
  let worldResizeObserver = null;
  let worldDisplayWidth = 320;
  let worldDisplayHeight = 160;
  let worldPixelRatio = 1;
  let initialized = false;
  let programStopped = true;
  const markerImages = [];
  const markerImageFailures = new Set();

  function clonePracticeObstructions(source) {
    return {
      fruitClutter: source.fruitClutter,
      roamingRobot: source.roamingRobot,
      seed: source.seed,
      fruit: source.fruit.map((item) => ({ ...item })),
      roamingStart: source.roamingStart ? { ...source.roamingStart } : null
    };
  }

  function samePracticeObstructions(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function isProgramStopped() {
    if (
      window.cvsProgramControl &&
      typeof window.cvsProgramControl.isStopped === "function"
    ) {
      return window.cvsProgramControl.isStopped();
    }
    return programStopped;
  }

  function normalizeSettings(candidate) {
    if (candidate === undefined || candidate === null) candidate = {};
    if (typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Simulator settings must be an object.");
    }

    const scene = candidate.scene === undefined ? BALL_SCENE_ID : candidate.scene;
    if (!VALID_SCENES.has(scene)) {
      throw new Error(`Unsupported AI Vision scene: ${String(scene)}.`);
    }

    const camera = candidate.camera === undefined ? {} : candidate.camera;
    if (!camera || typeof camera !== "object" || Array.isArray(camera)) {
      throw new Error("Camera settings must be an object.");
    }

    const mount = camera.mount === undefined ? diningModel.config.defaultMount : camera.mount;
    if (!VALID_MOUNTS.has(mount)) {
      throw new Error(`Unsupported camera mount: ${String(mount)}.`);
    }

    const height = camera.height === undefined
      ? diningModel.config.cameraDefaultHeight
      : Number(camera.height);
    if (
      !Number.isFinite(height) ||
      height < diningModel.config.cameraMinHeight ||
      height > diningModel.config.cameraMaxHeight
    ) {
      throw new Error(
        `Lens height must be ${diningModel.config.cameraMinHeight}–${diningModel.config.cameraMaxHeight} inches.`,
      );
    }
    const step = diningModel.config.cameraHeightStep;
    const steppedHeight = Math.round(height / step) * step;
    if (Math.abs(height - steppedHeight) > 0.000001) {
      throw new Error(`Lens height must use ${step}-inch increments.`);
    }

    const head = camera.head === undefined ? diningModel.config.defaultHead : camera.head;
    if (!VALID_HEADS.has(head)) {
      throw new Error(`Unsupported camera head preset: ${String(head)}.`);
    }

    const chassis = candidate.chassis === undefined ? {} : candidate.chassis;
    if (!chassis || typeof chassis !== "object" || Array.isArray(chassis)) {
      throw new Error("Chassis settings must be an object.");
    }

    const length = chassis.length === undefined
      ? diningModel.config.robotDefaultLength
      : Number(chassis.length);
    const width = chassis.width === undefined
      ? diningModel.config.robotDefaultWidth
      : Number(chassis.width);
    const dimensionMinimum = diningModel.config.robotDimensionMin;
    const dimensionMaximum = diningModel.config.robotDimensionMax;
    const dimensionStep = diningModel.config.robotDimensionStep;
    [
      ["Length", length],
      ["Width", width],
    ].forEach(([label, value]) => {
      if (!Number.isFinite(value) || value < dimensionMinimum || value > dimensionMaximum) {
        throw new Error(`${label} must be ${dimensionMinimum}\u2013${dimensionMaximum} inches.`);
      }
      const steppedValue = Math.round(value / dimensionStep) * dimensionStep;
      if (Math.abs(value - steppedValue) > 0.000001) {
        throw new Error(`${label} must use ${dimensionStep}-inch increments.`);
      }
    });

    const defaultStart = scene === DINING_SCENE_ID
      ? diningModel.config.defaultStartPoseId
      : BALL_START_POSE_ID;
    const startPose = candidate.startPose === undefined ? defaultStart : candidate.startPose;
    if (scene === DINING_SCENE_ID && !VALID_STARTS.has(startPose)) {
      throw new Error(`Unsupported Dining Room start pose: ${String(startPose)}.`);
    }
    if (scene === BALL_SCENE_ID && startPose !== BALL_START_POSE_ID) {
      throw new Error(`Unsupported ball-sandbox start pose: ${String(startPose)}.`);
    }

    const normalizedChassis = {
      length: Math.round(length / dimensionStep) * dimensionStep,
      width: Math.round(width / dimensionStep) * dimensionStep,
    };
    const diningStartPose = scene === DINING_SCENE_ID
      ? startPose
      : candidate.diningStartPose === undefined
        ? diningModel.config.defaultStartPoseId
        : candidate.diningStartPose;
    if (!VALID_STARTS.has(diningStartPose)) {
      throw new Error(`Unsupported Dining Room start pose: ${String(diningStartPose)}.`);
    }
    const selectedStart = diningModel.startPoses.find((pose) => pose.id === diningStartPose);
    if (!diningModel.isPoseValid({ robot: selectedStart, chassis: normalizedChassis })) {
      throw new Error(
        `${selectedStart.label} does not fit a ${normalizedChassis.length} \u00d7 ${normalizedChassis.width} inch chassis. Choose another start or smaller dimensions.`,
      );
    }
    const practiceObstructions = diningModel.normalizePracticeObstructions(
      candidate.practiceObstructions,
      { robot: selectedStart, chassis: normalizedChassis },
    );

    return {
      scene,
      camera: { mount, height: steppedHeight, head },
      chassis: normalizedChassis,
      startPose,
      diningStartPose,
      practiceObstructions
    };
  }

  function getSettings() {
    return {
      scene: settings.scene,
      camera: { ...settings.camera },
      chassis: { ...settings.chassis },
      startPose: settings.startPose,
      diningStartPose: settings.diningStartPose,
      practiceObstructions: clonePracticeObstructions(settings.practiceObstructions)
    };
  }

  function dispatchSettingsChange(nextSettings) {
    if (window.Drivetrain && typeof window.Drivetrain.stop === "function") {
      window.Drivetrain.stop();
    }
    window.dispatchEvent(new CustomEvent("visionsettingschange", {
      detail: {
        settings: {
          scene: nextSettings.scene,
          camera: { ...nextSettings.camera },
          chassis: { ...nextSettings.chassis },
          startPose: nextSettings.startPose,
          diningStartPose: nextSettings.diningStartPose,
          practiceObstructions: clonePracticeObstructions(nextSettings.practiceObstructions)
        }
      }
    }));
  }

  function makeDiningState(nextSettings, nextHead = nextSettings.camera.head) {
    return diningModel.createState({
      startPoseId: nextSettings.startPose,
      chassis: nextSettings.chassis,
      practiceObstructions: nextSettings.practiceObstructions,
      camera: {
        mount: nextSettings.camera.mount,
        height: nextSettings.camera.height,
        head: nextHead
      }
    });
  }

  function applySettings(candidate, options) {
    const nextSettings = normalizeSettings(candidate);
    const applyOptions = options || {};
    const dimensionsChanged = Boolean(
      settings && (
        settings.chassis.length !== nextSettings.chassis.length ||
        settings.chassis.width !== nextSettings.chassis.width
      )
    );
    const practiceObstructionsChanged = Boolean(
      settings && !samePracticeObstructions(
        settings.practiceObstructions,
        nextSettings.practiceObstructions,
      )
    );
    if (
      dimensionsChanged &&
      window.cvsProgramControl &&
      typeof window.cvsProgramControl.isStopped === "function" &&
      !window.cvsProgramControl.isStopped()
    ) {
      throw new Error("Stop the program before changing chassis dimensions.");
    }
    if (practiceObstructionsChanged && !isProgramStopped()) {
      throw new Error("Stop the program before changing practice obstructions.");
    }
    const preserveHead = Boolean(applyOptions.preserveHead) && settings && settings.scene === nextSettings.scene;
    const nextHead = preserveHead ? headPreset : nextSettings.camera.head;
    nextSettings.camera.head = nextHead;

    if (applyOptions.notify !== false) dispatchSettingsChange(nextSettings);

    settings = nextSettings;
    headPreset = nextHead;
    motionBlocked = false;
    collisionDetail = null;
    previousFrameTime = null;

    if (settings.scene === DINING_SCENE_ID) {
      diningState = makeDiningState(settings, headPreset);
    } else {
      ballModel.resetWorld(ballWorld);
    }

    syncSetupControls();
    clearSnapshot();
    updateCameraView();
    return getSettings();
  }

  function sensorView(snapshot, item) {
    return ballModel.selectSnapshotObject(snapshot, item);
  }

  function publishSensorView() {
    currentSnapshot = sensorView(capturedSnapshot, selectedItem);
    window.visionSensor = currentSnapshot;
    window.dispatchEvent(new CustomEvent("visiondatachange", { detail: currentSnapshot }));
    return currentSnapshot;
  }

  function replaceSnapshot(nextSnapshot) {
    capturedSnapshot = nextSnapshot;
    selectedItem = 1;
    return publishSensorView();
  }

  function clearSnapshot() {
    return replaceSnapshot(ballModel.createEmptySnapshot());
  }

  function getSnapshot() {
    return currentSnapshot;
  }

  function hasCapturedSnapshot() {
    return currentSnapshot.captured;
  }

  function setSnapshotObjectItem(item) {
    const numeric = Math.floor(Number(item));
    selectedItem = Number.isFinite(numeric) && numeric >= 1 ? numeric : 1;
    return publishSensorView();
  }

  function normalizedSignature(signature) {
    if (signature === "TARGET" || signature === "FIDUCIAL_IDS") return signature;
    return settings.scene === DINING_SCENE_ID ? "FIDUCIAL_IDS" : "TARGET";
  }

  function takeSnapshot(signature) {
    const selectedSignature = normalizedSignature(signature);
    updateCameraView();

    if (settings.scene === BALL_SCENE_ID && selectedSignature === "TARGET") {
      return replaceSnapshot(ballModel.captureSnapshot(ballProjection));
    }

    if (settings.scene === DINING_SCENE_ID && selectedSignature === "FIDUCIAL_IDS") {
      const detections = diningProjection.detections.map((detection) => ({
        ...detection,
        type: "fiducial",
        confidenceSupported: false
      }));
      return replaceSnapshot(ballModel.captureSnapshot({ detections }));
    }

    return replaceSnapshot(ballModel.captureSnapshot({ detections: [] }));
  }

  function setHeadPreset(preset) {
    if (!VALID_HEADS.has(preset)) {
      throw new Error(`Unsupported camera head preset: ${String(preset)}.`);
    }
    headPreset = preset;
    settings = {
      ...settings,
      camera: { ...settings.camera, head: headPreset }
    };
    if (diningState) {
      diningState = {
        ...diningState,
        camera: diningModel.normalizeCameraSettings({
          ...diningState.camera,
          mount: settings.camera.mount,
          height: settings.camera.height,
          head: headPreset
        })
      };
    }
    syncSetupControls();
    updateCameraView();
    return headPreset;
  }

  function resetWorld() {
    previousFrameTime = null;
    motionBlocked = false;
    collisionDetail = null;
    headPreset = settings.camera.head;
    if (settings.scene === DINING_SCENE_ID) {
      diningState = makeDiningState(settings, headPreset);
    } else {
      ballModel.resetWorld(ballWorld);
    }
    syncSetupControls();
    const nextProjection = updateCameraView();
    clearSnapshot();
    return nextProjection;
  }

  function resetTarget() {
    return resetWorld();
  }

  function createPracticeScenario(options, seed) {
    const selectedStart = diningModel.startPoses.find((pose) => pose.id === settings.diningStartPose);
    return diningModel.createPracticeObstructions(
      {
        fruitClutter: Boolean(options.fruitClutter),
        roamingRobot: Boolean(options.roamingRobot)
      },
      {
        robot: selectedStart,
        chassis: settings.chassis,
        seed
      },
    );
  }

  function setPracticeObstructions(options) {
    if (settings.scene !== DINING_SCENE_ID) {
      throw new Error("Practice obstructions are available only in Dining Room.");
    }
    if (!isProgramStopped()) {
      throw new Error("Stop the program before changing practice obstructions.");
    }
    const next = getSettings();
    next.practiceObstructions = createPracticeScenario(options, settings.practiceObstructions.seed);
    return applySettings(next, { notify: true, preserveHead: true });
  }

  function nextPracticeSeed(seed) {
    return (Number(seed) + 0x9e3779b9) >>> 0;
  }

  function randomizePracticeObstructions() {
    if (settings.scene !== DINING_SCENE_ID) {
      throw new Error("Practice obstructions are available only in Dining Room.");
    }
    if (!isProgramStopped()) {
      throw new Error("Stop the program before randomizing practice obstructions.");
    }
    const current = settings.practiceObstructions;
    const next = getSettings();
    next.practiceObstructions = createPracticeScenario(current, nextPracticeSeed(current.seed));
    return applySettings(next, { notify: true, preserveHead: true });
  }

  function getWorldState() {
    if (settings.scene === DINING_SCENE_ID) {
      return {
        scene: settings.scene,
        startPoseId: diningState.startPoseId,
        robot: { ...diningState.robot },
        camera: { ...diningState.camera },
        chassis: { ...diningState.chassis },
        blocked: motionBlocked,
        collision: collisionDetail ? { ...collisionDetail } : null
      };
    }
    return {
      scene: settings.scene,
      robot: { ...ballWorld.robot },
      target: { ...ballWorld.target },
      blocked: false
    };
  }

  function setTargetPosition(centerX, centerY) {
    if (settings.scene !== BALL_SCENE_ID) return diningProjection;
    ballModel.setTargetFromCamera(ballWorld, centerX, centerY);
    return updateCameraView();
  }

  function step(deltaSeconds) {
    if (!window.cvsProgramControl || !window.cvsProgramControl.isPaused()) {
      if (settings.scene === DINING_SCENE_ID) {
        const movement = diningModel.integrateScene(
          diningState,
          window.drivetrain,
          deltaSeconds,
          {
            advanceRoaming: Boolean(
              window.cvsProgramControl &&
              typeof window.cvsProgramControl.isRunning === "function" &&
              window.cvsProgramControl.isRunning()
            )
          },
        );
        diningState = movement.state;
        motionBlocked = movement.blocked;
        collisionDetail = movement.collision;
      } else {
        ballModel.integrateRobot(ballWorld, window.drivetrain, deltaSeconds);
        motionBlocked = false;
        collisionDetail = null;
      }
    }
    return updateCameraView();
  }

  function animationFrame(timestamp) {
    if (previousFrameTime === null) previousFrameTime = timestamp;
    const deltaSeconds = Math.min(Math.max((timestamp - previousFrameTime) / 1000, 0), 0.05);
    previousFrameTime = timestamp;
    step(deltaSeconds);
    animationFrameId = window.requestAnimationFrame(animationFrame);
  }

  function add3(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function scale3(vector, factor) {
    return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
  }

  function cameraDepth(point, camera) {
    return (point.x - camera.position.x) * camera.forward.x +
      (point.y - camera.position.y) * camera.forward.y +
      (point.z - camera.position.z) * camera.forward.z;
  }

  function interpolatePoint(a, b, amount) {
    return {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
      z: a.z + (b.z - a.z) * amount
    };
  }

  function clipPolygonToNearPlane(points, camera) {
    if (!points.length) return [];
    const output = [];

    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const previous = points[(index + points.length - 1) % points.length];
      const currentDepth = cameraDepth(current, camera);
      const previousDepth = cameraDepth(previous, camera);
      const currentInside = currentDepth >= CAMERA_NEAR;
      const previousInside = previousDepth >= CAMERA_NEAR;

      if (currentInside !== previousInside) {
        const amount = (CAMERA_NEAR - previousDepth) / (currentDepth - previousDepth);
        output.push(interpolatePoint(previous, current, amount));
      }
      if (currentInside) output.push(current);
    }
    return output;
  }

  function projectWorldPolygon(points, camera) {
    const clipped = clipPolygonToNearPlane(points, camera);
    if (clipped.length < 3) return null;
    const projected = clipped.map((point) => diningModel.projectPoint(point, camera));
    if (!projected.every((point) => point.finite)) return null;
    return {
      points: projected,
      depth: clipped.reduce((total, point) => total + cameraDepth(point, camera), 0) / clipped.length
    };
  }

  function projectWorldSegment(start, end, camera) {
    let first = start;
    let second = end;
    let firstDepth = cameraDepth(first, camera);
    let secondDepth = cameraDepth(second, camera);
    if (firstDepth < CAMERA_NEAR && secondDepth < CAMERA_NEAR) return null;
    if (firstDepth < CAMERA_NEAR) {
      first = interpolatePoint(first, second, (CAMERA_NEAR - firstDepth) / (secondDepth - firstDepth));
      firstDepth = CAMERA_NEAR;
    } else if (secondDepth < CAMERA_NEAR) {
      second = interpolatePoint(second, first, (CAMERA_NEAR - secondDepth) / (firstDepth - secondDepth));
      secondDepth = CAMERA_NEAR;
    }
    const projectedStart = diningModel.projectPoint(first, camera);
    const projectedEnd = diningModel.projectPoint(second, camera);
    if (!projectedStart.finite || !projectedEnd.finite) return null;
    return [projectedStart, projectedEnd];
  }

  function drawPolygon(context, points, fill, stroke, lineWidth) {
    if (!points || points.length < 3) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth || 1;
      context.stroke();
    }
  }

  function markerCorners(marker, sideLength) {
    const half = sideLength / 2;
    return [
      add3(add3(marker.center, scale3(marker.right, -half)), scale3(marker.up, half)),
      add3(add3(marker.center, scale3(marker.right, half)), scale3(marker.up, half)),
      add3(add3(marker.center, scale3(marker.right, half)), scale3(marker.up, -half)),
      add3(add3(marker.center, scale3(marker.right, -half)), scale3(marker.up, -half))
    ];
  }

  function solveTriangleTransform(source, destination) {
    const [s0, s1, s2] = source;
    const [d0, d1, d2] = destination;
    const determinant = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(determinant) < 0.000001) return null;

    function coefficients(v0, v1, v2) {
      return {
        x: (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / determinant,
        y: (v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / determinant,
        offset: (
          v0 * (s1.x * s2.y - s2.x * s1.y) +
          v1 * (s2.x * s0.y - s0.x * s2.y) +
          v2 * (s0.x * s1.y - s1.x * s0.y)
        ) / determinant
      };
    }

    const x = coefficients(d0.x, d1.x, d2.x);
    const y = coefficients(d0.y, d1.y, d2.y);
    return { a: x.x, b: y.x, c: x.y, d: y.y, e: x.offset, f: y.offset };
  }

  function drawTexturedTriangle(context, image, source, destination) {
    const transform = solveTriangleTransform(source, destination);
    if (!transform) return;
    context.save();
    context.beginPath();
    context.moveTo(destination[0].x, destination[0].y);
    context.lineTo(destination[1].x, destination[1].y);
    context.lineTo(destination[2].x, destination[2].y);
    context.closePath();
    context.clip();
    context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
    context.drawImage(image, 0, 0);
    context.restore();
  }

  function drawTexturedQuad(context, image, corners) {
    if (!image || !image.complete || !image.naturalWidth || corners.length !== 4) {
      drawPolygon(context, corners, "#f7f8f2", "#0d1719", 0.7);
      return;
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    drawTexturedTriangle(
      context,
      image,
      [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }],
      [corners[0], corners[1], corners[2]],
    );
    drawTexturedTriangle(
      context,
      image,
      [{ x: 0, y: 0 }, { x: width, y: height }, { x: 0, y: height }],
      [corners[0], corners[2], corners[3]],
    );
  }

  function tableFaces(table) {
    const bounds = table.bounds;
    const x0 = bounds.minimumX;
    const x1 = bounds.maximumX;
    const y0 = bounds.minimumY;
    const y1 = bounds.maximumY;
    const z0 = 0;
    const z1 = table.topZ;
    return [
      [{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }],
      [{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }],
      [{ x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }],
      [{ x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 }],
      [{ x: x0, y: y1, z: z0 }, { x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: z1 }, { x: x0, y: y1, z: z1 }]
    ];
  }

  function obstructionFaces(obstruction) {
    const footprint = Array.isArray(obstruction.footprint) ? obstruction.footprint : [];
    if (footprint.length < 3) return [];
    const minimumZ = Number(obstruction.minimumZ) || 0;
    const maximumZ = Number(obstruction.maximumZ) || Number(obstruction.height) || minimumZ;
    const top = footprint.map((point) => ({ x: point.x, y: point.y, z: maximumZ }));
    const sides = footprint.map((point, index) => {
      const next = footprint[(index + 1) % footprint.length];
      return [
        { x: point.x, y: point.y, z: minimumZ },
        { x: next.x, y: next.y, z: minimumZ },
        { x: next.x, y: next.y, z: maximumZ },
        { x: point.x, y: point.y, z: maximumZ }
      ];
    });
    return [top, ...sides];
  }

  function obstructionPalette(obstruction, faceIndex) {
    if (obstruction.kind === "practice-fruit") {
      return {
        fill: faceIndex === 0 ? "#ffb33f" : "#c9572c",
        stroke: "#ffd787"
      };
    }
    return {
      fill: faceIndex === 0 ? "#7584d6" : "#34437f",
      stroke: "#c3ccff"
    };
  }

  function obstructionCountDescription(obstructions) {
    const fruitCount = obstructions.filter((item) => item.kind === "practice-fruit").length;
    const roamingCount = obstructions.filter((item) => item.kind === "roaming-robot").length;
    return `${fruitCount} fruit prop${fruitCount === 1 ? "" : "s"} and ${roamingCount} roaming robot${roamingCount === 1 ? "" : "s"}`;
  }

  function renderDiningCamera() {
    if (!diningCameraCanvas || !diningProjection) return;
    const context = diningCameraCanvas.getContext("2d");
    const camera = diningProjection.camera;
    context.setTransform(1, 0, 0, 1, 0, 0);
    const background = context.createLinearGradient(0, 0, 0, SENSOR_HEIGHT);
    background.addColorStop(0, "#061217");
    background.addColorStop(0.5, "#0b1c20");
    background.addColorStop(1, "#172522");
    context.fillStyle = background;
    context.fillRect(0, 0, SENSOR_WIDTH, SENSOR_HEIGHT);

    const floorBounds = diningModel.scene.outerBoundary;
    const floor = projectWorldPolygon([
      { x: floorBounds.minimumX, y: floorBounds.minimumY, z: 0 },
      { x: floorBounds.maximumX, y: floorBounds.minimumY, z: 0 },
      { x: floorBounds.maximumX, y: floorBounds.maximumY, z: 0 },
      { x: floorBounds.minimumX, y: floorBounds.maximumY, z: 0 }
    ], camera);
    if (floor) drawPolygon(context, floor.points, "#263a35", null);

    context.save();
    context.strokeStyle = "rgba(174, 216, 197, 0.16)";
    context.lineWidth = 0.7;
    for (let coordinate = -84; coordinate <= 84; coordinate += 12) {
      [
        [{ x: coordinate, y: -90, z: 0.01 }, { x: coordinate, y: 90, z: 0.01 }],
        [{ x: -90, y: coordinate, z: 0.01 }, { x: 90, y: coordinate, z: 0.01 }]
      ].forEach(([start, end]) => {
        const segment = projectWorldSegment(start, end, camera);
        if (!segment) return;
        context.beginPath();
        context.moveTo(segment[0].x, segment[0].y);
        context.lineTo(segment[1].x, segment[1].y);
        context.stroke();
      });
    }
    context.restore();

    const renderItems = [];
    diningModel.scene.walls.forEach((wall) => {
      const face = projectWorldPolygon([
        { x: wall.start.x, y: wall.start.y, z: 0 },
        { x: wall.end.x, y: wall.end.y, z: 0 },
        { x: wall.end.x, y: wall.end.y, z: wall.height },
        { x: wall.start.x, y: wall.start.y, z: wall.height }
      ], camera);
      if (face) renderItems.push({ ...face, kind: "face", layer: 0, fill: "#637178", stroke: "#9bacaf" });
    });

    diningModel.scene.tables.forEach((table) => {
      tableFaces(table).forEach((points, faceIndex) => {
        const face = projectWorldPolygon(points, camera);
        if (!face) return;
        renderItems.push({
          ...face,
          kind: "face",
          layer: 0,
          fill: faceIndex === 0 ? "#ad986f" : "#665941",
          stroke: "#d2bd91"
        });
      });
    });

    diningProjection.obstructions.forEach((obstruction) => {
      obstructionFaces(obstruction).forEach((points, faceIndex) => {
        const face = projectWorldPolygon(points, camera);
        if (!face) return;
        const palette = obstructionPalette(obstruction, faceIndex);
        renderItems.push({
          ...face,
          kind: "face",
          layer: 1,
          fill: palette.fill,
          stroke: palette.stroke
        });
      });
    });

    diningProjection.markers.forEach((projection) => {
      if (!projection.allInFront) return;
      const paperProjection = markerCorners(projection.marker, projection.marker.paperSide)
        .map((corner) => diningModel.projectPoint(corner, camera));
      if (paperProjection.every((point) => point.inFront && point.finite)) {
        renderItems.push({
          points: paperProjection,
          depth: paperProjection.reduce((sum, point) => sum + point.depth, 0) / paperProjection.length,
          kind: "paper",
          layer: 1,
          fill: "#f7f8f2",
          stroke: "#d1d5ce"
        });
      }
      renderItems.push({
        points: projection.corners,
        depth: projection.corners.reduce((sum, point) => sum + point.depth, 0) / projection.corners.length,
        kind: "pattern",
        layer: 2,
        image: markerImages[projection.id]
      });
    });

    renderItems.sort((a, b) => (b.depth - a.depth) || (a.layer - b.layer));
    renderItems.forEach((item) => {
      if (item.kind === "pattern") drawTexturedQuad(context, item.image, item.points);
      else drawPolygon(context, item.points, item.fill, item.stroke, 0.8);
    });

    context.save();
    context.font = "700 9px Space Mono, Consolas, monospace";
    context.textBaseline = "bottom";
    diningProjection.markers.filter((projection) => projection.eligible).forEach((projection) => {
      const bounds = projection.bounds;
      context.strokeStyle = "#67e5c0";
      context.lineWidth = 1.3;
      context.strokeRect(bounds.minimumX, bounds.minimumY, bounds.width, bounds.height);
      const label = `ID ${projection.id}`;
      const labelWidth = context.measureText(label).width + 6;
      const labelY = Math.max(10, bounds.minimumY - 2);
      context.fillStyle = "rgba(3, 14, 13, 0.88)";
      context.fillRect(bounds.minimumX, labelY - 10, labelWidth, 11);
      context.fillStyle = "#c6ffed";
      context.fillText(label, bounds.minimumX + 3, labelY);
    });
    context.restore();

    diningCameraCanvas.setAttribute(
      "aria-label",
      `Live projected Dining Room camera. ${diningProjection.detections.length} fiducial${diningProjection.detections.length === 1 ? "" : "s"} currently readable. ${obstructionCountDescription(diningProjection.obstructions)} in the scene.`,
    );
  }

  function canvasPath(context, points) {
    if (!points.length) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
  }

  function resizeWorldSurface() {
    if (!worldStageElement || !worldMapElement || !diningWorldCanvas) return false;
    const nextWidth = Math.max(1, Math.round(worldStageElement.clientWidth || worldDisplayWidth));
    const nextHeight = Math.max(1, Math.round(worldStageElement.clientHeight || worldDisplayHeight));
    const nextPixelRatio = Math.min(Math.max(Number(window.devicePixelRatio) || 1, 1), 2);
    const backingWidth = Math.max(1, Math.round(nextWidth * nextPixelRatio));
    const backingHeight = Math.max(1, Math.round(nextHeight * nextPixelRatio));
    const changed = nextWidth !== worldDisplayWidth
      || nextHeight !== worldDisplayHeight
      || nextPixelRatio !== worldPixelRatio
      || diningWorldCanvas.width !== backingWidth
      || diningWorldCanvas.height !== backingHeight;

    worldDisplayWidth = nextWidth;
    worldDisplayHeight = nextHeight;
    worldPixelRatio = nextPixelRatio;
    worldMapElement.setAttribute("viewBox", `0 0 ${nextWidth} ${nextHeight}`);
    worldMapBackgroundElement.setAttribute("width", nextWidth);
    worldMapBackgroundElement.setAttribute("height", nextHeight);
    worldMapGridElement.setAttribute("width", nextWidth);
    worldMapGridElement.setAttribute("height", nextHeight);
    if (diningWorldCanvas.width !== backingWidth) diningWorldCanvas.width = backingWidth;
    if (diningWorldCanvas.height !== backingHeight) diningWorldCanvas.height = backingHeight;
    return changed;
  }

  function scheduleWorldSurfaceResize() {
    if (worldResizeFrameId !== null) return;
    worldResizeFrameId = window.requestAnimationFrame(() => {
      worldResizeFrameId = null;
      if (resizeWorldSurface() && initialized) renderWorldView();
    });
  }

  function renderDiningWorld() {
    if (!diningWorldCanvas || !diningState) return;
    const context = diningWorldCanvas.getContext("2d");
    const layout = diningModel.layoutWorldView(diningState, worldDisplayWidth, worldDisplayHeight);
    const markerLabelSize = Math.min(Math.max(layout.scale * 2.15, 8), 11);
    const wallMarkerRadius = Math.min(Math.max(markerLabelSize * 0.72, 5.75), 7.25);
    const legendLabelSize = Math.min(Math.max(layout.scale * 2.25, 9), 12);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, diningWorldCanvas.width, diningWorldCanvas.height);
    context.setTransform(worldPixelRatio, 0, 0, worldPixelRatio, 0, 0);
    context.fillStyle = "#050e12";
    context.fillRect(0, 0, layout.width, layout.height);

    context.save();
    context.strokeStyle = "rgba(93, 166, 150, 0.13)";
    context.lineWidth = 1;
    const originX = layout.width / 2;
    const originY = layout.height / 2;
    for (let coordinate = -84; coordinate <= 84; coordinate += 12) {
      const offset = coordinate * layout.scale;
      context.beginPath();
      context.moveTo(originX + offset, layout.outerBoundary.y);
      context.lineTo(originX + offset, layout.outerBoundary.y + layout.outerBoundary.height);
      context.moveTo(layout.outerBoundary.x, originY - offset);
      context.lineTo(layout.outerBoundary.x + layout.outerBoundary.width, originY - offset);
      context.stroke();
    }
    context.restore();

    context.save();
    context.setLineDash([5, 4]);
    context.strokeStyle = "rgba(255, 200, 110, 0.55)";
    context.lineWidth = 1.2;
    context.strokeRect(
      layout.outerBoundary.x,
      layout.outerBoundary.y,
      layout.outerBoundary.width,
      layout.outerBoundary.height,
    );
    context.restore();

    context.save();
    context.setLineDash([2, 3]);
    context.strokeStyle = "rgba(130, 190, 181, 0.25)";
    context.strokeRect(
      layout.competitionInterior.x,
      layout.competitionInterior.y,
      layout.competitionInterior.width,
      layout.competitionInterior.height,
    );
    context.restore();

    canvasPath(context, layout.camera.viewFootprint);
    context.fillStyle = "rgba(24, 201, 154, 0.09)";
    context.fill();
    context.strokeStyle = "rgba(103, 229, 192, 0.42)";
    context.lineWidth = 1;
    context.stroke();

    layout.tables.forEach((table) => {
      context.fillStyle = "#7b6b4c";
      context.strokeStyle = "#c2aa78";
      context.lineWidth = 1;
      context.fillRect(table.x - table.width / 2, table.y - table.height / 2, table.width, table.height);
      context.strokeRect(table.x - table.width / 2, table.y - table.height / 2, table.width, table.height);
      const image = markerImages[table.markerId];
      const markerSize = diningModel.config.patternSide * layout.scale;
      if (image && image.complete && image.naturalWidth) {
        context.drawImage(image, table.x - markerSize / 2, table.y - markerSize / 2, markerSize, markerSize);
      }
    });

    context.save();
    context.strokeStyle = "#aebcc0";
    context.lineWidth = 4;
    context.lineCap = "square";
    layout.walls.forEach((wall) => {
      context.beginPath();
      context.moveTo(wall.start.x, wall.start.y);
      context.lineTo(wall.end.x, wall.end.y);
      context.stroke();
    });
    context.restore();

    context.save();
    context.font = `700 ${markerLabelSize}px Space Mono, Consolas, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    layout.fiducials.forEach((marker) => {
      if (marker.surface === "table") {
        context.fillStyle = "#05100e";
        context.fillText(String(marker.id), marker.x, marker.y);
      } else {
        context.fillStyle = "#f5fbf8";
        context.beginPath();
        context.arc(marker.x, marker.y, wallMarkerRadius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#06120f";
        context.fillText(String(marker.id), marker.x, marker.y + 0.2);
      }
    });
    context.restore();

    layout.obstructions.forEach((obstruction) => {
      canvasPath(context, obstruction.footprint);
      const isFruit = obstruction.kind === "practice-fruit";
      context.fillStyle = isFruit ? "#f07a3f" : "#6677c8";
      context.strokeStyle = isFruit ? "#ffd17a" : "#c3ccff";
      context.lineWidth = 1.3;
      context.fill();
      context.stroke();

      if (isFruit) {
        context.fillStyle = "#73c66b";
        context.beginPath();
        context.ellipse(
          obstruction.x + layout.scale * 0.8,
          obstruction.y - layout.scale * 0.8,
          Math.max(1.2, layout.scale * 1.3),
          Math.max(0.8, layout.scale * 0.7),
          -Math.PI / 4,
          0,
          Math.PI * 2,
        );
        context.fill();
      } else {
        const frontLength = (Number(obstruction.length) || 18) * layout.scale * 0.38;
        context.strokeStyle = "#edf0ff";
        context.lineWidth = 1.6;
        context.beginPath();
        context.moveTo(obstruction.x, obstruction.y);
        context.lineTo(
          obstruction.x + Math.cos(obstruction.heading) * frontLength,
          obstruction.y - Math.sin(obstruction.heading) * frontLength,
        );
        context.stroke();
      }
    });

    canvasPath(context, layout.robot.footprint);
    context.fillStyle = "#dafcf2";
    context.strokeStyle = motionBlocked ? "#ff8b82" : "#0a4d3d";
    context.lineWidth = motionBlocked ? 2.4 : 1.5;
    context.fill();
    context.stroke();

    const frontLength = ((Number(layout.robot.length) || diningModel.config.robotDefaultLength) / 2 + 4) * layout.scale;
    context.strokeStyle = "#006f50";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(layout.robot.x, layout.robot.y);
    context.lineTo(
      layout.robot.x + Math.cos(layout.robot.heading) * frontLength,
      layout.robot.y - Math.sin(layout.robot.heading) * frontLength,
    );
    context.stroke();
    context.fillStyle = "#18c99a";
    context.beginPath();
    context.arc(layout.camera.x, layout.camera.y, 3, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#e2fff7";
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = "rgba(151, 224, 208, 0.82)";
    context.font = `700 ${legendLabelSize}px Space Mono, Consolas, monospace`;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText("BLUE / RED", layout.competitionInterior.x + 3, layout.competitionInterior.y + 3);
    context.fillStyle = "rgba(255, 200, 110, 0.78)";
    context.textAlign = "right";
    context.fillText("SIM BOUNDARY", layout.outerBoundary.x + layout.outerBoundary.width - 3, layout.outerBoundary.y + 3);

    diningWorldCanvas.setAttribute(
      "aria-label",
      `Dining Room debug World View. Robot ${layout.robot.length} by ${layout.robot.width} inches; heading ${Math.round(layout.robot.headingDegrees)} degrees; camera ${layout.camera.mount}, ${layout.camera.head}, ${layout.camera.height} inches. ${obstructionCountDescription(layout.obstructions)}. Motion ${motionBlocked ? "blocked" : "clear"}.`,
    );
  }

  function formatSignedDegrees(value) {
    const rounded = Math.round(value);
    if (rounded > 0) return `+${rounded}\u00b0`;
    return `${rounded}\u00b0`;
  }

  function renderBallTarget() {
    if (!targetElement) return;
    targetElement.hidden = !ballProjection.visibleInFrame;
    targetElement.style.left = `${(ballProjection.rawCenterX / SENSOR_WIDTH) * 100}%`;
    targetElement.style.top = `${(ballProjection.rawCenterY / SENSOR_HEIGHT) * 100}%`;
    targetElement.style.width = `${(ballProjection.apparentSize / SENSOR_WIDTH) * 100}%`;
    targetElement.style.height = `${(ballProjection.apparentSize / SENSOR_HEIGHT) * 100}%`;
    targetElement.setAttribute(
      "aria-label",
      `Draggable target, object ID 1, center X ${Math.round(ballProjection.rawCenterX)}, center Y ${Math.round(ballProjection.rawCenterY)}, distance ${Math.round(ballProjection.distance)}`,
    );
  }

  function renderBallWorld() {
    if (!worldMapElement) return;
    const layout = ballModel.layoutWorldView(ballWorld, worldDisplayWidth, worldDisplayHeight);
    const robot = layout.robot;
    const target = layout.target;
    const labelSize = Math.min(Math.max(Math.min(layout.width, layout.height) / 62, 8), 11);
    worldMapElement.style.setProperty("--world-map-label-size", `${labelSize}px`);
    const targetLabelOnRight = target.x < layout.width - 66;
    const robotLabelOnRight = robot.x < layout.width - 62;

    worldMapFovElement.setAttribute(
      "d",
      `M ${robot.x} ${robot.y} L ${layout.fov.left.x} ${layout.fov.left.y} L ${layout.fov.right.x} ${layout.fov.right.y} Z`,
    );
    worldMapFovElement.classList.toggle("contains-target", layout.targetInFov);
    worldMapCameraAxisElement.setAttribute("x1", robot.x);
    worldMapCameraAxisElement.setAttribute("y1", robot.y);
    worldMapCameraAxisElement.setAttribute("x2", layout.fov.direction.x);
    worldMapCameraAxisElement.setAttribute("y2", layout.fov.direction.y);
    worldMapRobotElement.setAttribute("transform", `translate(${robot.x} ${robot.y}) rotate(${robot.rotationDegrees})`);
    worldMapTargetElement.setAttribute("transform", `translate(${target.x} ${target.y})`);
    worldMapTargetElement.classList.toggle("is-detected", layout.targetDetected);
    worldMapRobotLabelElement.setAttribute("x", robot.x + (robotLabelOnRight ? 13 : -13));
    worldMapRobotLabelElement.setAttribute("y", Math.min(Math.max(robot.y + 18, 14), layout.height - 7));
    worldMapRobotLabelElement.setAttribute("text-anchor", robotLabelOnRight ? "start" : "end");
    worldMapTargetLabelElement.setAttribute("x", target.x + (targetLabelOnRight ? 13 : -13));
    worldMapTargetLabelElement.setAttribute("y", Math.min(Math.max(target.y - 10, 14), layout.height - 7));
    worldMapTargetLabelElement.setAttribute("text-anchor", targetLabelOnRight ? "start" : "end");
    worldMapDistanceElement.textContent = String(Math.round(layout.distance));
    worldMapBearingElement.textContent = formatSignedDegrees(layout.bearingDegrees);
    worldMapHeadingElement.textContent = `${Math.round(layout.robot.headingDegrees)}\u00b0`;
    worldMapMotionElement.textContent = "Clear";
    worldMapMotionElement.classList.remove("is-blocked");
    worldMapElement.setAttribute(
      "aria-label",
      `Debug World View, teaching only. Robot heading ${Math.round(layout.robot.headingDegrees)} degrees. Target distance ${Math.round(layout.distance)}, bearing ${formatSignedDegrees(layout.bearingDegrees)}. Target ${layout.targetInFov ? "inside" : "outside"} camera field of view.`,
    );
  }

  function renderCameraView() {
    if (!cameraElement) return;
    const isDining = settings.scene === DINING_SCENE_ID;
    diningCameraCanvas.hidden = !isDining;
    targetElement.hidden = isDining || !ballProjection.visibleInFrame;
    cameraElement.classList.toggle("is-dining-room", isDining);

    if (isDining) {
      renderDiningCamera();
      cameraElement.setAttribute("aria-label", "Live simulated AI Vision camera view of the Byte to Bite Dining Room");
    } else {
      renderBallTarget();
      cameraElement.setAttribute("aria-label", "Live simulated AI Vision camera view with draggable target");
    }
  }

  function renderWorldView() {
    if (!worldMapElement || !diningWorldCanvas) return;
    const isDining = settings.scene === DINING_SCENE_ID;
    // SVG elements do not reliably reflect the HTMLElement.hidden property.
    // Toggle the attribute explicitly so only one World View is exposed.
    worldMapElement.toggleAttribute("hidden", isDining);
    diningWorldCanvas.toggleAttribute("hidden", !isDining);

    if (!isDining) {
      renderBallWorld();
      return;
    }

    renderDiningWorld();
    const headingDegrees = (diningState.robot.heading * 180 / Math.PI + 360) % 360;
    worldMapDistanceElement.textContent = "\u2014";
    worldMapBearingElement.textContent = "\u2014";
    worldMapHeadingElement.textContent = `${Math.round(headingDegrees)}\u00b0`;
    worldMapMotionElement.textContent = motionBlocked
      ? `Blocked: ${collisionDetail ? collisionDetail.id : "obstacle"}`
      : "Clear";
    worldMapMotionElement.classList.toggle("is-blocked", motionBlocked);
  }

  function updateCameraView() {
    if (settings.scene === DINING_SCENE_ID) {
      diningProjection = diningModel.projectScene(diningState);
      diningProjection = {
        ...diningProjection,
        detections: diningModel.detectFiducials(diningProjection)
      };
    } else {
      ballProjection = ballModel.projectTarget(ballWorld);
    }
    renderCameraView();
    renderWorldView();
    return settings.scene === DINING_SCENE_ID ? diningProjection : ballProjection;
  }

  function syncSetupControls() {
    if (!sceneSelectElement || !settings) return;
    const isDining = settings.scene === DINING_SCENE_ID;
    sceneSelectElement.value = settings.scene;
    startPoseSelectElement.value = isDining ? settings.startPose : BALL_START_POSE_ID;
    startPoseSelectElement.disabled = !isDining;
    chassisLengthInputElement.value = String(settings.chassis.length);
    chassisWidthInputElement.value = String(settings.chassis.width);
    chassisLengthInputElement.disabled = !isDining;
    chassisWidthInputElement.disabled = !isDining;
    cameraMountSelectElement.value = settings.camera.mount;
    cameraHeightInputElement.value = String(settings.camera.height);
    cameraMountSelectElement.disabled = !isDining;
    cameraHeightInputElement.disabled = !isDining;
    lookForwardButton.disabled = !isDining;
    lookDown45Button.disabled = !isDining;
    lookDownButton.disabled = !isDining;
    lookForwardButton.classList.toggle("is-active", headPreset === "forward");
    lookDown45Button.classList.toggle("is-active", headPreset === "down45");
    lookDownButton.classList.toggle("is-active", headPreset === "down");
    lookForwardButton.setAttribute("aria-pressed", String(headPreset === "forward"));
    lookDown45Button.setAttribute("aria-pressed", String(headPreset === "down45"));
    lookDownButton.setAttribute("aria-pressed", String(headPreset === "down"));
    const practice = settings.practiceObstructions;
    const practiceControlsDisabled = !isDining || !isProgramStopped();
    practiceObstructionsFieldset.hidden = !isDining;
    practiceObstructionsFieldset.disabled = practiceControlsDisabled;
    fruitClutterToggle.checked = practice.fruitClutter;
    roamingRobotToggle.checked = practice.roamingRobot;
    const practiceMessages = [];
    if (isDining && practice.fruitClutter && practice.fruit.length < 4) {
      practiceMessages.push(`Placed ${practice.fruit.length} of 4 fruit props because space was limited.`);
    }
    if (isDining && practice.roamingRobot && !practice.roamingStart) {
      practiceMessages.push("The roaming robot could not be placed because space was limited.");
    }
    practiceObstructionsStatus.textContent = practiceMessages.join(" ");
    cameraModeHintElement.textContent = isDining ? "Projected fiducials" : "Drag target";
    cameraHeadingElement.textContent = isDining ? "Dining Room camera" : "Live Camera";
    worldHeadingElement.textContent = isDining ? "Dining Room / robot map" : "Robot / target map";
    if (markerImageFailures.size && isDining) {
      setupStatusElement.textContent = `${markerImageFailures.size} marker image${markerImageFailures.size === 1 ? "" : "s"} failed to load`;
    } else {
      setupStatusElement.textContent = isDining
        ? "21 fixed fiducials \u00b7 4 open corners"
        : "Ball sandbox ready";
    }
    document.body.dataset.visionScene = settings.scene;
  }

  function populateStartPoseOptions() {
    startPoseSelectElement.replaceChildren();
    const ballOption = document.createElement("option");
    ballOption.value = BALL_START_POSE_ID;
    ballOption.textContent = "Center, facing target";
    startPoseSelectElement.appendChild(ballOption);
    diningModel.startPoses.forEach((pose) => {
      const option = document.createElement("option");
      option.value = pose.id;
      option.textContent = pose.label;
      startPoseSelectElement.appendChild(option);
    });
  }

  function updateSettingsFromControls(partial, options) {
    const next = getSettings();
    if (partial.scene !== undefined) next.scene = partial.scene;
    if (partial.startPose !== undefined) next.startPose = partial.startPose;
    if (partial.camera) next.camera = { ...next.camera, ...partial.camera };
    if (partial.chassis) next.chassis = { ...next.chassis, ...partial.chassis };
    if (partial.practiceObstructions) {
      next.practiceObstructions = clonePracticeObstructions(partial.practiceObstructions);
    }
    try {
      return applySettings(next, { notify: true, preserveHead: Boolean(options && options.preserveHead) });
    } catch (error) {
      syncSetupControls();
      setupStatusElement.textContent = error.message;
      return null;
    }
  }

  function handleSceneChange() {
    const scene = sceneSelectElement.value;
    updateSettingsFromControls({
      scene,
      startPose: scene === DINING_SCENE_ID ? settings.diningStartPose : BALL_START_POSE_ID
    });
  }

  function handleStartPoseChange() {
    updateSettingsFromControls({ startPose: startPoseSelectElement.value }, { preserveHead: true });
  }

  function handleMountChange() {
    updateSettingsFromControls({ camera: { mount: cameraMountSelectElement.value } }, { preserveHead: true });
  }

  function handleHeightChange() {
    updateSettingsFromControls({ camera: { height: Number(cameraHeightInputElement.value) } }, { preserveHead: true });
  }

  function handleChassisChange() {
    updateSettingsFromControls({
      chassis: {
        length: Number(chassisLengthInputElement.value),
        width: Number(chassisWidthInputElement.value)
      }
    }, { preserveHead: true });
  }

  function showPracticeError(error) {
    syncSetupControls();
    practiceObstructionsStatus.textContent = error.message;
  }

  function handlePracticeObstructionsChange() {
    try {
      setPracticeObstructions({
        fruitClutter: fruitClutterToggle.checked,
        roamingRobot: roamingRobotToggle.checked
      });
    } catch (error) {
      showPracticeError(error);
    }
  }

  function handleRandomizeObstructions() {
    try {
      randomizePracticeObstructions();
    } catch (error) {
      showPracticeError(error);
    }
  }

  function syncProgramState(state) {
    programStopped = Boolean(state && state.stopped);
    syncSetupControls();
  }

  function pointerToSensorUnits(event) {
    const bounds = cameraElement.getBoundingClientRect();
    const contentWidth = Math.max(1, cameraElement.clientWidth);
    const contentHeight = Math.max(1, cameraElement.clientHeight);
    return {
      x: ((event.clientX - bounds.left - cameraElement.clientLeft) / contentWidth) * SENSOR_WIDTH,
      y: ((event.clientY - bounds.top - cameraElement.clientTop) / contentHeight) * SENSOR_HEIGHT
    };
  }

  function handlePointerDown(event) {
    if (settings.scene !== BALL_SCENE_ID || (event.button !== undefined && event.button !== 0)) return;
    const pointer = pointerToSensorUnits(event);
    dragPointerId = event.pointerId;
    dragOffsetX = pointer.x - ballProjection.rawCenterX;
    dragOffsetY = pointer.y - ballProjection.rawCenterY;
    targetElement.setPointerCapture(event.pointerId);
    targetElement.classList.add("is-dragging");
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (event.pointerId !== dragPointerId || settings.scene !== BALL_SCENE_ID) return;
    const pointer = pointerToSensorUnits(event);
    setTargetPosition(pointer.x - dragOffsetX, pointer.y - dragOffsetY);
  }

  function finishDrag(event) {
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = null;
    targetElement.classList.remove("is-dragging");
    updateCameraView();
  }

  function loadMarkerImages() {
    for (let id = 0; id <= 20; id += 1) {
      const image = new Image();
      image.decoding = "async";
      image.alt = "";
      image.addEventListener("load", () => {
        markerImageFailures.delete(id);
        syncSetupControls();
        updateCameraView();
      });
      image.addEventListener("error", () => {
        markerImageFailures.add(id);
        console.error(`Fiducial artwork ${id} could not be loaded.`);
        syncSetupControls();
      });
      image.src = `./assets/fiducials/circle21h7-${String(id).padStart(2, "0")}.png`;
      markerImages[id] = image;
    }
  }

  function getElements() {
    cameraElement = document.getElementById("camera-view");
    targetElement = document.getElementById("vision-target");
    diningCameraCanvas = document.getElementById("dining-camera-canvas");
    worldStageElement = document.getElementById("world-stage");
    worldMapElement = document.getElementById("world-map");
    diningWorldCanvas = document.getElementById("dining-world-canvas");
    worldMapBackgroundElement = worldMapElement && worldMapElement.querySelector(".world-map-background");
    worldMapGridElement = worldMapElement && worldMapElement.querySelector(".world-map-grid");
    worldMapFovElement = document.getElementById("world-map-fov");
    worldMapCameraAxisElement = document.getElementById("world-map-camera-axis");
    worldMapRobotElement = document.getElementById("world-map-robot");
    worldMapRobotLabelElement = document.getElementById("world-map-robot-label");
    worldMapTargetElement = document.getElementById("world-map-target");
    worldMapTargetLabelElement = document.getElementById("world-map-target-label");
    worldMapDistanceElement = document.getElementById("world-map-distance");
    worldMapBearingElement = document.getElementById("world-map-bearing");
    worldMapHeadingElement = document.getElementById("world-map-heading");
    worldMapMotionElement = document.getElementById("world-map-motion");
    sceneSelectElement = document.getElementById("scene-select");
    startPoseSelectElement = document.getElementById("start-pose-select");
    chassisLengthInputElement = document.getElementById("chassis-length-input");
    chassisWidthInputElement = document.getElementById("chassis-width-input");
    cameraMountSelectElement = document.getElementById("camera-mount-select");
    cameraHeightInputElement = document.getElementById("camera-height-input");
    lookForwardButton = document.getElementById("look-forward-button");
    lookDown45Button = document.getElementById("look-down-45-button");
    lookDownButton = document.getElementById("look-down-button");
    practiceObstructionsFieldset = document.getElementById("practice-obstructions-fieldset");
    fruitClutterToggle = document.getElementById("fruit-clutter-toggle");
    roamingRobotToggle = document.getElementById("roaming-robot-toggle");
    randomizeObstructionsButton = document.getElementById("randomize-obstructions-button");
    practiceObstructionsStatus = document.getElementById("practice-obstructions-status");
    setupStatusElement = document.getElementById("setup-status");
    cameraModeHintElement = document.getElementById("camera-mode-hint");
    cameraHeadingElement = document.getElementById("camera-heading");
    worldHeadingElement = document.getElementById("world-heading");

    const required = [
      cameraElement, targetElement, diningCameraCanvas, worldStageElement, worldMapElement,
      diningWorldCanvas, worldMapBackgroundElement, worldMapGridElement,
      worldMapFovElement, worldMapCameraAxisElement, worldMapRobotElement,
      worldMapRobotLabelElement, worldMapTargetElement, worldMapTargetLabelElement,
      worldMapDistanceElement, worldMapBearingElement, worldMapHeadingElement,
      worldMapMotionElement, sceneSelectElement, startPoseSelectElement,
      chassisLengthInputElement, chassisWidthInputElement, cameraMountSelectElement,
      cameraHeightInputElement, lookForwardButton, lookDown45Button, lookDownButton,
      practiceObstructionsFieldset, fruitClutterToggle, roamingRobotToggle,
      randomizeObstructionsButton, practiceObstructionsStatus,
      setupStatusElement, cameraModeHintElement, cameraHeadingElement,
      worldHeadingElement
    ];
    if (required.some((element) => !element)) {
      throw new Error("The AI Vision scene, camera, or World View controls are incomplete.");
    }
  }

  function bindEvents() {
    targetElement.addEventListener("pointerdown", handlePointerDown);
    targetElement.addEventListener("pointermove", handlePointerMove);
    targetElement.addEventListener("pointerup", finishDrag);
    targetElement.addEventListener("pointercancel", finishDrag);
    targetElement.addEventListener("lostpointercapture", finishDrag);
    sceneSelectElement.addEventListener("change", handleSceneChange);
    startPoseSelectElement.addEventListener("change", handleStartPoseChange);
    chassisLengthInputElement.addEventListener("change", handleChassisChange);
    chassisWidthInputElement.addEventListener("change", handleChassisChange);
    cameraMountSelectElement.addEventListener("change", handleMountChange);
    cameraHeightInputElement.addEventListener("change", handleHeightChange);
    lookForwardButton.addEventListener("click", () => setHeadPreset("forward"));
    lookDown45Button.addEventListener("click", () => setHeadPreset("down45"));
    lookDownButton.addEventListener("click", () => setHeadPreset("down"));
    fruitClutterToggle.addEventListener("change", handlePracticeObstructionsChange);
    roamingRobotToggle.addEventListener("change", handlePracticeObstructionsChange);
    randomizeObstructionsButton.addEventListener("click", handleRandomizeObstructions);
    if ("ResizeObserver" in window) {
      worldResizeObserver = new ResizeObserver(scheduleWorldSurfaceResize);
      worldResizeObserver.observe(worldStageElement);
    }
    window.addEventListener("resize", scheduleWorldSurfaceResize);
  }

  function init() {
    if (initialized) return;
    getElements();
    populateStartPoseOptions();
    bindEvents();
    resizeWorldSurface();
    initialized = true;
    applySettings(settings, { notify: false });
    loadMarkerImages();
    if (animationFrameId === null) {
      animationFrameId = window.requestAnimationFrame(animationFrame);
    }
  }

  settings = normalizeSettings({});
  diningState = diningModel.createState();
  window.visionSensor = currentSnapshot;
  window.VisionSimulator = {
    init,
    resetWorld,
    resetTarget,
    setTargetPosition,
    step,
    getWorldState,
    takeSnapshot,
    clearSnapshot,
    getSnapshot,
    hasCapturedSnapshot,
    setSnapshotObjectItem,
    setHeadPreset,
    setPracticeObstructions,
    randomizePracticeObstructions,
    syncProgramState,
    getSettings,
    normalizeSettings,
    applySettings,
    getLiveProjection: () => settings.scene === DINING_SCENE_ID ? diningProjection : ballProjection,
    dimensions: { width: SENSOR_WIDTH, height: SENSOR_HEIGHT },
    cameraHorizontalFov: ballModel.CAMERA_HORIZONTAL_FOV_DEGREES
  };
})();
