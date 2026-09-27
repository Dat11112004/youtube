/**
 * YouTube Ad-Shield Pro - Background Service Worker (Manifest V3)
 * Quản lý vòng đời extension, thống kê phiên & tổng cộng, cập nhật Badge và hỗ trợ nạp động
 */

const DEFAULT_SETTINGS = {
  masterEnabled: true,
  skipVideoAds: true,
  hideBanners: true,
  blockShorts: true,
  antiAdblock: true,
  removeBackdrops: true,
  autoDismissPopup: false,
  sessionBlockedCount: 0,
  totalBlockedCount: 0,
  timeSavedSeconds: 0
};

// Cập nhật Badge trên thanh công cụ trình duyệt
function updateBadge(countOrStatus) {
  if (countOrStatus === 'OFF') {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#777777' });
    return;
  }

  const num = typeof countOrStatus === 'number' ? countOrStatus : 0;
  let text = '';
  if (num > 999) {
    text = (num / 1000).toFixed(1) + 'k';
  } else if (num > 0) {
    text = num.toString();
  } else {
    text = 'ON';
  }

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#EB0F2D' });
}

// Tự động nạp content script và CSS vào các tab YouTube đang mở sẵn khi cài đặt/cập nhật
async function injectOpenTabs() {
  if (!chrome.scripting || !chrome.tabs) return;

  try {
    const tabs = await chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://youtube.com/*"] });
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["src/content/content.css"]
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [
              "src/utils/logger.js",
              "src/utils/dom.js",
              "src/utils/storage.js",
              "src/content/detection/rules.js",
              "src/content/detection/ad_detector.js",
              "src/content/processing/ad_processor.js",
              "src/content/navigation/navigation_watcher.js",
              "src/content/content_main.js"
            ]
          });
        } catch (err) {
          // Bỏ qua các tab chưa hoàn thành tải hoặc bị hạn chế
        }
      }
    }
  } catch (e) {}
}

// Khởi tạo extension
chrome.runtime.onInstalled.addListener(async () => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    // Reset session counter về 0 khi extension mới được nạp/cài đặt
    const initialConfig = {
      ...DEFAULT_SETTINGS,
      ...stored,
      sessionBlockedCount: 0
    };
    chrome.storage.local.set(initialConfig, () => {
      const isEnabled = initialConfig.masterEnabled !== false;
      updateBadge(isEnabled ? initialConfig.sessionBlockedCount || 0 : 'OFF');
    });
  });

  injectOpenTabs();
});

// Khi trình duyệt khởi động, reset bộ đếm phiên về 0
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ sessionBlockedCount: 0 });
});

// Lắng nghe Message từ Content Script và Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'AD_BLOCKED') {
    const duration = request.duration || 15;
    chrome.storage.local.get(['sessionBlockedCount', 'totalBlockedCount', 'timeSavedSeconds', 'masterEnabled'], (res) => {
      const newSessionCount = (res.sessionBlockedCount || 0) + 1;
      const newTotalCount = (res.totalBlockedCount || 0) + 1;
      const newTime = (res.timeSavedSeconds || 0) + duration;

      chrome.storage.local.set({
        sessionBlockedCount: newSessionCount,
        totalBlockedCount: newTotalCount,
        timeSavedSeconds: newTime
      }, () => {
        if (res.masterEnabled !== false) {
          updateBadge(newSessionCount);
        }
        sendResponse({
          success: true,
          sessionCount: newSessionCount,
          totalCount: newTotalCount,
          timeSaved: newTime
        });
      });
    });
    return true;
  }

  if (request.action === 'RESET_STATS') {
    const resetAll = request.resetTotal === true;
    const updates = { sessionBlockedCount: 0 };
    if (resetAll) {
      updates.totalBlockedCount = 0;
      updates.timeSavedSeconds = 0;
    }

    chrome.storage.local.set(updates, () => {
      updateBadge('ON');
      sendResponse({ success: true });
    });
    return true;
  }
});

// Đồng bộ Badge khi trạng thái masterEnabled thay đổi
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.masterEnabled) {
    if (!changes.masterEnabled.newValue) {
      updateBadge('OFF');
    } else {
      chrome.storage.local.get(['sessionBlockedCount'], (res) => {
        updateBadge(res.sessionBlockedCount || 0);
      });
    }
  }
});
