(function () {
  "use strict";

  const drivetrain = {
    driveSpeed: 50,
    turnSpeed: 30,
    leftOutput: 0,
    rightOutput: 0,
    action: "stopped",
  };

  function clampSpeed(speed) {
    const numericSpeed = Number(speed);

    if (!Number.isFinite(numericSpeed)) {
      return 0;
    }

    return Math.min(Math.max(numericSpeed, 0), 100);
  }

  function publishState() {
    window.dispatchEvent(
      new CustomEvent("drivetrainchange", {
        detail: { ...drivetrain }
      })
    );
  }

  function stop() {
    drivetrain.action = "stopped";
    drivetrain.leftOutput = 0;
    drivetrain.rightOutput = 0;
    publishState();
  }

  function setDriveSpeed(speed) {
    drivetrain.driveSpeed = clampSpeed(speed);
    if (drivetrain.action === "forward") forward();
    else if (drivetrain.action === "reverse") reverse();
    else publishState();
  }

  function setTurnSpeed(speed) {
    drivetrain.turnSpeed = clampSpeed(speed);
    if (drivetrain.action === "turnLeft") turnLeft();
    else if (drivetrain.action === "turnRight") turnRight();
    else publishState();
  }

  function forward() {
    drivetrain.action = "forward";
    drivetrain.leftOutput = drivetrain.driveSpeed;
    drivetrain.rightOutput = drivetrain.driveSpeed;
    publishState();
  }

  function reverse() {
    drivetrain.action = "reverse";
    drivetrain.leftOutput = -drivetrain.driveSpeed;
    drivetrain.rightOutput = -drivetrain.driveSpeed;
    publishState();
  }

  function turnLeft() {
    drivetrain.action = "turnLeft";
    drivetrain.leftOutput = drivetrain.turnSpeed * 0.35;
    drivetrain.rightOutput = drivetrain.turnSpeed;
    publishState();
  }

  function turnRight() {
    drivetrain.action = "turnRight";
    drivetrain.leftOutput = drivetrain.turnSpeed;
    drivetrain.rightOutput = drivetrain.turnSpeed * 0.35;
    publishState();
  }

  function command(action, speed) {
    if (action === "forward") {
      setDriveSpeed(speed);
      forward();
    } else if (action === "reverse") {
      setDriveSpeed(speed);
      reverse();
    } else if (action === "turnLeft") {
      setTurnSpeed(speed);
      turnLeft();
    } else if (action === "turnRight") {
      setTurnSpeed(speed);
      turnRight();
    } else {
      stop();
    }
  }

  window.drivetrain = drivetrain;
  window.Drivetrain = {
    setDriveSpeed,
    setTurnSpeed,
    forward,
    reverse,
    turnLeft,
    turnRight,
    command,
    stop
  };
})();
