(function () {
  "use strict";

  const FIELD_WIDTH = 800;
  const FIELD_HEIGHT = 700;
  const TAPE_WIDTH = 20;

  const DEFAULT_POINTS = Object.freeze([
    { x: 74, y: 568 },
    { x: 170, y: 590 },
    { x: 275, y: 535 },
    { x: 344, y: 407 },
    { x: 424, y: 270 },
    { x: 540, y: 184 },
    { x: 650, y: 216 },
    { x: 734, y: 342 },
  ]);

  function copyPoints(points) {
    return points.map((point) => ({ x: point.x, y: point.y }));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function distanceToSegment(point, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lengthSquared = vx * vx + vy * vy;

    if (!lengthSquared) {
      return distance(point, a);
    }

    const projection = clamp(((point.x - a.x) * vx + (point.y - a.y) * vy) / lengthSquared, 0, 1);
    const closestX = a.x + projection * vx;
    const closestY = a.y + projection * vy;
    return Math.hypot(point.x - closestX, point.y - closestY);
  }

  function catmullRomPoint(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  class TrackModel {
    constructor() {
      this.points = copyPoints(DEFAULT_POINTS);
      this.smoothPoints = [];
      this.rebuild();
    }

    reset() {
      this.points = copyPoints(DEFAULT_POINTS);
      this.rebuild();
    }

    setPoints(points) {
      this.points = points.map((point) => ({
        x: clamp(point.x, 12, FIELD_WIDTH - 12),
        y: clamp(point.y, 12, FIELD_HEIGHT - 12),
      }));
      this.rebuild();
    }

    updatePoint(index, point) {
      if (!this.points[index]) return;
      this.points[index] = {
        x: clamp(point.x, 12, FIELD_WIDTH - 12),
        y: clamp(point.y, 12, FIELD_HEIGHT - 12),
      };
      this.rebuild();
    }

    rebuild() {
      if (this.points.length < 2) {
        this.smoothPoints = copyPoints(this.points);
        return;
      }

      const stepsPerSegment = this.points.length > 30 ? 3 : 12;
      const result = [];
      for (let index = 0; index < this.points.length - 1; index += 1) {
        const p0 = this.points[Math.max(0, index - 1)];
        const p1 = this.points[index];
        const p2 = this.points[index + 1];
        const p3 = this.points[Math.min(this.points.length - 1, index + 2)];
        for (let step = 0; step < stepsPerSegment; step += 1) {
          result.push(catmullRomPoint(p0, p1, p2, p3, step / stepsPerSegment));
        }
      }
      result.push({ ...this.points[this.points.length - 1] });
      this.smoothPoints = result;
    }

    getSurfaceAt(x, y) {
      if (this.smoothPoints.length < 2) return "field";

      const point = { x, y };
      let minimum = Number.POSITIVE_INFINITY;
      for (let index = 0; index < this.smoothPoints.length - 1; index += 1) {
        minimum = Math.min(
          minimum,
          distanceToSegment(point, this.smoothPoints[index], this.smoothPoints[index + 1]),
        );
      }

      if (minimum <= TAPE_WIDTH / 2) return "white";
      if (minimum <= (TAPE_WIDTH * 3) / 2) return "black";
      return "field";
    }

    getStartPose() {
      const first = this.smoothPoints[0] || DEFAULT_POINTS[0];
      const second = this.smoothPoints[2] || this.smoothPoints[1] || DEFAULT_POINTS[1];
      return {
        x: first.x,
        y: first.y,
        heading: Math.atan2(second.y - first.y, second.x - first.x),
      };
    }

    draw(context, editing) {
      if (this.smoothPoints.length < 2) return;

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";

      context.beginPath();
      context.moveTo(this.smoothPoints[0].x, this.smoothPoints[0].y);
      for (let index = 1; index < this.smoothPoints.length; index += 1) {
        context.lineTo(this.smoothPoints[index].x, this.smoothPoints[index].y);
      }
      context.strokeStyle = "#050706";
      context.lineWidth = TAPE_WIDTH * 3;
      context.shadowColor = "rgba(0, 0, 0, 0.34)";
      context.shadowBlur = 7;
      context.stroke();

      context.shadowBlur = 0;
      context.strokeStyle = "#f2f3ef";
      context.lineWidth = TAPE_WIDTH;
      context.stroke();

      context.strokeStyle = "rgba(21, 34, 29, 0.16)";
      context.lineWidth = 1;
      context.setLineDash([7, 9]);
      context.stroke();
      context.setLineDash([]);

      const start = this.smoothPoints[0];
      context.beginPath();
      context.arc(start.x, start.y, 5, 0, Math.PI * 2);
      context.fillStyle = "#45e07f";
      context.fill();
      context.strokeStyle = "#08110e";
      context.lineWidth = 2;
      context.stroke();

      if (editing) {
        const step = Math.max(1, Math.ceil(this.points.length / 16));
        this.points.forEach((point, index) => {
          if (index % step !== 0 && index !== this.points.length - 1) return;
          context.beginPath();
          context.arc(point.x, point.y, 6, 0, Math.PI * 2);
          context.fillStyle = "#0d1b17";
          context.fill();
          context.strokeStyle = "#70e1f5";
          context.lineWidth = 2;
          context.stroke();
        });
      }

      context.restore();
    }
  }

  class TrackEditor {
    constructor(canvas, track, onCommit) {
      this.canvas = canvas;
      this.track = track;
      this.onCommit = onCommit;
      this.editing = false;
      this.dragIndex = -1;
      this.drawing = false;
      this.originalPoints = null;

      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);

      canvas.addEventListener("pointerdown", this.handlePointerDown);
      canvas.addEventListener("pointermove", this.handlePointerMove);
      canvas.addEventListener("pointerup", this.handlePointerUp);
      canvas.addEventListener("pointercancel", this.handlePointerUp);
    }

    setEditing(enabled) {
      this.editing = enabled;
      this.dragIndex = -1;
      this.drawing = false;
      this.canvas.classList.toggle("is-editing", enabled);
    }

    toFieldPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * FIELD_WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * FIELD_HEIGHT,
      };
    }

    nearestHandle(point) {
      let nearest = -1;
      let nearestDistance = 20;
      this.track.points.forEach((candidate, index) => {
        const currentDistance = distance(point, candidate);
        if (currentDistance < nearestDistance) {
          nearest = index;
          nearestDistance = currentDistance;
        }
      });
      return nearest;
    }

    handlePointerDown(event) {
      if (!this.editing) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      const point = this.toFieldPoint(event);
      const handle = this.nearestHandle(point);

      if (handle >= 0) {
        this.dragIndex = handle;
        this.track.updatePoint(handle, point);
        return;
      }

      this.originalPoints = copyPoints(this.track.points);
      this.drawing = true;
      this.track.setPoints([point]);
    }

    handlePointerMove(event) {
      if (!this.editing) return;
      const point = this.toFieldPoint(event);

      if (this.dragIndex >= 0) {
        event.preventDefault();
        this.track.updatePoint(this.dragIndex, point);
        return;
      }

      if (!this.drawing) return;
      event.preventDefault();
      const last = this.track.points[this.track.points.length - 1];
      if (!last || distance(last, point) >= 9) {
        this.track.setPoints([...this.track.points, point]);
      }
    }

    handlePointerUp(event) {
      if (!this.editing || (this.dragIndex < 0 && !this.drawing)) return;
      event.preventDefault();

      if (this.drawing && this.track.points.length < 2 && this.originalPoints) {
        this.track.setPoints(this.originalPoints);
      }

      this.dragIndex = -1;
      this.drawing = false;
      this.originalPoints = null;
      if (typeof this.onCommit === "function") this.onCommit();
    }
  }

  window.DigitalFeedbackTrack = {
    FIELD_WIDTH,
    FIELD_HEIGHT,
    TAPE_WIDTH,
    TrackModel,
    TrackEditor,
  };
})();
