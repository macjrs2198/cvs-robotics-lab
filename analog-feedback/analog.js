(function () {
  "use strict";

  const DEFAULT_CALIBRATION = Object.freeze({
    Joint1: { rawMin: 620, rawMax: 3470, angleMin: 0, angleMax: 180 },
    Joint2: { rawMin: 540, rawMax: 3560, angleMin: -120, angleMax: 120 },
    Joint3: { rawMin: 700, rawMax: 3380, angleMin: -120, angleMax: 120 },
    Gripper: { rawMin: 400, rawMax: 3700, angleMin: 0, angleMax: 100 },
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function copyCalibration(name) {
    return { ...(DEFAULT_CALIBRATION[name] || DEFAULT_CALIBRATION.Joint1) };
  }

  function mapValue(value, inputMin, inputMax, outputMin, outputMax) {
    const inMin = Number(inputMin);
    const inMax = Number(inputMax);
    const outMin = Number(outputMin);
    const outMax = Number(outputMax);
    const numericValue = Number(value);
    if (![inMin, inMax, outMin, outMax, numericValue].every(Number.isFinite) || inMin === inMax) {
      return outMin || 0;
    }
    return outMin + ((numericValue - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  class AnalogSystem {
    constructor() {
      this.calibration = Object.create(null);
      Object.keys(DEFAULT_CALIBRATION).forEach((name) => {
        this.calibration[name] = copyCalibration(name);
      });
    }

    getCalibration(name) {
      if (!this.calibration[name]) this.calibration[name] = copyCalibration(name);
      return this.calibration[name];
    }

    setCalibration(name, updates) {
      const current = this.getCalibration(name);
      Object.entries(updates || {}).forEach(([key, value]) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && key in current) current[key] = numeric;
      });

      current.rawMin = Math.round(clamp(current.rawMin, 0, 4094));
      current.rawMax = Math.round(clamp(current.rawMax, 1, 4095));
      if (current.rawMax <= current.rawMin) {
        current.rawMax = Math.min(4095, current.rawMin + 1);
        if (current.rawMax <= current.rawMin) current.rawMin = current.rawMax - 1;
      }
      current.angleMin = clamp(current.angleMin, -360, 359);
      current.angleMax = clamp(current.angleMax, -359, 360);
      if (current.angleMax <= current.angleMin) current.angleMax = Math.min(360, current.angleMin + 1);
      return { ...current };
    }

    getMechanicalLimits(name) {
      const calibration = this.getCalibration(name);
      return { min: calibration.angleMin, max: calibration.angleMax };
    }

    rawFor(name, mechanicalPosition) {
      const calibration = this.getCalibration(name);
      const position = clamp(Number(mechanicalPosition) || 0, calibration.angleMin, calibration.angleMax);
      const raw = mapValue(
        position,
        calibration.angleMin,
        calibration.angleMax,
        calibration.rawMin,
        calibration.rawMax,
      );
      return Math.round(clamp(raw, Math.min(calibration.rawMin, calibration.rawMax), Math.max(calibration.rawMin, calibration.rawMax)));
    }

    load(values) {
      if (!values || typeof values !== "object") return;
      Object.entries(values).forEach(([name, calibration]) => this.setCalibration(name, calibration));
    }

    serialize() {
      return Object.fromEntries(Object.entries(this.calibration).map(([name, values]) => [name, { ...values }]));
    }
  }

  window.AnalogFeedbackAnalog = { AnalogSystem, mapValue, DEFAULT_CALIBRATION };
})();
