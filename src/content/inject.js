/**
 * YouTube Ad-Shield Pro - Main World Injection Script (Pre-Stream Prevention Engine)
 * Xử lý quảng cáo ở tầng sâu nhất: Chặn và lọc sạch metadata quảng cáo TRƯỚC KHI player kịp nạp stream
 *
 * TUYỆT ĐỐI KHÔNG can thiệp vào video element:
 * - Không tua currentTime
 * - Không đổi playbackRate
 * - Không bấm Skip / Next
 * - Không pause / play
 */

(function () {
  'use strict';

  if (window.__yt_adshield_injected__) return;
  window.__yt_adshield_injected__ = true;

  const AD_KEYS = [
    'adPlacements',
    'playerAds',
    'adSlots',
    'adBreakHeartbeatParams',
    'adPlacementConfig'
  ];

  /**
   * Thông báo tới Isolated World để ghi nhận thống kê và xuất log
   * @param {string} source
   */
  function notifyAdPrevented(source) {
    try {
      window.dispatchEvent(
        new CustomEvent('yt-adshield-prevented', {
          detail: { source, timestamp: Date.now() }
        })
      );
    } catch (e) {}
  }

  /**
   * Lọc sạch toàn bộ các thuộc tính quảng cáo trong Player Response
   * Khi YouTube Player nhận được response không có adPlacements/playerAds,
   * Player sẽ xác định video không có quảng cáo và phát trực tiếp video chính tại 0:00
   * @param {any} target
   * @param {string} source
   * @returns {any}
   */
  function sanitizePlayerResponse(target, source = 'unknown') {
    if (!target || typeof target !== 'object') return target;

    let hadAd = false;

    // 1. Loại bỏ các danh mục quảng cáo chính
    for (const key of AD_KEYS) {
      if (key in target) {
        hadAd = true;
        try {
          delete target[key];
        } catch (e) {
          target[key] = undefined;
        }
      }
    }

    // 2. Loại bỏ cấu hình adConfig trong playerConfig nếu có
    if (target.playerConfig && typeof target.playerConfig === 'object') {
      if (target.playerConfig.adConfig) {
        hadAd = true;
        try {
          delete target.playerConfig.adConfig;
        } catch (e) {
          target.playerConfig.adConfig = undefined;
        }
      }
    }

    // 3. Xóa các URL theo dõi quảng cáo (tracking pings)
    if (target.playbackTracking && typeof target.playbackTracking === 'object') {
      const tracking = target.playbackTracking;
      const adTrackingUrls = [
        'videostatsPlaybackUrl',
        'videostatsDelayplayUrl',
        'videostatsWatchtimeUrl',
        'ptrackingUrl',
        'qoeUrl'
      ];
      for (const tKey of adTrackingUrls) {
        if (tracking[tKey] && typeof tracking[tKey].baseUrl === 'string' && tracking[tKey].baseUrl.includes('pagead')) {
          delete tracking[tKey];
        }
      }
    }

    if (hadAd) {
      notifyAdPrevented(source);
    }

    return target;
  }

  // =========================================================================
  // 1. Can thiệp window.ytInitialPlayerResponse (Tải ban đầu khi mở/reload trang)
  // =========================================================================
  let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;

  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    configurable: true,
    enumerable: true,
    get() {
      return _ytInitialPlayerResponse;
    },
    set(value) {
      _ytInitialPlayerResponse = sanitizePlayerResponse(value, 'ytInitialPlayerResponse');
    }
  });

  if (window.ytInitialPlayerResponse) {
    _ytInitialPlayerResponse = sanitizePlayerResponse(window.ytInitialPlayerResponse, 'initial_existing');
  }

  // =========================================================================
  // 2. Can thiệp window.fetch (SPA Navigation: Click video khác, Playlist next)
  // =========================================================================
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');

    // YouTube SPA gọi endpoint này để lấy stream video và danh sách ad breaks
    if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
      try {
        const response = await originalFetch.apply(this, args);
        const clone = response.clone();
        const json = await clone.json();
        const cleaned = sanitizePlayerResponse(json, 'fetch_player_api');

        return new Response(JSON.stringify(cleaned), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (err) {
        return originalFetch.apply(this, args);
      }
    }

    return originalFetch.apply(this, args);
  };

  // =========================================================================
  // 3. Can thiệp XMLHttpRequest (Dự phòng cho các client XHR hoặc YouTube Embeds)
  // =========================================================================
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._adshield_url = typeof url === 'string' ? url : '';
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._adshield_url && this._adshield_url.includes('/youtubei/v1/player')) {
      this.addEventListener('readystatechange', function () {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const data = JSON.parse(this.responseText);
            const sanitized = sanitizePlayerResponse(data, 'xhr_player_api');
            Object.defineProperty(this, 'responseText', {
              configurable: true,
              value: JSON.stringify(sanitized)
            });
            Object.defineProperty(this, 'response', {
              configurable: true,
              value: JSON.stringify(sanitized)
            });
          } catch (e) {}
        }
      });
    }
    return originalSend.apply(this, args);
  };

  // =========================================================================
  // 4. Can thiệp JSON.parse (Dự phòng cho raw_player_response)
  // =========================================================================
  const originalJsonParse = JSON.parse;
  JSON.parse = function (...args) {
    const result = originalJsonParse.apply(this, args);
    try {
      if (result && typeof result === 'object') {
        if (result.adPlacements || result.playerAds || result.adSlots) {
          sanitizePlayerResponse(result, 'json_parse');
        }
      }
    } catch (e) {}
    return result;
  };

})();
