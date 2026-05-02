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

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const nextSettings = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) {
      nextSettings[key] = value;
    }
  }

  if (Object.keys(nextSettings).length > 0) {
    await chrome.storage.local.set(nextSettings);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "cat-gatekeeper:get-settings") {
    return false;
  }

  chrome.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
    sendResponse({ settings });
  });

  return true;
});
