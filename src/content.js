const DEFAULT_SETTINGS = {
  enabled: true,
  targetSites: [
    "cnki.net",
    "wanfangdata.com.cn",
    "cqvip.com",
    "iqiyi.com",
    "v.qq.com",
    "youku.com",
    "bilibili.com",
    "douyin.com",
    "xiaohongshu.com",
    "weibo.com",
    "zhihu.com"
  ],
  triggerMinutes: 2,
  breakMinutes: 1,
  soundEnabled: false
};

const STATE = {
  settings: DEFAULT_SETTINGS,
  usageSeconds: 0,
  breakUntil: 0,
  overlayRoot: null,
  overlayLoading: false,
  timerId: null
};

init();

async function init() {
  STATE.settings = await loadSettings();
  STATE.timerId = window.setInterval(tick, 1000);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    const nextSettings = { ...STATE.settings };
    let changed = false;

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (changes[key]) {
        nextSettings[key] = changes[key].newValue;
        changed = true;
      }
    }

    if (changed) {
      STATE.settings = normalizeSettings(nextSettings);
      if (!isTargetPage()) {
        STATE.usageSeconds = 0;
      }
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "cat-gatekeeper:settings-updated") {
      STATE.settings = normalizeSettings(message.settings);
    }
  });
}

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "cat-gatekeeper:get-settings"
    });
    return normalizeSettings(response?.settings ?? DEFAULT_SETTINGS);
  } catch (_error) {
    return DEFAULT_SETTINGS;
  }
}

function tick() {
  if (!STATE.settings.enabled || !isTargetPage()) {
    STATE.usageSeconds = 0;
    return;
  }

  if (Date.now() < STATE.breakUntil || STATE.overlayRoot || STATE.overlayLoading) {
    return;
  }

  if (document.visibilityState !== "visible" || !document.hasFocus()) {
    return;
  }

  STATE.usageSeconds += 1;

  if (STATE.usageSeconds >= STATE.settings.triggerMinutes * 60) {
    STATE.usageSeconds = 0;
    showCatOverlay(STATE.settings.breakMinutes);
  }
}

function isTargetPage() {
  const host = window.location.hostname.toLowerCase();
  const url = window.location.href.toLowerCase();

  return STATE.settings.targetSites.some((site) => {
    const normalized = normalizeSite(site);

    if (!normalized) {
      return false;
    }

    if (normalized.includes("*")) {
      const pattern = normalized
        .split("*")
        .map(escapeRegExp)
        .join(".*");
      return new RegExp(`^${pattern}$`).test(url);
    }

    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      return url.startsWith(normalized);
    }

    const siteHost = normalized.replace(/^www\./, "");
    const pageHost = host.replace(/^www\./, "");
    return pageHost === siteHost || pageHost.endsWith(`.${siteHost}`);
  });
}

function normalizeSite(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");
}

function normalizeSettings(settings) {
  const triggerMinutes = Number(settings?.triggerMinutes);
  const breakMinutes = Number(settings?.breakMinutes);
  const targetSites = Array.isArray(settings?.targetSites)
    ? settings.targetSites
    : DEFAULT_SETTINGS.targetSites;

  return {
    enabled: settings?.enabled !== false,
    targetSites: targetSites.map(normalizeSite).filter(Boolean),
    triggerMinutes: Number.isFinite(triggerMinutes)
      ? clamp(triggerMinutes, 0.1, 240)
      : DEFAULT_SETTINGS.triggerMinutes,
    breakMinutes: Number.isFinite(breakMinutes)
      ? clamp(breakMinutes, 0.1, 60)
      : DEFAULT_SETTINGS.breakMinutes,
    soundEnabled: settings?.soundEnabled === true
  };
}

