/**
 * Test Suite: Storage & Settings Module Tests
 */

const assert = require('assert');

// Mock chrome.storage.local environment
function setupChromeStorageMock() {
  const store = {};

  global.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          let result = {};
          if (typeof keys === 'string') {
            result[keys] = store[keys];
          } else if (Array.isArray(keys)) {
            for (const k of keys) {
              if (k in store) result[k] = store[k];
            }
          } else if (typeof keys === 'object' && keys !== null) {
            result = { ...keys };
            for (const k of Object.keys(keys)) {
              if (k in store) result[k] = store[k];
            }
          } else {
            result = { ...store };
          }
          callback(result);
        },
        set(items, callback) {
          Object.assign(store, items);
          if (callback) callback();
        }
      }
    }
  };

  return store;
}

async function runStorageTests() {
  console.log('Testing storage.js...');
  const mockStore = setupChromeStorageMock();

  // Load storage module
  const storage = require('../src/utils/storage');

  // Test 1: getSettings returns default settings
  const initialSettings = await storage.getSettings();
  assert.strictEqual(initialSettings.masterEnabled, true, 'Default masterEnabled should be true');
  assert.strictEqual(initialSettings.skipVideoAds, true, 'Default skipVideoAds should be true');
  assert.strictEqual(initialSettings.sessionBlockedCount, 0, 'Initial sessionBlockedCount should be 0');
  assert.strictEqual(initialSettings.totalBlockedCount, 0, 'Initial totalBlockedCount should be 0');

  // Test 2: saveSettings updates items
  await storage.saveSettings({ masterEnabled: false, skipVideoAds: false });
  const updatedSettings = await storage.getSettings();
  assert.strictEqual(updatedSettings.masterEnabled, false, 'masterEnabled should now be false');
  assert.strictEqual(updatedSettings.skipVideoAds, false, 'skipVideoAds should now be false');

  // Restore masterEnabled
  await storage.saveSettings({ masterEnabled: true, skipVideoAds: true });

  // Test 3: incrementBlockedStats increments both session and total
  const res1 = await storage.incrementBlockedStats(15);
  assert.strictEqual(res1.sessionBlockedCount, 1, 'sessionBlockedCount should be 1');
  assert.strictEqual(res1.totalBlockedCount, 1, 'totalBlockedCount should be 1');
  assert.strictEqual(res1.timeSavedSeconds, 15, 'timeSavedSeconds should be 15');

  const res2 = await storage.incrementBlockedStats(20);
  assert.strictEqual(res2.sessionBlockedCount, 2, 'sessionBlockedCount should be 2');
  assert.strictEqual(res2.totalBlockedCount, 2, 'totalBlockedCount should be 2');
  assert.strictEqual(res2.timeSavedSeconds, 35, 'timeSavedSeconds should be 35');

  // Test 4: resetStats(false) only resets session count
  await storage.resetStats(false);
  const afterSessionReset = await storage.getSettings();
  assert.strictEqual(afterSessionReset.sessionBlockedCount, 0, 'sessionBlockedCount should be 0 after session reset');
  assert.strictEqual(afterSessionReset.totalBlockedCount, 2, 'totalBlockedCount should remain 2');
  assert.strictEqual(afterSessionReset.timeSavedSeconds, 35, 'timeSavedSeconds should remain 35');

  // Test 5: resetStats(true) resets both total and timeSaved
  await storage.resetStats(true);
  const afterTotalReset = await storage.getSettings();
  assert.strictEqual(afterTotalReset.sessionBlockedCount, 0, 'sessionBlockedCount should be 0');
  assert.strictEqual(afterTotalReset.totalBlockedCount, 0, 'totalBlockedCount should be 0 after total reset');
  assert.strictEqual(afterTotalReset.timeSavedSeconds, 0, 'timeSavedSeconds should be 0 after total reset');

  console.log('✅ storage.js passed all unit tests.');
}

module.exports = runStorageTests;

if (require.main === module) {
  runStorageTests();
}
