/**
 * YouTube Ad-Shield Pro - Navigation Watcher Module
 * Chuyên trách phát hiện chính xác mọi chuyển hướng trên YouTube SPA:
 * - Click video đề xuất / tìm kiếm
 * - Tự động nhảy video trong danh sách phát (Playlist)
 * - Nút Next / Previous trên Player
 * - Thay đổi URL qua History API (pushState/replaceState) mà không reload trang
 * - Đảm bảo dọn sạch timers/listeners khi điều hướng để tránh Memory Leak
 */

class NavigationWatcher {
  constructor() {
    this.currentUrl = window.location.href;
    this.currentVideoId = this.extractVideoId(this.currentUrl);
    this.callbacks = [];
    this.timerIds = [];
    this.isDestroyed = false;

    // Lưu trữ tham chiếu hàm gốc để có thể restore khi destroy
    this._originalPushState = history.pushState;
    this._originalReplaceState = history.replaceState;

    this.init();
  }

  /**
   * Trích xuất Video ID từ URL
   * @param {string} url
   * @returns {string|null}
   */
  extractVideoId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || null;
      }
    } catch (e) {}
    return null;
  }

  /**
   * Đăng ký callback nhận thông báo khi có điều hướng
   * @param {(data: import('../../types').NavigationEventData) => void} callback
   */
  onNavigate(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  /**
   * Phát thông báo tới các listeners
   * @param {boolean} isNewVideo
   */
  notify(isNewVideo = false) {
    if (this.isDestroyed) return;

    const data = {
      url: this.currentUrl,
      videoId: this.currentVideoId,
      isNewVideo
    };

    for (const cb of this.callbacks) {
      try {
        cb(data);
      } catch (err) {
        if (typeof AdShieldLogger !== 'undefined') {
          AdShieldLogger.error('Lỗi trong NavigationWatcher callback:', err);
        }
      }
    }
  }

  /**
   * Kiểm tra sự thay đổi URL
   */
  checkUrlChange() {
    if (this.isDestroyed) return;

    const newUrl = window.location.href;
    if (newUrl !== this.currentUrl) {
      const newVideoId = this.extractVideoId(newUrl);
      const isNewVideo = newVideoId !== null && newVideoId !== this.currentVideoId;

      this.currentUrl = newUrl;
      this.currentVideoId = newVideoId;

      this.handleNavigationDetected(isNewVideo);
    }
  }

  /**
   * Lên lịch quét tuần tự khi YouTube đang khởi tạo video player mới
   * @param {boolean} isNewVideo
   */
  handleNavigationDetected(isNewVideo) {
    this.clearTimers();
    this.notify(isNewVideo);

    // Kích hoạt chuỗi quét kiểm tra pre-roll ads khi YouTube nạp player
    const intervals = [50, 200, 500, 1000, 2000];
    intervals.forEach((delay) => {
      const t = setTimeout(() => {
        if (!this.isDestroyed) {
          this.notify(false);
        }
      }, delay);
      this.timerIds.push(t);
    });
  }

  /**
   * Xóa toàn bộ timers đang chờ
   */
  clearTimers() {
    this.timerIds.forEach(clearTimeout);
    this.timerIds = [];
  }

  init() {
    const onNavigationEvent = () => this.checkUrlChange();

    // 1. YouTube Custom SPA Navigation Events
    window.addEventListener('yt-navigate-start', onNavigationEvent);
    window.addEventListener('yt-navigate-finish', onNavigationEvent);
    window.addEventListener('yt-page-data-updated', onNavigationEvent);
    window.addEventListener('spfdone', onNavigationEvent);

    // 2. Trình duyệt chuẩn navigation events
    window.addEventListener('popstate', onNavigationEvent);
    window.addEventListener('hashchange', onNavigationEvent);

    // 3. Intercept History API
    const self = this;
    history.pushState = function (...args) {
      self._originalPushState.apply(this, args);
      self.checkUrlChange();
    };

    history.replaceState = function (...args) {
      self._originalReplaceState.apply(this, args);
      self.checkUrlChange();
    };

    // 4. Polling an toàn dự phòng mỗi 1000ms
    this.pollingInterval = setInterval(() => {
      this.checkUrlChange();
    }, 1000);
  }

  /**
   * Giải phóng tài nguyên và khôi phục hàm gốc
   */
  destroy() {
    this.isDestroyed = true;
    this.clearTimers();
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    history.pushState = this._originalPushState;
    history.replaceState = this._originalReplaceState;
    this.callbacks = [];
  }
}

if (typeof window !== 'undefined') {
  window.NavigationWatcher = NavigationWatcher;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NavigationWatcher;
}
