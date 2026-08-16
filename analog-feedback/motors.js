(function () {
  "use strict";

  function clampVelocity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
  }

  class MotorBank {
    constructor(jointCount = 1) {
      this.motors = Object.create(null);
      this.configure(jointCount);
    }

    configure(jointCount) {
      const count = Math.min(3, Math.max(1, Math.round(Number(jointCount) || 1)));
      const names = Array.from({ length: count }, (_, index) => `Joint${index + 1}`);
      names.push("Gripper");
      const next = Object.create(null);
      names.forEach((name) => {
        next[name] = {
          direction: "stopped",
          velocity: this.motors[name]?.velocity ?? 50,
        };
      });
      this.motors = next;
    }

    getNames() {
      return Object.keys(this.motors);
    }

    getState(name) {
      return this.motors[name] || null;
    }

    setVelocity(name, velocity) {
      const motor = this.getState(name);
      if (!motor) return;
      motor.velocity = clampVelocity(velocity);
    }

    spin(name, direction) {
      const motor = this.getState(name);
      if (!motor) return;
      motor.direction = direction === "reverse" ? "reverse" : "forward";
    }

    stop(name) {
      const motor = this.getState(name);
      if (motor) motor.direction = "stopped";
    }

    stopAll() {
      this.getNames().forEach((name) => this.stop(name));
    }
  }

  window.AnalogFeedbackMotors = { MotorBank, clampVelocity };
})();
