import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from 'playwright';
import type { Rect } from './types.ts';

const CSS = readFileSync(fileURLToPath(new URL('../assets/overlay.css', import.meta.url)), 'utf8');

/** Browser-side controller. Installed once per page; survives hash navigation, re-installed after reloads. */
const SCRIPT = String.raw`
(() => {
  if (window.__tour) return;
  const CURSOR = '<svg viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L3 34 L11 26 L17 41 L23 38 L17 24 L28 24 Z" fill="#fff" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  const layer = document.createElement('div');
  layer.className = 'tour-layer';
  // A manual popover lives in the browser's top layer, so notes draw above <dialog> elements too.
  const popover = typeof layer.showPopover === 'function';
  if (popover) layer.setAttribute('popover', 'manual');
  const raise = () => {
    if (!popover) return;
    try { if (layer.matches(':popover-open')) layer.hidePopover(); layer.showPopover(); } catch {}
  };
  layer.innerHTML =
    '<svg class="tour-dim" hidden><defs><mask id="tour-mask"><rect width="100%" height="100%" fill="white"/><rect id="tour-hole" fill="black" rx="10"/></mask></defs><rect width="100%" height="100%" fill="#4b5560" fill-opacity="0.66" mask="url(#tour-mask)"/></svg>' +
    '<svg class="tour-connector" hidden><line x1="0" y1="0" x2="0" y2="0"/><circle r="6"/></svg>' +
    '<div class="tour-target" hidden></div>' +
    '<div class="tour-note" hidden><div class="tour-eyebrow"></div><h2></h2><p></p></div>' +
    '<div class="tour-input" hidden><span class="tour-input-label"></span><span class="tour-input-text"></span></div>' +
    '<div class="tour-slide" hidden><div class="tour-eyebrow"></div><h1></h1><p></p></div>' +
    '<div class="tour-cursor" hidden>' + CURSOR + '</div>';
  document.documentElement.appendChild(layer);
  raise();
  const $ = (s) => layer.querySelector(s);
  const dim = $('.tour-dim'), hole = $('#tour-hole'), connector = $('.tour-connector'), target = $('.tour-target');
  const note = $('.tour-note'), input = $('.tour-input'), slide = $('.tour-slide'), cursor = $('.tour-cursor');
  let cursorPos = { x: innerWidth / 2, y: innerHeight / 2 };
  cursor.style.transform = 'translate(' + cursorPos.x + 'px,' + cursorPos.y + 'px)';

  function setHole(rect) {
    if (!rect) { hole.setAttribute('width', '0'); hole.setAttribute('height', '0'); return; }
    const pad = 8;
    hole.setAttribute('x', rect.x - pad); hole.setAttribute('y', rect.y - pad);
    hole.setAttribute('width', rect.width + pad * 2); hole.setAttribute('height', rect.height + pad * 2);
  }
  function outline(rect) {
    if (!rect) { target.hidden = true; return; }
    const pad = 6;
    Object.assign(target.style, { left: (rect.x - pad) + 'px', top: (rect.y - pad) + 'px', width: (rect.width + pad * 2) + 'px', height: (rect.height + pad * 2) + 'px' });
    target.hidden = false;
  }
  function intersects(a, b, gap) {
    return !(a.x + a.width + gap < b.x || b.x + b.width + gap < a.x || a.y + a.height + gap < b.y || b.y + b.height + gap < a.y);
  }
  function placeNote(rect) {
    const W = innerWidth, H = innerHeight, m = 28, gap = 36;
    note.style.left = '0px'; note.style.top = '0px';
    const nw = note.offsetWidth, nh = note.offsetHeight;
    let pos;
    if (!rect) {
      pos = { x: (W - nw) / 2, y: (H - nh) / 2 };
    } else {
      const candidates = [
        { x: rect.x + rect.width + gap, y: rect.y + rect.height / 2 - nh / 2 },          // right
        { x: rect.x - gap - nw, y: rect.y + rect.height / 2 - nh / 2 },                   // left
        { x: rect.x + rect.width / 2 - nw / 2, y: rect.y + rect.height + gap },           // below
        { x: rect.x + rect.width / 2 - nw / 2, y: rect.y - gap - nh },                    // above
        { x: W - nw - m, y: H - nh - m },                                                 // bottom-right corner
        { x: m, y: H - nh - m },                                                          // bottom-left corner
      ];
      for (const c of candidates) {
        c.x = Math.min(Math.max(c.x, m), W - nw - m); c.y = Math.min(Math.max(c.y, m), H - nh - m);
        if (!intersects({ x: c.x, y: c.y, width: nw, height: nh }, rect, 12)) { pos = c; break; }
      }
      if (!pos) pos = { x: (W - nw) / 2, y: H - nh - m };
    }
    note.style.left = pos.x + 'px'; note.style.top = pos.y + 'px';
    return { x: pos.x, y: pos.y, width: nw, height: nh };
  }
  function connect(noteRect, rect) {
    if (!rect) { connector.hidden = true; return; }
    const ncx = noteRect.x + noteRect.width / 2, ncy = noteRect.y + noteRect.height / 2;
    const tcx = rect.x + rect.width / 2, tcy = rect.y + rect.height / 2;
    // From the note edge nearest the target to the target edge nearest the note.
    const dx = tcx - ncx, dy = tcy - ncy;
    let x1, y1, x2, y2;
    if (Math.abs(dx) * noteRect.height > Math.abs(dy) * noteRect.width) {
      x1 = dx > 0 ? noteRect.x + noteRect.width : noteRect.x; y1 = ncy;
      x2 = dx > 0 ? rect.x - 8 : rect.x + rect.width + 8; y2 = Math.min(Math.max(ncy, rect.y), rect.y + rect.height);
    } else {
      x1 = ncx; y1 = dy > 0 ? noteRect.y + noteRect.height : noteRect.y;
      x2 = Math.min(Math.max(ncx, rect.x), rect.x + rect.width); y2 = dy > 0 ? rect.y - 8 : rect.y + rect.height + 8;
    }
    const distance = Math.hypot(x2 - x1, y2 - y1);
    if (distance < 40) { connector.hidden = true; return; }
    const line = connector.querySelector('line'), dot = connector.querySelector('circle');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    dot.setAttribute('cx', x2); dot.setAttribute('cy', y2);
    connector.hidden = false;
  }

  window.__tour = {
    slide(eyebrow, title, body, closing) {
      this.clear();
      raise();
      slide.classList.toggle('tour-slide--closing', !!closing);
      slide.querySelector('.tour-eyebrow').textContent = eyebrow || '';
      slide.querySelector('h1').textContent = title || '';
      slide.querySelector('p').textContent = body || '';
      slide.hidden = false;
      cursor.hidden = true;
    },
    note(opts) {
      raise();
      slide.hidden = true;
      const rect = opts.target || null;
      note.querySelector('.tour-eyebrow').textContent = opts.eyebrow || '';
      const h2 = note.querySelector('h2'); h2.textContent = opts.title || ''; h2.hidden = !opts.title;
      note.querySelector('p').textContent = opts.caption || '';
      note.hidden = false;
      const noteRect = placeNote(rect);
      setHole(rect); dim.hidden = false;
      outline(rect);
      connect(noteRect, rect);
      if (opts.input) {
        input.querySelector('.tour-input-label').textContent = opts.inputLabel || 'Exact input';
        input.querySelector('.tour-input-text').textContent = opts.input;
        input.hidden = false;
        // Keep the input bar clear of the note and the target.
        const ir = input.getBoundingClientRect();
        if (intersects({ x: ir.left, y: ir.top, width: ir.width, height: ir.height }, noteRect, 0) || (rect && intersects({ x: ir.left, y: ir.top, width: ir.width, height: ir.height }, rect, 0))) {
          input.style.bottom = 'auto'; input.style.top = '28px';
        } else { input.style.bottom = '28px'; input.style.top = 'auto'; }
      } else input.hidden = true;
      return { note: noteRect, target: rect, clipped: note.scrollHeight > note.clientHeight + 2 };
    },
    keepTarget(rect) {
      raise();
      note.hidden = true; connector.hidden = true; input.hidden = true; slide.hidden = true;
      setHole(rect); dim.hidden = !rect; outline(rect);
      target.classList.add('tour-target--pulse');
    },
    clear() {
      note.hidden = true; connector.hidden = true; input.hidden = true; slide.hidden = true; target.hidden = true; dim.hidden = true;
      target.classList.remove('tour-target--pulse');
    },
    cursor(x, y) {
      raise();
      cursor.hidden = false;
      cursorPos = { x, y };
      cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    },
    ripple(x, y) {
      const r = document.createElement('div');
      r.className = 'tour-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px';
      layer.appendChild(r); setTimeout(() => r.remove(), 700);
    },
    hideCursor() { cursor.hidden = true; },
  };
})();
`;

