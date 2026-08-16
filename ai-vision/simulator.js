(function () {
  "use strict";

  const SENSOR_WIDTH = 320;
  const SENSOR_HEIGHT = 240;
  const TARGET_WIDTH = 40;
  const TARGET_HEIGHT = 40;
  const DRAG_MARGIN = 50;

  const visionSensor = {
    exists: true,
    centerX: 160,
    centerY: 120,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    id: 1,
    confidence: 100
  };

  let cameraElement = null;
  let targetElement = null;
  let rawCenterX = 160;
  let rawCenterY = 120;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function targetIntersectsCamera() {
    const left = rawCenterX - TARGET_WIDTH / 2;
    const right = rawCenterX + TARGET_WIDTH / 2;
    const top = rawCenterY - TARGET_HEIGHT / 2;
    const bottom = rawCenterY + TARGET_HEIGHT / 2;

    return right > 0 && left < SENSOR_WIDTH && bottom > 0 && top < SENSOR_HEIGHT;
  }

  function publishSensorData() {
    visionSensor.exists = targetIntersectsCamera();
    visionSensor.centerX = Math.round(clamp(rawCenterX, 0, SENSOR_WIDTH));
    visionSensor.centerY = Math.round(clamp(rawCenterY, 0, SENSOR_HEIGHT));
    visionSensor.width = TARGET_WIDTH;
    visionSensor.height = TARGET_HEIGHT;
    visionSensor.id = 1;
    visionSensor.confidence = 100;

    window.dispatchEvent(
      new CustomEvent("visiondatachange", {
        detail: { ...visionSensor }
      })
    );
  }

  function renderTarget() {
    if (!targetElement) {
      return;
    }

    targetElement.style.left = `${(rawCenterX / SENSOR_WIDTH) * 100}%`;
    targetElement.style.top = `${(rawCenterY / SENSOR_HEIGHT) * 100}%`;
    targetElement.setAttribute(
      "aria-label",
      `Draggable target, object ID 1, center X ${visionSensor.centerX}, center Y ${visionSensor.centerY}`
    );
  }

  function setTargetPosition(centerX, centerY) {
    rawCenterX = clamp(centerX, -DRAG_MARGIN, SENSOR_WIDTH + DRAG_MARGIN);
    rawCenterY = clamp(centerY, -DRAG_MARGIN, SENSOR_HEIGHT + DRAG_MARGIN);
    publishSensorData();
    renderTarget();
  }

  function pointerToSensorUnits(event) {
    const bounds = cameraElement.getBoundingClientRect();

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * SENSOR_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * SENSOR_HEIGHT
    };
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const pointer = pointerToSensorUnits(event);
    dragPointerId = event.pointerId;
    dragOffsetX = pointer.x - rawCenterX;
    dragOffsetY = pointer.y - rawCenterY;
    targetElement.setPointerCapture(event.pointerId);
    targetElement.classList.add("is-dragging");
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (event.pointerId !== dragPointerId) {
      return;
    }

    const pointer = pointerToSensorUnits(event);
    setTargetPosition(pointer.x - dragOffsetX, pointer.y - dragOffsetY);
  }

  function finishDrag(event) {
    if (event.pointerId !== dragPointerId) {
      return;
    }

    dragPointerId = null;
    targetElement.classList.remove("is-dragging");
  }

  function resetTarget() {
    setTargetPosition(SENSOR_WIDTH / 2, SENSOR_HEIGHT / 2);
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
    resetTarget();
  }

  window.visionSensor = visionSensor;
  window.VisionSimulator = {
    init,
    resetTarget,
    setTargetPosition,
    dimensions: {
      width: SENSOR_WIDTH,
      height: SENSOR_HEIGHT
    }
  };
})();
