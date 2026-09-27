/**
 * YouTube Ad-Shield Pro - Type Definitions
 * Hệ thống định nghĩa kiểu dữ liệu cho toàn bộ Extension (Manifest V3)
 */

export interface UserSettings {
  masterEnabled: boolean;
  skipVideoAds: boolean;
  hideBanners: boolean;
  blockShorts: boolean;
  antiAdblock: boolean;
  removeBackdrops: boolean;
  autoDismissPopup: boolean;
  sessionBlockedCount: number;
  totalBlockedCount: number;
  timeSavedSeconds: number;
}

export interface NavigationEventData {
  url: string;
  videoId: string | null;
  isNewVideo: boolean;
}

export interface AdIndicators {
  playerClasses: string[];
  containerSelectors: string[];
  badgeSelectors: string[];
}

export interface RuleRegistry {
  version: string;
  lastUpdated: string;
  videoAdIndicators: AdIndicators;
  skipButtons: string[];
  skipKeywords: string[];
  bannerAds: string[];
  overlayAds: string[];
  antiAdblockDialogs: string[];
  backdrops: string[];
  shortsAds: string[];
}

export type MessageAction =
  | 'AD_BLOCKED'
  | 'RESET_STATS'
  | 'GET_TAB_STATUS'
  | 'SETTINGS_UPDATED';

export interface RuntimeMessage {
  action: MessageAction;
  duration?: number;
  resetTotal?: boolean;
  settings?: Partial<UserSettings>;
}

export interface TabStatusResponse {
  active: boolean;
  isYouTube: boolean;
  isAdActive: boolean;
  url: string;
  videoId: string | null;
}