async function showCatOverlay(breakMinutes) {
  STATE.overlayLoading = true;

  const totalSeconds = Math.max(1, Math.round(breakMinutes * 60));
  const endAt = Date.now() + totalSeconds * 1000;
  STATE.breakUntil = endAt;

  const { catVideoUrl, mimeType, isObjectUrl, needsBlackKey } = await resolveCatVideoUrl();

  const host = document.createElement("div");
  host.id = "cat-gatekeeper-root";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = buildOverlayHtml(totalSeconds, catVideoUrl, mimeType, needsBlackKey);
  STATE.overlayRoot = host;
  STATE.overlayLoading = false;

  if (STATE.settings.soundEnabled) {
    playSoftBeep();
  }

  const countdown = shadow.querySelector("[data-countdown]");
  const timer = window.setInterval(() => {
    const secondsLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    countdown.textContent = formatSeconds(secondsLeft);

    if (secondsLeft <= 0) {
      window.clearInterval(timer);
      if (isObjectUrl) {
        URL.revokeObjectURL(catVideoUrl);
      }
      host.remove();
      STATE.overlayRoot = null;
    }
  }, 250);
}

async function resolveCatVideoUrl() {
  const defaultResult = {
    catVideoUrl: chrome.runtime.getURL("assets/cat.webm"),
    mimeType: "video/webm",
    isObjectUrl: false,
    needsBlackKey: false
  };

  try {
    const result = await chrome.storage.local.get("customCatVideoDataUrl");
    const dataUrl = result?.customCatVideoDataUrl;

    if (!dataUrl) {
      return defaultResult;
    }

    const mimeMatch = dataUrl.match(/^data:(video\/[^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "video/mp4";
    const base64Data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mimeType });

    return {
      catVideoUrl: URL.createObjectURL(blob),
      mimeType,
      isObjectUrl: true,
      needsBlackKey: !mimeType.includes("webm")
    };
  } catch (_error) {
    return defaultResult;
  }
}

function buildOverlayHtml(totalSeconds, catVideoUrl, mimeType, needsBlackKey) {
  const fallbackCatUrl = chrome.runtime.getURL("assets/cat.svg");
  const catClassName = needsBlackKey ? "cat cat--black-key" : "cat";

  return `
    <style>
      :host {
        all: initial;
      }

      .overlay {
        inset: 0;
        position: fixed;
        z-index: 2147483647;
      }

      .dim {
        background: rgba(0, 0, 0, 0.52);
        inset: 0;
        position: absolute;
      }

      .cat {
        animation: cat-breathe 2.4s ease-in-out infinite;
        filter: drop-shadow(0 24px 64px rgba(0, 0, 0, 0.55));
        height: min(96vh, 1080px);
        left: 50%;
        object-fit: contain;
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: auto;
        max-width: 96vw;
      }

      .cat--black-key {
        filter: url(#cat-black-to-alpha);
      }

      .filter-defs {
        height: 0;
        position: absolute;
        width: 0;
      }

      .footer {
        align-items: flex-start;
        display: flex;
        flex-direction: column;
        gap: 10px;
        left: 48px;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        white-space: nowrap;
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

      @keyframes cat-breathe {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1);
        }

        50% {
          transform: translate(-50%, -50%) scale(1.04);
        }
      }
    </style>

    <section class="overlay" role="dialog" aria-modal="true" aria-label="Cat break reminder">
      ${needsBlackKey ? `
        <svg class="filter-defs" aria-hidden="true">
          <defs>
            <filter id="cat-black-to-alpha" color-interpolation-filters="sRGB">
              <feColorMatrix type="matrix" values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                3 3 3 0 -0.05
              " />
            </filter>
          </defs>
        </svg>
      ` : ""}
      <div class="dim"></div>
      <video class="${catClassName}" autoplay loop muted playsinline poster="${fallbackCatUrl}" aria-label="A chubby orange cat">
        <source src="${catVideoUrl}" type="${mimeType}" />
      </video>
      <div class="footer">
        <div class="countdown" data-countdown>${formatSeconds(totalSeconds)}</div>
        <span class="hint">你已经刷太久了，先休息一下。</span>
      </div>
    </section>
  `;
}

function playSoftBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.frequency.value = 440;
    oscillator.type = "sine";
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18);
  } catch (_error) {
    // Autoplay policies can block audio until the user interacts with the page.
  }
}

function formatSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
