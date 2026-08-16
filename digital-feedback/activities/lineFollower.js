(function () {
  "use strict";

  const { TrackModel, TrackEditor } = window.DigitalFeedbackTrack;
  const { DigitalSensorArray } = window.DigitalFeedbackSensors;

  class LineFollowerActivity {
    constructor({ canvas, robot, onTrackCommit }) {
      this.id = "line-follower";
      this.title = "Line Follower";
      this.canvas = canvas;
      this.robot = robot;
      this.track = new TrackModel();
      this.sensors = new DigitalSensorArray(this.track, this.robot);
      this.active = false;
      this.editing = false;
      this.onTrackCommit = onTrackCommit;
      this.trackEditor = null;
    }

    init() {
      if (this.trackEditor) return;
      this.trackEditor = new TrackEditor(this.canvas, this.track, () => {
        this.robot.reset(this.track.getStartPose());
        this.sensors.update();
        if (typeof this.onTrackCommit === "function") this.onTrackCommit();
      });
      this.sensors.update();
    }

    setActive(active) {
      this.active = Boolean(active);
      if (!this.active) this.setEditing(false);
    }

    reset() {
      this.robot.reset(this.track.getStartPose());
      this.sensors.update();
    }

    resetTrack() {
      this.track.reset();
      this.reset();
    }

    update(deltaSeconds, movementEnabled) {
      if (movementEnabled) this.robot.update(deltaSeconds);
      this.sensors.update();
    }

    getDigitalInputs() {
      this.sensors.update();
      return { ...this.sensors.state };
    }

    readInput(inputName) {
      return this.sensors.read(inputName);
    }

    render(context) {
      this.track.draw(context, this.editing);
      this.robot.draw(context, this.sensors.getVisualization());
    }

    setSensorMode(mode) {
      this.sensors.setMode(mode);
    }

    setSensorSpacing(spacing) {
      this.sensors.setSpacing(spacing);
    }

    setSensorConfiguration(configuration) {
      this.sensors.setConfiguration(configuration);
    }

    updateSensorMount(mount, values) {
      this.sensors.updateMount(mount, values);
    }

    getSensorConfiguration() {
      return this.sensors.getConfiguration();
    }

    get sensorMode() {
      return this.sensors.mode;
    }

    get sensorSpacing() {
      return this.sensors.spacing;
    }

    setEditing(enabled) {
      this.editing = this.active && Boolean(enabled);
      if (this.trackEditor) this.trackEditor.setEditing(this.editing);
    }
  }

  window.DigitalFeedbackActivities = window.DigitalFeedbackActivities || {};
  window.DigitalFeedbackActivities.LineFollowerActivity = LineFollowerActivity;
})();
