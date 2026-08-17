(function () {
  "use strict";

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

  function updateCameraView() {
    projection = model.projectTarget(world);
    publishSensorData(projection.sensor);
    renderTarget();
    return projection;
  }

  function step(deltaSeconds) {
    model.integrateRobot(world, window.drivetrain, deltaSeconds);
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

    if (!cameraElement || !targetElement) {
      throw new Error("The simulated camera elements are missing.");
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
