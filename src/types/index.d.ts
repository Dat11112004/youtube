/**
 * YouTube Ad-Shield Pro - Type Definitions
 * Hệ thống định nghĩa kiểu dữ liệu cho toàn bộ Extension (Manifest V3)
 */

// =====================================================
// USER SETTINGS & CONFIG
// =====================================================

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
  currentState?: string;
  url: string;
  videoId: string | null;
}

// =====================================================
// GLOBAL DECLARATIONS - Window extensions
// =====================================================

/**
 * YouTube Player mở rộng HTMLElement với các API nội bộ
 */
interface YTPlayerElement extends HTMLElement {
  getAdState?: () => number;
  skipAd?: () => void;
  cancelPlayback?: () => void;
  getPlayerState?: () => number;
}

/**
 * Mở rộng Window interface cho các global variables
 */
declare global {
  // YouTube globals
  interface Window {
    __yt_adshield_injected__?: boolean;
    __yt_adshield_orchestrator__?: boolean;
    ytInitialPlayerResponse?: any;

    // Extension module globals (injected via content_scripts order in manifest)
    AdShieldLogger: typeof AdShieldLogger;
    AdShieldDOM: typeof AdShieldDOM;
    AdShieldRules: any;
    AdDetector: typeof AdDetector;
    AdProcessor: typeof AdProcessor;
    NavigationWatcher: typeof NavigationWatcher;
  }

  // =====================================================
  // MODULE GLOBALS - Available via window.* in content scripts
  // =====================================================

  /** Logger utility */
  const AdShieldLogger: {
    log(message: string, ...details: any[]): void;
    info(message: string, ...details: any[]): void;
    warn(message: string, ...details: any[]): void;
    error(message: string, ...details: any[]): void;
  };

  /** DOM helper utility */
  const AdShieldDOM: {
    isVisible(el: Element | null): boolean;
    dispatchFullClick(el: Element | null): void;
    query(selector: string, context?: Element | Document): Element | null;
    queryAll(selector: string, context?: Element | Document): Element[];
    createRafThrottle(callback: Function): () => void;
  };

  /** Rules registry */
  const AdShieldRules: {
    version: string;
    lastUpdated: string;
    videoAdIndicators: AdIndicators;
    skipButtons: string[];
    skipKeywords: string[];
    bannerAds: string[];
    overlayAds: string[];
    antiAdblockDialogs: string[];
    backdrops: string[];
  };

  /** Storage functions */
  function getSettings(): Promise<UserSettings>;
  function saveSettings(updates: Partial<UserSettings>): Promise<void>;
  function incrementBlockedStats(durationSeconds?: number): Promise<{
    sessionBlockedCount: number;
    totalBlockedCount: number;
    timeSavedSeconds: number;
  }>;
  function resetStats(resetTotal?: boolean): Promise<void>;

  /** Ad Detector class */
  class AdDetector {
    constructor(rules: any);
    getPlayerAndVideo(): { player: HTMLElement | null; video: HTMLVideoElement | null };
    isVideoAdActive(player: HTMLElement | null): boolean;
    findSkipButton(): Element | null;
    findAntiAdblockDialogs(): Element[];
    findBackdrops(): Element[];
    detectSponsoredShort(): { activeShort: Element; downBtn: Element | null } | null;
    _isValidSkipButton(btn: Element): boolean;
  }

  /** Ad Processor class */
  class AdProcessor {
    constructor(onAdBlockedCallback: (duration: number) => void);
    isHandlingAd: boolean;
    userPlaybackRate: number;
    userWasMuted: boolean;
    lastHandledTimestamp: number;
    handleAdStart(video: HTMLVideoElement | null, player: HTMLElement | null, skipBtn: Element | null): void;
    handleAdEnd(video: HTMLVideoElement | null): void;
    handleAdPrevented(source?: string): void;
    skipSponsoredShort(shortData: { activeShort?: Element; downBtn: Element | null } | null): void;
    neutralizeAntiAdblock(dialogs: Element[], backdrops: Element[]): void;
    resetState(): void;
  }

  /** Navigation Watcher class */
  class NavigationWatcher {
    constructor();
    currentUrl: string;
    currentVideoId: string | null;
    onNavigate(callback: (data: NavigationEventData) => void): void;
    destroy(): void;
  }
}
