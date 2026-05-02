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

const PRESET_SITES = [
  { label: "知网 CNKI", value: "cnki.net" },
  { label: "万方数据", value: "wanfangdata.com.cn" },
  { label: "维普", value: "cqvip.com" },
  { label: "爱奇艺", value: "iqiyi.com" },
  { label: "腾讯视频", value: "v.qq.com" },
  { label: "优酷", value: "youku.com" },
  { label: "哔哩哔哩", value: "bilibili.com" },
  { label: "抖音", value: "douyin.com" },
  { label: "小红书", value: "xiaohongshu.com" },
  { label: "微博", value: "weibo.com" },
  { label: "知乎", value: "zhihu.com" }
];

const form = document.querySelector("#settings-form");
const enabledInput = document.querySelector("#enabled");
const triggerMinutesInput = document.querySelector("#trigger-minutes");
const breakMinutesInput = document.querySelector("#break-minutes");
const targetSitesInput = document.querySelector("#target-sites");
const soundEnabledInput = document.querySelector("#sound-enabled");
const presetSitesContainer = document.querySelector("#preset-sites");
const restoreDefaultsButton = document.querySelector("#restore-defaults");
const statusElement = document.querySelector("#status");

let currentSites = [];

init();

async function init() {
  renderPresetSites();
  await loadAndRenderSettings();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSettings(readFormSettings());
    showStatus("已保存，刷新目标网页后生效。");
  });

  restoreDefaultsButton.addEventListener("click", async () => {
    await saveSettings(DEFAULT_SETTINGS);
    renderSettings(DEFAULT_SETTINGS);
    showStatus("已恢复默认设置。");
  });

  targetSitesInput.addEventListener("input", () => {
    currentSites = parseSites(targetSitesInput.value);
    syncPresetChecks();
  });
}

function renderPresetSites() {
  presetSitesContainer.innerHTML = "";

  for (const site of PRESET_SITES) {
    const label = document.createElement("label");
    label.className = "choice";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = site.value;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        addSite(site.value);
      } else {
        removeSite(site.value);
      }
    });

    const text = document.createElement("span");
    text.textContent = site.label;

    label.append(checkbox, text);
    presetSitesContainer.append(label);
  }
}

async function loadAndRenderSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  renderSettings(normalizeSettings(settings));
}

function renderSettings(settings) {
  enabledInput.checked = settings.enabled;
  triggerMinutesInput.value = String(settings.triggerMinutes);
  breakMinutesInput.value = String(settings.breakMinutes);
  soundEnabledInput.checked = settings.soundEnabled;
  currentSites = settings.targetSites;
  targetSitesInput.value = currentSites.join("\n");
  syncPresetChecks();
}

function readFormSettings() {
  return normalizeSettings({
    enabled: enabledInput.checked,
    triggerMinutes: Number(triggerMinutesInput.value),
    breakMinutes: Number(breakMinutesInput.value),
    targetSites: parseSites(targetSitesInput.value),
    soundEnabled: soundEnabledInput.checked
  });
}

async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

function addSite(site) {
  const normalized = normalizeSite(site);
  currentSites = uniqueSites([...parseSites(targetSitesInput.value), normalized]);
  targetSitesInput.value = currentSites.join("\n");
  syncPresetChecks();
}

function removeSite(site) {
  const normalized = normalizeSite(site);
  currentSites = parseSites(targetSitesInput.value).filter(
    (item) => item !== normalized
  );
  targetSitesInput.value = currentSites.join("\n");
  syncPresetChecks();
}

function syncPresetChecks() {
  const selectedSites = new Set(parseSites(targetSitesInput.value));

  for (const checkbox of presetSitesContainer.querySelectorAll("input")) {
    checkbox.checked = selectedSites.has(checkbox.value);
  }
}

function parseSites(value) {
  return uniqueSites(
    String(value)
      .split(/\r?\n|,/)
      .map(normalizeSite)
      .filter(Boolean)
  );
}

function uniqueSites(sites) {
  return [...new Set(sites)];
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
    targetSites: uniqueSites(targetSites.map(normalizeSite).filter(Boolean)),
    triggerMinutes: Number.isFinite(triggerMinutes)
      ? clamp(triggerMinutes, 0.1, 240)
      : DEFAULT_SETTINGS.triggerMinutes,
    breakMinutes: Number.isFinite(breakMinutes)
      ? clamp(breakMinutes, 0.1, 60)
      : DEFAULT_SETTINGS.breakMinutes,
    soundEnabled: settings?.soundEnabled === true
  };
}

function showStatus(message) {
  statusElement.textContent = message;
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    statusElement.textContent = "";
  }, 2600);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
