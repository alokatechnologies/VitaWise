import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const pidFile = vitawiseDir ? path.join(vitawiseDir, '.vitawise-server.pid') : null;
const PORT = 3001;

console.log('[VitaWise Lifecycle] Checking for active VitaWise backend process...');

function getPidsOnPort(port) {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const output = execSync('netstat -ano', { encoding: 'utf-8' });
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(Number(pid))) {
            pids.add(Number(pid));
          }
        }
      }
    } else {
      const output = execSync(`lsof -t -i :${port} || true`, { encoding: 'utf-8' });
      for (const line of output.trim().split('\n')) {
        if (line.trim() && !isNaN(Number(line.trim()))) {
          pids.add(Number(line.trim()));
        }
      }
    }
  } catch (err) {
    console.error('Could not query port:', err.message);
  }
  return Array.from(pids);
}

let storedPid = null;
if (pidFile && fs.existsSync(pidFile)) {
  try {
    const raw = fs.readFileSync(pidFile, 'utf-8').trim();
    if (raw && !isNaN(Number(raw))) {
      storedPid = Number(raw);
    }
  } catch (_) {}
}

const activePids = getPidsOnPort(PORT);

if (activePids.length === 0 && !storedPid) {
  console.log('[VitaWise Lifecycle] No running backend process found on port ' + PORT + '.');
  process.exit(0);
}

const pidsToTerminate = new Set(activePids);
if (storedPid) pidsToTerminate.add(storedPid);

let killedCount = 0;
for (const pid of pidsToTerminate) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`[VitaWise Lifecycle] Successfully stopped backend process (PID: ${pid}).`);
    killedCount++;
  } catch (e) {
    // Process might have already exited
  }
}

if (pidFile && fs.existsSync(pidFile)) {
  try {
    fs.unlinkSync(pidFile);
  } catch (_) {}
}

if (killedCount > 0) {
  console.log('[VitaWise Lifecycle] VitaWise backend is now stopped.');
} else {
  console.log('[VitaWise Lifecycle] Process was already stopped.');
}
