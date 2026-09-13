(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CVSVisionLayout = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const STORAGE_KEY = "cvs-ai-vision-layout-v1";
  const DEFAULT_SPLIT_PERCENT = 40;
  const MIN_WORKSPACE_PX = 420;
  const MIN_SIMULATION_PX = 700;
  const MIN_PREFERRED_PERCENT = 20;
  const MAX_PREFERRED_PERCENT = 80;
  const DESKTOP_QUERY = "(min-width: 1181px)";

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getSplitBounds(containerWidth, dividerWidth, options) {
    const settings = options || {};
    const usableWidth = Math.max(
      1,
      finiteNumber(containerWidth, 0) - Math.max(0, finiteNumber(dividerWidth, 0)),
    );
    const minimumWorkspace = Math.max(1, finiteNumber(settings.minimumWorkspace, MIN_WORKSPACE_PX));
    const minimumSimulation = Math.max(1, finiteNumber(settings.minimumSimulation, MIN_SIMULATION_PX));
    const minimum = clamp(minimumWorkspace / usableWidth * 100, MIN_PREFERRED_PERCENT, MAX_PREFERRED_PERCENT);
    const maximum = clamp(
      (usableWidth - minimumSimulation) / usableWidth * 100,
      MIN_PREFERRED_PERCENT,
      MAX_PREFERRED_PERCENT,
    );

    if (maximum < minimum) {
      const shared = clamp(DEFAULT_SPLIT_PERCENT, maximum, minimum);
      return { minimum: shared, maximum: shared, usableWidth };
    }

    return { minimum, maximum, usableWidth };
  }

  function getEffectiveSplit(preferredPercent, containerWidth, dividerWidth, options) {
    const bounds = getSplitBounds(containerWidth, dividerWidth, options);
    const preferred = clamp(
      finiteNumber(preferredPercent, DEFAULT_SPLIT_PERCENT),
      MIN_PREFERRED_PERCENT,
      MAX_PREFERRED_PERCENT,
    );
    const percent = clamp(preferred, bounds.minimum, bounds.maximum);
    return {
      preferred,
      percent,
      workspacePixels: bounds.usableWidth * percent / 100,
      minimum: bounds.minimum,
      maximum: bounds.maximum,
      usableWidth: bounds.usableWidth,
    };
  }

  function parseStoredSplit(rawValue, fallback) {
    const defaultValue = clamp(
      finiteNumber(fallback, DEFAULT_SPLIT_PERCENT),
      MIN_PREFERRED_PERCENT,
      MAX_PREFERRED_PERCENT,
    );
    if (typeof rawValue !== "string" || !rawValue.trim()) return defaultValue;

    try {
      const parsed = JSON.parse(rawValue);
      const candidate = parsed && typeof parsed === "object"
        ? parsed.desktopSplitPercent
        : parsed;
      if (typeof candidate !== "number" || !Number.isFinite(candidate)) return defaultValue;
      return clamp(candidate, MIN_PREFERRED_PERCENT, MAX_PREFERRED_PERCENT);
    } catch (_error) {
      return defaultValue;
    }
  }

  function readStoredSplit(storage, key, fallback) {
    try {
      if (!storage || typeof storage.getItem !== "function") {
        return parseStoredSplit(null, fallback);
      }
      return parseStoredSplit(storage.getItem(key || STORAGE_KEY), fallback);
    } catch (_error) {
      return parseStoredSplit(null, fallback);
    }
  }

  function writeStoredSplit(storage, percent, key) {
    try {
      if (!storage || typeof storage.setItem !== "function") return false;
      const value = clamp(
        finiteNumber(percent, DEFAULT_SPLIT_PERCENT),
        MIN_PREFERRED_PERCENT,
        MAX_PREFERRED_PERCENT,
      );
      storage.setItem(key || STORAGE_KEY, JSON.stringify({ desktopSplitPercent: value }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function pointerPercentFromClientX(clientX, contentLeft, usableWidth, grabOffset) {
    const width = Math.max(1, finiteNumber(usableWidth, 1));
    const workspacePixels = finiteNumber(clientX, 0)
      - finiteNumber(contentLeft, 0)
      - Math.max(0, finiteNumber(grabOffset, 0));
    return workspacePixels / width * 100;
  }

  function create(options) {
    const settings = options || {};
    const workbench = settings.workbench;
    const divider = settings.divider;
    if (!workbench || !divider) {
      throw new Error("The AI Vision workbench and layout divider are required.");
    }

    const ownerWindow = settings.window || (workbench.ownerDocument && workbench.ownerDocument.defaultView) || root;
    const ownerDocument = workbench.ownerDocument || (ownerWindow && ownerWindow.document) || null;
    const body = ownerDocument && ownerDocument.body;
    const requestFrame = settings.requestAnimationFrame
      || (ownerWindow && ownerWindow.requestAnimationFrame && ownerWindow.requestAnimationFrame.bind(ownerWindow))
      || ((callback) => setTimeout(callback, 0));
    const cancelFrame = settings.cancelAnimationFrame
      || (ownerWindow && ownerWindow.cancelAnimationFrame && ownerWindow.cancelAnimationFrame.bind(ownerWindow))
      || clearTimeout;
    const computedStyle = settings.getComputedStyle
      || (ownerWindow && ownerWindow.getComputedStyle && ownerWindow.getComputedStyle.bind(ownerWindow));
    const mediaQuery = settings.mediaQuery
      || (ownerWindow && ownerWindow.matchMedia
        ? ownerWindow.matchMedia(settings.desktopQuery || DESKTOP_QUERY)
        : { matches: true, addEventListener() {}, removeEventListener() {} });
    const storage = Object.prototype.hasOwnProperty.call(settings, "storage")
      ? settings.storage
      : (() => {
          try {
            return ownerWindow && ownerWindow.localStorage;
          } catch (_error) {
            return null;
          }
        })();
    const storageKey = settings.storageKey || STORAGE_KEY;
    const minimumWorkspace = finiteNumber(settings.minimumWorkspace, MIN_WORKSPACE_PX);
    const minimumSimulation = finiteNumber(settings.minimumSimulation, MIN_SIMULATION_PX);
    const onResize = typeof settings.onResize === "function" ? settings.onResize : () => {};
    let preferredPercent = readStoredSplit(storage, storageKey, settings.defaultSplit);
    let effectivePercent = preferredPercent;
    let activePointerId = null;
    let grabOffset = 0;
    let pendingPointerX = null;
    let pointerFrame = null;
    let resizeFrame = null;
    let resizeObserver = null;

    function readPadding() {
      if (!computedStyle) return { left: 0, right: 0 };
      const style = computedStyle(workbench);
      return {
        left: finiteNumber(Number.parseFloat(style.paddingLeft), 0),
        right: finiteNumber(Number.parseFloat(style.paddingRight), 0),
      };
    }

    function measure() {
      const rect = workbench.getBoundingClientRect();
      const padding = readPadding();
      const contentWidth = Math.max(1, workbench.clientWidth - padding.left - padding.right);
      return {
        left: rect.left + finiteNumber(workbench.clientLeft, 0) + padding.left,
        width: contentWidth,
        dividerWidth: Math.max(0, finiteNumber(divider.offsetWidth, divider.getBoundingClientRect().width)),
      };
    }

    function scheduleResizeNotification() {
      if (resizeFrame !== null) return;
      resizeFrame = requestFrame(() => {
        resizeFrame = null;
        onResize();
      });
    }

    function applyLayout() {
      if (!mediaQuery.matches) {
        scheduleResizeNotification();
        return null;
      }

      const dimensions = measure();
      const split = getEffectiveSplit(preferredPercent, dimensions.width, dimensions.dividerWidth, {
        minimumWorkspace,
        minimumSimulation,
      });
      effectivePercent = split.percent;
      workbench.style.setProperty("--workspace-size", `${split.workspacePixels.toFixed(2)}px`);
      divider.setAttribute("aria-valuemin", String(Math.round(split.minimum)));
      divider.setAttribute("aria-valuemax", String(Math.round(split.maximum)));
      divider.setAttribute("aria-valuenow", String(Math.round(split.percent)));
      divider.setAttribute(
        "aria-valuetext",
        `${Math.round(split.percent)}% programming, ${Math.round(100 - split.percent)}% simulation`,
      );
      scheduleResizeNotification();
      return split;
    }

    function setPreferredPercent(nextPercent, persist) {
      preferredPercent = clamp(
        finiteNumber(nextPercent, preferredPercent),
        MIN_PREFERRED_PERCENT,
        MAX_PREFERRED_PERCENT,
      );
      const split = applyLayout();
      if (persist) writeStoredSplit(storage, preferredPercent, storageKey);
      return split;
    }

    function applyPointerX(clientX) {
      const dimensions = measure();
      const bounds = getSplitBounds(dimensions.width, dimensions.dividerWidth, {
        minimumWorkspace,
        minimumSimulation,
      });
      const percent = pointerPercentFromClientX(
        clientX,
        dimensions.left,
        bounds.usableWidth,
        grabOffset,
      );
      return setPreferredPercent(clamp(percent, bounds.minimum, bounds.maximum), false);
    }

    function flushPointerMove() {
      if (pointerFrame !== null) {
        cancelFrame(pointerFrame);
        pointerFrame = null;
      }
      if (pendingPointerX === null) return;
      const clientX = pendingPointerX;
      pendingPointerX = null;
      applyPointerX(clientX);
    }

    function handlePointerDown(event) {
      if (!mediaQuery.matches || event.isPrimary === false) return;
      if (event.button !== undefined && event.button !== 0) return;
      activePointerId = event.pointerId;
      const dividerRect = divider.getBoundingClientRect();
      grabOffset = clamp(event.clientX - dividerRect.left, 0, dividerRect.width);
      if (typeof divider.setPointerCapture === "function") {
        divider.setPointerCapture(event.pointerId);
      }
      if (body) body.classList.add("is-resizing-layout");
      event.preventDefault();
      event.stopPropagation();
    }

    function handlePointerMove(event) {
      if (event.pointerId !== activePointerId) return;
      pendingPointerX = event.clientX;
      if (pointerFrame === null) {
        pointerFrame = requestFrame(() => {
          pointerFrame = null;
          if (pendingPointerX === null) return;
          const clientX = pendingPointerX;
          pendingPointerX = null;
          applyPointerX(clientX);
        });
      }
      event.preventDefault();
      event.stopPropagation();
    }

    function finishPointer(event) {
      if (event.pointerId !== activePointerId) return;
      flushPointerMove();
      const pointerId = activePointerId;
      activePointerId = null;
      if (
        typeof divider.hasPointerCapture === "function"
        && divider.hasPointerCapture(pointerId)
        && typeof divider.releasePointerCapture === "function"
      ) {
        divider.releasePointerCapture(pointerId);
      }
      if (body) body.classList.remove("is-resizing-layout");
      writeStoredSplit(storage, preferredPercent, storageKey);
      event.preventDefault();
      event.stopPropagation();
    }

    function handleKeyDown(event) {
      if (!mediaQuery.matches) return;
      const dimensions = measure();
      const bounds = getSplitBounds(dimensions.width, dimensions.dividerWidth, {
        minimumWorkspace,
        minimumSimulation,
      });
      const step = event.shiftKey ? 6 : 2;
      let next = null;
      if (event.key === "ArrowLeft") next = effectivePercent - step;
      if (event.key === "ArrowRight") next = effectivePercent + step;
      if (event.key === "Home") next = bounds.minimum;
      if (event.key === "End") next = bounds.maximum;
      if (next === null) return;
      setPreferredPercent(clamp(next, bounds.minimum, bounds.maximum), true);
      event.preventDefault();
      event.stopPropagation();
    }

    function syncMediaQuery() {
      const enabled = Boolean(mediaQuery.matches);
      if (!enabled && activePointerId !== null) {
        if (pointerFrame !== null) cancelFrame(pointerFrame);
        pointerFrame = null;
        pendingPointerX = null;
        const pointerId = activePointerId;
        activePointerId = null;
        if (
          typeof divider.hasPointerCapture === "function"
          && divider.hasPointerCapture(pointerId)
          && typeof divider.releasePointerCapture === "function"
        ) {
          divider.releasePointerCapture(pointerId);
        }
        writeStoredSplit(storage, preferredPercent, storageKey);
      }
      divider.hidden = !enabled;
      divider.tabIndex = enabled ? 0 : -1;
      divider.toggleAttribute("aria-hidden", !enabled);
      if (!enabled && body) body.classList.remove("is-resizing-layout");
      applyLayout();
    }

    function handleContainerResize() {
      applyLayout();
    }

    divider.addEventListener("pointerdown", handlePointerDown);
    divider.addEventListener("pointermove", handlePointerMove);
    divider.addEventListener("pointerup", finishPointer);
    divider.addEventListener("pointercancel", finishPointer);
    divider.addEventListener("lostpointercapture", finishPointer);
    divider.addEventListener("keydown", handleKeyDown);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMediaQuery);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(syncMediaQuery);
    }
    if (ownerWindow && "ResizeObserver" in ownerWindow) {
      resizeObserver = new ownerWindow.ResizeObserver(handleContainerResize);
      resizeObserver.observe(workbench);
    } else if (ownerWindow && typeof ownerWindow.addEventListener === "function") {
      ownerWindow.addEventListener("resize", handleContainerResize);
    }

    syncMediaQuery();

    return Object.freeze({
      refresh: applyLayout,
      getPreferredSplit: () => preferredPercent,
      getEffectiveSplit: () => effectivePercent,
      setPreferredSplit: (percent) => setPreferredPercent(percent, true),
      destroy() {
        divider.removeEventListener("pointerdown", handlePointerDown);
        divider.removeEventListener("pointermove", handlePointerMove);
        divider.removeEventListener("pointerup", finishPointer);
        divider.removeEventListener("pointercancel", finishPointer);
        divider.removeEventListener("lostpointercapture", finishPointer);
        divider.removeEventListener("keydown", handleKeyDown);
        if (typeof mediaQuery.removeEventListener === "function") {
          mediaQuery.removeEventListener("change", syncMediaQuery);
        } else if (typeof mediaQuery.removeListener === "function") {
          mediaQuery.removeListener(syncMediaQuery);
        }
        if (resizeObserver) resizeObserver.disconnect();
        if (ownerWindow && typeof ownerWindow.removeEventListener === "function") {
          ownerWindow.removeEventListener("resize", handleContainerResize);
        }
        if (pointerFrame !== null) cancelFrame(pointerFrame);
        if (resizeFrame !== null) cancelFrame(resizeFrame);
        if (body) body.classList.remove("is-resizing-layout");
      },
    });
  }

  return Object.freeze({
    STORAGE_KEY,
    DEFAULT_SPLIT_PERCENT,
    MIN_WORKSPACE_PX,
    MIN_SIMULATION_PX,
    DESKTOP_QUERY,
    clamp,
    getSplitBounds,
    getEffectiveSplit,
    parseStoredSplit,
    readStoredSplit,
    writeStoredSplit,
    pointerPercentFromClientX,
    create,
  });
});
