(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.VisionWorld = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SENSOR_WIDTH = 320;
  const SENSOR_HEIGHT = 240;
  const CAMERA_HORIZONTAL_FOV_DEGREES = 60;
  const CAMERA_HORIZONTAL_FOV_RADIANS = CAMERA_HORIZONTAL_FOV_DEGREES * Math.PI / 180;
  const DEFAULT_TARGET_DISTANCE = 300;
  const DEFAULT_TARGET_SIZE = 40;
  const PERSPECTIVE_DISTANCE = 300;
  const MIN_RENDERED_SIZE = 8;
  const MAX_RENDERED_SIZE = 120;
  const MIN_PROJECTION_DISTANCE = 8;
  const MAX_LINEAR_SPEED = 100;
  const DRIVE_TRACK_WIDTH = 70;
  const DRAG_MARGIN = 50;
  const MIN_DRAG_DISTANCE = 80;
  const MAX_DRAG_DISTANCE = 520;
  const WORLD_VIEW_WIDTH = 320;
  const WORLD_VIEW_HEIGHT = 160;
  const WORLD_VIEW_PADDING = 14;
  const WORLD_VIEW_MIN_HALF_WIDTH = 360;
  const WORLD_VIEW_MIN_HALF_HEIGHT = 180;
  const WORLD_VIEW_BOUNDARY_MARGIN = 40;

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function normalizeAngle(angle) {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized <= -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

  function createWorldState() {
    return {
      robot: { x: 0, y: 0, heading: 0 },
      target: { x: DEFAULT_TARGET_DISTANCE, y: 0, physicalSize: DEFAULT_TARGET_SIZE }
    };
  }

  function resetWorld(world) {
    world.robot.x = 0;
    world.robot.y = 0;
    world.robot.heading = 0;
    world.target.x = DEFAULT_TARGET_DISTANCE;
    world.target.y = 0;
    world.target.physicalSize = DEFAULT_TARGET_SIZE;
    return world;
  }

  function normalizedDriveOutput(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return clamp(numeric, -100, 100) / 100;
  }

  function integrateRobot(world, drivetrain, deltaSeconds) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    if (dt === 0 || !drivetrain) return world.robot;

    const leftSpeed = normalizedDriveOutput(drivetrain.leftOutput) * MAX_LINEAR_SPEED;
    const rightSpeed = normalizedDriveOutput(drivetrain.rightOutput) * MAX_LINEAR_SPEED;
    const linearSpeed = (leftSpeed + rightSpeed) / 2;
    const angularSpeed = (rightSpeed - leftSpeed) / DRIVE_TRACK_WIDTH;
    const midpointHeading = world.robot.heading + angularSpeed * dt / 2;

    world.robot.x += Math.cos(midpointHeading) * linearSpeed * dt;
    world.robot.y += Math.sin(midpointHeading) * linearSpeed * dt;
    world.robot.heading = normalizeAngle(world.robot.heading + angularSpeed * dt);
    return world.robot;
  }

  function projectTarget(world) {
    const differenceX = world.target.x - world.robot.x;
    const differenceY = world.target.y - world.robot.y;
    const distance = Math.max(Math.hypot(differenceX, differenceY), Number.EPSILON);
    const cosine = Math.cos(world.robot.heading);
    const sine = Math.sin(world.robot.heading);
    const forwardDistance = differenceX * cosine + differenceY * sine;
    const leftDistance = -differenceX * sine + differenceY * cosine;
    const bearing = Math.atan2(leftDistance, forwardDistance);
    const rawCenterX = SENSOR_WIDTH / 2 - (bearing / (CAMERA_HORIZONTAL_FOV_RADIANS / 2)) * (SENSOR_WIDTH / 2);
    const rawCenterY = SENSOR_HEIGHT / 2;
    const apparentSize = clamp(
      world.target.physicalSize * PERSPECTIVE_DISTANCE / Math.max(distance, MIN_PROJECTION_DISTANCE),
      MIN_RENDERED_SIZE,
      MAX_RENDERED_SIZE
    );
    const targetLeft = rawCenterX - apparentSize / 2;
    const targetRight = rawCenterX + apparentSize / 2;
    const targetTop = rawCenterY - apparentSize / 2;
    const targetBottom = rawCenterY + apparentSize / 2;
    const exists =
      forwardDistance > 0 &&
      targetRight > 0 &&
      targetLeft < SENSOR_WIDTH &&
      targetBottom > 0 &&
      targetTop < SENSOR_HEIGHT;

    return {
      rawCenterX,
      rawCenterY,
      apparentSize,
      distance,
      bearing,
      forwardDistance,
      sensor: {
        exists,
        centerX: Math.round(clamp(rawCenterX, 0, SENSOR_WIDTH)),
        centerY: Math.round(rawCenterY),
        width: exists ? Math.round(apparentSize) : 0,
        height: exists ? Math.round(apparentSize) : 0,
        id: 1,
        confidence: exists ? 100 : 0
      }
    };
  }

  function setTargetFromCamera(world, centerX, centerY) {
    const cameraX = clamp(Number(centerX) || 0, -DRAG_MARGIN, SENSOR_WIDTH + DRAG_MARGIN);
    const cameraY = clamp(Number(centerY) || 0, 0, SENSOR_HEIGHT);
    const bearing = ((SENSOR_WIDTH / 2 - cameraX) / (SENSOR_WIDTH / 2)) * (CAMERA_HORIZONTAL_FOV_RADIANS / 2);
    const distance = MIN_DRAG_DISTANCE + (1 - cameraY / SENSOR_HEIGHT) * (MAX_DRAG_DISTANCE - MIN_DRAG_DISTANCE);
    const worldBearing = world.robot.heading + bearing;

    world.target.x = world.robot.x + Math.cos(worldBearing) * distance;
    world.target.y = world.robot.y + Math.sin(worldBearing) * distance;
    return world.target;
  }

  function layoutWorldView(world, width = WORLD_VIEW_WIDTH, height = WORLD_VIEW_HEIGHT) {
    const mapWidth = Math.max(Number(width) || WORLD_VIEW_WIDTH, WORLD_VIEW_PADDING * 2 + 1);
    const mapHeight = Math.max(Number(height) || WORLD_VIEW_HEIGHT, WORLD_VIEW_PADDING * 2 + 1);
    const halfWidth = Math.max(
      WORLD_VIEW_MIN_HALF_WIDTH,
      Math.abs(world.robot.x) + WORLD_VIEW_BOUNDARY_MARGIN,
      Math.abs(world.target.x) + WORLD_VIEW_BOUNDARY_MARGIN
    );
    const halfHeight = Math.max(
      WORLD_VIEW_MIN_HALF_HEIGHT,
      Math.abs(world.robot.y) + WORLD_VIEW_BOUNDARY_MARGIN,
      Math.abs(world.target.y) + WORLD_VIEW_BOUNDARY_MARGIN
    );
    const scale = Math.min(
      (mapWidth - WORLD_VIEW_PADDING * 2) / (halfWidth * 2),
      (mapHeight - WORLD_VIEW_PADDING * 2) / (halfHeight * 2)
    );
    const projection = projectTarget(world);

    function toScreen(point) {
      return {
        x: mapWidth / 2 + point.x * scale,
        y: mapHeight / 2 - point.y * scale
      };
    }

    const robot = toScreen(world.robot);
    const target = toScreen(world.target);
    const headingDegrees = world.robot.heading * 180 / Math.PI;
    const rayLength = Math.hypot(mapWidth, mapHeight) * 1.5;

    function rayPoint(angle, length = rayLength) {
      return {
        x: robot.x + Math.cos(angle) * length,
        y: robot.y - Math.sin(angle) * length
      };
    }

    return {
      width: mapWidth,
      height: mapHeight,
      scale,
      bounds: {
        minimumX: -halfWidth,
        maximumX: halfWidth,
        minimumY: -halfHeight,
        maximumY: halfHeight
      },
      robot: {
        x: robot.x,
        y: robot.y,
        rotationDegrees: -headingDegrees,
        headingDegrees: (headingDegrees + 360) % 360
      },
      target,
      fov: {
        left: rayPoint(world.robot.heading + CAMERA_HORIZONTAL_FOV_RADIANS / 2),
        right: rayPoint(world.robot.heading - CAMERA_HORIZONTAL_FOV_RADIANS / 2),
        direction: rayPoint(world.robot.heading, 46)
      },
      distance: projection.distance,
      bearingDegrees: projection.bearing * 180 / Math.PI,
      targetInFov: projection.sensor.exists
    };
  }

  return Object.freeze({
    SENSOR_WIDTH,
    SENSOR_HEIGHT,
    CAMERA_HORIZONTAL_FOV_DEGREES,
    createWorldState,
    resetWorld,
    integrateRobot,
    projectTarget,
    setTargetFromCamera,
    layoutWorldView,
    normalizeAngle,
    config: Object.freeze({
      defaultTargetDistance: DEFAULT_TARGET_DISTANCE,
      defaultTargetSize: DEFAULT_TARGET_SIZE,
      minRenderedSize: MIN_RENDERED_SIZE,
      maxRenderedSize: MAX_RENDERED_SIZE,
      maxLinearSpeed: MAX_LINEAR_SPEED,
      driveTrackWidth: DRIVE_TRACK_WIDTH,
      worldViewWidth: WORLD_VIEW_WIDTH,
      worldViewHeight: WORLD_VIEW_HEIGHT,
      worldViewHorizontalFov: CAMERA_HORIZONTAL_FOV_DEGREES
    })
  });
});

