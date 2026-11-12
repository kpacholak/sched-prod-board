import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

// Rows the viewer acked on this board (survive every refresh).
const acked = new Map(); // id -> ackedAt

// R5: viewer's local time zone and locale order (en-GB, de, pl -> dd/mm; en-US -> mm/dd).
const timeFmt = new Intl.DateTimeFormat(navigator.languages?.[0] || navigator.language || undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function rowHtml(i) {
  const ackCell = acked.has(i.id)
    ? `<span data-testid="acked" class="acked">acked</span>`
    : `<button type="button" data-testid="ack" class="ack">Ack</button>`;
  return `<span class="id">${esc(i.id)}</span>
        <span class="sev">${esc(i.severity)}</span>
        <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
        <time datetime="${esc(i.openedAt)}" title="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
        <span class="act">${ackCell}</span>`;
}

// R1: newest first. Rows are keyed by id, so a refresh adds new rows at the top and keeps the rest.
function render(incidents) {
  const sorted = [...incidents].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  const existing = new Map([...list.children].map((li) => [li.dataset.id, li]));
  let prev = null;
  for (const i of sorted) {
    let li = existing.get(i.id);
    const html = rowHtml(i);
    if (!li) {
      li = document.createElement('li');
      li.dataset.testid = 'incident-row';
      li.setAttribute('data-testid', 'incident-row');
      li.dataset.id = i.id;
      li.classList.add('row', 'new');
      setTimeout(() => li.classList.remove('new'), 1500);
    }
    li.className = li.className.replace(/\bsev\d\b/g, '').trim() + ` ${i.severity}`;
    if (li.dataset.html !== html) {
      li.innerHTML = html;
      li.dataset.html = html;
    }
    existing.delete(i.id);
    const want = prev ? prev.nextSibling : list.firstChild;
    if (want !== li) list.insertBefore(li, want);
    prev = li;
  }
  for (const gone of existing.values()) gone.remove();
  empty.hidden = sorted.length > 0;
  list.hidden = sorted.length === 0;
}

let latest = [];

// R2: Ack calls api.ack(id) and marks the row acked.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.closest('[data-testid="incident-row"]').dataset.id;
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
    render(latest);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Ack';
    btn.title = String(err.message || err);
  }
});

async function refresh() {
  const page = await fetchIncidents();
  latest = page.incidents;
  render(latest);
  board.dataset.updatedAt = page.updatedAt;
}

// R3: loader until the first answer is on screen.
async function start() {
  for (;;) {
    try {
      await refresh();
      break;
    } catch (err) {
      console.error(err);
      loader.textContent = 'Could not load incidents. Retrying…';
      await new Promise((r) => setTimeout(r, REFRESH_MS));
    }
  }
  loader.remove();
  // R4: keep the board current without a reload.
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      busy = false;
    }
  }, REFRESH_MS);
}

start();
