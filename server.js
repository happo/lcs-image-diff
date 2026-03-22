#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3456;
const SNAPSHOTS_DIR = join(__dirname, 'snapshots');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
};

function getSnapshots() {
  return fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((name) => {
      const dir = path.join(SNAPSHOTS_DIR, name);
      return (
        fs.statSync(dir).isDirectory() &&
        fs.existsSync(path.join(dir, 'before.png')) &&
        fs.existsSync(path.join(dir, 'after.png'))
      );
    })
    .sort();
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Diff Viewer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      display: flex;
      height: 100vh;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #111;
      color: #eee;
    }

    /* Sidebar */
    #sidebar {
      width: 220px;
      flex-shrink: 0;
      background: #1a1a1a;
      border-right: 1px solid #333;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    #sidebar h1 {
      font-size: 13px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: .08em;
      padding: 14px 14px 10px;
      border-bottom: 1px solid #2a2a2a;
    }

    .snapshot-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      cursor: pointer;
      border-bottom: 1px solid #222;
      transition: background 0.1s;
    }

    .snapshot-item:hover { background: #252525; }
    .snapshot-item.active { background: #1d3557; }

    .snapshot-thumb {
      width: 48px;
      height: 36px;
      object-fit: cover;
      border-radius: 3px;
      background: #2a2a2a;
      flex-shrink: 0;
    }

    .snapshot-name {
      font-size: 12px;
      line-height: 1.4;
      word-break: break-word;
    }

    /* Main content */
    #main {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    #placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #555;
      font-size: 15px;
    }

    #viewer { display: none; }

    #viewer h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #ccc;
    }

    .images-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      align-items: start;
    }

    .image-block h3 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .07em;
      color: #666;
      margin-bottom: 8px;
    }

    .image-block img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
      border: 1px solid #333;
      background: #fff;
    }
  </style>
</head>
<body>
  <nav id="sidebar">
    <h1>Snapshots</h1>
    <div id="snapshot-list"></div>
  </nav>

  <main id="main">
    <div id="placeholder">Select a snapshot</div>
    <div id="viewer">
      <h2 id="viewer-title"></h2>
      <div class="images-row">
        <div class="image-block">
          <h3>Before</h3>
          <img id="img-before" src="" alt="Before">
        </div>
        <div class="image-block">
          <h3>After</h3>
          <img id="img-after" src="" alt="After">
        </div>
        <div class="image-block">
          <h3>Diff</h3>
          <img id="img-diff" src="" alt="Diff">
        </div>
      </div>
    </div>
  </main>

  <script>
    async function init() {
      const res = await fetch('/api/snapshots');
      const snapshots = await res.json();

      const list = document.getElementById('snapshot-list');
      snapshots.forEach((name) => {
        const item = document.createElement('div');
        item.className = 'snapshot-item';
        item.dataset.name = name;

        const thumb = document.createElement('img');
        thumb.className = 'snapshot-thumb';
        thumb.src = '/snapshots/' + name + '/diff.png';
        thumb.alt = '';

        const label = document.createElement('span');
        label.className = 'snapshot-name';
        label.textContent = name;

        item.appendChild(thumb);
        item.appendChild(label);
        item.addEventListener('click', () => selectSnapshot(name));
        list.appendChild(item);
      });

      // Auto-select first
      if (snapshots.length > 0) selectSnapshot(snapshots[0]);
    }

    function selectSnapshot(name) {
      document.querySelectorAll('.snapshot-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.name === name);
      });

      document.getElementById('placeholder').style.display = 'none';
      const viewer = document.getElementById('viewer');
      viewer.style.display = 'block';

      document.getElementById('viewer-title').textContent = name;
      document.getElementById('img-before').src = '/snapshots/' + name + '/before.png?' + Date.now();
      document.getElementById('img-after').src = '/snapshots/' + name + '/after.png?' + Date.now();
      document.getElementById('img-diff').src = '/snapshots/' + name + '/diff.png?' + Date.now();
    }

    init();
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // API: list snapshots
  if (pathname === '/api/snapshots') {
    const snapshots = getSnapshots();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshots));
    return;
  }

  // Serve snapshot images: /snapshots/<name>/<file>.png
  const snapshotMatch = pathname.match(/^\/snapshots\/([^/]+)\/(before|after|diff)\.png$/);
  if (snapshotMatch) {
    const [, name, file] = snapshotMatch;
    const filePath = path.join(SNAPSHOTS_DIR, name, `${file}.png`);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // Serve the HTML page for everything else
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Diff viewer running at http://localhost:${PORT}`);
});
