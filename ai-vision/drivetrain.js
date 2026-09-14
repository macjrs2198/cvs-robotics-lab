(function () {
  "use strict";

  const MOTOR_OUTPUT_KEYS = Object.freeze({
    LeftDrive: "leftOutput",
    RightDrive: "rightOutput",
  });

  function createMotorState(velocity = 50, direction = "stopped") {
    return Object.freeze({ velocity, direction });
  }

  const drivetrain = {
    driveSpeed: 50,
    turnSpeed: 30,
    leftOutput: 0,
    rightOutput: 0,
    action: "stopped",
    motors: Object.freeze({
      LeftDrive: createMotorState(),
      RightDrive: createMotorState(),
    }),
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
        detail: { ...drivetrain, motors: drivetrain.motors },
      })
    );
  }

  function isMotorDevice(device) {
    return Object.prototype.hasOwnProperty.call(MOTOR_OUTPUT_KEYS, device);
  }

  function replaceMotorState(device, updates) {
    drivetrain.motors = Object.freeze({
      ...drivetrain.motors,
      [device]: createMotorState(
        updates.velocity ?? drivetrain.motors[device].velocity,
        updates.direction ?? drivetrain.motors[device].direction,
      ),
    });
  }

  function replaceMotorDirections(leftDirection, rightDirection) {
    drivetrain.motors = Object.freeze({
      LeftDrive: createMotorState(drivetrain.motors.LeftDrive.velocity, leftDirection),
      RightDrive: createMotorState(drivetrain.motors.RightDrive.velocity, rightDirection),
    });
  }

  function directionOutput(direction, velocity) {
    return direction === "forward" ? velocity : -velocity;
  }

  function setMotorVelocity(device, speed) {
    const numericSpeed = Number(speed);
    if (!isMotorDevice(device) || !Number.isFinite(numericSpeed)) return false;

    const velocity = clampSpeed(numericSpeed);
    const direction = drivetrain.motors[device].direction;
    replaceMotorState(device, { velocity });

    if (direction !== "stopped") {
      drivetrain[MOTOR_OUTPUT_KEYS[device]] = directionOutput(direction, velocity);
      drivetrain.action = "individual";
    }

    publishState();
    return true;
  }

  function spinMotor(device, direction) {
    if (!isMotorDevice(device) || (direction !== "forward" && direction !== "reverse")) {
      return false;
    }

    const velocity = drivetrain.motors[device].velocity;
    replaceMotorState(device, { direction });
    drivetrain[MOTOR_OUTPUT_KEYS[device]] = directionOutput(direction, velocity);
    drivetrain.action = "individual";
    publishState();
    return true;
  }

  function stopMotor(device) {
    if (!isMotorDevice(device)) return false;

    replaceMotorState(device, { direction: "stopped" });
    drivetrain[MOTOR_OUTPUT_KEYS[device]] = 0;
    drivetrain.action = drivetrain.motors.LeftDrive.direction === "stopped" &&
      drivetrain.motors.RightDrive.direction === "stopped"
      ? "stopped"
      : "individual";
    publishState();
    return true;
  }

  function stop() {
    drivetrain.action = "stopped";
    drivetrain.leftOutput = 0;
    drivetrain.rightOutput = 0;
    replaceMotorDirections("stopped", "stopped");
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
    replaceMotorDirections("forward", "forward");
    publishState();
  }

  function reverse() {
    drivetrain.action = "reverse";
    drivetrain.leftOutput = -drivetrain.driveSpeed;
    drivetrain.rightOutput = -drivetrain.driveSpeed;
    replaceMotorDirections("reverse", "reverse");
    publishState();
  }

  function turnLeft() {
    drivetrain.action = "turnLeft";
    drivetrain.leftOutput = drivetrain.turnSpeed * 0.35;
    drivetrain.rightOutput = drivetrain.turnSpeed;
    replaceMotorDirections("forward", "forward");
    publishState();
  }

  function turnRight() {
    drivetrain.action = "turnRight";
    drivetrain.leftOutput = drivetrain.turnSpeed;
    drivetrain.rightOutput = drivetrain.turnSpeed * 0.35;
    replaceMotorDirections("forward", "forward");
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
    setMotorVelocity,
    spinMotor,
    stopMotor,
    forward,
    reverse,
    turnLeft,
    turnRight,
    command,
    stop
  };
})();
