/**
 * Test Suite: Rules Registry & AdDetector Module
 */

const assert = require('assert');

// Mock a lightweight DOM environment
function createMockElement(tagName, attrs = {}) {
  const children = [];
  const classListSet = new Set((attrs.className || '').split(' ').filter(Boolean));

  return {
    tagName: tagName.toUpperCase(),
    className: attrs.className || '',
    id: attrs.id || '',
    textContent: attrs.textContent || '',
    children,
    clientWidth: attrs.clientWidth !== undefined ? attrs.clientWidth : 100,
    clientHeight: attrs.clientHeight !== undefined ? attrs.clientHeight : 50,
    offsetWidth: attrs.offsetWidth !== undefined ? attrs.offsetWidth : 100,
    offsetHeight: attrs.offsetHeight !== undefined ? attrs.offsetHeight : 50,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
    classList: {
      contains: (cls) => classListSet.has(cls),
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls)
    },
    getAttribute: (attr) => attrs[attr] || null,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 40 }),
    querySelectorAll: function (sel) {
      const matched = [];
      function traverse(node) {
        for (const child of node.children) {
          if (child.matches(sel)) matched.push(child);
          traverse(child);
        }
      }
      traverse(this);
      return matched;
    },
    querySelector: function (sel) {
      const all = this.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    },
    matches: function (sel) {
      if (sel.startsWith('.')) return classListSet.has(sel.slice(1));
      if (sel.startsWith('#')) return this.id === sel.slice(1);
      if (sel.includes('button')) return this.tagName === 'BUTTON';
      return false;
    },
    appendChild(child) {
      children.push(child);
      return child;
    }
  };
}

function setupDOMMock() {
  const elements = [];

  global.window = {
    location: { href: 'https://www.youtube.com/watch?v=test1234', pathname: '/watch' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
  };

  global.Element = function () {};

  global.document = {
    elements,
    querySelector(sel) {
      if (sel === 'video' || sel === 'video.html5-main-video') {
        return elements.find(e => e.tagName === 'VIDEO') || null;
      }
      if (sel === '.html5-video-player' || sel === '#movie_player') {
        return elements.find(e => e.id === 'movie_player' || e.classList.contains('html5-video-player')) || null;
      }
      return elements.find(e => e.matches(sel)) || null;
    },
    querySelectorAll(sel) {
      return elements.filter(e => e.matches(sel));
    }
  };

  return elements;
}

function runRulesAndDetectorTests() {
  console.log('Testing rules.js and ad_detector.js...');
  const domElements = setupDOMMock();

  const rules = require('../src/content/detection/rules');
  const AdDetector = require('../src/content/detection/ad_detector');

  // Test 1: Rules structure validation
  assert(rules.videoAdIndicators, 'rules.videoAdIndicators must exist');
  assert(Array.isArray(rules.skipButtons), 'rules.skipButtons must be an array');
  assert(rules.skipButtons.length > 0, 'rules.skipButtons must not be empty');
  assert(Array.isArray(rules.bannerAds), 'rules.bannerAds must be an array');
  assert(rules.bannerAds.length > 0, 'rules.bannerAds must not be empty');

  const detector = new AdDetector(rules);

  // Setup DOM elements: player and video
  const player = createMockElement('div', { id: 'movie_player', className: 'html5-video-player' });
  const video = createMockElement('video', { className: 'html5-main-video' });
  domElements.push(player);
  domElements.push(video);

  // Test 2: When video is normal (no ad)
  assert.strictEqual(detector.isVideoAdActive(player), false, 'Initially video should NOT be an ad');

  // Test 3: When player has ad-showing class
  player.classList.add('ad-showing');
  assert.strictEqual(detector.isVideoAdActive(player), true, 'Should detect ad when ad-showing is present');

  // Test 4: Find skip button with modern class
  const skipBtn = createMockElement('button', { className: 'ytp-ad-skip-button-modern', textContent: 'Skip' });
  domElements.push(skipBtn);
  player.appendChild(skipBtn);
  const foundBtn = detector.findSkipButton();
  assert(foundBtn, 'Should find skip button');
  assert.strictEqual(foundBtn.className, 'ytp-ad-skip-button-modern', 'Found button should match class');

  // Test 5: Remove ad class -> must return false
  player.classList.remove('ad-showing');
  assert.strictEqual(detector.isVideoAdActive(player), false, 'Should return false after ad-showing removed');

  // Test 6: Verify that Next Video button is NEVER picked up as a skip button
  const nextBtn = createMockElement('button', { className: 'ytp-next-button', textContent: 'Next video' });
  domElements.push(nextBtn);
  assert.strictEqual(detector.isValidSkipButton(nextBtn), false, 'Next button must NEVER be valid skip button');

  console.log('✅ rules.js and ad_detector.js passed all unit tests.');
}

module.exports = runRulesAndDetectorTests;

if (require.main === module) {
  runRulesAndDetectorTests();
}
