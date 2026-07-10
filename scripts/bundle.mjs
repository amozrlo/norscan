// Vendors JS libs + Tesseract wasm/traineddata into www/ so the APK runs fully offline.
// Runs at build time (CI or local) where network is available.
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import https from 'https';

const root = path.resolve('.');
const www = path.join(root, 'www');
const vendor = path.join(www, 'vendor');
const core = path.join(vendor, 'tesseract-core');   // corePath must be a DIRECTORY with all core files
const tess = path.join(www, 'tessdata');

const get = (url, dest) => new Promise((res, rej) => {
  const go = (u) => https.get(u, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return go(r.headers.location);
    if (r.statusCode !== 200) return rej(new Error(u + ' -> ' + r.statusCode));
    pipeline(r, createWriteStream(dest)).then(res).catch(rej);
  }).on('error', rej);
  go(url);
});

async function copyDep(from, to) {
  await fs.copyFile(path.join(root, 'node_modules', from), path.join(vendor, to));
  console.log('vendored', to);
}

await fs.mkdir(core, { recursive: true });
await fs.mkdir(tess, { recursive: true });

// 1) JS libraries from installed node_modules
await copyDep('@zxing/library/umd/index.min.js', 'zxing.min.js');
await copyDep('tesseract.js/dist/tesseract.min.js', 'tesseract.min.js');
await copyDep('tesseract.js/dist/worker.min.js', 'worker.min.js');
await copyDep('xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js');

// 2) FULL Tesseract core directory — all builds tesseract.js may pick (loader .wasm.js + its .wasm binary)
const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5';
const coreFiles = [
  'tesseract-core.wasm.js', 'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm'
];
// also copy worker into the core dir sibling for local worker resolution
const dl = coreFiles.map(f => [`${CORE}/${f}`, path.join(core, f)]);
dl.push(
  ['https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz', path.join(tess, 'eng.traineddata.gz')],
  ['https://tessdata.projectnaptha.com/4.0.0/ara.traineddata.gz', path.join(tess, 'ara.traineddata.gz')]
);
let failed = 0;
for (const [u, d] of dl) { try { await get(u, d); console.log('downloaded', path.basename(d)); } catch (e) { failed++; console.warn('FAILED', path.basename(d), e.message); } }
if (failed) console.warn('WARNING: ' + failed + ' asset(s) failed — the app will fall back to the CDN at runtime.');

console.log('bundle complete');
