(function () {
  "use strict";

  const FIELD_WIDTH = 800;
  const FIELD_HEIGHT = 700;
  const BASE = Object.freeze({ x: 210, y: 580 });
  const TOTAL_REACH = 260;
  const LINK_LENGTHS = Object.freeze({
    1: [260],
    2: [165, 95],
    3: [130, 75, 55],
  });
  const START_ANGLES = Object.freeze({ Joint1: 35, Joint2: 0, Joint3: 0 });
  const JOINT_RATE_DEGREES = 70;
  const GRIPPER_RATE_PERCENT = 72;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  class ArmModel {
    constructor(jointCount = 1, analogSystem) {
      this.jointCount = 1;
      this.angles = { Joint1: 35, Joint2: 0, Joint3: 0 };
      this.gripperPosition = 100;
      this.configure(jointCount, analogSystem);
    }

    configure(jointCount, analogSystem) {
      this.jointCount = Math.min(3, Math.max(1, Math.round(Number(jointCount) || 1)));
      this.reset(analogSystem);
    }

    getActuatorNames() {
      const names = Array.from({ length: this.jointCount }, (_, index) => `Joint${index + 1}`);
      names.push("Gripper");
      return names;
    }

    getPosition(name) {
      return name === "Gripper" ? this.gripperPosition : this.angles[name] ?? 0;
    }

    reset(analogSystem) {
      for (let index = 1; index <= 3; index += 1) {
        const name = `Joint${index}`;
        const limits = analogSystem?.getMechanicalLimits(name) || { min: -180, max: 180 };
        this.angles[name] = clamp(START_ANGLES[name], limits.min, limits.max);
      }
      const gripperLimits = analogSystem?.getMechanicalLimits("Gripper") || { min: 0, max: 100 };
      this.gripperPosition = clamp(100, gripperLimits.min, gripperLimits.max);
    }

    constrainToLimits(analogSystem) {
      this.getActuatorNames().forEach((name) => {
        const limits = analogSystem.getMechanicalLimits(name);
        if (name === "Gripper") {
          this.gripperPosition = clamp(this.gripperPosition, limits.min, limits.max);
        } else {
          this.angles[name] = clamp(this.angles[name], limits.min, limits.max);
        }
      });
    }

    update(deltaSeconds, motorBank, analogSystem) {
      this.getActuatorNames().forEach((name) => {
        const motor = motorBank.getState(name);
        if (!motor || motor.direction === "stopped") return;
        // The gripper resets fully open, so its forward motor direction must
        // close the jaws (decrease opening) instead of pushing into the open limit.
        const sign = name === "Gripper"
          ? (motor.direction === "forward" ? -1 : 1)
          : (motor.direction === "forward" ? 1 : -1);
        const rate = name === "Gripper" ? GRIPPER_RATE_PERCENT : JOINT_RATE_DEGREES;
        const change = sign * (motor.velocity / 100) * rate * deltaSeconds;
        const limits = analogSystem.getMechanicalLimits(name);
        if (name === "Gripper") {
          this.gripperPosition = clamp(this.gripperPosition + change, limits.min, limits.max);
        } else {
          this.angles[name] = clamp(this.angles[name] + change, limits.min, limits.max);
        }
      });
      this.constrainToLimits(analogSystem);
    }

    getJointPoints() {
      const lengths = LINK_LENGTHS[this.jointCount];
      const points = [{ ...BASE }];
      let x = BASE.x;
      let y = BASE.y;
      let totalAngle = 0;
      for (let index = 0; index < this.jointCount; index += 1) {
        totalAngle += this.angles[`Joint${index + 1}`];
        const radians = toRadians(totalAngle);
        x += Math.cos(radians) * lengths[index];
        y -= Math.sin(radians) * lengths[index];
        points.push({ x, y, angle: totalAngle });
      }
      return points;
    }

    getGripperPose() {
      const points = this.getJointPoints();
      const end = points[points.length - 1];
      return { x: end.x, y: end.y, angle: end.angle || this.angles.Joint1 };
    }

    getChallengePoint(primaryAngle, forwardOffset = 25) {
      const radians = toRadians(primaryAngle);
      return {
        x: BASE.x + Math.cos(radians) * (TOTAL_REACH + forwardOffset),
        y: BASE.y - Math.sin(radians) * (TOTAL_REACH + forwardOffset),
      };
    }

    draw(context) {
      const points = this.getJointPoints();
      context.save();

      context.fillStyle = "rgba(7,16,14,0.34)";
      context.fillRect(0, BASE.y + 38, FIELD_WIDTH, FIELD_HEIGHT - BASE.y - 38);
      context.strokeStyle = "rgba(229,243,236,0.16)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, BASE.y + 38);
      context.lineTo(FIELD_WIDTH, BASE.y + 38);
      context.stroke();

      context.fillStyle = "#182721";
      context.strokeStyle = "#07100e";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(BASE.x - 58, BASE.y + 38);
      context.lineTo(BASE.x - 40, BASE.y - 5);
      context.lineTo(BASE.x + 40, BASE.y - 5);
      context.lineTo(BASE.x + 58, BASE.y + 38);
      context.closePath();
      context.fill();
      context.stroke();

      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        context.strokeStyle = "#0a1210";
        context.lineWidth = 28;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.strokeStyle = index % 2 === 0 ? "#2fbb70" : "#2b9d86";
        context.lineWidth = 18;
        context.stroke();
      }

      points.slice(0, -1).forEach((point, index) => {
        context.beginPath();
        context.arc(point.x, point.y, 16, 0, Math.PI * 2);
        context.fillStyle = "#d9e5e0";
        context.fill();
        context.strokeStyle = "#07100e";
        context.lineWidth = 5;
        context.stroke();
        context.fillStyle = "#07100e";
        context.font = "700 9px Space Mono, monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(`J${index + 1}`, point.x, point.y);
      });
      context.restore();
      this.drawGripper(context);
    }

    drawGripper(context) {
      const pose = this.getGripperPose();
      const normalizedOpen = clamp(this.gripperPosition, 0, 100) / 100;
      const spread = 5 + normalizedOpen * 19;
      context.save();
      context.translate(pose.x, pose.y);
      context.rotate(-toRadians(pose.angle));
      context.fillStyle = "#cbd8d3";
      context.strokeStyle = "#07100e";
      context.lineWidth = 3;
      context.fillRect(-5, -13, 23, 26);
      context.strokeRect(-5, -13, 23, 26);
      context.lineCap = "round";
      [-1, 1].forEach((side) => {
        context.strokeStyle = "#07100e";
        context.lineWidth = 8;
        context.beginPath();
        context.moveTo(14, side * 8);
        context.lineTo(38, side * spread);
        context.lineTo(49, side * Math.max(3, spread - 5));
        context.stroke();
        context.strokeStyle = "#d9e5e0";
        context.lineWidth = 4;
        context.stroke();
      });
      context.restore();
    }
  }

  window.AnalogFeedbackArm = { ArmModel, FIELD_WIDTH, FIELD_HEIGHT, BASE, TOTAL_REACH };
})();
