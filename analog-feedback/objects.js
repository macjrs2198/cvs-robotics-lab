(function () {
  "use strict";

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  class ManipulationTask {
    constructor(arm) {
      this.object = { x: 0, y: 0, size: 24 };
      this.destination = { x: 0, y: 0, radius: 38 };
      this.held = false;
      this.complete = false;
      this.reset(arm);
    }

    capturePoint(arm) {
      const pose = arm.getGripperPose();
      const radians = (pose.angle * Math.PI) / 180;
      return {
        x: pose.x + Math.cos(radians) * 30,
        y: pose.y - Math.sin(radians) * 30,
      };
    }

    reset(arm) {
      const start = this.capturePoint(arm);
      const destination = arm.getChallengePoint(105, 30);
      this.object.x = start.x;
      this.object.y = start.y;
      this.destination.x = destination.x;
      this.destination.y = destination.y;
      this.held = false;
      this.complete = false;
    }

    update(arm) {
      const capture = this.capturePoint(arm);
      if (this.held) {
        this.object.x = capture.x;
        this.object.y = capture.y;
        if (arm.gripperPosition >= 65) {
          this.held = false;
          if (distance(this.object, this.destination) <= this.destination.radius) this.complete = true;
        }
      } else if (!this.complete && arm.gripperPosition <= 35 && distance(this.object, capture) <= 34) {
        this.held = true;
        this.object.x = capture.x;
        this.object.y = capture.y;
      }
    }

    draw(context) {
      context.save();
      context.beginPath();
      context.arc(this.destination.x, this.destination.y, this.destination.radius, 0, Math.PI * 2);
      context.fillStyle = "rgba(112,225,245,0.1)";
      context.fill();
      context.strokeStyle = "#70e1f5";
      context.lineWidth = 4;
      context.setLineDash([9, 7]);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#d7eef2";
      context.font = "700 10px Space Mono, monospace";
      context.textAlign = "center";
      context.fillText("DROP ZONE", this.destination.x, this.destination.y + this.destination.radius + 18);

      const half = this.object.size / 2;
      context.fillStyle = this.complete ? "#45e07f" : "#ffc857";
      context.strokeStyle = "#07100e";
      context.lineWidth = 4;
      context.fillRect(this.object.x - half, this.object.y - half, this.object.size, this.object.size);
      context.strokeRect(this.object.x - half, this.object.y - half, this.object.size, this.object.size);
      context.fillStyle = "#07100e";
      context.font = "700 9px Space Mono, monospace";
      context.fillText("A", this.object.x, this.object.y + 3);
      context.restore();
    }
  }

  window.AnalogFeedbackObjects = { ManipulationTask };
})();
