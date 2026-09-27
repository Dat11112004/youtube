/**
 * Test Suite: NavigationWatcher Module Tests
 */

const assert = require('assert');

function runNavigationTests() {
  console.log('Testing navigation_watcher.js...');

  // Setup browser environment mocks
  const eventListeners = {};
  global.window = {
    location: {
      href: 'https://www.youtube.com/',
      pathname: '/'
    },
    addEventListener: (event, handler) => {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(handler);
    }
  };

  global.history = {
    pushState: function (state, title, url) {},
    replaceState: function (state, title, url) {}
  };

  const NavigationWatcher = require('../src/content/navigation/navigation_watcher');
  const watcher = new NavigationWatcher();

  // Test 1: Video ID extraction
  assert.strictEqual(
    watcher.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ',
    'Should correctly extract video ID from watch URL'
  );

  assert.strictEqual(
    watcher.extractVideoId('https://www.youtube.com/shorts/sampleShort123'),
    'sampleShort123',
    'Should correctly extract short ID from shorts URL'
  );

  assert.strictEqual(
    watcher.extractVideoId('https://www.youtube.com/feed/trending'),
    null,
    'Non-video URL should return null'
  );

  // Test 2: onNavigate callback triggers when URL changes
  let receivedData = null;
  watcher.onNavigate((data) => {
    receivedData = data;
  });

  // Simulate URL change to video
  window.location.href = 'https://www.youtube.com/watch?v=newVideo999';
  watcher.checkUrlChange();

  assert(receivedData, 'Should have received navigation event');
  assert.strictEqual(receivedData.videoId, 'newVideo999', 'Video ID should be newVideo999');
  assert.strictEqual(receivedData.isNewVideo, true, 'isNewVideo should be true for first video load');

  // Test 3: History pushState triggers checkUrlChange automatically
  receivedData = null;
  window.location.href = 'https://www.youtube.com/watch?v=pushedVideo888';
  history.pushState(null, '', '/watch?v=pushedVideo888');

  assert(receivedData, 'Should catch navigation via pushState hook');
  assert.strictEqual(receivedData.videoId, 'pushedVideo888', 'Should extract pushedVideo888');

  // Test 4: Destroy cleans up
  watcher.destroy();
  assert.strictEqual(watcher.isDestroyed, true, 'isDestroyed should be true after destroy()');

  console.log('✅ navigation_watcher.js passed all unit tests.');
}

module.exports = runNavigationTests;

if (require.main === module) {
  runNavigationTests();
}
