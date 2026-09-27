/**
 * Test Suite: Manifest V3 Specification & Minimal Permissions Verification
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runManifestTests() {
  console.log('Testing manifest.json configuration...');

  const manifestPath = path.resolve(__dirname, '../manifest.json');
  assert(fs.existsSync(manifestPath), 'manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // 1. Manifest V3 check
  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');

  // 2. Host permissions check (Must ONLY be YouTube, no <all_urls>)
  assert(Array.isArray(manifest.host_permissions), 'host_permissions must be an array');
  assert(manifest.host_permissions.length > 0, 'host_permissions must not be empty');
  for (const host of manifest.host_permissions) {
    assert(
      host.includes('youtube.com'),
      `host_permissions must only target YouTube, found: ${host}`
    );
    assert(!host.includes('<all_urls>'), 'Must NOT have <all_urls>');
  }

  // 3. Permissions check (Minimal permissions only)
  assert(Array.isArray(manifest.permissions), 'permissions must be an array');
  const forbiddenPermissions = ['tabs', 'cookies', 'webRequestBlocking', 'management', 'proxy'];
  for (const perm of forbiddenPermissions) {
    assert(
      !manifest.permissions.includes(perm),
      `Permission "${perm}" should not be requested (violates minimal permissions principle)`
    );
  }

  // 4. Content scripts match patterns
  assert(Array.isArray(manifest.content_scripts), 'content_scripts must be configured');
  for (const cs of manifest.content_scripts) {
    for (const match of cs.matches) {
      assert(match.includes('youtube.com'), `Content script match must be YouTube only: ${match}`);
    }
    // Verify each js file exists
    if (cs.js) {
      for (const file of cs.js) {
        const filePath = path.resolve(__dirname, '..', file);
        assert(fs.existsSync(filePath), `Content script file does not exist: ${file}`);
      }
    }
    if (cs.css) {
      for (const file of cs.css) {
        const filePath = path.resolve(__dirname, '..', file);
        assert(fs.existsSync(filePath), `CSS file does not exist: ${file}`);
      }
    }
  }

  // 5. Background Service Worker
  assert(manifest.background?.service_worker, 'Background service worker must be defined');
  const swPath = path.resolve(__dirname, '..', manifest.background.service_worker);
  assert(fs.existsSync(swPath), `Service worker file does not exist: ${manifest.background.service_worker}`);

  // 6. Action Popup
  assert(manifest.action?.default_popup, 'Action default_popup must be defined');
  const popupPath = path.resolve(__dirname, '..', manifest.action.default_popup);
  assert(fs.existsSync(popupPath), `Popup HTML file does not exist: ${manifest.action.default_popup}`);

  console.log('✅ manifest.json passed all security and specification checks.');
}

module.exports = runManifestTests;

if (require.main === module) {
  runManifestTests();
}
