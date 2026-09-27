/**
 * Master Test Runner - YouTube Ad-Shield Pro
 * Executes the entire automated test suite covering:
 * - Manifest V3 compliance & minimal permissions
 * - Storage & session stats
 * - Rules & AdDetector
 * - AdProcessor (16x, audio mute, state restoration)
 * - NavigationWatcher (SPA transitions, History API)
 * - Popup UI structure
 */

const runManifestTests = require('./test_manifest');
const runStorageTests = require('./test_storage');
const runRulesAndDetectorTests = require('./test_rules_and_detector');
const runProcessorTests = require('./test_processor');
const runNavigationTests = require('./test_navigation');
const runPopupDomTests = require('./test_popup_dom');

async function main() {
  console.log('====================================================');
  console.log('🚀 RUNNING AUTOMATED TEST SUITE: YouTube Ad-Shield Pro');
  console.log('====================================================\n');

  try {
    // 1. Manifest
    runManifestTests();
    console.log('');

    // 2. Storage
    await runStorageTests();
    console.log('');

    // 3. Rules & Detector
    runRulesAndDetectorTests();
    console.log('');

    // 4. Processor
    runProcessorTests();
    console.log('');

    // 5. Navigation Watcher
    runNavigationTests();
    console.log('');

    // 6. Popup DOM
    runPopupDomTests();
    console.log('');

    console.log('====================================================');
    console.log('🎉 ALL 6 TEST SUITES PASSED 100% SUCCESSFULLY!');
    console.log('✨ The extension is verified, robust, and production-ready.');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

main();
