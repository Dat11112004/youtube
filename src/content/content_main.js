/**
 * YouTube Ad-Shield Pro - Content Script Orchestrator
 * Quản lý chu trình và State Machine bảo vệ Main Video:
 * IDLE -> MAIN_VIDEO_PLAYING -> ADVERTISEMENT_DETECTED -> ADVERTISEMENT_HANDLED -> MAIN_VIDEO_PLAYING
 *
 * TUYỆT ĐỐI KHÔNG CÓ FLOW SANG NEXT VIDEO
 */

(function () {
  'use strict';

  if (window.__yt_adshield_orchestrator__) return;
  window.__yt_adshield_orchestrator__ = true;

  // 1. Định nghĩa State Machine
  const PlayerState = {
    IDLE: 'IDLE',
    MAIN_VIDEO_PLAYING: 'MAIN_VIDEO_PLAYING',
    ADVERTISEMENT_DETECTED: 'ADVERTISEMENT_DETECTED',
    ADVERTISEMENT_HANDLED: 'ADVERTISEMENT_HANDLED'
  };

  let currentState = PlayerState.IDLE;

  // 2. Khởi tạo các module chuyên trách
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

  // 3. Trạng thái cấu hình runtime
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
  let playerClassObserver = null;

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

  // 4. Chu kỳ kiểm tra và State Machine Transition
  function executeScanCycle() {
    if (!settings.masterEnabled) return;

    bindElements();

    const { player, video } = detector.getPlayerAndVideo();

    // Xử lý Video Ads theo State Machine nghiêm ngặt
    if (settings.skipVideoAds && video && player) {
      const isAdActive = detector.isVideoAdActive(player);

      if (isAdActive) {
        // TÌNH HUỐNG 1: Phát hiện quảng cáo
        if (currentState !== PlayerState.ADVERTISEMENT_DETECTED) {
          currentState = PlayerState.ADVERTISEMENT_DETECTED;
        }
        const skipBtn = detector.findSkipButton();
        processor.handleAdStart(video, player, skipBtn);
      } else {
        // TÌNH HUỐNG 2: Video bình thường (Không có quảng cáo)
        if (currentState === PlayerState.ADVERTISEMENT_DETECTED) {
          // Chuyển từ AD sang MAIN VIDEO
          currentState = PlayerState.ADVERTISEMENT_HANDLED;
          processor.handleAdEnd(video);
          currentState = PlayerState.MAIN_VIDEO_PLAYING;
        } else if (currentState === PlayerState.IDLE) {
          // Lần đầu mở video và video không có quảng cáo
          currentState = PlayerState.MAIN_VIDEO_PLAYING;
          if (typeof AdShieldLogger !== 'undefined') {
            AdShieldLogger.log('Main video detected', `(Video ID: ${navigation.currentVideoId || 'watch'})`);
            AdShieldLogger.log('Main video preserved', '(No ad detected, playing normally without interference)');
          }
        }
        // Khi ở MAIN_VIDEO_PLAYING: TUYỆT ĐỐI KHÔNG TÁC ĐỘNG VÀO VIDEO PLAYER!
      }
    }

    // Xử lý Anti-Adblock modal
    if (settings.antiAdblock) {
      const dialogs = detector.findAntiAdblockDialogs();
      const backdrops = settings.removeBackdrops ? detector.findBackdrops() : [];
      if (dialogs.length > 0 || backdrops.length > 0) {
        processor.neutralizeAntiAdblock(dialogs, backdrops, video);
      }
    }

    // Xử lý Shorts Ads (Chỉ chạy trên URL /shorts/)
    if (settings.blockShorts && window.location.pathname.startsWith('/shorts/')) {
      const shortData = detector.detectSponsoredShort();
      if (shortData) {
        processor.skipSponsoredShort(shortData);
      }
    }
  }

  // 5. Gắn kết trực tiếp thẻ Player và Video để bắt mid-roll ads ngay lập tức
  function onVideoTimeUpdate() {
    if (!settings.masterEnabled || !settings.skipVideoAds) return;
    const { player, video } = detector.getPlayerAndVideo();
    if (!player || !video) return;

    const isAdActive = detector.isVideoAdActive(player);

    if (isAdActive) {
      if (currentState !== PlayerState.ADVERTISEMENT_DETECTED) {
        currentState = PlayerState.ADVERTISEMENT_DETECTED;
      }
      const skipBtn = detector.findSkipButton();
      processor.handleAdStart(video, player, skipBtn);
    } else if (currentState === PlayerState.ADVERTISEMENT_DETECTED) {
      currentState = PlayerState.ADVERTISEMENT_HANDLED;
      processor.handleAdEnd(video);
      currentState = PlayerState.MAIN_VIDEO_PLAYING;
    }
  }

  function bindElements() {
    const { player, video } = detector.getPlayerAndVideo();

    if (player && player !== activePlayerElement) {
      activePlayerElement = player;

      if (playerClassObserver) {
        playerClassObserver.disconnect();
      }
      // Chỉ quan sát sự thay đổi class trên player để bắt ad-showing
      playerClassObserver = new MutationObserver(() => scheduleScan());
      playerClassObserver.observe(player, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    if (video && video !== activeVideoElement) {
      if (activeVideoElement) {
        activeVideoElement.removeEventListener('timeupdate', onVideoTimeUpdate);
      }
      activeVideoElement = video;
      activeVideoElement.addEventListener('timeupdate', onVideoTimeUpdate);
    }
  }

  // 6. Cập nhật DOM Class tương ứng với trạng thái Master
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

  // 7. Tải và lắng nghe cài đặt từ chrome.storage
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
          if (!isEnabled) {
            processor.handleAdEnd(activeVideoElement);
          }
        }
        scheduleScan();
      }
    });
  }

  // 8. Kết nối Navigation Watcher
  navigation.onNavigate(({ url, videoId, isNewVideo }) => {
    if (typeof AdShieldLogger !== 'undefined') {
      AdShieldLogger.log('YouTube navigation detected', `(URL: ${url})`);
    }

    // Nếu trước đó đang trong trạng thái xử lý ad, khôi phục ngay
    if (currentState === PlayerState.ADVERTISEMENT_DETECTED) {
      processor.handleAdEnd(activeVideoElement);
    }

    // Reset về IDLE cho video mới
    currentState = PlayerState.IDLE;
    processor.resetState();

    if (isNewVideo) {
      activePlayerElement = null;
      activeVideoElement = null;
    }

    bindElements();
    scheduleScan();
  });

  // 9. Khởi tạo Observer quan sát DOM có giới hạn (Chỉ thẻ #content)
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

  // 10. Khởi động
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

  // 11. Phản hồi thông tin tới Popup
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
