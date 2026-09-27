/**
 * YouTube Ad-Shield Pro - Content Script Orchestrator
 * Quản lý chu trình và State Machine bảo vệ Main Video:
 * IDLE -> MAIN_VIDEO_PLAYING -> ADVERTISEMENT_PREVENTED -> MAIN_VIDEO_PLAYING
 *
 * TUYỆT ĐỐI TUÂN THỦ CÁC QUY TẮC BẢO VỆ VIDEO CHÍNH:
 * - KHÔNG tua video, KHÔNG đổi video.currentTime
 * - KHÔNG đổi video.playbackRate
 * - KHÔNG click nút Skip Ads, KHÔNG click nút Next
 * - KHÔNG pause/play video
 * - KHÔNG reload trang
 * - Xử lý quảng cáo trước khi hiển thị (Pre-Stream Prevention)
 * - FAIL-SAFE: Nếu không xác định chắc chắn advertisement thì DO NOTHING
 */

(function () {
  'use strict';

  if (window.__yt_adshield_orchestrator__) return;
  window.__yt_adshield_orchestrator__ = true;

  // 1. Logging khởi động
  if (typeof AdShieldLogger !== 'undefined') {
    AdShieldLogger.log('Extension initialized');
  }

  // 2. Định nghĩa State Machine
  const PlayerState = {
    IDLE: 'IDLE',
    MAIN_VIDEO_PLAYING: 'MAIN_VIDEO_PLAYING',
    ADVERTISEMENT_DETECTED: 'ADVERTISEMENT_DETECTED',
    ADVERTISEMENT_PREVENTED: 'ADVERTISEMENT_PREVENTED'
  };

  let currentState = PlayerState.IDLE;
  let hasLoggedMainVideo = false;

  // 3. Khởi tạo các module chuyên trách
  const rules = typeof AdShieldRules !== 'undefined' ? AdShieldRules : {};
  const detector = new AdDetector(rules);

  const processor = new AdProcessor((durationSeconds) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'AD_BLOCKED',
          duration: durationSeconds
        });
      }
    } catch (e) {}
  });

  const navigation = new NavigationWatcher();

  // 4. Trạng thái cấu hình runtime
  let settings = {
    masterEnabled: true,
    skipVideoAds: true,
    hideBanners: true,
    blockShorts: true,
    antiAdblock: true,
    removeBackdrops: true
  };

  let activeVideoElement = null;
  let activePlayerElement = null;
  let domObserver = null;

  // Throttle scan bằng requestAnimationFrame
  let isScanScheduled = false;
  function scheduleScan() {
    if (isScanScheduled) return;
    isScanScheduled = true;
    requestAnimationFrame(() => {
      isScanScheduled = false;
      executeScanCycle();
    });
  }

  // 5. Lắng nghe sự kiện từ Main World (inject.js) khi quảng cáo bị chặn trước khi phát
  window.addEventListener('yt-adshield-prevented', (event) => {
    if (!settings.masterEnabled) return;

    currentState = PlayerState.ADVERTISEMENT_PREVENTED;

    if (typeof AdShieldLogger !== 'undefined') {
      AdShieldLogger.log('Advertisement detected');
    }

    processor.handleAdPrevented(event.detail?.source || 'pre_stream');
    scheduleScan();
  });

  // 6. Chu kỳ kiểm tra định kỳ (DOM & Anti-adblock)
  function executeScanCycle() {
    if (!settings.masterEnabled) return;

    bindElements();

    const { player, video } = detector.getPlayerAndVideo();

    // Xác nhận và bảo vệ Main Video
    if (video && player) {
      const isAdActive = detector.isVideoAdActive(player);

      if (isAdActive) {
        // TÌNH HUỐNG: YouTube cố render UI quảng cáo
        if (currentState !== PlayerState.ADVERTISEMENT_DETECTED) {
          currentState = PlayerState.ADVERTISEMENT_DETECTED;
          if (typeof AdShieldLogger !== 'undefined') {
            AdShieldLogger.log('Advertisement detected');
          }
        }
        // NGUYÊN TẮC FAIL-SAFE & BẢO VỆ TUYỆT ĐỐI:
        // TUYỆT ĐỐI KHÔNG tua currentTime, KHÔNG đổi playbackRate, KHÔNG click Next/Skip!
        // Quảng cáo đã/đang được chặn ở tầng Pre-Stream & Declarative CSS
      } else {
        // TÌNH HUỐNG: Main Video đang phát bình thường
        if (!hasLoggedMainVideo) {
          hasLoggedMainVideo = true;
          currentState = PlayerState.MAIN_VIDEO_PLAYING;
          if (typeof AdShieldLogger !== 'undefined') {
            AdShieldLogger.log('Main video detected');
            AdShieldLogger.log('Main video preserved');
          }
        } else if (currentState === PlayerState.ADVERTISEMENT_DETECTED || currentState === PlayerState.ADVERTISEMENT_PREVENTED) {
          currentState = PlayerState.MAIN_VIDEO_PLAYING;
          if (typeof AdShieldLogger !== 'undefined') {
            AdShieldLogger.log('Main video preserved');
          }
        }
      }
    }

    // Xử lý Anti-Adblock modal (Chỉ gỡ modal/backdrop, KHÔNG can thiệp video)
    if (settings.antiAdblock) {
      const dialogs = detector.findAntiAdblockDialogs();
      const backdrops = settings.removeBackdrops ? detector.findBackdrops() : [];
      if (dialogs.length > 0 || backdrops.length > 0) {
        processor.neutralizeAntiAdblock(dialogs, backdrops);
      }
    }
  }

  // 7. Gắn kết thẻ Player và Video
  function bindElements() {
    const { player, video } = detector.getPlayerAndVideo();

    if (player && player !== activePlayerElement) {
      activePlayerElement = player;
    }

    if (video && video !== activeVideoElement) {
      activeVideoElement = video;
      hasLoggedMainVideo = false;
    }
  }

  // 8. Cập nhật DOM Class tương ứng với trạng thái Master
  function updateDomClasses(isEnabled) {
    const root = document.documentElement;
    if (!isEnabled) {
      root.classList.add('yt-adshield-disabled');
      root.classList.remove('yt-adshield-unlocked');
    } else {
      root.classList.remove('yt-adshield-disabled');
      root.classList.add('yt-adshield-unlocked');
    }
  }

  // 9. Tải và lắng nghe cài đặt từ chrome.storage
  if (typeof getSettings === 'function') {
    getSettings().then((stored) => {
      settings = { ...settings, ...stored };
      updateDomClasses(settings.masterEnabled !== false);
      scheduleScan();
    });
  } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(null, (stored) => {
      settings = { ...settings, ...stored };
      updateDomClasses(settings.masterEnabled !== false);
      scheduleScan();
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        for (const [key, change] of Object.entries(changes)) {
          settings[key] = change.newValue;
        }

        if ('masterEnabled' in changes) {
          const isEnabled = changes.masterEnabled.newValue !== false;
          updateDomClasses(isEnabled);
        }
        scheduleScan();
      }
    });
  }

  // 10. Kết nối Navigation Watcher (Hỗ trợ YouTube SPA)
  navigation.onNavigate(({ url, videoId, isNewVideo }) => {
    if (typeof AdShieldLogger !== 'undefined') {
      AdShieldLogger.log('Navigation detected');
    }

    // Reset về IDLE cho video mới - Đảm bảo xử lý độc lập từng video
    currentState = PlayerState.IDLE;
    hasLoggedMainVideo = false;
    processor.resetState();

    if (isNewVideo) {
      activePlayerElement = null;
      activeVideoElement = null;
    }

    bindElements();
    scheduleScan();
  });

  // 11. Khởi tạo Observer quan sát DOM
  function startObserver() {
    if (domObserver) domObserver.disconnect();

    const target = document.getElementById('content') || document.body || document.documentElement;
    domObserver = new MutationObserver(() => {
      scheduleScan();
    });

    domObserver.observe(target, {
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'src']
    });
  }

  // 12. Khởi động
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindElements();
      startObserver();
      scheduleScan();
    });
  } else {
    bindElements();
    startObserver();
    scheduleScan();
  }

  // 13. Phản hồi thông tin tới Popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'GET_TAB_STATUS') {
        const { player } = detector.getPlayerAndVideo();
        sendResponse({
          active: settings.masterEnabled !== false,
          isYouTube: true,
          isAdActive: detector.isVideoAdActive(player),
          currentState: currentState,
          url: window.location.href,
          videoId: navigation.currentVideoId
        });
        return true;
      }
    });
  }
})();