export interface NotePlacement {
  note: Rect;
  target: Rect | null;
  clipped: boolean;
}

export class Overlay {
  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    const installed = await this.page.evaluate(() => Boolean((window as unknown as { __tour?: unknown }).__tour));
    if (installed) return;
    await this.page.addStyleTag({ content: CSS });
    await this.page.addScriptTag({ content: SCRIPT });
  }

  private async call<T>(expression: string, arg?: unknown): Promise<T> {
    await this.install();
    return this.page.evaluate(({ expression, arg }) => {
      const tour = (window as unknown as { __tour: Record<string, (...a: unknown[]) => unknown> }).__tour;
      const [name] = expression.split('(');
      const args = Array.isArray(arg) ? arg : [arg];
      return tour[name!]!.apply(tour, args) as T;
    }, { expression, arg });
  }

  slide(eyebrow: string, title: string, body: string, closing = false) {
    return this.call<void>('slide()', [eyebrow, title, body, closing]);
  }
  note(opts: { eyebrow?: string; title?: string; caption: string; input?: string; inputLabel?: string; target: Rect | null }) {
    return this.call<NotePlacement>('note()', [opts]);
  }
  keepTarget(rect: Rect | null) {
    return this.call<void>('keepTarget()', [rect]);
  }
  clear() {
    return this.call<void>('clear()', [null]);
  }
  cursor(x: number, y: number) {
    return this.call<void>('cursor()', [x, y]);
  }
  ripple(x: number, y: number) {
    return this.call<void>('ripple()', [x, y]);
  }
  hideCursor() {
    return this.call<void>('hideCursor()', [null]);
  }

  /** Waits for a visible, enabled, layout-stable element and returns its exact bounds. */
  async measure(locator: Locator): Promise<Rect> {
    await locator.waitFor({ state: 'visible', timeout: 15_000 });
    await locator.scrollIntoViewIfNeeded();
    let previous: Rect | null = null;
    for (let i = 0; i < 20; i++) {
      const box = await locator.boundingBox();
      if (!box || box.width <= 0 || box.height <= 0) throw new Error('Target has no visible box');
      if (previous && Math.abs(previous.x - box.x) < 0.5 && Math.abs(previous.y - box.y) < 0.5 && Math.abs(previous.width - box.width) < 0.5 && Math.abs(previous.height - box.height) < 0.5) {
        return box;
      }
      previous = box;
      await this.page.waitForTimeout(80);
    }
    return previous!;
  }
}
