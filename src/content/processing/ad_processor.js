/**
 * YouTube Ad-Shield Pro - Ad Processor Module (Pre-Stream & Non-Invasive)
 *
 * TUYỆT ĐỐI TUÂN THỦ QUY TẮC BẢO VỆ VIDEO CHÍNH:
 * - KHÔNG tua video, KHÔNG đổi video.currentTime
 * - KHÔNG đổi video.playbackRate
 * - KHÔNG click nút Skip Ads
 * - KHÔNG click nút Next
 * - KHÔNG gọi video.play() hay video.pause()
 * - KHÔNG can thiệp luồng phát video chính
 *
 * Nhiệm vụ:
 * 1. Ghi nhận sự kiện quảng cáo bị ngăn chặn từ tầng mạng (Pre-Stream)
 * 2. Gỡ bỏ cảnh báo Anti-Adblock (nếu có) mà không can thiệp video
 */

class AdProcessor {
  /**
   * @param {(duration: number) => void} onAdBlockedCallback
   */
  constructor(onAdBlockedCallback) {
    this.onAdBlockedCallback = onAdBlockedCallback;
    this.lastHandledTimestamp = 0;
  }

  /**
   * Xử lý khi nhận được tín hiệu quảng cáo đã được ngăn chặn trước khi phát
   * @param {string} source
   */
  handleAdPrevented(source = 'network_pre_stream') {
    if (typeof AdShieldLogger !== 'undefined') {
      AdShieldLogger.log('Advertisement prevented', `(Pre-stream metadata filtered from: ${source})`);
      AdShieldLogger.log('Main video preserved', '(Main video plays directly at original speed, volume, and timeline)');
    }

    const now = Date.now();
    if (now - this.lastHandledTimestamp > 1000) {
      this.lastHandledTimestamp = now;
      if (typeof this.onAdBlockedCallback === 'function') {
        this.onAdBlockedCallback(15);
      }
    }
  }

  /**
   * Gỡ bỏ dialog Anti-Adblock và mở khóa cuộn trang (KHÔNG can thiệp video)
   * @param {Element[]} dialogs
   * @param {Element[]} backdrops
   */
  neutralizeAntiAdblock(dialogs, backdrops) {
    if (dialogs.length > 0) {
      dialogs.forEach((d) => d.remove());
      document.documentElement.classList.add('yt-adshield-unlocked');
      document.body.style.overflow = 'auto';

      if (typeof AdShieldLogger !== 'undefined') {
        AdShieldLogger.log('Anti-Adblock warning removed', '(Page scroll unlocked)');
      }
    }

    if (backdrops.length > 0) {
      backdrops.forEach((b) => {
        const hasEnforcement = typeof document !== 'undefined' && typeof document.querySelector === 'function' && !!document.querySelector('ytd-enforcement-message-view-model');
        if ((b.classList && b.classList.contains('opened')) || hasEnforcement) {
          b.remove();
        }
      });
    }
  }

  /**
   * Reset trạng thái
   */
  resetState() {
    this.lastHandledTimestamp = 0;
  }
}

if (typeof window !== 'undefined') {
  window.AdProcessor = AdProcessor;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdProcessor;
}
