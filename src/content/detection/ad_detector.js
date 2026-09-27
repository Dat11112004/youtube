/**
 * YouTube Ad-Shield Pro - Ad Detector Module
 * Đảm nhiệm duy nhất vai trò PHÁT HIỆN:
 * - Phân biệt chính xác giữa MAIN_VIDEO (video người dùng mở) và ADVERTISEMENT (quảng cáo)
 * - Tuyệt đối không nhận diện nhầm video chính là quảng cáo
 * - Chỉ kiểm tra nút Skip trong container quảng cáo, loại trừ hoàn toàn nút Next/Prev của player
 */

class AdDetector {
  /**
   * @param {typeof import('../../types').RuleRegistry} rules
   */
  constructor(rules) {
    this.rules = rules || (typeof AdShieldRules !== 'undefined' ? AdShieldRules : {});
  }

  /**
   * Tìm và trả về phần tử Player và Video chính trên trang
   * @returns {{ player: HTMLElement | null, video: HTMLVideoElement | null }}
   */
  getPlayerAndVideo() {
    const player = document.querySelector('.html5-video-player') || document.getElementById('movie_player');
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    return {
      player: /** @type {HTMLElement|null} */ (player),
      video: /** @type {HTMLVideoElement|null} */ (video)
    };
  }

  /**
   * Kiểm tra xem video hiện tại có đang chiếu quảng cáo hay không
   * YÊU CẦU: Phải có dấu hiệu xác thực rõ ràng từ YouTube Player (ad-showing / ad-interrupting / getAdState > 0)
   * Tuyệt đối không dựa đơn thuần vào sự tồn tại của thẻ video hoặc container rỗng
   * @param {HTMLElement|null} player
   * @returns {boolean}
   */
  isVideoAdActive(player) {
    const targetPlayer = player || this.getPlayerAndVideo().player;
    if (!targetPlayer) return false;

    // 1. Kiểm tra xác thực Player Class của YouTube
    const hasAdClass = this.rules.videoAdIndicators.playerClasses.some((cls) =>
      targetPlayer.classList.contains(cls)
    );

    // 2. Kiểm tra API nội bộ của YouTube Player
    let hasAdState = false;
    try {
      // @ts-ignore
      if (typeof targetPlayer.getAdState === 'function') {
        // @ts-ignore
        const state = targetPlayer.getAdState();
        hasAdState = typeof state === 'number' && state > 0;
      }
    } catch (e) {}

    // NGUYÊN TẮC BẢO VỆ: Nếu Player KHÔNG có class ad-showing/ad-interrupting VÀ getAdState <= 0,
    // thì đây 100% là MAIN_VIDEO. Không bao giờ coi là quảng cáo!
    if (!hasAdClass && !hasAdState) {
      return false;
    }

    // 3. Khi đã có tín hiệu từ player, kiểm tra xem có phần tử quảng cáo thực tế hiển thị không
    for (const sel of this.rules.videoAdIndicators.containerSelectors) {
      const el = targetPlayer.querySelector(sel) || document.querySelector(sel);
      if (el && this.isElementVisible(el)) {
        return true;
      }
    }

    for (const sel of this.rules.videoAdIndicators.badgeSelectors) {
      const badge = targetPlayer.querySelector(sel) || document.querySelector(sel);
      if (badge && this.isElementVisible(badge)) {
        return true;
      }
    }

    // Nếu player có class ad-showing hoặc getAdState > 0 thì xác nhận là ad
    return hasAdClass || hasAdState;
  }

  /**
   * Định vị nút Bỏ qua quảng cáo (Skip Button)
   * QUAN TRỌNG: Tuyệt đối không click vào nút Next Video (.ytp-next-button) hoặc các nút điều khiển chính
   * @returns {Element | null}
   */
  findSkipButton() {
    const player = this.getPlayerAndVideo().player;

    // 1. Quét danh sách selectors nút Skip quảng cáo
    for (const sel of this.rules.skipButtons) {
      const btn = (player && player.querySelector(sel)) || document.querySelector(sel);
      if (btn && this.isValidSkipButton(btn)) {
        return btn;
      }
    }

    // 2. Fallback: Quét nội dung văn bản nút CHỈ TRONG container quảng cáo (.video-ads, .ytp-ad-module)
    const searchRoot = player || document;
    const adContainers = searchRoot.querySelectorAll('.video-ads, .ytp-ad-module, .ytp-ad-player-overlay');
    for (const container of adContainers) {
      const buttons = container.querySelectorAll('button, div[role="button"]');
      for (const btn of buttons) {
        if (!this.isValidSkipButton(btn)) continue;

        const text = (btn.textContent || '').trim().toLowerCase();
        const matches = this.rules.skipKeywords.some((kw) => text.includes(kw));
        if (matches) {
          return btn;
        }
      }
    }

    return null;
  }

  /**
   * Kiểm tra tính hợp lệ của nút Skip (bảo vệ chống click nhầm nút Next hoặc controls của video chính)
   * @param {Element} btn
   * @returns {boolean}
   */
  isValidSkipButton(btn) {
    if (!btn || !this.isElementVisible(btn)) return false;

    // Loại trừ tuyệt đối nút Next, Prev, Play, Autonav của YouTube
    const hasNextClass = btn.classList && (
      btn.classList.contains('ytp-next-button') ||
      btn.classList.contains('ytp-prev-button') ||
      btn.classList.contains('ytp-play-button')
    );
    if (hasNextClass) return false;

    const tooltipId = typeof btn.getAttribute === 'function' ? btn.getAttribute('data-tooltip-target-id') : null;
    if (tooltipId === 'ytp-autonav-toggle-button') return false;

    const inControls = typeof btn.closest === 'function' ? btn.closest('.ytp-chrome-controls') : null;
    if (inControls) return false;

    return true;
  }

  /**
   * Phát hiện các dialog cảnh báo Anti-Adblock
   * @returns {Element[]}
   */
  findAntiAdblockDialogs() {
    const found = [];
    for (const sel of this.rules.antiAdblockDialogs) {
      const elements = document.querySelectorAll(sel);
      elements.forEach((el) => found.push(el));
    }
    return found;
  }

  /**
   * Phát hiện các màn mờ / backdrop che mờ video
   * @returns {Element[]}
   */
  findBackdrops() {
    const found = [];
    for (const sel of this.rules.backdrops) {
      const elements = document.querySelectorAll(sel);
      elements.forEach((el) => found.push(el));
    }
    return found;
  }

  /**
   * Phát hiện video Shorts được tài trợ (Chỉ chạy trên URL /shorts/)
   * @returns {{ activeShort: Element, downBtn: Element | null } | null}
   */
  detectSponsoredShort() {
    if (!window.location.pathname.startsWith('/shorts/')) return null;

    const activeShort = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (!activeShort) return null;

    const isSponsored = activeShort.querySelector(
      'ytd-ad-slot-renderer, .ytd-in-feed-ad-layout-renderer, [aria-label*="Sponsored" i]'
    );

    if (isSponsored) {
      const downBtn = document.getElementById('navigation-endpoint-down');
      return { activeShort, downBtn };
    }

    return null;
  }

  /**
   * Kiểm tra phần tử có hiển thị thực tế
   * @param {Element} el
   * @returns {boolean}
   */
  isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }
}

if (typeof window !== 'undefined') {
  window.AdDetector = AdDetector;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdDetector;
}
