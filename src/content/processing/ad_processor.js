/**
 * YouTube Ad-Shield Pro - Ad Processor Module (Isolated World)
 *
 * Xử lý quảng cáo với nguyên tắc bảo vệ tuyệt đối Main Video:
 * 1. Gửi tín hiệu sang Main World để gọi player.skipAd() API
 * 2. Click nút Skip Ad với chuỗi sự kiện chuột hoàn chỉnh
 * 3. Tắt tiếng video ad ngay lập tức
 * 4. Tăng tốc độ phát ad lên max để ad kết thúc nhanh nhất có thể
 * 5. TUYỆT ĐỐI KHÔNG can thiệp video.currentTime
 * 6. TUYỆT ĐỐI KHÔNG phát sự kiện 'ended'
 * 7. Khôi phục hoàn toàn tốc độ và âm lượng ban đầu khi ad kết thúc
 */

class AdProcessor {
  /**
   * @param {(duration: number) => void} onAdBlockedCallback
   */
  constructor(onAdBlockedCallback) {
    this.onAdBlockedCallback = onAdBlockedCallback;
    this.lastHandledTimestamp = 0;
    this.isHandlingAd = false;
    this.userPlaybackRate = 1.0;
    this.userWasMuted = false;
  }

  /**
   * Xử lý khi phát hiện quảng cáo đang chạy
   * @param {HTMLVideoElement|null} video
   * @param {HTMLElement|null} player
   * @param {Element|null} skipBtn
   */
  handleAdStart(video, player, skipBtn) {
    // 1. Gửi tín hiệu sang Main World để gọi player.skipAd()
    try {
      window.dispatchEvent(new CustomEvent('yt-adshield-request-skip'));
    } catch (_) {}

    // 2. Click nút Skip Ad
    const targetBtn = skipBtn || this._findSkipButton(player);
    if (targetBtn) {
      this._clickElement(targetBtn);
    }

    // 3. Đóng overlay quảng cáo nếu có
    this._closeOverlays(player);

    // 4. Xử lý video element (TUYỆT ĐỐI KHÔNG chạm currentTime)
    if (video) {
      try {
        // Lưu trạng thái user lần đầu
        if (!this.isHandlingAd) {
          this.isHandlingAd = true;
          const currentRate = video.playbackRate;
          // Chỉ lưu nếu là rate hợp lý (do user chọn, không phải rate do mình set)
          this.userPlaybackRate = (currentRate > 0 && currentRate <= 4) ? currentRate : 1.0;
          this.userWasMuted = video.muted;
        }

        // Mute quảng cáo
        if (!video.muted) video.muted = true;

        // Tăng tốc tối đa (YouTube/browser sẽ clamp nếu vượt quá giới hạn)
        if (video.playbackRate < 16) {
          video.playbackRate = 16;
        }
      } catch (_) {}
    }

    // 5. Ghi nhận thống kê (throttle 1.5s)
    this._reportBlocked();
  }

  /**
   * Khôi phục trạng thái khi quảng cáo kết thúc
   * @param {HTMLVideoElement|null} video
   */
  handleAdEnd(video) {
    if (!this.isHandlingAd) return;
    this.isHandlingAd = false;

    if (video) {
      try {
        // Khôi phục playbackRate
        const targetRate = (this.userPlaybackRate > 0 && this.userPlaybackRate <= 4)
          ? this.userPlaybackRate
          : 1.0;
        if (video.playbackRate !== targetRate) {
          video.playbackRate = targetRate;
        }

        // Khôi phục âm thanh
        if (!this.userWasMuted && video.muted) {
          video.muted = false;
        }
      } catch (_) {}
    }
  }

  /**
   * Xử lý khi ad được ngăn chặn ở tầng network (pre-stream)
   * @param {string} _source
   */
  handleAdPrevented(_source) {
    this._reportBlocked();
  }

  /**
   * Tự động cuộn qua video Shorts được tài trợ
   * @param {{ activeShort: Element, downBtn: Element|null }|null} shortData
   */
   skipSponsoredShort(shortData) {
    if (shortData && shortData.downBtn) {
      try {
        /** @type {HTMLElement} */ (shortData.downBtn).click();
      } catch (_) {}
    }
  }

  /**
   * Gỡ bỏ dialog Anti-Adblock và mở khóa cuộn trang
   * @param {Element[]} dialogs
   * @param {Element[]} backdrops
   */
  neutralizeAntiAdblock(dialogs, backdrops) {
    if (Array.isArray(dialogs) && dialogs.length > 0) {
      for (const d of dialogs) {
        try { if (d && d.remove) d.remove(); } catch (_) {}
      }

      // Mở khóa cuộn trang
      try {
        document.documentElement.classList.add('yt-adshield-unlocked');
        document.body.style.overflow = 'auto';
      } catch (_) {}
    }

    if (Array.isArray(backdrops) && backdrops.length > 0) {
      for (const b of backdrops) {
        try {
          const hasEnforcement = document.querySelector('ytd-enforcement-message-view-model');
          if ((b && b.classList && b.classList.contains('opened')) || hasEnforcement) {
            b.remove();
          }
        } catch (_) {}
      }
    }
  }

  /**
   * Reset toàn bộ trạng thái
   */
  resetState() {
    this.lastHandledTimestamp = 0;
    this.isHandlingAd = false;
    this.userPlaybackRate = 1.0;
    this.userWasMuted = false;
  }

  // ===========================
  // PRIVATE METHODS
  // ===========================

  /**
   * Tìm nút skip trong player
   * @param {HTMLElement|null} player
   * @returns {Element|null}
   */
  _findSkipButton(player) {
    if (!player) return null;

    const selectors = [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button-text',
      '.ytp-ad-skip-button-container button',
      '.ytp-ad-skip-button-slot button',
      'button[id^="skip-button"]'
    ];

    for (const sel of selectors) {
      const btn = /** @type {HTMLElement|null} */ (player.querySelector(sel));
      if (btn && btn.offsetParent !== null) return btn;
    }

    return null;
  }

  /**
   * Click element với chuỗi sự kiện chuột hoàn chỉnh
   * @param {Element} el
   */
  _clickElement(el) {
    if (!el) return;

    try {
      // Dispatch chuỗi sự kiện đầy đủ
      if (typeof AdShieldDOM !== 'undefined' && typeof AdShieldDOM.dispatchFullClick === 'function') {
        AdShieldDOM.dispatchFullClick(el);
      } else {
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }
    } catch (_) {}

    // Fallback native click
    try { const h = /** @type {HTMLElement} */ (el); if (typeof h.click === 'function') h.click(); } catch (_) {}
  }

  /**
   * Đóng các overlay banner che màn hình
   * @param {HTMLElement|null} player
   */
  _closeOverlays(player) {
    if (!player) return;
    try {
      const closeBtn = /** @type {HTMLElement|null} */ (player.querySelector('.ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container button'));
      if (closeBtn) closeBtn.click();
    } catch (_) {}
  }

  /**
   * Ghi nhận thống kê quảng cáo (throttle 1.5s)
   */
  _reportBlocked() {
    const now = Date.now();
    if (now - this.lastHandledTimestamp > 1500) {
      this.lastHandledTimestamp = now;
      if (typeof this.onAdBlockedCallback === 'function') {
        try { this.onAdBlockedCallback(15); } catch (_) {}
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.AdProcessor = AdProcessor;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdProcessor;
}
