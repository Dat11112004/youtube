/**
 * YouTube Ad-Shield Pro - Ad Detector Module (Isolated World)
 *
 * Phát hiện chính xác quảng cáo đang phát trên YouTube Player:
 * - Dựa vào class ad-showing / ad-interrupting trên player element
 * - Dựa vào player.getAdState() API nội bộ
 * - Tìm nút Skip Ad trong container quảng cáo (KHÔNG click nhầm nút Next/Play)
 * - Phát hiện Anti-Adblock dialogs
 * - Phát hiện Sponsored Shorts
 */

class AdDetector {
  /**
   * @param {Object} rules - AdShieldRules registry
   */
  constructor(rules) {
    this.rules = rules || (typeof AdShieldRules !== 'undefined' ? AdShieldRules : {});
  }

  /**
   * Tìm Player và Video element chính
   * @returns {{ player: HTMLElement|null, video: HTMLVideoElement|null }}
   */
  getPlayerAndVideo() {
    var player = /** @type {HTMLElement|null} */ (document.querySelector('.html5-video-player') || document.getElementById('movie_player'));
    var video = /** @type {HTMLVideoElement|null} */ (document.querySelector('video.html5-main-video') || document.querySelector('video'));
    return { player: player, video: video };
  }

  /**
   * Kiểm tra player có đang chiếu ad không
   * NGUYÊN TẮC: Phải có ít nhất 1 tín hiệu xác thực từ YouTube (class hoặc API)
   *
   * @param {HTMLElement|null} player
   * @returns {boolean}
   */
  isVideoAdActive(player) {
    var targetPlayer = player || this.getPlayerAndVideo().player;
    if (!targetPlayer) return false;

    // 1. Kiểm tra class trên player
    var hasAdClass = false;
    var playerClasses = this.rules.videoAdIndicators ? this.rules.videoAdIndicators.playerClasses : ['ad-showing', 'ad-interrupting'];
    for (var i = 0; i < playerClasses.length; i++) {
      if (targetPlayer.classList.contains(playerClasses[i])) {
        hasAdClass = true;
        break;
      }
    }

    // 2. Kiểm tra API nội bộ
    var hasAdState = false;
    try {
      var p = /** @type {any} */ (targetPlayer);
      if (typeof p.getAdState === 'function') {
        var state = p.getAdState();
        hasAdState = typeof state === 'number' && state > 0;
      }
    } catch (_) {}

    // Nếu cả 2 đều không có tín hiệu -> chắc chắn KHÔNG phải ad
    if (!hasAdClass && !hasAdState) return false;

    // Có tín hiệu -> xác nhận là ad
    return true;
  }

  /**
   * Tìm nút Skip Ad
   * QUAN TRỌNG: Tuyệt đối KHÔNG trả về nút Next/Prev/Play
   *
   * @returns {Element|null}
   */
  findSkipButton() {
    var player = this.getPlayerAndVideo().player;
    var skipButtons = this.rules.skipButtons || [];

    // 1. Tìm theo selector
    for (var i = 0; i < skipButtons.length; i++) {
      var sel = skipButtons[i];
      var btn = (player && player.querySelector(sel)) || document.querySelector(sel);
      if (btn && this._isValidSkipButton(btn)) {
        return btn;
      }
    }

    // 2. Fallback: tìm trong ad container theo text content
    var searchRoot = player || document;
    var adContainers = searchRoot.querySelectorAll('.video-ads, .ytp-ad-module, .ytp-ad-player-overlay');

    for (var c = 0; c < adContainers.length; c++) {
      var buttons = adContainers[c].querySelectorAll('button, div[role="button"]');
      var keywords = this.rules.skipKeywords || ['skip', 'bỏ qua', 'passer', 'saltar', 'überspringen'];

      for (var b = 0; b < buttons.length; b++) {
        if (!this._isValidSkipButton(buttons[b])) continue;

        var text = (buttons[b].textContent || '').trim().toLowerCase();
        for (var k = 0; k < keywords.length; k++) {
          if (text.indexOf(keywords[k]) !== -1) {
            return buttons[b];
          }
        }
      }
    }

    return null;
  }

  /**
   * Phát hiện Anti-Adblock dialogs
   * @returns {Element[]}
   */
  findAntiAdblockDialogs() {
    var found = [];
    var selectors = this.rules.antiAdblockDialogs || [];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var elements = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < elements.length; j++) {
          found.push(elements[j]);
        }
      } catch (_) {}
    }
    return found;
  }

  /**
   * Phát hiện backdrops che mờ video
   * @returns {Element[]}
   */
  findBackdrops() {
    var found = [];
    var selectors = this.rules.backdrops || [];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var elements = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < elements.length; j++) {
          found.push(elements[j]);
        }
      } catch (_) {}
    }
    return found;
  }

  /**
   * Phát hiện Sponsored Shorts
   * @returns {{ activeShort: Element, downBtn: Element|null }|null}
   */
  detectSponsoredShort() {
    if (!window.location.pathname.startsWith('/shorts/')) return null;

    var activeShort = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (!activeShort) return null;

    var isSponsored = activeShort.querySelector(
      'ytd-ad-slot-renderer, .ytd-in-feed-ad-layout-renderer, [aria-label*="Sponsored" i]'
    );

    if (isSponsored) {
      var downBtn = document.getElementById('navigation-endpoint-down');
      return { activeShort: activeShort, downBtn: downBtn };
    }

    return null;
  }

  // ===========================
  // PRIVATE METHODS
  // ===========================

  /**
   * Kiểm tra nút skip có hợp lệ không (loại trừ nút Next/Prev/Play)
   * @param {Element} btn
   * @returns {boolean}
   */
  _isValidSkipButton(btn) {
    if (!btn) return false;

    // Phải visible (offsetParent !== null cho non-fixed elements)
    // Hoặc kiểm tra bounding rect
    var rect = btn.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    // Loại trừ nút Next/Prev/Play
    if (btn.classList) {
      if (btn.classList.contains('ytp-next-button') ||
          btn.classList.contains('ytp-prev-button') ||
          btn.classList.contains('ytp-play-button')) {
        return false;
      }
    }

    // Loại trừ nút Autonav
    var tooltipId = btn.getAttribute ? btn.getAttribute('data-tooltip-target-id') : null;
    if (tooltipId === 'ytp-autonav-toggle-button') return false;

    // Loại trừ nút trong Chrome Controls (play/pause, volume, settings...)
    var inControls = btn.closest ? btn.closest('.ytp-chrome-controls') : null;
    if (inControls) return false;

    return true;
  }
}

if (typeof window !== 'undefined') {
  window.AdDetector = AdDetector;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdDetector;
}
