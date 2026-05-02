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

  if (Date.now() < STATE.breakUntil || STATE.overlayRoot) {
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

function showCatOverlay(breakMinutes) {
  const totalSeconds = Math.max(1, Math.round(breakMinutes * 60));
  const endAt = Date.now() + totalSeconds * 1000;
  STATE.breakUntil = endAt;

  const host = document.createElement("div");
  host.id = "cat-gatekeeper-root";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = buildOverlayHtml(totalSeconds);
  STATE.overlayRoot = host;

  if (STATE.settings.soundEnabled) {
    playSoftBeep();
  }

  const countdown = shadow.querySelector("[data-countdown]");
  const timer = window.setInterval(() => {
    const secondsLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    countdown.textContent = formatSeconds(secondsLeft);

    if (secondsLeft <= 0) {
      window.clearInterval(timer);
      host.remove();
      STATE.overlayRoot = null;
    }
  }, 250);
}

function buildOverlayHtml(totalSeconds) {
  return `
    <style>
      :host {
        all: initial;
      }

      .overlay {
        align-items: center;
        background:
          radial-gradient(circle at top left, rgba(255, 143, 90, 0.24), transparent 34%),
          rgba(0, 0, 0, 0.72);
        color: #fff;
        display: flex;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        inset: 0;
        justify-content: center;
        position: fixed;
        text-align: center;
        z-index: 2147483647;
      }

      .card {
        align-items: center;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: min(1280px, calc(100vw - 16px));
        padding: 18px;
      }

      .cat {
        animation: cat-breathe 1.4s ease-in-out infinite;
        filter: drop-shadow(0 32px 52px rgba(0, 0, 0, 0.48));
        max-height: min(76vh, 820px);
        max-width: min(118vw, 1280px);
        object-fit: contain;
        transform-origin: center bottom;
        width: min(118vw, 1280px);
      }

      .title {
        font-size: clamp(32px, 5vw, 64px);
        font-weight: 900;
        letter-spacing: -0.04em;
        line-height: 1.02;
        margin: 0;
      }

      .subtitle {
        color: rgba(255, 255, 255, 0.76);
        font-size: clamp(18px, 2vw, 28px);
        font-weight: 700;
        margin: 0;
      }

      .countdown {
        background: #ff6633;
        border-radius: 999px;
        box-shadow: 0 18px 50px rgba(255, 102, 51, 0.32);
        color: #fff;
        font-size: clamp(34px, 6vw, 72px);
        font-weight: 900;
        line-height: 1;
        padding: 18px 34px 22px;
      }

      @keyframes cat-breathe {
        0%, 100% {
          transform: rotate(-1deg) scale(1.18);
        }

        50% {
          transform: rotate(1deg) scale(1.24);
        }
      }
    </style>

    <section class="overlay" role="dialog" aria-modal="true" aria-label="Cat break reminder">
      <div class="card">
        ${buildCatMedia()}
        <h1 class="title">猫猫接管屏幕</h1>
        <p class="subtitle">你已经刷太久了，先休息一下。</p>
        <div class="countdown" data-countdown>${formatSeconds(totalSeconds)}</div>
      </div>
    </section>
  `;
}

function buildCatMedia() {
  const catVideoUrl = chrome.runtime.getURL("assets/cat.webm");
  const fallbackCatUrl = chrome.runtime.getURL("assets/cat.svg");

  return `
    <video class="cat" autoplay loop muted playsinline poster="${fallbackCatUrl}" aria-label="A chubby orange cat">
      <source src="${catVideoUrl}" type="video/webm" />
    </video>
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
