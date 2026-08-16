(function () {
  "use strict";

  const MODES = Object.freeze(["none", "single", "dual"]);
  const OFFSET_MIN = 30;
  const OFFSET_MAX = 76;
  const SPACING_MIN = 24;
  const SPACING_MAX = 72;
  const DEFAULT_CONFIGURATION = Object.freeze({
    front: Object.freeze({ mode: "single", longitudinalOffset: 42, spacing: 42 }),
    rear: Object.freeze({ mode: "none", longitudinalOffset: 42, spacing: 42 }),
  });

  function clamp(value, min, max, fallback) {
    const numeric = Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : fallback));
  }

  function normalizeMode(mode, fallback = "none") {
    return MODES.includes(mode) ? mode : fallback;
  }

  function copyMount(mount, values) {
    const defaults = DEFAULT_CONFIGURATION[mount];
    return {
      mode: normalizeMode(values?.mode, defaults.mode),
      longitudinalOffset: clamp(
        values?.longitudinalOffset,
        OFFSET_MIN,
        OFFSET_MAX,
        defaults.longitudinalOffset,
      ),
      spacing: clamp(values?.spacing, SPACING_MIN, SPACING_MAX, defaults.spacing),
    };
  }

  function copyConfiguration(values) {
    return {
      front: copyMount("front", values?.front),
      rear: copyMount("rear", values?.rear),
    };
  }

  class DigitalSensorArray {
    constructor(track, robot) {
      this.track = track;
      this.robot = robot;
      this.configuration = copyConfiguration(DEFAULT_CONFIGURATION);
      this.state = {
        frontSingle: false,
        frontLeft: false,
        frontRight: false,
        rearSingle: false,
        rearLeft: false,
        rearRight: false,
      };
      this.surfaces = {
        frontSingle: "field",
        frontLeft: "field",
        frontRight: "field",
        rearSingle: "field",
        rearLeft: "field",
        rearRight: "field",
      };
      this.update();
    }

    setConfiguration(values) {
      this.configuration = copyConfiguration(values);
      this.update();
    }

    updateMount(mount, values) {
      if (mount !== "front" && mount !== "rear") return;
      this.configuration[mount] = copyMount(mount, {
        ...this.configuration[mount],
        ...values,
      });
      this.update();
    }

    getConfiguration() {
      return copyConfiguration(this.configuration);
    }

    // Compatibility helpers for Version 2 saves and programs.
    setMode(mode) {
      this.updateMount("front", { mode });
    }

    setSpacing(spacing) {
      this.updateMount("front", { spacing });
    }

    get mode() {
      return this.configuration.front.mode;
    }

    get spacing() {
      return this.configuration.front.spacing;
    }

    localToWorld(forward, lateral) {
      const { x, y, heading } = this.robot.state;
      return {
        x: x + Math.cos(heading) * forward - Math.sin(heading) * lateral,
        y: y + Math.sin(heading) * forward + Math.cos(heading) * lateral,
      };
    }

    getMountPositions(mount) {
      const settings = this.configuration[mount];
      if (!settings || settings.mode === "none") return null;

      const forward = mount === "front"
        ? settings.longitudinalOffset
        : -settings.longitudinalOffset;
      const emitterForward = settings.mode === "single"
        ? forward + (mount === "front" ? -9 : 9)
        : forward;
      const assembly = {
        mount,
        mode: settings.mode,
        emitter: this.localToWorld(emitterForward, 0),
      };

      if (settings.mode === "single") {
        assembly.single = this.localToWorld(forward, 0);
      } else {
        assembly.left = this.localToWorld(forward, -settings.spacing / 2);
        assembly.right = this.localToWorld(forward, settings.spacing / 2);
      }
      return assembly;
    }

    getPositions() {
      return {
        front: this.getMountPositions("front"),
        rear: this.getMountPositions("rear"),
      };
    }

    resetState() {
      Object.keys(this.state).forEach((key) => {
        this.state[key] = false;
        this.surfaces[key] = "field";
      });
    }

    updateMountState(mount, positions) {
      const prefix = mount === "front" ? "front" : "rear";
      const keys = [`${prefix}Single`, `${prefix}Left`, `${prefix}Right`];
      keys.forEach((key) => {
        this.state[key] = false;
        this.surfaces[key] = "field";
      });
      if (!positions) return;

      if (positions.mode === "single") {
        const key = `${prefix}Single`;
        this.surfaces[key] = this.track.getSurfaceAt(positions.single.x, positions.single.y);
        this.state[key] = this.surfaces[key] === "white";
        return;
      }

      ["Left", "Right"].forEach((side) => {
        const positionKey = side.toLowerCase();
        const key = `${prefix}${side}`;
        this.surfaces[key] = this.track.getSurfaceAt(positions[positionKey].x, positions[positionKey].y);
        this.state[key] = this.surfaces[key] === "white";
      });
    }

    update() {
      const positions = this.getPositions();
      this.updateMountState("front", positions.front);
      this.updateMountState("rear", positions.rear);
      return this.state;
    }

    read(sensorName) {
      this.update();
      const aliases = {
        single: "frontSingle",
        left: "frontLeft",
        right: "frontRight",
      };
      const key = aliases[sensorName] || sensorName;
      return Boolean(this.state[key]);
    }

    getVisualization() {
      const positions = this.getPositions();
      return {
        assemblies: ["front", "rear"].flatMap((mount) => {
          const assembly = positions[mount];
          if (!assembly) return [];
          const prefix = mount === "front" ? "front" : "rear";
          const receivers = assembly.mode === "single"
            ? [{ ...assembly.single, on: this.state[`${prefix}Single`], name: `${prefix}Single` }]
            : [
                { ...assembly.left, on: this.state[`${prefix}Left`], name: `${prefix}Left` },
                { ...assembly.right, on: this.state[`${prefix}Right`], name: `${prefix}Right` },
              ];
          return [{ mount, emitter: assembly.emitter, receivers }];
        }),
      };
    }
  }

  window.DigitalFeedbackSensors = {
    DigitalSensorArray,
    DEFAULT_CONFIGURATION,
    OFFSET_MIN,
    OFFSET_MAX,
    SPACING_MIN,
    SPACING_MAX,
  };
})();
