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
    ? `<button type="button" data-testid="acked" class="acked" title="Already acked">acked</button>`
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

// R2 + product decision (step 2): Ack asks to confirm, and the confirm names the incident id.
// The id is taken from the row at click time and kept in the confirm, so a list that moves while the
// confirm is open cannot change which incident gets acked.
const confirmBox = document.querySelector('[data-testid="confirm"]');
const confirmText = confirmBox.querySelector('.confirm-text');
const confirmAck = confirmBox.querySelector('[data-testid="confirm-ack"]');
const confirmCancel = confirmBox.querySelector('[data-testid="confirm-cancel"]');
let pending = null; // incident id the open confirm names

function incidentById(id) {
  return latest.find((i) => i.id === id);
}

function openConfirm(id) {
  const i = incidentById(id);
  pending = id;
  if (acked.has(id)) {
    confirmText.textContent = `${id} is already acked. Nothing to ack.`;
    confirmAck.hidden = true;
    confirmCancel.textContent = 'Close';
  } else {
    confirmText.textContent = `Ack ${id}${i ? ` (${i.severity} · ${i.service} · ${i.summary})` : ''}?`;
    confirmAck.hidden = false;
    confirmAck.disabled = false;
    confirmAck.textContent = `Ack ${id}`;
    confirmCancel.textContent = 'Cancel';
  }
  confirmBox.hidden = false;
  (confirmAck.hidden ? confirmCancel : confirmAck).focus();
}

function closeConfirm() {
  pending = null;
  confirmBox.hidden = true;
}

list.addEventListener('click', (e) => {
  const hit = e.target.closest('[data-testid="ack"], [data-testid="acked"]');
  if (!hit) return;
  const id = hit.closest('[data-testid="incident-row"]').dataset.id;
  openConfirm(id);
});

confirmCancel.addEventListener('click', closeConfirm);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmBox.hidden) closeConfirm();
});

confirmAck.addEventListener('click', async () => {
  const id = pending;
  if (!id || acked.has(id)) return closeConfirm();
  confirmAck.disabled = true;
  confirmAck.textContent = `Acking ${id}…`;
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
    closeConfirm();
    render(latest);
  } catch (err) {
    console.error(err);
    confirmText.textContent = `Could not ack ${id}: ${err.message || err}`;
    confirmAck.disabled = false;
    confirmAck.textContent = `Retry ack ${id}`;
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
