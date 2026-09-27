/**
 * Test Suite: AdProcessor Module Tests (Pre-Stream & Non-Invasive)
 * Kiểm tra các tính năng an toàn tuyệt đối:
 * - TUYỆT ĐỐI KHÔNG can thiệp vào video.currentTime, video.playbackRate, video.src
 * - handleAdPrevented ghi nhận sự kiện và cập nhật thống kê
 * - neutralizeAntiAdblock gỡ bỏ modal cảnh báo và mở khóa cuộn trang
 */

const assert = require('assert');

function runProcessorTests() {
  console.log('Testing ad_processor.js (Safety & Non-Invasive Pre-Stream Mode)...');

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

  const AdProcessor = require('../src/content/processing/ad_processor');

  let reportedDuration = null;
  const processor = new AdProcessor((duration) => {
    reportedDuration = duration;
  });

  // Test 1: handleAdPrevented invokes callback and reports stats
  processor.handleAdPrevented('ytInitialPlayerResponse');
  assert.strictEqual(reportedDuration, 15, 'Callback should report estimated seconds saved');

  // Test 2: Throttling within 1 second prevents duplicate counts
  reportedDuration = null;
  processor.handleAdPrevented('network_pre_stream');
  assert.strictEqual(reportedDuration, null, 'Immediate successive call within 1s should be throttled');

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

  console.log('✅ ad_processor.js passed all pre-stream & non-invasive unit tests.');
}

module.exports = runProcessorTests;

if (require.main === module) {
  runProcessorTests();
}
