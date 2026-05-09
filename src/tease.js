(function () {
  const ROOT_ID = "cat-tease-root";
  const DISMISSED_KEY = "cat-tease-dismissed";
  const ASSET_ROOT = "assets/tiedan_ring";
  const MANIFEST_PATH = `${ASSET_ROOT}/manifest.json`;
  const WAND_PATH = "assets/daomao_cursor.png";
  const CENTER_WIDTH = 1280;
  const CORNER_WIDTH = 260;
  const WAND_WIDTH = 220;
  const WAND_HOTSPOT_X = 0.785;
  const WAND_HOTSPOT_Y = 0.37;
  const FOLLOW_LERP = 0.16;
  const MOUSE_LERP = 0.35;
  const CENTER_DEAD_ZONE = 0.13;
  const CONTENT_CENTER_X_OFFSET_RATIO = 80 / 720;

  const NODE_OFFSETS = {
    topLeft: 0,
    top: 45,
    topRight: 90,
    bottomRight: 180,
    bottom: 225,
    bottomLeft: 270
  };

  const GRID_NODES = {
    "0,0": "topLeft",
    "1,0": "top",
    "2,0": "topRight",
    "0,1": "bottomLeft",
    "1,1": "bottom",
    "2,1": "bottomRight"
  };

  const FALLBACK_MANIFEST = {
    frameDir: "frames",
    framePattern: "%03d.png",
    frameCount: 192,
    startAngle: 225,
    clockwise: true,
    directionFrames: {
      topLeft: 0,
      top: 56,
      topRight: 80,
      bottomRight: 96,
      bottom: 120,
      bottomLeft: 144
    }
  };

  const state = {
    root: null,
    shadow: null,
    container: null,
    canvas: null,
    context: null,
    wand: null,
    frames: [],
    countdown: null,
    lastCountdownSeconds: null,
    manifest: null,
    assetAvailable: null,
    mode: "corner",
    onClose: null,
    endAt: 0,
    target: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    smoothTarget: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    targetAngle: FALLBACK_MANIFEST.startAngle,
    catAngle: FALLBACK_MANIFEST.startAngle,
    currentFrame: -1,
    rafId: 0,
    active: false,
    hidden: false
  };

  window.__catTease = {
    hasSprite,
    start,
    stop,
    hide,
    show
  };

  async function hasSprite() {
    if (state.assetAvailable !== null) {
      return state.assetAvailable;
    }

    try {
      const response = await fetch(chrome.runtime.getURL(MANIFEST_PATH), { cache: "no-store" });
      state.assetAvailable = response.ok;
    } catch (_error) {
      state.assetAvailable = false;
    }

    return state.assetAvailable;
  }

  async function start(options = {}) {
    if (options.rememberDismissed !== false && window.sessionStorage.getItem(DISMISSED_KEY) === "true") {
      return;
    }

    state.active = true;
    state.hidden = false;
    state.mode = options.mode === "center" ? "center" : "corner";
    state.onClose = typeof options.onClose === "function" ? options.onClose : null;
    state.endAt = options.totalSeconds
      ? Date.now() + Math.max(1, Math.round(options.totalSeconds)) * 1000
      : 0;

    if (!state.manifest) {
      state.manifest = await loadManifest();
      state.targetAngle = Number(state.manifest.startAngle ?? FALLBACK_MANIFEST.startAngle);
      state.catAngle = state.targetAngle;
    }

    if (!state.root) {
      createRoot();
      addListeners();
      preloadFrames();
    }

    applyMode();
    state.root.style.display = "";
    setTargetToContainerCenter();
    setFrame(angleToFrame(state.catAngle));
    updateCountdown();
    startLoop();
  }

  function stop(rememberDismissed = false) {
    if (rememberDismissed) {
      window.sessionStorage.setItem(DISMISSED_KEY, "true");
    }

    stopLoop();
    removeListeners();

    if (state.root) {
      state.root.remove();
    }

    state.root = null;
    state.shadow = null;
    state.container = null;
    state.canvas = null;
    state.context = null;
    state.wand = null;
    state.frames = [];
    state.countdown = null;
    state.lastCountdownSeconds = null;
    state.mode = "corner";
    state.onClose = null;
    state.endAt = 0;
    state.currentFrame = -1;
    state.active = false;
    state.hidden = false;
  }

  function hide() {
    state.hidden = true;
    stopLoop();

    if (state.root) {
      state.root.style.display = "none";
    }
  }

  function show() {
    if (!state.active || !state.root) {
      return;
    }

    state.hidden = false;
    state.root.style.display = "";
    setTargetToContainerCenter();
    startLoop();
  }

  async function loadManifest() {
    try {
      const response = await fetch(chrome.runtime.getURL(MANIFEST_PATH), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (_error) {
      return { ...FALLBACK_MANIFEST };
    }
  }

  function createRoot() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    document.documentElement.append(root);

    const shadow = root.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .tease {
          filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.24));
          left: auto;
          pointer-events: none;
          position: fixed;
          right: 24px;
          top: auto;
          bottom: 24px;
          width: ${CORNER_WIDTH}px;
          z-index: 2147483646;
        }

        .tease.center {
          bottom: auto;
          left: 50%;
          max-height: 98vh;
          max-width: 118vw;
          right: auto;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(118vw, ${CENTER_WIDTH}px);
          z-index: 2147483647;
        }

        .dim {
          background: rgba(0, 0, 0, 0.52);
          inset: 0;
          opacity: 0;
          pointer-events: none;
          position: fixed;
          transition: opacity 160ms ease;
          z-index: 2147483646;
        }

        .dim.visible {
          cursor: none;
          opacity: 1;
          pointer-events: auto;
        }

        .cat {
          display: block;
          height: auto;
          pointer-events: none;
          transform: translateX(${CONTENT_CENTER_X_OFFSET_RATIO * 100}%);
          user-select: none;
          width: 100%;
          will-change: transform;
        }

        .footer {
          align-items: flex-start;
          display: none;
          flex-direction: column;
          gap: 10px;
          left: 48px;
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          white-space: nowrap;
          z-index: 2147483647;
        }

        .footer.visible {
          display: flex;
        }

        .countdown {
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: clamp(52px, 8vw, 110px);
          font-weight: 900;
          letter-spacing: -0.03em;
          line-height: 1;
          text-shadow:
            0 2px 4px rgba(0, 0, 0, 0.6),
            0 8px 32px rgba(0, 0, 0, 0.5);
        }

        .hint {
          color: rgba(255, 255, 255, 0.75);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: clamp(13px, 1.4vw, 18px);
          font-weight: 600;
          letter-spacing: 0.01em;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
        }

        .exit {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 999px;
          color: #171717;
          cursor: pointer;
          font: 800 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          margin-top: 8px;
          min-height: 38px;
          padding: 0 18px;
          pointer-events: auto;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
        }

        .exit:hover {
          background: #fff;
        }

        .close {
          align-items: center;
          background: rgba(24, 24, 24, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.32);
          border-radius: 999px;
          color: #fff;
          cursor: pointer;
          display: flex;
          font: 700 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          height: 24px;
          justify-content: center;
          pointer-events: auto;
          position: absolute;
          right: -8px;
          top: -8px;
          width: 24px;
        }

        .close:hover {
          background: rgba(24, 24, 24, 0.9);
        }

        .wand {
          display: none;
          height: auto;
          left: 0;
          pointer-events: none;
          position: fixed;
          top: 0;
          transform: translate(-${WAND_HOTSPOT_X * 100}%, -${WAND_HOTSPOT_Y * 100}%);
          user-select: none;
          width: ${WAND_WIDTH}px;
          will-change: transform;
          z-index: 2147483647;
        }

        .wand.visible {
          display: block;
        }

        :host(.cursor-wand),
        :host(.cursor-wand) * {
          cursor: none !important;
        }
      </style>
      <div class="dim" data-dim></div>
      <div class="tease" aria-label="Cat tease mode">
        <canvas class="cat" aria-label="Cursor-following cat"></canvas>
        <button class="close" type="button" aria-label="Close cat tease">x</button>
      </div>
      <img class="wand" data-wand alt="" src="${chrome.runtime.getURL(WAND_PATH)}">
      <div class="footer" data-footer>
        <div class="countdown" data-countdown>00:00</div>
        <span class="hint">你已经刷太久了，和猫猫玩一会儿再回来。</span>
        <button class="exit" type="button" data-exit>结束休息</button>
      </div>
    `;

    state.root = root;
    state.shadow = shadow;
    state.container = shadow.querySelector(".tease");
    state.canvas = shadow.querySelector(".cat");
    state.context = state.canvas.getContext("2d", { alpha: true });
    state.wand = shadow.querySelector("[data-wand]");
    state.countdown = shadow.querySelector("[data-countdown]");

    shadow.querySelector(".close").addEventListener("click", () => {
      finishByUser();
    });

    shadow.querySelector("[data-exit]").addEventListener("click", () => {
      finishByUser();
    });
  }

  function addListeners() {
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleMouseLeave);
  }

  function removeListeners() {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseleave", handleMouseLeave);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleMouseLeave);
  }

  function handleMouseMove(event) {
    state.target.x = event.clientX;
    state.target.y = event.clientY;
    updateWand(event.clientX, event.clientY);
  }

  function handleMouseLeave() {
    setTargetToContainerCenter();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      startLoop();
    } else {
      stopLoop();
    }
  }

  function applyMode() {
    if (!state.container) {
      return;
    }

    state.container.classList.toggle("center", state.mode === "center");
    state.root.classList.toggle("cursor-wand", state.mode === "center");
    state.shadow?.querySelector("[data-dim]")?.classList.toggle("visible", state.mode === "center");
    state.shadow?.querySelector("[data-footer]")?.classList.toggle("visible", state.mode === "center");
    state.wand?.classList.toggle("visible", state.mode === "center");
    updateWand(state.target.x, state.target.y);
  }

  function setTargetToContainerCenter() {
    if (!state.container) {
      return;
    }

    const rect = state.container.getBoundingClientRect();
    state.target.x = rect.left + rect.width / 2 + rect.width * CONTENT_CENTER_X_OFFSET_RATIO;
    state.target.y = rect.top + rect.height / 2;
    state.smoothTarget.x = state.target.x;
    state.smoothTarget.y = state.target.y;
    updateWand(state.target.x, state.target.y);
  }

  function updateWand(x, y) {
    if (!state.wand || state.mode !== "center") {
      return;
    }

    state.wand.style.transform =
      `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) ` +
      `translate(-${WAND_HOTSPOT_X * 100}%, -${WAND_HOTSPOT_Y * 100}%)`;
  }

  function startLoop() {
    if (state.rafId || state.hidden || document.visibilityState !== "visible") {
      return;
    }

    state.rafId = window.requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (!state.rafId) {
      return;
    }

    window.cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  function loop() {
    state.rafId = 0;

    if (!state.active || state.hidden || !state.container) {
      return;
    }

    state.smoothTarget.x += (state.target.x - state.smoothTarget.x) * MOUSE_LERP;
    state.smoothTarget.y += (state.target.y - state.smoothTarget.y) * MOUSE_LERP;

    const nextTargetAngle = getTargetAngle();
    if (nextTargetAngle !== null) {
      state.targetAngle = nextTargetAngle;
    }

    state.catAngle = normalizeAngle(
      state.catAngle + shortestAngleDiff(state.targetAngle, state.catAngle) * FOLLOW_LERP
    );
    setFrame(angleToFrame(state.catAngle));
    updateCountdown();

    state.rafId = window.requestAnimationFrame(loop);
  }

  function updateCountdown() {
    if (!state.countdown || !state.endAt) {
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
    if (secondsLeft === state.lastCountdownSeconds) {
      return;
    }

    state.lastCountdownSeconds = secondsLeft;
    state.countdown.textContent = formatSeconds(secondsLeft);
  }

  function finishByUser() {
    const onClose = state.onClose;
    stop(false);
    onClose?.();
  }

  function getTargetAngle() {
    if (!state.container) {
      return null;
    }

    const rect = state.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 + rect.width * CONTENT_CENTER_X_OFFSET_RATIO;
    const centerY = rect.top + rect.height / 2;
    const dx = state.smoothTarget.x - centerX;
    const dy = state.smoothTarget.y - centerY;
    const radius = Math.hypot(dx, dy) / Math.max(1, rect.width * 0.55);

    if (radius < CENTER_DEAD_ZONE) {
      return null;
    }

    const col = clamp(Math.floor(state.smoothTarget.x / window.innerWidth * 3), 0, 2);
    const row = clamp(Math.floor(state.smoothTarget.y / window.innerHeight * 2), 0, 1);
    return angleForNode(GRID_NODES[`${col},${row}`]);
  }

  function angleToFrame(angle) {
    const manifest = state.manifest ?? FALLBACK_MANIFEST;
    const nodes = calibratedNodes(manifest);
    const start = nodes[0].angle;
    let phase = angle;

    if (phase < start) {
      phase += 360;
    }

    let frame = 0;
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const current = nodes[index];
      const next = nodes[index + 1];

      if (phase >= current.angle && phase <= next.angle) {
        const local = (phase - current.angle) / (next.angle - current.angle || 1);
        frame = current.frame + local * (next.frame - current.frame);
        break;
      }
    }

    return mod(Math.round(frame), manifest.frameCount);
  }

  function calibratedNodes(manifest) {
    const startAngle = Number(manifest.startAngle ?? FALLBACK_MANIFEST.startAngle);
    const directionFrames = manifest.directionFrames ?? FALLBACK_MANIFEST.directionFrames;
    const order = ["topLeft", "top", "topRight", "bottomRight", "bottom", "bottomLeft"];
    const nodes = order.map((name) => ({
      name,
      angle: startAngle + NODE_OFFSETS[name],
      frame: Number(directionFrames[name] ?? FALLBACK_MANIFEST.directionFrames[name])
    }));

    nodes.push({
      name: "topLeftEnd",
      angle: startAngle + 360,
      frame: manifest.frameCount
    });

    return nodes;
  }

  function angleForNode(name) {
    const manifest = state.manifest ?? FALLBACK_MANIFEST;
    const startAngle = Number(manifest.startAngle ?? FALLBACK_MANIFEST.startAngle);
    return normalizeAngle(startAngle + (NODE_OFFSETS[name] ?? 0));
  }

  function setFrame(frame) {
    if (!state.canvas || !state.context || frame === state.currentFrame) {
      return;
    }

    const image = state.frames[frame];
    if (image?.complete && image.naturalWidth > 0) {
      drawFrame(frame, image);
      return;
    }

    state.currentFrame = frame;
    loadFrame(frame, true);
  }

  function frameUrl(frame) {
    const manifest = state.manifest ?? FALLBACK_MANIFEST;
    const frameDir = manifest.frameDir ?? FALLBACK_MANIFEST.frameDir;
    const framePattern = manifest.framePattern ?? FALLBACK_MANIFEST.framePattern;
    const filename = framePattern.replace("%03d", String(frame).padStart(3, "0"));
    return chrome.runtime.getURL(`${ASSET_ROOT}/${frameDir}/${filename}`);
  }

  function preloadFrames() {
    const manifest = state.manifest ?? FALLBACK_MANIFEST;
    const preload = () => {
      for (let index = 0; index < manifest.frameCount; index += 1) {
        loadFrame(index);
      }
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(preload, { timeout: 2000 });
    } else {
      window.setTimeout(preload, 250);
    }
  }

  function loadFrame(frame, drawWhenReady = false) {
    const existing = state.frames[frame];
    if (existing) {
      if (drawWhenReady && !existing.complete) {
        existing.addEventListener("load", () => {
          if (frame === state.currentFrame) {
            drawFrame(frame, existing);
          }
        }, { once: true });
      }
      return existing;
    }

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (drawWhenReady && frame === state.currentFrame) {
        drawFrame(frame, image);
      }
    };
    image.src = frameUrl(frame);
    state.frames[frame] = image;
    return image;
  }

  function drawFrame(frame, image) {
    if (!state.canvas || !state.context) {
      return;
    }

    if (state.canvas.width !== image.naturalWidth || state.canvas.height !== image.naturalHeight) {
      state.canvas.width = image.naturalWidth;
      state.canvas.height = image.naturalHeight;
    }

    state.context.clearRect(0, 0, state.canvas.width, state.canvas.height);
    state.context.drawImage(image, 0, 0);
    state.currentFrame = frame;
  }

  function shortestAngleDiff(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
  }

  function mod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatSeconds(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
})();
