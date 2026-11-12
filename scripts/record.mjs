// Records the board in use (open-board, watch-board, ack-incident) and writes a timeline with mm:ss marks.
// Usage: node scripts/record.mjs <board url> <out dir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir = 'recordings/run'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1100, height: 720 },
  locale: 'en-GB',
  timezoneId: 'Europe/Berlin',
  recordVideo: { dir: outDir, size: { width: 1100, height: 720 } },
});
// A visible pointer and a caption, so the video shows where the click lands.
await context.addInitScript(() => {
  window.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.id = '__pointer';
    dot.style.cssText =
      'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,0,0,.55);border:2px solid #b00;pointer-events:none;left:-50px;top:-50px;transition:transform .1s';
    document.body.appendChild(dot);
    document.addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', () => (dot.style.transform = 'scale(1.8)'), true);
    document.addEventListener('mouseup', () => (dot.style.transform = ''), true);
    const cap = document.createElement('div');
    cap.id = '__caption';
    cap.style.cssText =
      'position:fixed;z-index:99998;right:12px;bottom:12px;max-width:520px;padding:8px 12px;background:#111;color:#fff;font:13px/1.4 ui-monospace,monospace;border-radius:6px;opacity:.9;pointer-events:none';
    document.body.appendChild(cap);
  });
});

const t0 = Date.now();
const page = await context.newPage();
const mmss = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const timeline = [];
const mark = async (flow, note, extra = {}) => {
  const at = mmss();
  timeline.push({ at, flow, note, ...extra });
  console.log(at, flow, note, JSON.stringify(extra));
  await page.evaluate((t) => { const c = document.getElementById('__caption'); if (c) c.textContent = t; }, `${at}  ${flow}: ${note}`).catch(() => {});
};
const acks = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('ack ')) {
    const [, id, ackedAt, receipt] = t.split(' ');
    acks.push({ at: mmss(), id, ackedAt, receipt });
  }
});

await page.goto(url);
const loaderSeen = await page.locator('[data-testid="loader"]').count();
await mark('open-board', `page opened, loader present=${loaderSeen > 0}`);
await page.locator('[data-testid="incident-row"]').first().waitFor();
const sha = await page.locator('meta[name="build"]').getAttribute('content');
const footerSha = await page.locator('[data-testid="build-sha"]').textContent();
const loaderAfter = await page.locator('[data-testid="loader"]').count();
const rows0 = await page.locator('[data-testid="incident-row"]').evaluateAll((els) => els.map((e) => e.dataset.id));
const time0 = await page.locator('[data-testid="incident-row"] time').first().evaluate((t) => ({ text: t.textContent, datetime: t.getAttribute('datetime') }));
await mark('open-board', `${rows0.length} incidents, newest first; loader gone=${loaderAfter === 0}; build ${footerSha}; first time ${time0.text} (UTC ${time0.datetime})`, { sha, footerSha });
await page.waitForTimeout(2500);

// watch-board: wait for a new incident to arrive at the top without a reload.
const top0 = rows0[0];
await mark('watch-board', `watching; top row is ${top0}`);
await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== id, top0, { timeout: 60000 });
const top1 = await page.locator('[data-testid="incident-row"]').first().getAttribute('data-id');
await mark('watch-board', `new incident ${top1} appeared at the top without a reload`, { newTop: top1 });
await page.waitForTimeout(2500);

// ack-incident #1: on-call aims at a row and clicks Ack right away.
const aimRow1 = page.locator('[data-testid="incident-row"]').nth(2);
const aim1 = await aimRow1.getAttribute('data-id');
const box1 = await aimRow1.locator('[data-testid="ack"]').boundingBox();
await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2, { steps: 15 });
await mark('ack-incident', `aiming at Ack on ${aim1}, clicking now`, { aimed: aim1 });
await page.mouse.click(box1.x + box1.width / 2, box1.y + box1.height / 2);
await page.locator(`[data-testid="incident-row"][data-id="${aim1}"] [data-testid="acked"]`).waitFor({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
await mark('ack-incident', `acked: ${acks.map((a) => a.id).join(', ')}`, { aimed: aim1, acked: acks.at(-1)?.id });
await page.waitForTimeout(2500);

// ack-incident #2: on-call aims at a row, reads it (human reaction time), and a new incident lands
// while the pointer rests on the button. The click goes to whatever row is under the pointer then.
const aimRow2 = page.locator('[data-testid="incident-row"]').nth(5);
const aim2 = await aimRow2.getAttribute('data-id');
const box2 = await aimRow2.locator('[data-testid="ack"]').boundingBox();
const x2 = box2.x + box2.width / 2, y2 = box2.y + box2.height / 2;
await page.mouse.move(x2, y2, { steps: 15 });
const topBefore = await page.locator('[data-testid="incident-row"]').first().getAttribute('data-id');
await mark('ack-incident', `pointer on Ack of ${aim2}; reading the row before clicking`, { aimed: aim2 });
await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== id, topBefore, { timeout: 60000 });
await page.waitForTimeout(250); // reaction time: the click was already on its way
const underPointer = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="incident-row"]')?.dataset.id, [x2, y2]);
const before = acks.length;
await page.mouse.click(x2, y2);
for (let i = 0; i < 40 && acks.length === before; i++) await page.waitForTimeout(100);
const got = acks.length > before ? acks.at(-1) : null;
await mark('ack-incident', `aimed ${aim2}, list moved, acked ${got?.id}${got?.id !== aim2 ? '  <-- WRONG INCIDENT' : ''}`, { aimed: aim2, underPointer, acked: got?.id, receipt: got?.receipt });
await page.waitForTimeout(4000);

const ackedIds = await page.locator('[data-testid="acked"]').evaluateAll((els) => els.map((e) => e.closest('[data-testid="incident-row"]').dataset.id));
await mark('watch-board', `rows marked acked: ${ackedIds.join(', ')}; aimed ${aim2} still shows Ack=${!ackedIds.includes(aim2)}`);
await page.waitForTimeout(3000);

const video = page.video();
await context.close();
await browser.close();
const vpath = await video.path();
fs.renameSync(vpath, path.join(outDir, 'board.webm'));
fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ url, sha, footerSha, timeline, acks }, null, 2));
console.log('done', outDir);
