/**
 * Generates before/after snapshot images for the "whitespace-shift" test case.
 *
 * The "before" image simulates a typical web page layout. The "after" image is
 * identical except that a 30 px extra top-margin has been added to one section,
 * causing all content below that point to shift downward. This is exactly the
 * scenario that the band-based LCS alignment must handle correctly.
 */

'use strict';

const sharp = require('sharp');
const path = require('path');

const WIDTH  = 1280;
const EXTRA_MARGIN = 30; // px added between sections in the "after" image

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Fill a rectangular region of a raw RGBA buffer with a solid colour.
 */
function fillRect(buf, width, x, y, w, h, r, g, b, a = 255) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const i = (row * width + col) * 4;
      buf[i]     = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
}

/**
 * Draw a horizontal rule (thin dark line).
 */
function hRule(buf, width, y, pageWidth) {
  fillRect(buf, width, 0, y, pageWidth, 1, 180, 180, 180);
}

// ---------------------------------------------------------------------------
// Build a page description as a list of vertical sections
// ---------------------------------------------------------------------------

/**
 * Each section: { type, height, color?, label? }
 *
 * Types:
 *   'navbar'   – orange header bar
 *   'gap'      – white / background gap (margin / padding)
 *   'card'     – a content card block
 *   'footer'   – grey footer
 */
function buildSections(extraGapAfterSection) {
  const ORANGE  = hexToRgb('#ff6600');
  const WHITE   = hexToRgb('#f6f6ef');  // HN background
  const LIGHT   = hexToRgb('#ffffff');
  const CARD_BG = hexToRgb('#ffffff');
  const SUBTEXT = hexToRgb('#828282');
  const FOOTER  = hexToRgb('#e8e8e0');

  const sections = [];

  // Navbar
  sections.push({ type: 'navbar', height: 36, color: ORANGE });
  sections.push({ type: 'gap',    height: 8,  color: WHITE  });

  const cardColors = [
    hexToRgb('#e8f4fd'),
    hexToRgb('#fdf5e8'),
    hexToRgb('#e8fdf0'),
    hexToRgb('#fde8e8'),
    hexToRgb('#f0e8fd'),
    hexToRgb('#fdfde8'),
    hexToRgb('#e8fdfd'),
    hexToRgb('#fde8f5'),
  ];

  const TOTAL_CARDS = 18;
  const SPLIT_AT    = 8; // inject extra gap after this card index (1-based)

  for (let i = 1; i <= TOTAL_CARDS; i++) {
    const accent = cardColors[(i - 1) % cardColors.length];

    // Left accent bar + card body
    sections.push({
      type: 'card',
      height: 20,
      accent,
      color: CARD_BG,
      rank: i,
      subtext: SUBTEXT,
    });
    sections.push({ type: 'card-sub', height: 16, color: WHITE, subtext: SUBTEXT });
    sections.push({ type: 'gap', height: 2, color: WHITE });

    if (i === SPLIT_AT && extraGapAfterSection > 0) {
      // This is where the margin change occurs in the "after" image
      sections.push({ type: 'gap', height: extraGapAfterSection, color: WHITE });
    }
  }

  sections.push({ type: 'gap',    height: 10, color: WHITE  });
  sections.push({ type: 'footer', height: 30, color: FOOTER });

  return sections;
}

// ---------------------------------------------------------------------------
// Render sections into a raw RGBA buffer
// ---------------------------------------------------------------------------

function renderSections(sections) {
  const totalHeight = sections.reduce((s, sec) => s + sec.height, 0);
  const buf = Buffer.alloc(WIDTH * totalHeight * 4, 255); // white

  let y = 0;
  for (const sec of sections) {
    const [r, g, b] = sec.color || [255, 255, 255];

    if (sec.type === 'navbar') {
      fillRect(buf, WIDTH, 0, y, WIDTH, sec.height, r, g, b);
      // "Y" brand block in top-left
      fillRect(buf, WIDTH, 0, y, 18, sec.height, 255, 102, 0);
      // White text placeholder (title bar)
      fillRect(buf, WIDTH, 20, y + 10, 200, 14, 255, 255, 255, 200);
      // Login link placeholder on right
      fillRect(buf, WIDTH, WIDTH - 60, y + 10, 50, 14, 255, 255, 255, 180);

    } else if (sec.type === 'card') {
      fillRect(buf, WIDTH, 0, y, WIDTH, sec.height, r, g, b);
      // Left accent strip
      const [ar, ag, ab] = sec.accent;
      fillRect(buf, WIDTH, 40, y + 4, 4, sec.height - 8, ar, ag, ab);
      // Rank number placeholder
      fillRect(buf, WIDTH, 48, y + 4, 18, 12, 160, 160, 160);
      // Title text placeholder (varying width to look natural)
      const titleW = 400 + ((sec.rank * 37) % 300);
      fillRect(buf, WIDTH, 72, y + 4, titleW, 12, 30, 30, 30);
      // Domain badge
      fillRect(buf, WIDTH, 72 + titleW + 8, y + 4, 80, 12, 130, 160, 190);

    } else if (sec.type === 'card-sub') {
      fillRect(buf, WIDTH, 0, y, WIDTH, sec.height, r, g, b);
      // Subtext (points/time/comments)
      const [sr, sg, sb] = sec.subtext;
      fillRect(buf, WIDTH, 72, y + 3, 180, 9, sr, sg, sb);

    } else {
      // gap / footer / generic
      fillRect(buf, WIDTH, 0, y, WIDTH, sec.height, r, g, b);
    }

    y += sec.height;
  }

  return { buf, height: totalHeight };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const outDir = path.resolve(__dirname, '../snapshots/whitespace-shift');

  for (const [filename, extraGap] of [['before.png', 0], ['after.png', EXTRA_MARGIN]]) {
    const sections = buildSections(extraGap);
    const { buf, height } = renderSections(sections);

    await sharp(buf, { raw: { width: WIDTH, height, channels: 4 } })
      .png()
      .toFile(path.join(outDir, filename));

    console.log(`Wrote ${filename}  (${WIDTH}x${height})`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
