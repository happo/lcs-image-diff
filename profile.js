#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

import imageDiff from './src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RUNS_PER_SNAPSHOT = 3;

function hashFunction(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

async function loadImage(filePath) {
  const s = sharp(filePath);
  const [metadata, buffer] = await Promise.all([
    s.metadata(),
    s.ensureAlpha().raw().toBuffer(),
  ]);
  return { data: buffer, width: metadata.width, height: metadata.height };
}

function formatMs(ms) {
  return `${ms.toFixed(1)}ms`;
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  return { mean, min, max, median };
}

async function main() {
  const snapshotsDir = path.resolve(__dirname, 'snapshots');
  const snapshots = fs
    .readdirSync(snapshotsDir)
    .filter(name => fs.statSync(path.join(snapshotsDir, name)).isDirectory())
    .sort();

  console.log(`Profiling ${snapshots.length} snapshots, ${RUNS_PER_SNAPSHOT} runs each\n`);
  console.log(
    `${'Snapshot'.padEnd(40)} ${'Runs'.padStart(4)}  ${'Min'.padStart(9)}  ${'Median'.padStart(9)}  ${'Mean'.padStart(9)}  ${'Max'.padStart(9)}  ${'Size'.padStart(15)}`,
  );
  console.log('-'.repeat(105));

  const allResults = [];

  for (const snapshot of snapshots) {
    const beforePath = path.join(snapshotsDir, snapshot, 'before.png');
    const afterPath = path.join(snapshotsDir, snapshot, 'after.png');

    if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
      console.log(`  ${snapshot}: missing before/after images, skipping`);
      continue;
    }

    const [image1, image2] = await Promise.all([
      loadImage(beforePath),
      loadImage(afterPath),
    ]);

    const sizeLabel = `${image1.width}x${image1.height} / ${image2.width}x${image2.height}`;

    const times = [];
    for (let i = 0; i < RUNS_PER_SNAPSHOT; i++) {
      const t0 = performance.now();
      imageDiff(image1, image2, { hashFunction });
      const t1 = performance.now();
      times.push(t1 - t0);
    }

    const s = stats(times);
    allResults.push({ snapshot, ...s, sizeLabel });

    console.log(
      `${snapshot.padEnd(40)} ${String(RUNS_PER_SNAPSHOT).padStart(4)}  ${formatMs(s.min).padStart(9)}  ${formatMs(s.median).padStart(9)}  ${formatMs(s.mean).padStart(9)}  ${formatMs(s.max).padStart(9)}  ${sizeLabel.padStart(15)}`,
    );
  }

  // Summary
  const totalMean = allResults.reduce((a, r) => a + r.mean, 0);
  console.log('-'.repeat(105));
  console.log(`${'TOTAL (sum of means)'.padEnd(40)} ${''.padStart(4)}  ${''.padStart(9)}  ${''.padStart(9)}  ${formatMs(totalMean).padStart(9)}`);

  const slowest = [...allResults].sort((a, b) => b.median - a.median)[0];
  const fastest = [...allResults].sort((a, b) => a.median - b.median)[0];
  console.log(`\nSlowest: ${slowest.snapshot} (${formatMs(slowest.median)} median)`);
  console.log(`Fastest: ${fastest.snapshot} (${formatMs(fastest.median)} median)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
