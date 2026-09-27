/**
 * Test Suite: AdProcessor Module Tests
 * Kiểm tra các tính năng an toàn và xử lý quảng cáo:
 * - handleAdStart: Mute tiếng, tăng tốc 16x, click nút Skip, KHÔNG chạm currentTime
 * - handleAdEnd: Khôi phục tốc độ và âm lượng ban đầu
 * - handleAdPrevented: Ghi nhận sự kiện pre-stream và cập nhật thống kê
 * - neutralizeAntiAdblock: Gỡ bỏ modal cảnh báo và mở khóa cuộn trang
 * - skipSponsoredShort: Bỏ qua Shorts được tài trợ
 */

const assert = require('assert');

function runProcessorTests() {
  console.log('Testing ad_processor.js (Multi-tier Ad Protection Engine)...');

  let classAdded = '';
  let bodyStyleOverflow = '';

  global.document = {
    documentElement: {
      classList: {
        add: (cls) => { classAdded = cls; },
        remove: () => {}
      }
    },
    body: {
      style: {
        set overflow(val) { bodyStyleOverflow = val; },
        get overflow() { return bodyStyleOverflow; }
      }
    },
    querySelector: () => null
  };

  global.window = {
    dispatchEvent: () => {}
  };

  // Mock PointerEvent and CustomEvent for Node.js environment
  global.PointerEvent = global.PointerEvent || class PointerEvent {};
  global.MouseEvent = global.MouseEvent || class MouseEvent {};
  global.CustomEvent = global.CustomEvent || class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init ? init.detail : null; }
  };

  const AdProcessor = require('../src/content/processing/ad_processor');

  let reportedDuration = null;
  const processor = new AdProcessor((duration) => {
    reportedDuration = duration;
  });

  // Test 1: handleAdPrevented invokes callback and reports stats
  processor.handleAdPrevented('ytInitialPlayerResponse');
  assert.strictEqual(reportedDuration, 15, 'Callback should report estimated seconds saved');

  // Test 2: Throttling prevents duplicate counts within window
  reportedDuration = null;
  processor.handleAdPrevented('network_pre_stream');
  assert.strictEqual(reportedDuration, null, 'Immediate successive call should be throttled');

  // Test 3: neutralizeAntiAdblock removes dialogs and unblocks body scroll
  let removedDialog = false;
  let removedBackdrop = false;

  const mockDialog = {
    remove: () => { removedDialog = true; }
  };
  const mockBackdrop = {
    classList: {
      contains: (cls) => cls === 'opened'
    },
    remove: () => { removedBackdrop = true; }
  };

  processor.neutralizeAntiAdblock([mockDialog], [mockBackdrop]);
  assert.strictEqual(removedDialog, true, 'Anti-adblock dialog must be removed');
  assert.strictEqual(removedBackdrop, true, 'Backdrop element must be removed');
  assert.strictEqual(classAdded, 'yt-adshield-unlocked', 'Should add unlock class to documentElement');
  assert.strictEqual(bodyStyleOverflow, 'auto', 'Should unlock body overflow scroll');

  // Test 4: handleAdStart mutes audio, accelerates to 16x, clicks skip button, PRESERVES currentTime
  const mockVideo = {
    playbackRate: 1.0,
    muted: false,
    duration: 30,
    currentTime: 2
  };
  const mockPlayer = {
    querySelector: () => null
  };
  let skipClicked = false;
  const mockSkipBtn = {
    click: () => { skipClicked = true; },
    dispatchEvent: () => true,
    offsetParent: {},
    getBoundingClientRect: () => ({ width: 100, height: 30 })
  };

  processor.resetState();
  processor.handleAdStart(mockVideo, mockPlayer, mockSkipBtn);
  assert.strictEqual(skipClicked, true, 'Skip button must be clicked');
  assert.strictEqual(mockVideo.muted, true, 'Video must be muted during ad');
  assert.strictEqual(mockVideo.playbackRate, 16, 'Video playbackRate must be accelerated to 16x');
  assert.strictEqual(mockVideo.currentTime, 2, 'currentTime must NEVER be altered (zero-touch timeline protection)');

  // Test 5: handleAdEnd restores original playback rate and mute state
  processor.handleAdEnd(mockVideo);
  assert.strictEqual(mockVideo.muted, false, 'Audio should be unmuted after ad');
  assert.strictEqual(mockVideo.playbackRate, 1.0, 'Playback rate must be restored to 1.0x');

  // Test 6: skipSponsoredShort clicks down button
  let downClicked = false;
  processor.skipSponsoredShort({
    activeShort: {},
    downBtn: {
      click: () => { downClicked = true; }
    }
  });
  assert.strictEqual(downClicked, true, 'Shorts down button should be clicked');

  // Test 7: resetState clears all tracking state
  processor.resetState();
  assert.strictEqual(processor.isHandlingAd, false, 'isHandlingAd should be false after reset');
  assert.strictEqual(processor.userPlaybackRate, 1.0, 'userPlaybackRate should be 1.0 after reset');
  assert.strictEqual(processor.userWasMuted, false, 'userWasMuted should be false after reset');

  console.log('✅ ad_processor.js passed all unit tests.');
}

module.exports = runProcessorTests;

if (require.main === module) {
  runProcessorTests();
}
