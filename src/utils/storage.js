/**
 * YouTube Ad-Shield Pro - Storage & Configuration Manager
 * Cung cấp API quản lý cấu hình, lưu trữ thống kê phiên và tổng số quảng cáo đã xử lý
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

/**
 * Lấy toàn bộ cấu hình từ chrome.storage.local
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
async function getSettings() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve({ ...DEFAULT_SETTINGS });
      return;
    }
    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
      resolve({ ...DEFAULT_SETTINGS, ...items });
    });
  });
}

/**
 * Lưu các thay đổi cấu hình vào chrome.storage.local
 * @param {Partial<typeof DEFAULT_SETTINGS>} updates
 * @returns {Promise<void>}
 */
async function saveSettings(updates) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve();
      return;
    }
    chrome.storage.local.set(updates, () => {
      resolve();
    });
  });
}

/**
 * Tăng số lượng quảng cáo đã chặn trong phiên hiện tại và tổng cộng
 * @param {number} durationSeconds
 * @returns {Promise<{sessionBlockedCount: number, totalBlockedCount: number, timeSavedSeconds: number}>}
 */
async function incrementBlockedStats(durationSeconds = 15) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve({ sessionBlockedCount: 1, totalBlockedCount: 1, timeSavedSeconds: durationSeconds });
      return;
    }

    chrome.storage.local.get(['sessionBlockedCount', 'totalBlockedCount', 'timeSavedSeconds'], (res) => {
      const newSessionCount = (res.sessionBlockedCount || 0) + 1;
      const newTotalCount = (res.totalBlockedCount || 0) + 1;
      const newTimeSaved = (res.timeSavedSeconds || 0) + durationSeconds;

      chrome.storage.local.set({
        sessionBlockedCount: newSessionCount,
        totalBlockedCount: newTotalCount,
        timeSavedSeconds: newTimeSaved
      }, () => {
        resolve({
          sessionBlockedCount: newSessionCount,
          totalBlockedCount: newTotalCount,
          timeSavedSeconds: newTimeSaved
        });
      });
    });
  });
}

/**
 * Đặt lại bộ đếm thống kê phiên hoặc toàn bộ
 * @param {boolean} resetTotal Nếu true, reset cả tổng số và thời gian
 * @returns {Promise<void>}
 */
async function resetStats(resetTotal = false) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve();
      return;
    }

    const updates = { sessionBlockedCount: 0 };
    if (resetTotal) {
      updates.totalBlockedCount = 0;
      updates.timeSavedSeconds = 0;
    }

    chrome.storage.local.set(updates, resolve);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    incrementBlockedStats,
    resetStats
  };
}
