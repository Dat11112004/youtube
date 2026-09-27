/**
 * Test Suite: Popup HTML DOM & UI Requirements Verification
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runPopupDomTests() {
  console.log('Testing popup.html DOM structure...');

  const popupHtmlPath = path.resolve(__dirname, '../src/popup/popup.html');
  const htmlContent = fs.readFileSync(popupHtmlPath, 'utf8');

  // 1. Required IDs check
  const requiredIds = [
    'btn-close-popup',
    'yt-context-card',
    'site-name',
    'processing-status',
    'toggle-master',
    'status-dot',
    'status-text',
    'stat-session-count',
    'stat-total-count',
    'stat-time',
    'btn-quick-activate',
    'btn-toggle-settings',
    'settings-panel',
    'toggle-video-ads',
    'toggle-anti-adblock',
    'toggle-backdrops',
    'toggle-banners',
    'toggle-shorts',
    'btn-reset-session',
    'btn-reset-all'
  ];

  for (const id of requiredIds) {
    assert(
      htmlContent.includes(`id="${id}"`),
      `popup.html must contain element with id="${id}"`
    );
  }

  // 2. Keyword checks (Website, Active, Session, Reset)
  assert(htmlContent.includes('Website:'), 'popup.html must display "Website:" label');
  assert(htmlContent.includes('YouTube'), 'popup.html must mention "YouTube"');
  assert(htmlContent.includes('Active'), 'popup.html must display "Active"');
  assert(htmlContent.includes('Phiên hiện tại'), 'popup.html must display session count label');
  assert(htmlContent.includes('Reset'), 'popup.html must display "Reset" button');

  // 3. Script references
  assert(htmlContent.includes('popup.js'), 'popup.html must link popup.js');
  assert(htmlContent.includes('storage.js'), 'popup.html must link storage.js');
  assert(htmlContent.includes('popup.css'), 'popup.html must link popup.css');

  console.log('✅ popup.html DOM structure passed all requirement checks.');
}

module.exports = runPopupDomTests;

if (require.main === module) {
  runPopupDomTests();
}
