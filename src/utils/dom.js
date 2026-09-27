/**
 * YouTube Ad-Shield Pro - DOM Helper Utility
 * Chứa các hàm hỗ trợ tương tác DOM an toàn, mô phỏng sự kiện chuột và kiểm tra khả năng hiển thị
 */

const AdShieldDOM = (function () {
  return {
    /**
     * Kiểm tra phần tử có đang hiển thị thực tế trên màn hình hay không
     * @param {Element|null} el
     * @returns {boolean}
     */
    isVisible(el) {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    },

    /**
     * Mô phỏng chuỗi sự kiện chuột hoàn chỉnh: pointerdown -> mousedown -> pointerup -> mouseup -> click
     * YouTube Player yêu cầu đầy đủ chuỗi sự kiện này để kích hoạt nút Skip
     * @param {Element|null} el
     */
    dispatchFullClick(el) {
      if (!el) return;
      try {
        const eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        for (const type of eventTypes) {
          el.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              buttons: 1
            })
          );
        }
        if (typeof el.click === 'function') {
          el.click();
        }
      } catch (err) {
        if (typeof AdShieldLogger !== 'undefined') {
          AdShieldLogger.error('Lỗi khi dispatch sự kiện click:', err);
        }
      }
    },

    /**
     * Tìm phần tử an toàn, tránh văng exception khi selector không hợp lệ
     * @param {string} selector
     * @param {Element|Document} context
     * @returns {Element|null}
     */
    query(selector, context = document) {
      try {
        return context.querySelector(selector);
      } catch (e) {
        return null;
      }
    },

    /**
     * Tìm danh sách phần tử an toàn
     * @param {string} selector
     * @param {Element|Document} context
     * @returns {Element[]}
     */
    queryAll(selector, context = document) {
      try {
        return Array.from(context.querySelectorAll(selector));
      } catch (e) {
        return [];
      }
    },

    /**
     * Tạo hàm throttle dựa trên requestAnimationFrame
     * @param {Function} callback
     * @returns {() => void}
     */
    createRafThrottle(callback) {
      let isScheduled = false;
      return function () {
        if (isScheduled) return;
        isScheduled = true;
        requestAnimationFrame(() => {
          isScheduled = false;
          callback();
        });
      };
    }
  };
})();

if (typeof window !== 'undefined') {
  window.AdShieldDOM = AdShieldDOM;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdShieldDOM;
}