(function () {
  "use strict";

  if (typeof window === "undefined") return;

  const model = window.VisionWorld;
  if (!model) {
    throw new Error("The AI Vision world model is unavailable.");
  }

  const visionSensor = {
    exists: true,
    centerX: model.SENSOR_WIDTH / 2,
    centerY: model.SENSOR_HEIGHT / 2,
    width: model.config.defaultTargetSize,
    height: model.config.defaultTargetSize,
    id: 1,
    confidence: 100
  };

  const world = model.createWorldState();
  let projection = model.projectTarget(world);
  let cameraElement = null;
  let targetElement = null;
  let worldMapElement = null;
  let worldMapFovElement = null;
  let worldMapCameraAxisElement = null;
  let worldMapRobotElement = null;
  let worldMapRobotLabelElement = null;
  let worldMapTargetElement = null;
  let worldMapTargetLabelElement = null;
  let worldMapDistanceElement = null;
  let worldMapBearingElement = null;
  let worldMapHeadingElement = null;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let animationFrameId = null;
  let previousFrameTime = null;

  function sensorDataChanged(nextSensor) {
    return Object.keys(visionSensor).some((key) => visionSensor[key] !== nextSensor[key]);
  }

  function publishSensorData(nextSensor) {
    const changed = sensorDataChanged(nextSensor);
    Object.assign(visionSensor, nextSensor);

    if (changed) {
      window.dispatchEvent(
        new CustomEvent("visiondatachange", {
          detail: { ...visionSensor }
        })
      );
    }
  }

  function renderTarget() {
    if (!targetElement) return;

    targetElement.hidden = !projection.sensor.exists;
    targetElement.style.left = `${(projection.rawCenterX / model.SENSOR_WIDTH) * 100}%`;
    targetElement.style.top = `${(projection.rawCenterY / model.SENSOR_HEIGHT) * 100}%`;
    targetElement.style.width = `${(projection.apparentSize / model.SENSOR_WIDTH) * 100}%`;
    targetElement.style.height = `${(projection.apparentSize / model.SENSOR_HEIGHT) * 100}%`;
    targetElement.setAttribute(
      "aria-label",
      `Draggable target, object ID 1, center X ${visionSensor.centerX}, center Y ${visionSensor.centerY}, distance ${Math.round(projection.distance)}`
    );
  }

  function formatSignedDegrees(value) {
    const rounded = Math.round(value);
    if (rounded > 0) return `+${rounded}\u00b0`;
    return `${rounded}\u00b0`;
  }

  function renderWorldView() {
    if (!worldMapElement) return;

    const layout = model.layoutWorldView(world);
    const robot = layout.robot;
    const target = layout.target;
    const targetLabelOnRight = target.x < layout.width - 66;
    const robotLabelOnRight = robot.x < layout.width - 62;

    worldMapFovElement.setAttribute(
      "d",
      `M ${robot.x} ${robot.y} L ${layout.fov.left.x} ${layout.fov.left.y} L ${layout.fov.right.x} ${layout.fov.right.y} Z`
    );
    worldMapFovElement.classList.toggle("contains-target", layout.targetInFov);
    worldMapCameraAxisElement.setAttribute("x1", robot.x);
    worldMapCameraAxisElement.setAttribute("y1", robot.y);
    worldMapCameraAxisElement.setAttribute("x2", layout.fov.direction.x);
    worldMapCameraAxisElement.setAttribute("y2", layout.fov.direction.y);
    worldMapRobotElement.setAttribute(
      "transform",
      `translate(${robot.x} ${robot.y}) rotate(${robot.rotationDegrees})`
    );
    worldMapTargetElement.setAttribute("transform", `translate(${target.x} ${target.y})`);
    worldMapTargetElement.classList.toggle("is-detected", layout.targetInFov);

    worldMapRobotLabelElement.setAttribute("x", robot.x + (robotLabelOnRight ? 13 : -13));
    worldMapRobotLabelElement.setAttribute("y", Math.min(Math.max(robot.y + 18, 14), layout.height - 7));
    worldMapRobotLabelElement.setAttribute("text-anchor", robotLabelOnRight ? "start" : "end");
    worldMapTargetLabelElement.setAttribute("x", target.x + (targetLabelOnRight ? 13 : -13));
    worldMapTargetLabelElement.setAttribute("y", Math.min(Math.max(target.y - 10, 14), layout.height - 7));
    worldMapTargetLabelElement.setAttribute("text-anchor", targetLabelOnRight ? "start" : "end");

    worldMapDistanceElement.textContent = String(Math.round(layout.distance));
    worldMapBearingElement.textContent = formatSignedDegrees(layout.bearingDegrees);
    worldMapHeadingElement.textContent = `${Math.round(layout.robot.headingDegrees)}\u00b0`;
    worldMapElement.setAttribute(
      "aria-label",
      `World view. Robot heading ${Math.round(layout.robot.headingDegrees)} degrees. Target distance ${Math.round(layout.distance)}, bearing ${formatSignedDegrees(layout.bearingDegrees)}. Target ${layout.targetInFov ? "inside" : "outside"} camera field of view.`
    );
  }

  function updateCameraView() {
    projection = model.projectTarget(world);
    publishSensorData(projection.sensor);
    renderTarget();
    renderWorldView();
    return projection;
  }

  function step(deltaSeconds) {
    if (!window.cvsProgramControl || !window.cvsProgramControl.isPaused()) {
      model.integrateRobot(world, window.drivetrain, deltaSeconds);
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

  function pointerToSensorUnits(event) {
    const bounds = cameraElement.getBoundingClientRect();

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * model.SENSOR_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * model.SENSOR_HEIGHT
    };
  }

  function setTargetPosition(centerX, centerY) {
    model.setTargetFromCamera(world, centerX, centerY);
    return updateCameraView();
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;

    const pointer = pointerToSensorUnits(event);
    dragPointerId = event.pointerId;
    dragOffsetX = pointer.x - projection.rawCenterX;
    dragOffsetY = pointer.y - projection.rawCenterY;
    targetElement.setPointerCapture(event.pointerId);
    targetElement.classList.add("is-dragging");
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (event.pointerId !== dragPointerId) return;

    const pointer = pointerToSensorUnits(event);
    setTargetPosition(pointer.x - dragOffsetX, pointer.y - dragOffsetY);
  }

  function finishDrag(event) {
    if (event.pointerId !== dragPointerId) return;

    dragPointerId = null;
    targetElement.classList.remove("is-dragging");
    updateCameraView();
  }

  function resetWorld() {
    model.resetWorld(world);
    previousFrameTime = null;
    return updateCameraView();
  }

  function resetTarget() {
    return resetWorld();
  }

  function getWorldState() {
    return {
      robot: { ...world.robot },
      target: { ...world.target }
    };
  }

  function init() {
    cameraElement = document.getElementById("camera-view");
    targetElement = document.getElementById("vision-target");
    worldMapElement = document.getElementById("world-map");
    worldMapFovElement = document.getElementById("world-map-fov");
    worldMapCameraAxisElement = document.getElementById("world-map-camera-axis");
    worldMapRobotElement = document.getElementById("world-map-robot");
    worldMapRobotLabelElement = document.getElementById("world-map-robot-label");
    worldMapTargetElement = document.getElementById("world-map-target");
    worldMapTargetLabelElement = document.getElementById("world-map-target-label");
    worldMapDistanceElement = document.getElementById("world-map-distance");
    worldMapBearingElement = document.getElementById("world-map-bearing");
    worldMapHeadingElement = document.getElementById("world-map-heading");

    if (
      !cameraElement || !targetElement || !worldMapElement || !worldMapFovElement ||
      !worldMapCameraAxisElement || !worldMapRobotElement || !worldMapRobotLabelElement ||
      !worldMapTargetElement || !worldMapTargetLabelElement || !worldMapDistanceElement ||
      !worldMapBearingElement || !worldMapHeadingElement
    ) {
      throw new Error("The simulated camera or World View elements are missing.");
    }

    targetElement.addEventListener("pointerdown", handlePointerDown);
    targetElement.addEventListener("pointermove", handlePointerMove);
    targetElement.addEventListener("pointerup", finishDrag);
    targetElement.addEventListener("pointercancel", finishDrag);
    targetElement.addEventListener("lostpointercapture", finishDrag);
    resetWorld();

    if (animationFrameId === null) {
      animationFrameId = window.requestAnimationFrame(animationFrame);
    }
  }

  window.visionSensor = visionSensor;
  window.VisionSimulator = {
    init,
    resetWorld,
    resetTarget,
    setTargetPosition,
    step,
    getWorldState,
    dimensions: {
      width: model.SENSOR_WIDTH,
      height: model.SENSOR_HEIGHT
    },
    cameraHorizontalFov: model.CAMERA_HORIZONTAL_FOV_DEGREES
  };
})();
