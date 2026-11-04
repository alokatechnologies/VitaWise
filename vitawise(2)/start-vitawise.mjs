import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isSilent = process.argv.includes('--silent');
const skipBrowser = process.argv.includes('--no-browser');

function log(...args) {
  if (!isSilent) {
    console.log(...args);
  }
}

function error(...args) {
  console.error(...args);
}

// 1. Locate the VitaWise working directory containing server.mjs
function findVitawiseDir() {
  const candidates = [
    path.join(__dirname, 'vitawise(2)', 'vitawise'),
    path.join(__dirname, 'vitawise'),
    __dirname,
    path.join(__dirname, '..', 'vitawise(2)', 'vitawise'),
    path.join(__dirname, '..', 'vitawise')
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'server.mjs')) && fs.existsSync(path.join(c, 'public', 'index.html'))) {
      return c;
    }
  }
  return null;
}

const vitawiseDir = findVitawiseDir();
if (!vitawiseDir) {
  error('[VitaWise ERROR] Could not locate the VitaWise directory containing server.mjs');
  process.exit(1);
}

const serverScript = path.join(vitawiseDir, 'server.mjs');
const pidFile = path.join(vitawiseDir, '.vitawise-server.pid');
const logFile = path.join(vitawiseDir, '.vitawise-server.log');
const targetUrl = 'http://127.0.0.1:3001/';
const PORT = 3001;

// 2. Health & Readiness probe function
async function checkServerReady(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(1000)
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// 3. Browser launcher
function openBrowser(url) {
  if (skipBrowser) return;
  const startCmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(startCmd, (err) => {
    if (err) {
      error('[VitaWise] Note: Could not auto-launch browser. Please open:', url);
    }
  });
}

// 4. Main lifecycle flow
async function main() {
  log('[VitaWise Launcher] Checking existing backend status...');

  // Check if backend is already listening and responsive
  const alreadyRunning = await checkServerReady(targetUrl);
  if (alreadyRunning) {
    log('[VitaWise Launcher] Backend is already running and healthy on port 3001.');
    log(`[VitaWise Launcher] Opening VitaWise at ${targetUrl}...`);
    openBrowser(targetUrl);
    process.exit(0);
  }

  log('[VitaWise Launcher] Starting VitaWise backend in the background...');

  try {
    const outLog = fs.openSync(logFile, 'a');
    const errLog = fs.openSync(logFile, 'a');

    const child = spawn(process.execPath, [serverScript], {
      cwd: vitawiseDir,
      detached: true,
      stdio: ['ignore', outLog, errLog],
      windowsHide: true
    });
    child.unref();
  } catch (err) {
    error('[VitaWise Launcher] Failed to spawn background process:', err.message);
  }

  // Bounded readiness polling loop
  const startTime = Date.now();
  const timeoutMs = 20000;
  const pollIntervalMs = 250;
  let isReady = false;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    isReady = await checkServerReady(targetUrl);
    if (isReady) {
      break;
    }
  }

  if (isReady) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`[VitaWise Launcher] Backend is ready! (Started in ${elapsed}s)`);
    log(`[VitaWise Launcher] Opening VitaWise at ${targetUrl}...`);
    openBrowser(targetUrl);
    process.exit(0);
  } else {
    error(`[VitaWise ERROR] Backend failed to respond on ${targetUrl} within ${timeoutMs / 1000}s.`);
    error(`[VitaWise ERROR] Please inspect the server log at:\n  ${logFile}`);
    process.exit(1);
  }
}

main().catch((err) => {
  error('[VitaWise Launcher Unhandled Error]:', err.message);
  process.exit(1);
});
