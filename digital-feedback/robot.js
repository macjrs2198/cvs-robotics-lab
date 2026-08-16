(function () {
  "use strict";

  const MAX_LINEAR_SPEED = 92;
  const WHEEL_BASE = 48;

  function clampPercent(value) {
    return Math.min(100, Math.max(0, Number(value) || 0));
  }

  function normalizeAngle(angle) {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized <= -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

  class DriveController {
    constructor() {
      this.state = {
        driveSpeed: 50,
        turnSpeed: 30,
        leftOutput: 0,
        rightOutput: 0,
        action: "stopped",
      };
    }

    setDriveSpeed(value) {
      this.state.driveSpeed = clampPercent(value);
      if (this.state.action === "forward") this.forward();
      if (this.state.action === "reverse") this.reverse();
    }

    setTurnSpeed(value) {
      this.state.turnSpeed = clampPercent(value);
      if (this.state.action === "turnLeft") this.turnLeft();
      if (this.state.action === "turnRight") this.turnRight();
    }

    forward() {
      this.state.leftOutput = this.state.driveSpeed;
      this.state.rightOutput = this.state.driveSpeed;
      this.state.action = "forward";
    }

    reverse() {
      this.state.leftOutput = -this.state.driveSpeed;
      this.state.rightOutput = -this.state.driveSpeed;
      this.state.action = "reverse";
    }

    turnLeft() {
      this.state.leftOutput = this.state.turnSpeed * 0.35;
      this.state.rightOutput = this.state.turnSpeed;
      this.state.action = "turnLeft";
    }

    turnRight() {
      this.state.leftOutput = this.state.turnSpeed;
      this.state.rightOutput = this.state.turnSpeed * 0.35;
      this.state.action = "turnRight";
    }

    stop() {
      this.state.leftOutput = 0;
      this.state.rightOutput = 0;
      this.state.action = "stopped";
    }

    reset() {
      this.state.driveSpeed = 50;
      this.state.turnSpeed = 30;
      this.stop();
    }
  }

  class RobotModel {
    constructor(startPose) {
      this.drive = new DriveController();
      this.state = { x: 0, y: 0, heading: 0 };
      this.reset(startPose);
    }

    reset(startPose) {
      this.drive.stop();
      this.state.x = startPose.x;
      this.state.y = startPose.y;
      this.state.heading = startPose.heading;
    }

    update(deltaSeconds) {
      const leftVelocity = (this.drive.state.leftOutput / 100) * MAX_LINEAR_SPEED;
      const rightVelocity = (this.drive.state.rightOutput / 100) * MAX_LINEAR_SPEED;
      const linearVelocity = (leftVelocity + rightVelocity) / 2;
      const angularVelocity = (leftVelocity - rightVelocity) / WHEEL_BASE;

      this.state.heading = normalizeAngle(this.state.heading + angularVelocity * deltaSeconds);
      this.state.x += Math.cos(this.state.heading) * linearVelocity * deltaSeconds;
      this.state.y += Math.sin(this.state.heading) * linearVelocity * deltaSeconds;
    }

    draw(context, visualization) {
      const { x, y, heading } = this.state;
      context.save();
      context.translate(x, y);
      context.rotate(heading);

      context.fillStyle = "#080d0b";
      context.fillRect(-22, -28, 40, 8);
      context.fillRect(-22, 20, 40, 8);

      context.fillStyle = "#263832";
      context.strokeStyle = "#09110e";
      context.lineWidth = 3;
      context.beginPath();
      context.rect(-25, -22, 52, 44);
      context.fill();
      context.stroke();

      context.fillStyle = "#45e07f";
      context.beginPath();
      context.moveTo(27, -11);
      context.lineTo(38, 0);
      context.lineTo(27, 11);
      context.closePath();
      context.fill();

      context.fillStyle = "#dff5e7";
      context.font = "700 8px Space Mono, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("CVS", 0, 0);
      context.restore();

      if (!visualization) return;

      context.save();
      (visualization.assemblies || []).forEach((assembly) => {
        context.strokeStyle = "#101b17";
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(assembly.emitter.x, assembly.emitter.y);
        context.stroke();

        context.beginPath();
        context.arc(assembly.emitter.x, assembly.emitter.y, 5, 0, Math.PI * 2);
        context.fillStyle = "#ffd45f";
        context.fill();
        context.strokeStyle = "#151b18";
        context.lineWidth = 2;
        context.stroke();

        assembly.receivers.forEach((receiver) => {
          context.beginPath();
          context.arc(receiver.x, receiver.y, 6, 0, Math.PI * 2);
          context.fillStyle = receiver.on ? "#45e07f" : "#ff8d69";
          context.fill();
          context.strokeStyle = "#08110e";
          context.lineWidth = 2;
          context.stroke();
          if (receiver.on) {
            context.beginPath();
            context.arc(receiver.x, receiver.y, 10, 0, Math.PI * 2);
            context.strokeStyle = "rgba(69, 224, 127, 0.55)";
            context.lineWidth = 2;
            context.stroke();
          }
        });
      });
      context.restore();
    }
  }

  window.DigitalFeedbackRobot = { DriveController, RobotModel };
})();
