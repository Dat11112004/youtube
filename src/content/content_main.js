/**
 * YouTube Ad-Shield Pro - Content Script Orchestrator (Isolated World)
 *
 * State Machine:
 *   IDLE -> MAIN_VIDEO_PLAYING <-> AD_DETECTED -> AD_HANDLED -> MAIN_VIDEO_PLAYING
 *
 * Vai trò:
 * - Phát hiện ad qua DOM (class ad-showing trên player)
 * - Điều phối AdProcessor để skip/mute/speed-up ad
 * - Lắng nghe event từ Main World (inject.js) khi ad bị chặn pre-stream
 * - Xử lý Anti-Adblock dialogs
 * - Xử lý Sponsored Shorts
 * - Đồng bộ settings từ chrome.storage
 * - Phản hồi popup qua chrome.runtime.onMessage
 */

(function () {
  'use strict';

  if (window.__yt_adshield_orchestrator__) return;
  window.__yt_adshield_orchestrator__ = true;

  // ==========================
  // STATE
  // ==========================
  const State = {
    IDLE: 'IDLE',
    PLAYING: 'PLAYING',
    AD_DETECTED: 'AD_DETECTED',
    AD_PREVENTED: 'AD_PREVENTED'
  };

  let currentState = State.IDLE;
  let hasLoggedMainVideo = false;

  // ==========================
  // MODULE INIT
  // ==========================
  const rules = typeof AdShieldRules !== 'undefined' ? AdShieldRules : {};
  const detector = new AdDetector(rules);

  const processor = new AdProcessor(function (durationSeconds) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'AD_BLOCKED', duration: durationSeconds });
      }
    } catch (_) {}
  });

  const navigation = new NavigationWatcher();

  // ==========================
  // SETTINGS
  // ==========================
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

  // ==========================
  // SCAN THROTTLE (RAF)
  // ==========================
  let scanScheduled = false;

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(function () {
      scanScheduled = false;
      runScan();
    });
  }

  // ==========================
  // MAIN WORLD EVENT LISTENER
  // ==========================
  window.addEventListener('yt-adshield-prevented', function (event) {
    if (!settings.masterEnabled) return;
    currentState = State.AD_PREVENTED;
    const customEvent = /** @type {CustomEvent} */ (event);
    processor.handleAdPrevented(customEvent.detail ? customEvent.detail.source : 'pre_stream');
    scheduleScan();
  });

  // ==========================
  // CORE SCAN CYCLE
  // ==========================
  function runScan() {
    if (!settings.masterEnabled) return;

    bindElements();

    const { player, video } = detector.getPlayerAndVideo();
    if (!video || !player) return;

    const isAd = detector.isVideoAdActive(player);

    if (isAd) {
      // === AD ĐANG PHÁT ===
      if (currentState !== State.AD_DETECTED) {
        currentState = State.AD_DETECTED;
      }

      if (settings.skipVideoAds) {
        const skipBtn = detector.findSkipButton();
        processor.handleAdStart(video, player, skipBtn);
      }
    } else {
      // === MAIN VIDEO ===
      if (currentState === State.AD_DETECTED || currentState === State.AD_PREVENTED) {
        // Vừa thoát khỏi ad -> khôi phục
        processor.handleAdEnd(video);
        currentState = State.PLAYING;
      } else if (!hasLoggedMainVideo) {
        hasLoggedMainVideo = true;
        currentState = State.PLAYING;
      }
    }

    // Anti-Adblock
    if (settings.antiAdblock) {
      const dialogs = detector.findAntiAdblockDialogs();
      const backdrops = settings.removeBackdrops ? detector.findBackdrops() : [];
      if (dialogs.length > 0 || backdrops.length > 0) {
        processor.neutralizeAntiAdblock(dialogs, backdrops);
      }
    }

    // Shorts
    if (settings.blockShorts && window.location.pathname.startsWith('/shorts/')) {
      const shortData = detector.detectSponsoredShort();
      if (shortData) {
        processor.skipSponsoredShort(shortData);
      }
    }
  }

  // ==========================
  // VIDEO TIMEUPDATE LISTENER
  // Bắt ad nhanh hơn DOM mutation
  // ==========================
  function onTimeUpdate() {
    if (!settings.masterEnabled || !settings.skipVideoAds) return;

    const { player, video } = detector.getPlayerAndVideo();
    if (!player || !video) return;

    if (detector.isVideoAdActive(player)) {
      if (currentState !== State.AD_DETECTED) {
        currentState = State.AD_DETECTED;
      }
      const skipBtn = detector.findSkipButton();
      processor.handleAdStart(video, player, skipBtn);
    } else if (currentState === State.AD_DETECTED) {
      processor.handleAdEnd(video);
      currentState = State.PLAYING;
    }
  }

  // ==========================
  // ELEMENT BINDING
  // ==========================
  function bindElements() {
    const { player, video } = detector.getPlayerAndVideo();

    if (player && player !== activePlayerElement) {
      activePlayerElement = player;

      // Observe class changes trên player (ad-showing được thêm/xóa tại đây)
      if (playerClassObserver) playerClassObserver.disconnect();
      playerClassObserver = new MutationObserver(scheduleScan);
      playerClassObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
    }

    if (video && video !== activeVideoElement) {
      if (activeVideoElement) {
        activeVideoElement.removeEventListener('timeupdate', onTimeUpdate);
      }
      activeVideoElement = video;
      activeVideoElement.addEventListener('timeupdate', onTimeUpdate);
      hasLoggedMainVideo = false;
    }
  }

  // ==========================
  // DOM CLASS MANAGEMENT
  // ==========================
  function updateDomClasses(isEnabled) {
    if (!isEnabled) {
      document.documentElement.classList.add('yt-adshield-disabled');
      document.documentElement.classList.remove('yt-adshield-unlocked');
    } else {
      document.documentElement.classList.remove('yt-adshield-disabled');
      document.documentElement.classList.add('yt-adshield-unlocked');
    }
  }

  // ==========================
  // SETTINGS LOAD
  // ==========================
  if (typeof getSettings === 'function') {
    getSettings().then(function (stored) {
      settings = Object.assign({}, settings, stored);
      updateDomClasses(settings.masterEnabled !== false);
      scheduleScan();
    });
  } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(null, function (stored) {
      settings = Object.assign({}, settings, stored);
      updateDomClasses(settings.masterEnabled !== false);
      scheduleScan();
    });
  }

  // Settings change listener
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;

      for (var key in changes) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          settings[key] = changes[key].newValue;
        }
      }

      if ('masterEnabled' in changes) {
        var isEnabled = changes.masterEnabled.newValue !== false;
        updateDomClasses(isEnabled);
        if (!isEnabled && activeVideoElement) {
          processor.handleAdEnd(activeVideoElement);
        }
      }
      scheduleScan();
    });
  }

  // ==========================
  // NAVIGATION WATCHER
  // ==========================
  navigation.onNavigate(function (data) {
    // Nếu đang xử lý ad mà user navigate đi -> khôi phục trạng thái
    if (currentState === State.AD_DETECTED && activeVideoElement) {
      processor.handleAdEnd(activeVideoElement);
    }

    currentState = State.IDLE;
    hasLoggedMainVideo = false;
    processor.resetState();

    if (data.isNewVideo) {
      activePlayerElement = null;
      activeVideoElement = null;
    }

    bindElements();
    scheduleScan();
  });

  // ==========================
  // DOM OBSERVER
  // ==========================
  function startObserver() {
    if (domObserver) domObserver.disconnect();

    var target = document.getElementById('content') || document.body || document.documentElement;
    domObserver = new MutationObserver(scheduleScan);
    domObserver.observe(target, {
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'src']
    });
  }

  // ==========================
  // BACKUP POLLING (400ms)
  // Chỉ trigger scan khi thực sự phát hiện ad, tránh CPU waste
  // ==========================
  setInterval(function () {
    if (!settings.masterEnabled || !settings.skipVideoAds) return;
    if (!window.location.pathname.includes('/watch')) return;

    var player = detector.getPlayerAndVideo().player;
    if (player && detector.isVideoAdActive(player)) {
      scheduleScan();
    }
  }, 400);

  // ==========================
  // BOOTSTRAP
  // ==========================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindElements();
      startObserver();
      scheduleScan();
    });
  } else {
    bindElements();
    startObserver();
    scheduleScan();
  }

  // ==========================
  // POPUP MESSAGE HANDLER
  // ==========================
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (request.action === 'GET_TAB_STATUS') {
        var result = detector.getPlayerAndVideo();
        sendResponse({
          active: settings.masterEnabled !== false,
          isYouTube: true,
          isAdActive: detector.isVideoAdActive(result.player),
          currentState: currentState,
          url: window.location.href,
          videoId: navigation.currentVideoId
        });
        return true;
      }
    });
  }
})();
