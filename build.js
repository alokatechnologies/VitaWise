import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');

console.log('[VitaWise Build] Preparing production distribution...');

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

fs.cpSync(publicDir, distDir, { recursive: true });

console.log(`[VitaWise Build] Successfully built assets to ${distDir}`);
