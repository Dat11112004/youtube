/**
 * YouTube Ad-Shield Pro - Build & Validation Script
 * Kiểm tra tính hợp lệ của manifest.json, dnr_rules.json và cú pháp JavaScript
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const FILES_TO_VALIDATE = [
  'manifest.json',
  'rules/dnr_rules.json',
  'src/utils/logger.js',
  'src/utils/dom.js',
  'src/utils/storage.js',
  'src/content/detection/rules.js',
  'src/content/detection/ad_detector.js',
  'src/content/processing/ad_processor.js',
  'src/content/navigation/navigation_watcher.js',
  'src/content/content_main.js',
  'src/content/inject.js',
  'src/background/service_worker.js',
  'src/popup/popup.js'
];

console.log('--- Starting Extension Integrity & Syntax Validation ---');
let hasError = false;

for (const relPath of FILES_TO_VALIDATE) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing file: ${relPath}`);
    hasError = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  if (relPath.endsWith('.json')) {
    try {
      JSON.parse(content);
      console.log(`✅ Valid JSON: ${relPath}`);
    } catch (err) {
      console.error(`❌ JSON Syntax Error in ${relPath}:`, err.message);
      hasError = true;
    }
  } else if (relPath.endsWith('.js')) {
    try {
      new Function(content);
      console.log(`✅ Valid JS Syntax: ${relPath}`);
    } catch (err) {
      console.error(`❌ JS Syntax Error in ${relPath}:`, err.message);
      hasError = true;
    }
  }
}

// Kiểm tra các tệp tin trong manifest.json có tồn tại thực tế
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
  const scriptsToCheck = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])])
  ].filter(Boolean);

  for (const scriptPath of scriptsToCheck) {
    const full = path.join(ROOT_DIR, scriptPath);
    if (!fs.existsSync(full)) {
      console.error(`❌ Manifest references missing resource: ${scriptPath}`);
      hasError = true;
    }
  }
} catch (e) {
  console.error('❌ Could not parse manifest for resource check:', e.message);
  hasError = true;
}

if (hasError) {
  console.error('\n❌ Build validation failed with errors.');
  process.exit(1);
} else {
  console.log('\n✨ All project files passed validation successfully! Ready for Chrome Developer Mode.');
}
