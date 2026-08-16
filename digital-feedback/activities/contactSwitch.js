(function () {
  "use strict";

  const { FIELD_WIDTH, FIELD_HEIGHT } = window.DigitalFeedbackTrack;

  const START_POSE = Object.freeze({ x: 132, y: 350, heading: 0 });
  const DEFAULT_STOP = Object.freeze({ x: 510, y: 220, width: 48, height: 260 });
  const SWITCH_FORWARD_OFFSET = 42;
  const SWITCH_HALF_WIDTH = 17;
  const CONTACT_MARGIN = 5;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function copyStop() {
    return { ...DEFAULT_STOP };
  }

  class ContactSwitchActivity {
    constructor({ canvas, robot, onObjectMove }) {
      this.id = "contact-switch";
      this.title = "Contact Switch";
      this.canvas = canvas;
      this.robot = robot;
      this.onObjectMove = onObjectMove;
      this.stopObject = copyStop();
      this.state = { contact: false };
      this.active = false;
      this.dragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this.initialized = false;

      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
    }

    init() {
      if (this.initialized) return;
      this.initialized = true;
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerUp);
      this.updateContact();
    }

    setActive(active) {
      this.active = Boolean(active);
      this.dragging = false;
      this.canvas.classList.toggle("is-contact-mode", this.active);
    }

    reset() {
      this.stopObject = copyStop();
      this.robot.reset(START_POSE);
      this.updateContact();
    }

    update(deltaSeconds, movementEnabled) {
      if (movementEnabled) this.robot.update(deltaSeconds);
      this.updateContact();
    }

    getDigitalInputs() {
      this.updateContact();
      return { contact: this.state.contact };
    }

    readInput(inputName) {
      this.updateContact();
      return inputName === "contact" && this.state.contact;
    }

    localToWorld(forward, lateral) {
      const { x, y, heading } = this.robot.state;
      return {
        x: x + Math.cos(heading) * forward - Math.sin(heading) * lateral,
        y: y + Math.sin(heading) * forward + Math.cos(heading) * lateral,
      };
    }

    getSwitchPoints() {
      return [-SWITCH_HALF_WIDTH, 0, SWITCH_HALF_WIDTH].map((lateral) =>
        this.localToWorld(SWITCH_FORWARD_OFFSET, lateral),
      );
    }

    updateContact() {
      const stop = this.stopObject;
      this.state.contact = this.getSwitchPoints().some(
        (point) =>
          point.x >= stop.x - CONTACT_MARGIN &&
          point.x <= stop.x + stop.width + CONTACT_MARGIN &&
          point.y >= stop.y - CONTACT_MARGIN &&
          point.y <= stop.y + stop.height + CONTACT_MARGIN,
      );
      return this.state.contact;
    }

    toFieldPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * FIELD_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * FIELD_HEIGHT,
      };
    }

    stopContains(point, hitSlop = 0) {
      const stop = this.stopObject;
      return (
        point.x >= stop.x - hitSlop &&
        point.x <= stop.x + stop.width + hitSlop &&
        point.y >= stop.y - hitSlop &&
        point.y <= stop.y + stop.height + hitSlop
      );
    }

    handlePointerDown(event) {
      if (!this.active) return;
      const point = this.toFieldPoint(event);
      if (!this.stopContains(point, 18)) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.dragOffset.x = point.x - this.stopObject.x;
      this.dragOffset.y = point.y - this.stopObject.y;
      this.canvas.classList.add("is-dragging-object");
    }

    handlePointerMove(event) {
      if (!this.active || !this.dragging) return;
      event.preventDefault();
      const point = this.toFieldPoint(event);
      this.stopObject.x = clamp(point.x - this.dragOffset.x, 18, FIELD_WIDTH - this.stopObject.width - 18);
      this.stopObject.y = clamp(point.y - this.dragOffset.y, 18, FIELD_HEIGHT - this.stopObject.height - 18);
      this.updateContact();
      if (typeof this.onObjectMove === "function") this.onObjectMove();
    }

    handlePointerUp(event) {
      if (!this.dragging) return;
      event.preventDefault();
      this.dragging = false;
      this.canvas.classList.remove("is-dragging-object");
      this.updateContact();
    }

    render(context) {
      const stop = this.stopObject;

      context.save();
      context.strokeStyle = "rgba(242, 247, 244, 0.18)";
      context.lineWidth = 2;
      context.setLineDash([12, 10]);
      context.beginPath();
      context.moveTo(70, START_POSE.y);
      context.lineTo(FIELD_WIDTH - 60, START_POSE.y);
      context.stroke();
      context.setLineDash([]);

      context.fillStyle = "rgba(255, 200, 87, 0.09)";
      context.fillRect(stop.x - 34, stop.y, 34, stop.height);

      context.fillStyle = "#161d1a";
      context.strokeStyle = this.state.contact ? "#45e07f" : "#ffc857";
      context.lineWidth = 4;
      context.fillRect(stop.x, stop.y, stop.width, stop.height);
      context.strokeRect(stop.x, stop.y, stop.width, stop.height);

      context.save();
      context.beginPath();
      context.rect(stop.x, stop.y, stop.width, stop.height);
      context.clip();
      context.strokeStyle = "rgba(255, 200, 87, 0.72)";
      context.lineWidth = 8;
      for (let offset = -stop.height; offset < stop.height + stop.width; offset += 24) {
        context.beginPath();
        context.moveTo(stop.x, stop.y + offset);
        context.lineTo(stop.x + stop.width, stop.y + offset + stop.width);
        context.stroke();
      }
      context.restore();

      context.fillStyle = "#eaf4f0";
      context.font = "700 13px Space Mono, monospace";
      context.textAlign = "center";
      context.fillText("DRAG STOP", stop.x + stop.width / 2, stop.y - 14);

      context.fillStyle = "rgba(7, 16, 14, 0.72)";
      context.fillRect(44, 40, 310, 50);
      context.fillStyle = "#dce9e4";
      context.textAlign = "left";
      context.font = "700 15px Space Grotesk, sans-serif";
      context.fillText("CONTACT-SWITCH TEST LANE", 60, 62);
      context.fillStyle = "#c0d0ca";
      context.font = "700 10px Space Mono, monospace";
      context.fillText("PHYSICAL CONTACT → DIGITAL ON", 60, 80);
      context.restore();

      this.robot.draw(context, null);
      this.drawSwitch(context);
    }

    drawSwitch(context) {
      const center = this.localToWorld(SWITCH_FORWARD_OFFSET, 0);
      const left = this.localToWorld(SWITCH_FORWARD_OFFSET, -SWITCH_HALF_WIDTH);
      const right = this.localToWorld(SWITCH_FORWARD_OFFSET, SWITCH_HALF_WIDTH);

      context.save();
      context.strokeStyle = "#09110e";
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.stroke();

      context.strokeStyle = this.state.contact ? "#45e07f" : "#ff8d69";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.stroke();

      context.beginPath();
      context.arc(center.x, center.y, this.state.contact ? 10 : 7, 0, Math.PI * 2);
      context.fillStyle = this.state.contact ? "#45e07f" : "#ff8d69";
      context.fill();
      context.strokeStyle = "#08110e";
      context.lineWidth = 2;
      context.stroke();
      context.restore();
    }
  }

  window.DigitalFeedbackActivities = window.DigitalFeedbackActivities || {};
  window.DigitalFeedbackActivities.ContactSwitchActivity = ContactSwitchActivity;
})();
