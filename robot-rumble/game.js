(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RobotRumbleGame = api;
    if (root.document) {
      const initialize = () => api.initialize(root.document, root);
      if (root.document.readyState === "loading") {
        root.document.addEventListener("DOMContentLoaded", initialize, { once: true });
      } else {
        initialize();
      }
    }
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const FIELD_W = 1100;
  const FIELD_H = 650;
  const ROBOT_RADIUS = 34;
  const MAX_HITS = 5;
  const CONTROL_KEYS = new Set([
    "w", "a", "s", "d", "f", "c",
    "arrowup", "arrowdown", "arrowleft", "arrowright", "l", "p",
  ]);

  let activeController = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createRobot(x, angle) {
    return {
      x,
      y: FIELD_H / 2,
      angle,
      vx: 0,
      vy: 0,
      hits: 0,
      punchingUntil: 0,
      cooldownUntil: 0,
      punchConnected: false,
      blocking: false,
      flashUntil: 0,
      blockFlashUntil: 0,
    };
  }

  function overlapsSpawn(x, y, width, height) {
    return [
      { x: 185, y: FIELD_H / 2, radius: 150 },
      { x: FIELD_W - 185, y: FIELD_H / 2, radius: 150 },
    ].some((zone) => {
      const nearestX = clamp(zone.x, x, x + width);
      const nearestY = clamp(zone.y, y, y + height);
      return Math.hypot(nearestX - zone.x, nearestY - zone.y) < zone.radius;
    });
  }

  function createObstacles(random = Math.random) {
    const obstacles = [];
    const desired = 5 + Math.floor(random() * 3);
    for (let attempts = 0; obstacles.length < desired && attempts < 250; attempts += 1) {
      const kind = random() > 0.42 ? "barrier" : "crate";
      const horizontal = random() > 0.5;
      const width = kind === "crate" ? 68 : horizontal ? 126 : 48;
      const height = kind === "crate" ? 68 : horizontal ? 48 : 126;
      const x = 82 + random() * (FIELD_W - 164 - width);
      const y = 82 + random() * (FIELD_H - 164 - height);
      if (overlapsSpawn(x, y, width, height)) continue;
      const collides = obstacles.some((item) => (
        x < item.x + item.width + 55
        && x + width + 55 > item.x
        && y < item.y + item.height + 55
        && y + height + 55 > item.y
      ));
      if (!collides) obstacles.push({ x, y, width, height, kind });
    }
    return obstacles;
  }

  function resolveObstacleCollision(robot, obstacle) {
    const nearestX = clamp(robot.x, obstacle.x, obstacle.x + obstacle.width);
    const nearestY = clamp(robot.y, obstacle.y, obstacle.y + obstacle.height);
    const dx = robot.x - nearestX;
    const dy = robot.y - nearestY;
    const distance = Math.hypot(dx, dy);
    const padding = ROBOT_RADIUS + 3;
    if (distance >= padding) return false;

    if (distance > 0.001) {
      const push = padding - distance;
      robot.x += (dx / distance) * push;
      robot.y += (dy / distance) * push;
      return true;
    }

    const sides = [
      Math.abs(robot.x - obstacle.x),
      Math.abs(obstacle.x + obstacle.width - robot.x),
      Math.abs(robot.y - obstacle.y),
      Math.abs(obstacle.y + obstacle.height - robot.y),
    ];
    const edge = sides.indexOf(Math.min(...sides));
    if (edge === 0) robot.x = obstacle.x - padding;
    else if (edge === 1) robot.x = obstacle.x + obstacle.width + padding;
    else if (edge === 2) robot.y = obstacle.y - padding;
    else robot.y = obstacle.y + obstacle.height + padding;
    return true;
  }

  function movementVector(keys, controls) {
    let x = Number(keys.has(controls.right)) - Number(keys.has(controls.left));
    let y = Number(keys.has(controls.down)) - Number(keys.has(controls.up));
    const length = Math.hypot(x, y);
    if (length > 0) {
      x /= length;
      y /= length;
    }
    return { x, y, moving: length > 0 };
  }

  function updateRobot(robot, controls, keys, delta, obstacles, now) {
    robot.blocking = keys.has(controls.block) && now >= robot.punchingUntil;
    const movement = movementVector(keys, controls);
    if (movement.moving) {
      const speed = robot.blocking ? 112 : 210;
      robot.x += movement.x * speed * delta;
      robot.y += movement.y * speed * delta;
      robot.angle = Math.atan2(movement.y, movement.x);
    }

    robot.x += robot.vx * delta;
    robot.y += robot.vy * delta;
    const drag = Math.pow(0.04, delta);
    robot.vx *= drag;
    robot.vy *= drag;
    robot.x = clamp(robot.x, 55, FIELD_W - 55);
    robot.y = clamp(robot.y, 55, FIELD_H - 55);
    obstacles.forEach((obstacle) => resolveObstacleCollision(robot, obstacle));
  }

  function startPunch(robot, now) {
    if (now < robot.cooldownUntil || robot.blocking) return false;
    robot.punchingUntil = now + 155;
    robot.cooldownUntil = now + 475;
    robot.punchConnected = false;
    return true;
  }

  function resolvePunch(attacker, defender, now) {
    if (attacker.punchingUntil <= now || attacker.punchConnected) {
      return { connected: false, blocked: false, hit: false, knockout: false };
    }

    const dx = defender.x - attacker.x;
    const dy = defender.y - attacker.y;
    const distance = Math.hypot(dx, dy);
    const facing = Math.cos(attacker.angle) * dx + Math.sin(attacker.angle) * dy;
    if (distance > 116 || facing / Math.max(distance, 1) < 0.42) {
      return { connected: false, blocked: false, hit: false, knockout: false };
    }

    attacker.punchConnected = true;
    const normalX = dx / Math.max(distance, 1);
    const normalY = dy / Math.max(distance, 1);
    const defenderFacingAttacker = (
      Math.cos(defender.angle) * -normalX
      + Math.sin(defender.angle) * -normalY
    );

    if (defender.blocking && defenderFacingAttacker > 0.18) {
      defender.blockFlashUntil = now + 150;
      attacker.vx -= normalX * 105;
      attacker.vy -= normalY * 105;
      return {
        connected: true,
        blocked: true,
        hit: false,
        knockout: false,
        contactX: (attacker.x + defender.x) / 2,
        contactY: (attacker.y + defender.y) / 2,
      };
    }

    defender.hits += 1;
    defender.flashUntil = now + 115;
    defender.vx += normalX * 340;
    defender.vy += normalY * 340;
    return {
      connected: true,
      blocked: false,
      hit: true,
      knockout: defender.hits >= MAX_HITS,
      contactX: defender.x - normalX * 18,
      contactY: defender.y - normalY * 18,
    };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(x, y, width, height, safeRadius);
      return;
    }
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    context.lineTo(x + safeRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    context.lineTo(x, y + safeRadius);
    context.quadraticCurveTo(x, y, x + safeRadius, y);
    context.closePath();
  }

  function drawObstacle(context, obstacle) {
    context.save();
    context.shadowColor = "rgba(0,0,0,.55)";
    context.shadowBlur = 14;
    context.shadowOffsetY = 8;
    roundedRect(context, obstacle.x, obstacle.y, obstacle.width, obstacle.height, 8);
    const metal = context.createLinearGradient(
      obstacle.x,
      obstacle.y,
      obstacle.x,
      obstacle.y + obstacle.height,
    );
    metal.addColorStop(0, obstacle.kind === "crate" ? "#78858c" : "#909a9f");
    metal.addColorStop(0.5, obstacle.kind === "crate" ? "#435159" : "#59656b");
    metal.addColorStop(1, "#273238");
    context.fillStyle = metal;
    context.fill();
    context.shadowColor = "transparent";
    context.strokeStyle = "#a8b2b7";
    context.lineWidth = 3;
    context.stroke();

    if (obstacle.kind === "barrier") {
      context.save();
      roundedRect(
        context,
        obstacle.x + 5,
        obstacle.y + 5,
        obstacle.width - 10,
        obstacle.height - 10,
        4,
      );
      context.clip();
      context.strokeStyle = "rgba(245,184,46,.75)";
      context.lineWidth = 12;
      for (
        let stripe = -obstacle.height;
        stripe < obstacle.width + obstacle.height;
        stripe += 30
      ) {
        context.beginPath();
        context.moveTo(obstacle.x + stripe, obstacle.y + obstacle.height);
        context.lineTo(obstacle.x + stripe + obstacle.height, obstacle.y);
        context.stroke();
      }
      context.restore();
    } else {
      context.strokeStyle = "rgba(20,28,32,.75)";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(obstacle.x + 10, obstacle.y + 10);
      context.lineTo(obstacle.x + obstacle.width - 10, obstacle.y + obstacle.height - 10);
      context.moveTo(obstacle.x + obstacle.width - 10, obstacle.y + 10);
      context.lineTo(obstacle.x + 10, obstacle.y + obstacle.height - 10);
      context.stroke();
    }
    context.restore();
  }

  function drawArena(context, obstacles) {
    const floor = context.createLinearGradient(0, 0, 0, FIELD_H);
    floor.addColorStop(0, "#263039");
    floor.addColorStop(1, "#141b20");
    context.fillStyle = floor;
    context.fillRect(0, 0, FIELD_W, FIELD_H);
    context.strokeStyle = "rgba(153,177,190,.09)";
    context.lineWidth = 1;
    for (let x = 40; x < FIELD_W; x += 80) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, FIELD_H);
      context.stroke();
    }
    for (let y = 40; y < FIELD_H; y += 80) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(FIELD_W, y);
      context.stroke();
    }
    for (let x = 24; x < FIELD_W; x += 90) {
      for (let y = 24; y < FIELD_H; y += 90) {
        context.fillStyle = "rgba(192,213,222,.14)";
        context.beginPath();
        context.arc(x, y, 2.4, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.save();
    context.lineWidth = 18;
    context.strokeStyle = "#090d0f";
    context.strokeRect(9, 9, FIELD_W - 18, FIELD_H - 18);
    context.lineWidth = 11;
    context.setLineDash([24, 18]);
    context.strokeStyle = "#f5b82e";
    context.strokeRect(18, 18, FIELD_W - 36, FIELD_H - 36);
    context.restore();

    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(255,255,255,.025)";
    context.font = "900 82px Arial";
    context.fillText("ROBOT RUMBLE", FIELD_W / 2, FIELD_H / 2);
    context.restore();
    obstacles.forEach((obstacle) => drawObstacle(context, obstacle));
  }

  function drawRobot(context, robot, number, color, darkColor, now) {
    const punched = robot.punchingUntil > now ? 1 : 0;
    context.save();
    context.translate(robot.x, robot.y);
    context.rotate(robot.angle);
    context.shadowColor = "rgba(0,0,0,.65)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 7;
    context.fillStyle = "#080b0d";
    roundedRect(context, -34, -39, 55, 18, 5);
    context.fill();
    roundedRect(context, -34, 21, 55, 18, 5);
    context.fill();
    context.shadowColor = "transparent";
    context.fillStyle = "#11191d";
    [-29, 29].forEach((wheelY) => {
      roundedRect(context, -28, wheelY - 7, 49, 14, 4);
      context.fill();
      context.strokeStyle = "#536068";
      context.lineWidth = 2;
      context.stroke();
    });

    const body = context.createLinearGradient(-28, -34, 30, 34);
    body.addColorStop(0, robot.flashUntil > now ? "#fff" : color);
    body.addColorStop(0.55, darkColor);
    body.addColorStop(1, "#121a1e");
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(-30, -30);
    context.lineTo(20, -34);
    context.lineTo(36, -18);
    context.lineTo(36, 18);
    context.lineTo(20, 34);
    context.lineTo(-30, 30);
    context.lineTo(-38, 14);
    context.lineTo(-38, -14);
    context.closePath();
    context.fill();
    context.strokeStyle = robot.flashUntil > now ? "#fff" : color;
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = "rgba(8,13,15,.7)";
    context.beginPath();
    context.arc(-4, 0, 18, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.18)";
    context.stroke();
    context.fillStyle = "#eef4f4";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 18px Arial";
    context.fillText(String(number), -4, 1);

    context.fillStyle = "#222c31";
    roundedRect(context, 20, -10, 31 + punched * 28, 20, 5);
    context.fill();
    context.strokeStyle = "#a9b5ba";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = color;
    roundedRect(context, 46 + punched * 28, -16, 18, 32, 4);
    context.fill();
    context.strokeStyle = "#f1f5f5";
    context.stroke();

    if (robot.blocking) {
      context.strokeStyle = robot.blockFlashUntil > now ? "#fff" : color;
      context.lineWidth = robot.blockFlashUntil > now ? 10 : 7;
      context.globalAlpha = robot.blockFlashUntil > now ? 1 : 0.72;
      context.beginPath();
      context.arc(9, 0, 58, -1.05, 1.05);
      context.stroke();
      context.globalAlpha = 1;
    }
    context.restore();

    if (robot.blocking) {
      context.save();
      context.fillStyle = "rgba(8,12,14,.78)";
      roundedRect(context, robot.x - 29, robot.y + 48, 58, 20, 10);
      context.fill();
      context.fillStyle = color;
      context.textAlign = "center";
      context.font = "800 11px Arial";
      context.fillText("BLOCK", robot.x, robot.y + 62);
      context.restore();
    }
  }

  function createSparks(sparks, x, y, color, random = Math.random) {
    for (let index = 0; index < 18; index += 1) {
      const angle = random() * Math.PI * 2;
      const speed = 80 + random() * 260;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.22 + random() * 0.34,
        color,
      });
    }
  }

  function initialize(documentTarget, windowTarget) {
    if (activeController) return activeController;
    const canvas = documentTarget.getElementById("arena-canvas");
    const context = canvas && canvas.getContext("2d");
    if (!canvas || !context) return null;

    const elements = {
      arenaLabel: documentTarget.getElementById("arena-label"),
      overlay: documentTarget.getElementById("match-overlay"),
      overlayKicker: documentTarget.getElementById("overlay-kicker"),
      overlayTitle: documentTarget.getElementById("overlay-title"),
      overlayCopy: documentTarget.getElementById("overlay-copy"),
      startButton: documentTarget.getElementById("start-button"),
      randomizeButton: documentTarget.getElementById("randomize-button"),
      damageLabels: [
        documentTarget.getElementById("player-one-damage"),
        documentTarget.getElementById("player-two-damage"),
      ],
      progress: [
        documentTarget.getElementById("player-one-progress"),
        documentTarget.getElementById("player-two-progress"),
      ],
    };

    const controls = [
      { up: "w", down: "s", left: "a", right: "d", punch: "f", block: "c" },
      {
        up: "arrowup",
        down: "arrowdown",
        left: "arrowleft",
        right: "arrowright",
        punch: "l",
        block: "p",
      },
    ];
    const keys = new Set();
    let robots = [createRobot(185, 0), createRobot(FIELD_W - 185, Math.PI)];
    let obstacles = createObstacles();
    let sparks = [];
    let matchState = "ready";
    let winner = null;
    let arenaNumber = 1;
    let lastTime = 0;
    let animationFrame = null;

    function updateArenaLabel() {
      elements.arenaLabel.setAttribute("aria-label", `Arena layout ${arenaNumber}`);
      elements.arenaLabel.lastChild.textContent = ` ARENA ${String(arenaNumber).padStart(2, "0")}`;
    }

    function updateScore() {
      robots.forEach((robot, index) => {
        elements.damageLabels[index].textContent = `${robot.hits} / ${MAX_HITS} HITS`;
        elements.progress[index].setAttribute("aria-valuenow", String(robot.hits));
        const robotName = index === 0 ? "Green Machine" : "Orange Crush";
        elements.progress[index].setAttribute(
          "aria-label",
          `${robotName} has taken ${robot.hits} of ${MAX_HITS} hits`,
        );
        elements.progress[index].firstElementChild.style.width = `${(robot.hits / MAX_HITS) * 100}%`;
      });
    }

    function hideOverlay() {
      elements.overlay.hidden = true;
      elements.overlay.classList.remove("is-knockout");
    }

    function showKnockout(attackerIndex) {
      matchState = "knockout";
      winner = attackerIndex + 1;
      keys.clear();
      elements.overlayKicker.textContent = "KNOCKOUT";
      elements.overlayTitle.textContent = `PLAYER ${winner} WINS`;
      elements.overlayCopy.textContent = winner === 1
        ? "Green Machine rules this arena."
        : "Orange Crush rules this arena.";
      elements.startButton.textContent = "NEW ARENA";
      elements.overlay.classList.add("is-knockout");
      elements.overlay.hidden = false;
      elements.startButton.focus();
    }

    function resetMatch(newArena) {
      robots = [createRobot(185, 0), createRobot(FIELD_W - 185, Math.PI)];
      if (newArena) {
        obstacles = createObstacles();
        arenaNumber += 1;
        updateArenaLabel();
      }
      sparks = [];
      keys.clear();
      winner = null;
      matchState = "playing";
      lastTime = windowTarget.performance.now();
      updateScore();
      hideOverlay();
      canvas.focus();
    }

    function handleKeyDown(event) {
      const key = event.key.toLowerCase();
      if (!CONTROL_KEYS.has(key)) return;
      event.preventDefault();
      keys.add(key);
      if (matchState !== "playing" || event.repeat) return;
      const robotIndex = key === controls[0].punch ? 0 : key === controls[1].punch ? 1 : -1;
      if (robotIndex >= 0) startPunch(robots[robotIndex], windowTarget.performance.now());
    }

    function handleKeyUp(event) {
      keys.delete(event.key.toLowerCase());
    }

    function clearKeys() {
      keys.clear();
    }

    function resolveRobotCollision() {
      const dx = robots[1].x - robots[0].x;
      const dy = robots[1].y - robots[0].y;
      const distance = Math.hypot(dx, dy);
      const minimum = ROBOT_RADIUS * 2 + 3;
      if (distance >= minimum || distance <= 0.001) return;
      const push = (minimum - distance) / 2;
      robots[0].x -= (dx / distance) * push;
      robots[0].y -= (dy / distance) * push;
      robots[1].x += (dx / distance) * push;
      robots[1].y += (dy / distance) * push;
    }

    function checkPunch(attackerIndex, now) {
      const defenderIndex = attackerIndex === 0 ? 1 : 0;
      const result = resolvePunch(robots[attackerIndex], robots[defenderIndex], now);
      if (!result.connected) return;
      createSparks(
        sparks,
        result.contactX,
        result.contactY,
        result.blocked ? "#82e9ff" : "#ffbd35",
      );
      if (!result.hit) return;
      updateScore();
      if (result.knockout) showKnockout(attackerIndex);
    }

    function animate(now) {
      const delta = Math.min((now - (lastTime || now)) / 1000, 0.032);
      lastTime = now;
      if (matchState === "playing") {
        updateRobot(robots[0], controls[0], keys, delta, obstacles, now);
        updateRobot(robots[1], controls[1], keys, delta, obstacles, now);
        resolveRobotCollision();
        checkPunch(0, now);
        checkPunch(1, now);
      } else {
        robots[0].blocking = false;
        robots[1].blocking = false;
      }

      sparks = sparks.filter((spark) => {
        spark.x += spark.vx * delta;
        spark.y += spark.vy * delta;
        spark.vy += 240 * delta;
        spark.life -= delta;
        return spark.life > 0;
      });

      drawArena(context, obstacles);
      drawRobot(context, robots[0], 1, "#9ee33b", "#47751a", now);
      drawRobot(context, robots[1], 2, "#ff7a32", "#9c321a", now);
      sparks.forEach((spark) => {
        context.globalAlpha = Math.min(1, spark.life * 5);
        context.fillStyle = spark.color;
        context.beginPath();
        context.arc(spark.x, spark.y, 2.7, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      animationFrame = windowTarget.requestAnimationFrame(animate);
    }

    elements.startButton.addEventListener("click", () => resetMatch(matchState === "knockout"));
    elements.randomizeButton.addEventListener("click", () => resetMatch(true));
    windowTarget.addEventListener("keydown", handleKeyDown, { passive: false });
    windowTarget.addEventListener("keyup", handleKeyUp);
    windowTarget.addEventListener("blur", clearKeys);
    documentTarget.addEventListener("visibilitychange", () => {
      if (documentTarget.hidden) clearKeys();
    });

    updateArenaLabel();
    updateScore();
    animationFrame = windowTarget.requestAnimationFrame(animate);

    activeController = Object.freeze({
      start: () => resetMatch(false),
      randomize: () => resetMatch(true),
      destroy: () => {
        if (animationFrame) windowTarget.cancelAnimationFrame(animationFrame);
        windowTarget.removeEventListener("keydown", handleKeyDown);
        windowTarget.removeEventListener("keyup", handleKeyUp);
        windowTarget.removeEventListener("blur", clearKeys);
        activeController = null;
      },
      getState: () => ({
        matchState,
        winner,
        arenaNumber,
        robots: robots.map((robot) => ({ ...robot })),
        obstacles: obstacles.map((obstacle) => ({ ...obstacle })),
        pressedKeys: [...keys],
      }),
    });
    return activeController;
  }

  return Object.freeze({
    FIELD_W,
    FIELD_H,
    ROBOT_RADIUS,
    MAX_HITS,
    CONTROL_KEYS,
    clamp,
    createRobot,
    createObstacles,
    overlapsSpawn,
    resolveObstacleCollision,
    movementVector,
    updateRobot,
    startPunch,
    resolvePunch,
    initialize,
    getController: () => activeController,
  });
});
