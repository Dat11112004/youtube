/**
 * YouTube Ad-Shield Pro - Rules Registry
 * Danh mục selector dành cho Declarative CSS và Anti-Adblock modal
 * ĐÃ LOẠI BỎ TOÀN BỘ LOGIC SKIP/NEXT
 */

const AdShieldRules = {
  version: '3.0.0',
  lastUpdated: '2026-09-25',

  // 1. Chỉ báo Video Ads cấp Player
  videoAdIndicators: {
    playerClasses: ['ad-showing', 'ad-interrupting'],
    containerSelectors: ['.ytp-ad-player-overlay', '.ytp-ad-player-overlay-layout', '.ytp-ad-module'],
    badgeSelectors: ['.ytp-ad-simple-ad-badge', '.ytp-ad-preview-container', '.ytp-ad-duration-remaining']
  },

  // 2. Nút Skip Ad hợp lệ (nếu fallback cần đến)
  skipButtons: [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    'button.ytp-ad-skip-button-text'
  ],

  skipKeywords: [
    'skip',
    'bỏ qua',
    'passer'
  ],

  // 3. Banner, Feed và Promotional Ads trên trang YouTube (Ẩn bằng Declarative CSS)
  bannerAds: [
    '#masthead-ad',
    'ytd-ad-slot-renderer',
    '.ytd-ad-slot-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
    'ytd-rich-item-renderer:has(.ytd-in-feed-ad-layout-renderer)',
    'ytd-rich-section-renderer:has(ytd-ad-slot-renderer)',
    'ytd-rich-section-renderer:has(.ytd-in-feed-ad-layout-renderer)',
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-search-pyv-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '#player-ads',
    '#panels ytd-ads-engagement-panel-content-view-model',
    'ytd-action-companion-ad-renderer',
    'ytd-companion-slot-renderer',
    '.ytd-companion-slot-renderer',
    '#companion',
    '#secondary ytd-companion-slot-renderer',
    '#secondary ytd-ad-slot-renderer',
    '#below ytd-ad-slot-renderer',
    '#below ytd-companion-slot-renderer',
    'ytd-watch-flexy ytd-ad-slot-renderer',
    'ytd-watch-flexy ytd-companion-slot-renderer',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    'ytd-merch-shelf-renderer'
  ],

  // 2. Overlays đè lên khung hình Video
  overlayAds: [
    '.ytp-ad-overlay-container',
    '.ytp-ad-overlay-slot',
    '.ytp-ad-image-overlay',
    '.ytp-ad-text-overlay',
    '.ytp-ad-message-container',
    '.ytp-ad-survey',
    '.ytp-suggested-action'
  ],

  // 3. Cảnh báo Anti-Adblock của YouTube
  antiAdblockDialogs: [
    'ytd-enforcement-message-view-model',
    'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
    'ytd-popup-container:has(ytd-enforcement-message-view-model)',
    'yt-playability-error-supported-renderers:has(ytd-enforcement-message-view-model)'
  ],

  // 4. Lớp màn đen / backdrop che mờ video
  backdrops: [
    'tp-yt-iron-overlay-backdrop',
    '.opened[touch-action="none"]'
  ]
};

if (typeof window !== 'undefined') {
  window.AdShieldRules = AdShieldRules;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdShieldRules;
}
