/**
 * YouTube Ad-Shield Pro - Main World Injection Script
 * Chạy ở MAIN world để truy cập trực tiếp YouTube Player API và can thiệp network responses.
 *
 * Kiến trúc:
 * 1. Sanitize ytInitialPlayerResponse trước khi player khởi tạo
 * 2. Intercept fetch/XHR để loại bỏ ad metadata từ /youtubei/v1/player responses
 * 3. Intercept JSON.parse để chặn raw_player_response chứa ad data
 * 4. Gọi player.skipAd() và player.cancelPlayback() từ MAIN world
 * 5. Điều phối video element: mute + speed up ad (KHÔNG BAO GIỜ chạm currentTime)
 */

(function () {
  'use strict';

  if (window.__yt_adshield_injected__) return;
  window.__yt_adshield_injected__ = true;

  // =====================================================
  // CONSTANTS
  // =====================================================

  /** Các key chứa ad metadata trong YouTube Player Response */
  const AD_KEYS = [
    'adPlacements',
    'playerAds',
    'adSlots',
    'adBreakHeartbeatParams',
    'adPlacementConfig',
    'adBreakResponse',
    'adBreakService',
    'adThrottled',
    'adBreakParams'
  ];

  /**
   * YouTube giới hạn playbackRate tối đa là 16 trên Chrome (HTMLMediaElement spec).
   * Tuy nhiên một số video chỉ cho tối đa 2.0. Ta thử 16 trước, nếu không được thì giảm dần.
   */
  const AD_SPEEDUP_RATE = 16;

  // =====================================================
  // UTILITIES
  // =====================================================

  /**
   * Gửi event tới Isolated World (content_main.js) để ghi nhận thống kê
   * @param {string} source
   */
  function notifyAdPrevented(source) {
    try {
      window.dispatchEvent(
        new CustomEvent('yt-adshield-prevented', {
          detail: { source, timestamp: Date.now() }
        })
      );
    } catch (_) {}
  }

  /**
   * Lọc sạch toàn bộ các thuộc tính quảng cáo khỏi Player Response object
   * Đệ quy xử lý nested objects (playerResponse, playerConfig, streamingData, playbackTracking)
   *
   * @param {any} target - Object cần sanitize
   * @param {string} source - Nguồn gốc để log
   * @returns {any} - Object đã được sanitize
   */
  function sanitizePlayerResponse(target, source) {
    if (!target || typeof target !== 'object') return target;

    let hadAd = false;

    // 1. Xóa các key ad chính
    for (const key of AD_KEYS) {
      if (key in target) {
        hadAd = true;
        try { delete target[key]; } catch (_) { target[key] = undefined; }
      }
    }

    // 2. Xử lý nested playerResponse
    if (target.playerResponse && typeof target.playerResponse === 'object') {
      sanitizePlayerResponse(target.playerResponse, source + '/nested');
    }

    // 3. Xóa adConfig trong playerConfig
    if (target.playerConfig && typeof target.playerConfig === 'object') {
      if (target.playerConfig.adConfig) {
        hadAd = true;
        try { delete target.playerConfig.adConfig; } catch (_) { target.playerConfig.adConfig = undefined; }
      }
    }

    // 4. Xóa adBreakParams trong streamingData
    if (target.streamingData && typeof target.streamingData === 'object') {
      if (target.streamingData.adBreakParams) {
        hadAd = true;
        try { delete target.streamingData.adBreakParams; } catch (_) {}
      }
    }

    // 5. Xóa tracking URLs liên quan đến pagead
    if (target.playbackTracking && typeof target.playbackTracking === 'object') {
      const tracking = target.playbackTracking;
      for (const tKey of Object.keys(tracking)) {
        if (tracking[tKey] && typeof tracking[tKey].baseUrl === 'string' && tracking[tKey].baseUrl.includes('pagead')) {
          try { delete tracking[tKey]; } catch (_) {}
        }
      }
    }

    if (hadAd) {
      notifyAdPrevented(source);
    }

    return target;
  }

  // =====================================================
  // 1. INTERCEPT ytInitialPlayerResponse (page load)
  // =====================================================
  try {
    let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;

    if (_ytInitialPlayerResponse) {
      _ytInitialPlayerResponse = sanitizePlayerResponse(_ytInitialPlayerResponse, 'initial_existing');
    }

    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: true,
      get() { return _ytInitialPlayerResponse; },
      set(value) {
        _ytInitialPlayerResponse = sanitizePlayerResponse(value, 'ytInitialPlayerResponse_set');
      }
    });
  } catch (_) {
    // Fallback nếu defineProperty thất bại
    if (window.ytInitialPlayerResponse) {
      try { sanitizePlayerResponse(window.ytInitialPlayerResponse, 'initial_fallback'); } catch (__) {}
    }
  }

  // =====================================================
  // 2. INTERCEPT fetch() - YouTube SPA navigation
  // =====================================================
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : (request && /** @type {any} */ (request).url ? /** @type {any} */ (request).url : '');

    if (typeof url === 'string') {
      // Chặn hoàn toàn các request chuyên tải ad
      if (url.includes('/youtubei/v1/player/ad_break') || url.includes('/youtubei/v1/get_midroll_info')) {
        notifyAdPrevented('blocked_fetch_' + (url.includes('ad_break') ? 'ad_break' : 'midroll'));
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Lọc ad data từ player API response
      if (url.includes('/youtubei/v1/player') && !url.includes('/ad_break')) {
        const response = await originalFetch.apply(this, args);

        try {
          const clone = response.clone();
          const text = await clone.text();

          // Kiểm tra xem response có phải JSON không trước khi parse
          if (text && text.charAt(0) === '{') {
            const json = JSON.parse(text);
            const cleaned = sanitizePlayerResponse(json, 'fetch_player');

            return new Response(JSON.stringify(cleaned), {
              status: response.status,
              statusText: response.statusText,
              headers: new Headers({
                'content-type': 'application/json; charset=UTF-8'
              })
            });
          }
        } catch (_) {
          // Nếu parse thất bại (binary/protobuf), trả về response gốc
        }

        return response;
      }
    }

    return originalFetch.apply(this, args);
  };

  // =====================================================
  // 3. INTERCEPT XMLHttpRequest (fallback/embeds)
  // =====================================================
  const xhrProto = XMLHttpRequest.prototype;
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;

  xhrProto.open = function (method, url, ...rest) {
    /** @type {any} */ (this).__adshield_url = typeof url === 'string' ? url : '';
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  xhrProto.send = function (...args) {
    const url = /** @type {any} */ (this).__adshield_url;

    if (url && url.includes('/youtubei/v1/player') && !url.includes('/ad_break')) {
      this.addEventListener('readystatechange', function handler() {
        if (this.readyState !== 4 || this.status !== 200) return;

        try {
          const rawText = this.responseText;
          if (!rawText || rawText.charAt(0) !== '{') return;

          const data = JSON.parse(rawText);
          const sanitized = sanitizePlayerResponse(data, 'xhr_player');
          const sanitizedText = JSON.stringify(sanitized);

          // Override response properties
          Object.defineProperty(this, 'responseText', { configurable: true, get: () => sanitizedText });
          Object.defineProperty(this, 'response', {
            configurable: true,
            get: () => this.responseType === 'json' ? sanitized : sanitizedText
          });
        } catch (_) {}
      });
    }

    return originalSend.apply(this, args);
  };

  // =====================================================
  // 4. INTERCEPT JSON.parse (raw_player_response fallback)
  // =====================================================
  const originalJsonParse = JSON.parse;

  JSON.parse = function (text, reviver) {
    const result = originalJsonParse.call(this, text, reviver);

    try {
      if (result && typeof result === 'object' && (result.adPlacements || result.playerAds || result.adSlots)) {
        sanitizePlayerResponse(result, 'json_parse');
      }
    } catch (_) {}

    return result;
  };

  // =====================================================
  // 5. MAIN WORLD AD SKIPPER ENGINE
  // Chạy mỗi 100ms để phát hiện và xử lý ad đang phát
  // =====================================================

  /** Lưu trạng thái playback của user trước khi ad chạy */
  let savedUserRate = 1;
  let savedUserMuted = false;
  let isProcessingAd = false;

  /**
   * Tìm YouTube Player element
   * @returns {HTMLElement|null}
   */
  function getPlayer() {
    return /** @type {HTMLElement|null} */ (document.getElementById('movie_player') || document.querySelector('.html5-video-player'));
  }

  /**
   * Kiểm tra player có đang hiển thị ad không
   * @param {HTMLElement} player
   * @returns {boolean}
   */
  function isAdActive(player) {
    if (!player) return false;

    // YouTube thêm class 'ad-showing' hoặc 'ad-interrupting' khi ad đang phát
    if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
      return true;
    }

    // Fallback: Kiểm tra qua API nội bộ
    try {
      const p = /** @type {any} */ (player);
      if (typeof p.getAdState === 'function') {
        const state = p.getAdState();
        if (typeof state === 'number' && state > 0) return true;
      }
    } catch (_) {}

    return false;
  }

  /**
   * Tìm và click nút skip ad
   * @param {HTMLElement} player
   * @returns {boolean} true nếu đã click được
   */
  function trySkipAd(player) {
    let clicked = false;

    // 1. Click nút skip trong DOM nếu có
    const skipSelectors = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button-text',
      '.ytp-ad-skip-button-container button',
      '.ytp-ad-skip-button-slot button',
      'button[id^="skip-button"]'
    ];

    for (const sel of skipSelectors) {
      const btn = /** @type {HTMLElement|null} */ (player.querySelector(sel));
      if (btn && btn.offsetParent !== null) {
        dispatchClickSequence(btn);
        clicked = true;
        break;
      }
    }

    // 2. Gọi player.skipAd() API trực tiếp song song
    try {
      const p = /** @type {any} */ (player);
      if (typeof p.skipAd === 'function') {
        p.skipAd();
        clicked = true;
      }
    } catch (_) {}

    return clicked;
  }

  /**
   * Dispatch chuỗi sự kiện chuột hoàn chỉnh lên element
   * YouTube player yêu cầu đầy đủ pointer/mouse events để kích hoạt skip
   * @param {Element} el
   */
  function dispatchClickSequence(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    } catch (_) {}
    // Native click fallback
    try { const h = /** @type {HTMLElement} */ (el); if (typeof h.click === 'function') h.click(); } catch (_) {}
  }

  /**
   * Đóng các overlay/close button của ad banner
   * @param {HTMLElement} player
   */
  function closeAdOverlays(player) {
    const closeSelectors = [
      '.ytp-ad-overlay-close-button',
      '.ytp-ad-overlay-close-container button'
    ];
    for (const sel of closeSelectors) {
      const btn = /** @type {HTMLElement|null} */ (player.querySelector(sel));
      if (btn) {
        try { btn.click(); } catch (_) {}
      }
    }
  }

  /**
   * Core processing loop - chạy mỗi 100ms
   * Xử lý ad đang phát trong player bằng nhiều phương pháp đồng thời
   */
  function processAd() {
    const player = getPlayer();
    if (!player) return;

    const adActive = isAdActive(player);
    const video = player.querySelector('video');

    if (adActive) {
      // === AD ĐANG PHÁT ===

      // Lưu trạng thái user nếu chưa lưu
      if (!isProcessingAd && video) {
        isProcessingAd = true;
        const rate = video.playbackRate;
        // Chỉ lưu nếu rate hợp lý (không phải rate do chính mình set)
        savedUserRate = (rate > 0 && rate <= 4) ? rate : 1;
        savedUserMuted = video.muted;
      }

      // 1. Thử skip ngay
      trySkipAd(player);

      // 2. Đóng overlay ads
      closeAdOverlays(player);

      // 3. Mute + tăng tốc video ad (KHÔNG chạm currentTime)
      if (video) {
        try {
          if (!video.muted) video.muted = true;

          // YouTube cho phép playbackRate tối đa phụ thuộc vào codec.
          // Thử set cao trước, nếu browser clamp xuống thì chấp nhận.
          if (video.playbackRate < AD_SPEEDUP_RATE) {
            video.playbackRate = AD_SPEEDUP_RATE;
          }
        } catch (_) {}
      }

    } else {
      // === KHÔNG CÓ AD - Khôi phục trạng thái ===

      if (isProcessingAd && video) {
        isProcessingAd = false;
        try {
          // Khôi phục playbackRate gốc
          const targetRate = (savedUserRate > 0 && savedUserRate <= 4) ? savedUserRate : 1;
          if (video.playbackRate !== targetRate) {
            video.playbackRate = targetRate;
          }

          // Khôi phục muted state
          if (!savedUserMuted && video.muted) {
            video.muted = false;
          }
        } catch (_) {}
      }
    }
  }

  // Chạy loop mỗi 100ms
  setInterval(processAd, 100);

  // Lắng nghe tín hiệu từ content_main.js để trigger skip ngay lập tức
  window.addEventListener('yt-adshield-request-skip', processAd);

})();
