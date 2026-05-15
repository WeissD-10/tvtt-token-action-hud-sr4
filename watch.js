const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SOURCE_DIR = path.resolve(__dirname, './');
const TARGET_DIR = process.env.FOUNDRY_PATH;

if (!TARGET_DIR) {
  console.error('FOUNDRY_PATH missing in .env');
  process.exit(1);
}

function isAllowed(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  return (
    normalized === 'module.json' ||
    normalized === 'token-action-hud-sr4.js' ||
    normalized.startsWith('lang')
  );
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function removeFile(dest) {
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
}

function syncFile(filePath) {
  const rel = path.relative(SOURCE_DIR, filePath);
  if (!isAllowed(rel)) return;

  const target = path.join(TARGET_DIR, rel);
  copyFile(filePath, target);
  console.log('changed:', rel);
}

function removeSync(filePath) {
  const rel = path.relative(SOURCE_DIR, filePath);
  if (!isAllowed(rel)) return;

  const target = path.join(TARGET_DIR, rel);
  removeFile(target);
  console.log('removed:', rel);
}

function copyAll(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const rel = path.relative(SOURCE_DIR, srcPath);

    if (!isAllowed(rel)) continue;

    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyAll(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function watchDir(dir) {
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const fullPath = path.join(dir, filename);
    const rel = path.relative(SOURCE_DIR, fullPath);

    if (!isAllowed(rel)) return;

    if (!fs.existsSync(fullPath)) {
      removeSync(fullPath);
      return;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      syncFile(fullPath);
    }
  });
}

copyAll(SOURCE_DIR, TARGET_DIR);
watchDir(SOURCE_DIR);

console.log('watch active');