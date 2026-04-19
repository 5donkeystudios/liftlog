// Run with: node generate-icons.js
// Requires: npm install canvas
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function drawIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size * 0.18;

  // Background
  ctx.fillStyle = '#1a1a2e';
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  // Barbell
  const cx = size / 2, cy = size / 2;
  const barW = size * 0.72, barH = size * 0.11;
  const plateW = size * 0.09, plateH = size * 0.32;
  const collarW = size * 0.07, collarH = size * 0.24;

  ctx.fillStyle = '#6c63ff';

  // Bar
  ctx.beginPath();
  roundRect(ctx, cx - barW / 2, cy - barH / 2, barW, barH, barH / 2);
  ctx.fill();

  // Left plates
  ctx.fillStyle = '#9d97ff';
  ctx.beginPath();
  roundRect(ctx, cx - barW / 2 - collarW - plateW, cy - plateH / 2, plateW, plateH, 4);
  ctx.fill();

  ctx.fillStyle = '#6c63ff';
  ctx.beginPath();
  roundRect(ctx, cx - barW / 2 - collarW, cy - collarH / 2, collarW, collarH, 3);
  ctx.fill();

  // Right plates
  ctx.fillStyle = '#9d97ff';
  ctx.beginPath();
  roundRect(ctx, cx + barW / 2 + collarW, cy - plateH / 2, plateW, plateH, 4);
  ctx.fill();

  ctx.fillStyle = '#6c63ff';
  ctx.beginPath();
  roundRect(ctx, cx + barW / 2, cy - collarH / 2, collarW, collarH, 3);
  ctx.fill();

  return c.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

fs.mkdirSync(path.join(__dirname, 'icons'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'icons', 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(__dirname, 'icons', 'icon-512.png'), drawIcon(512));
console.log('Icons generated: icons/icon-192.png, icons/icon-512.png');
