// dev/creator=tubakhxn
import { analyze, DocModel } from "./core.js";
const TONES = ["professional", "friendly", "formal", "concise", "conversational"];
const OPS = ["shorten", "expand", "simplify", "clarify", "professional"];
const MODES = ["word", "sentence", "paragraph"];
const OP_LABEL = { shorten: "Shorten", expand: "Expand", simplify: "Simplify language", clarify: "Improve clarity", professional: "Rewrite professionally" };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function makeApi(base = "") {
  const post = async (path, body) => {
    const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error("text engine returned " + res.status);
    return res.json();
  };
  return {
    synonyms: (word) => post("/api/synonyms", { word }),
    sentenceAll: (text) => post("/api/sentence/all", { text }),
    paragraphAll: (text) => post("/api/paragraph/all", { text })
  };
}
class EditorController {
  constructor({ refs, api, onChange }) {
    this.refs = refs;
    this.api = api;
    this.onChange = onChange || (() => {
    });
    this.d = refs.docEl.ownerDocument;
    this.model = new DocModel([]);
    this.mode = "word";
    this.sel = { p: 0, s: 0, w: 0 };
    this.panel = null;
    this._bindMouse();
  }
  loadParagraphs(paras, label = "document") {
    this.model.setDocument(paras);
    this.panel = null;
    this.sel = { p: 0, s: 0, w: 0 };
    this.mode = "word";
    this.render();
    this.say(`Loaded ${label}`);
  }
  get paras() {
    return this.model.paras;
  }
  getText() {
    return this.model.text;
  }
  render() {
    const { docEl } = this.refs, d = this.d, paras = this.paras;
    this.an = paras.map(analyze);
    docEl.replaceChildren();
    this.wordEls = [];
    this.flatWords = [];
    this.wordIdx = new Map();
    this.sentEls = new Map();
    this.flatSents = [];
    this.paraEls = [];
    paras.forEach((text, p) => {
      const pe = d.createElement("p");
      pe.className = "para";
      pe.dataset.p = p;
      let cur = 0;
      this.an[p].forEach((sen, s) => {
        if (sen.start > cur) pe.append(text.slice(cur, sen.start));
        const se = d.createElement("span");
        se.className = "sent";
        se.dataset.p = p;
        se.dataset.s = s;
        let c = sen.start;
        sen.words.forEach((w, wi) => {
          if (w.start > c) se.append(text.slice(c, w.start));
          const we = d.createElement("span");
          we.className = "word";
          we.dataset.p = p;
          we.dataset.s = s;
          we.dataset.w = wi;
          we.textContent = text.slice(w.start, w.end);
          se.append(we);
          this.wordIdx.set(`${p}:${s}:${wi}`, this.flatWords.length);
          this.flatWords.push({ p, s, w: wi });
          this.wordEls.push(we);
          c = w.end;
        });
        if (sen.end > c) se.append(text.slice(c, sen.end));
        pe.append(se);
        this.sentEls.set(`${p}:${s}`, se);
        this.flatSents.push({ p, s });
        cur = sen.end;
      });
      if (cur < text.length) pe.append(text.slice(cur));
      docEl.append(pe);
      this.paraEls.push(pe);
    });
    if (!paras.length) docEl.textContent = "Nothing to edit yet. Use Paste to add some text.";
    this._clampSel();
    this.refreshSelection();
    this.updateHeader();
    this.onChange();
  }
  _clampSel() {
    const n = this.paras.length;
    if (!n) {
      this.sel = { p: 0, s: 0, w: 0 };
      return;
    }
    const p = clamp(this.sel.p, 0, n - 1);
    const sents = this.an[p];
    const s = clamp(this.sel.s, 0, Math.max(0, sents.length - 1));
    const w = clamp(this.sel.w, 0, Math.max(0, (sents[s]?.words.length || 1) - 1));
    this.sel = { p, s, w };
  }
  _curWord() {
    const i = this.wordIdx?.get(`${this.sel.p}:${this.sel.s}:${this.sel.w}`);
    return i === void 0 ? -1 : i;
  }
  _setWord(i) {
    if (!this.flatWords.length) return;
    this.sel = { ...this.flatWords[clamp(i, 0, this.flatWords.length - 1)] };
    this.refreshSelection();
  }
  _curSent() {
    return this.flatSents ? this.flatSents.findIndex((x) => x.p === this.sel.p && x.s === this.sel.s) : -1;
  }
  refreshSelection() {
    const { p, s } = this.sel;
    const wi = this._curWord();
    this.paraEls.forEach((e, i) => {
      e.classList.toggle("active", i === p);
      e.classList.toggle("sel", this.mode === "paragraph" && i === p);
    });
    this.sentEls.forEach((e, k) => e.classList.toggle("sel", this.mode === "sentence" && k === `${p}:${s}`));
    this.sentEls.forEach((e, k) => e.classList.toggle("current", this.mode === "word" && k === `${p}:${s}`));
    this.wordEls.forEach((e, i) => e.classList.toggle("sel", this.mode === "word" && i === wi));
    const target = this.mode === "word" ? this.wordEls[wi] : this.mode === "sentence" ? this.sentEls.get(`${p}:${s}`) : this.paraEls[p];
    if (target && target.scrollIntoView && !this.panel) target.scrollIntoView({ block: "center", behavior: "smooth" });
    this.refs.modeEls && Object.entries(this.refs.modeEls).forEach(([m, e]) => e.classList.toggle("on", m === this.mode));
  }
  cycleMode() {
    if (this.panel || !this.paras.length) return;
    const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.setMode(next);
  }
  setMode(next) {
    if (this.panel || !MODES.includes(next)) return;
    const prev = this.mode;
    if (next === "word") {
      let i = this.flatWords.findIndex((x) => x.p === this.sel.p && x.s >= this.sel.s);
      if (prev === "paragraph") i = this.flatWords.findIndex((x) => x.p === this.sel.p);
      if (i < 0) i = this.flatWords.length - 1;
      if (i >= 0) this.sel = { ...this.flatWords[i] };
    }
    this.mode = next;
    this.refreshSelection();
    this.updateHeader();
    this.say(`Browsing by ${next}`);
  }
  move(dx, dy) {
    if (!this.paras.length) return;
    if (this.panel) {
      this.panelStep(dx + dy);
      return;
    }
    if (this.mode === "word") {
      const i = this._curWord();
      if (i < 0) return;
      this._setWord(dx ? i + dx : this._verticalWord(i, dy));
    } else if (this.mode === "sentence") {
      const i = this._curSent();
      const n = clamp(i + (dx || dy), 0, this.flatSents.length - 1);
      this.sel = { p: this.flatSents[n].p, s: this.flatSents[n].s, w: 0 };
      this._fixWordIndex();
      this.refreshSelection();
    } else {
      const p = clamp(this.sel.p + (dx || dy), 0, this.paras.length - 1);
      this.sel = { p, s: 0, w: 0 };
      this._fixWordIndex();
      this.refreshSelection();
    }
    this.updateHeader();
  }
  _fixWordIndex() {
    const { p, s } = this.sel;
    const i = this.flatWords.findIndex((x) => x.p === p && x.s >= s);
    if (i >= 0 && this.flatWords[i].p === p) this.sel = { ...this.flatWords[i] };
  }
  _verticalWord(cur, dir) {
    const els = this.wordEls, n = els.length;
    const r = els[cur].getBoundingClientRect();
    if (!r.width && !r.height) return clamp(cur + dir * 6, 0, n - 1);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, tol = Math.max(4, r.height * 0.6);
    const centerY = (e) => {
      const b = e.getBoundingClientRect();
      return b.top + b.height / 2;
    };
    let j = cur + dir;
    while (j >= 0 && j < n && Math.abs(centerY(els[j]) - cy) <= tol) j += dir;
    if (j < 0 || j >= n) return cur;
    const ly = centerY(els[j]);
    let best = j, bd = Infinity;
    for (const step of [-1, 1]) {
      for (let k = step === -1 ? j : j + 1; k >= 0 && k < n; k += step) {
        if (Math.abs(centerY(els[k]) - ly) > tol) break;
        const b = els[k].getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - cx);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    }
    return best;
  }
  handleGestureEvent(ev) {
    switch (ev.type) {
      case "move":
        this.move(ev.dx, ev.dy);
        break;
      case "cycle-mode":
        this.cycleMode();
        break;
      case "open":
        this.lastOpen = this.openPanel();
        break;
      case "confirm":
        this.confirm();
        break;
      case "back":
        this.back();
        break;
      case "undo":
        this.undo();
        break;
      default:
        break;
    }
  }
  context() {
    if (this.panel) return { editing: true, stepX: 0.07, stepY: 0.1 };
    return this.mode === "word" ? { editing: false, stepX: 0.04, stepY: 0.075 } : { editing: false, stepX: 0.085, stepY: 0.085 };
  }
  get editing() {
    return !!this.panel;
  }
  _wordText() {
    const w = this.an[this.sel.p]?.[this.sel.s]?.words[this.sel.w];
    return w ? { w, text: this.paras[this.sel.p].slice(w.start, w.end) } : null;
  }
  async openPanel() {
    if (this.panel || !this.paras.length) return;
    const { p, s } = this.sel;
    if (this.mode === "word") {
      const cur = this._wordText();
      if (!cur) {
        this.say("No word selected");
        return;
      }
      const panel = { type: "word", word: cur.text, anchor: this._curWord(), items: [], index: 0, loading: true };
      this.panel = panel;
      this._renderPanel();
      try {
        const res = await this.api.synonyms(cur.text);
        if (this.panel !== panel) return;
        panel.items = res.alternatives || [];
      } catch (e) {
        if (this.panel !== panel) return;
        panel.error = "The text engine is not reachable.";
      }
      panel.loading = false;
      this._renderPanel();
      if (panel.error) this.say(panel.error, "error");
      else if (!panel.items.length) this.say(`No alternatives for "${cur.text}" in the local lexicon`);
    } else {
      const sentence = this.mode === "sentence";
      const sen = this.an[p][s];
      const original = sentence ? this.paras[p].slice(sen.start, sen.end) : this.paras[p];
      const panel = { type: sentence ? "tone" : "op", keys: sentence ? TONES : OPS, original, index: 0, loading: true, variants: null };
      this.panel = panel;
      this._renderPanel();
      try {
        panel.variants = await (sentence ? this.api.sentenceAll(original) : this.api.paragraphAll(original));
      } catch (e) {
        if (this.panel !== panel) return;
        panel.error = "The text engine is not reachable.";
      }
      if (this.panel !== panel) return;
      panel.loading = false;
      this._renderPanel();
      if (panel.error) this.say(panel.error, "error");
    }
  }
  panelStep(delta) {
    const pl = this.panel;
    if (!pl || !delta) return;
    const n = pl.type === "word" ? pl.items.length : pl.keys.length;
    if (!n) return;
    pl.index = clamp(pl.index + Math.sign(delta), 0, n - 1);
    this._renderPanel();
  }
  panelSet(i) {
    const pl = this.panel;
    if (!pl) return;
    pl.index = i;
    this._renderPanel();
  }
  back() {
    if (this.panel) {
      this.closePanel();
      this.say("Back to browsing");
    } else this.say(`Browsing by ${this.mode}`);
  }
  closePanel() {
    this.panel = null;
    this.refs.overlayEl.replaceChildren();
    this.refs.overlayEl.className = "overlay";
    this.refs.docEl.classList.remove("dimmed");
    this.refreshSelection();
    this.updateHeader();
  }
  confirm() {
    const pl = this.panel;
    if (!pl || pl.loading) return false;
    const { p, s } = this.sel;
    if (pl.type === "word") {
      const alt = pl.items[pl.index], cur = this._wordText();
      if (!alt || !cur) {
        this.say("Nothing to apply - no alternative highlighted");
        return false;
      }
      this.model.replaceRange(p, cur.w.start, cur.w.end, alt);
      this.closePanel();
      this.render();
      this.say(`Replaced "${cur.text}" with "${alt}"`, "ok");
      return true;
    }
    const key = pl.keys[pl.index], v = pl.variants && pl.variants[key];
    if (!v) {
      this.say("Text engine unavailable - nothing changed", "error");
      return false;
    }
    if (!v.changed) {
      this.say(v.note || "No change for this option", "info");
      this.closePanel();
      return false;
    }
    if (pl.type === "tone") {
      const sen = this.an[p][s];
      this.model.replaceRange(p, sen.start, sen.end, v.text);
      this.closePanel();
      this.render();
      this.say(`Sentence rewritten: ${cap(key)}`, "ok");
    } else {
      this.model.replaceParagraph(p, v.text);
      this.closePanel();
      this.render();
      this.say(`Paragraph updated: ${OP_LABEL[key]}`, "ok");
    }
    return true;
  }
  undo() {
    if (this.panel) this.closePanel();
    const ok = this.model.undo();
    this.render();
    this.say(ok ? "Undid last edit" : "Nothing to undo");
    return ok;
  }
  redo() {
    if (this.panel) this.closePanel();
    const ok = this.model.redo();
    this.render();
    this.say(ok ? "Redid edit" : "Nothing to redo");
    return ok;
  }
  reset() {
    if (this.panel) this.closePanel();
    const ok = this.model.reset();
    this.render();
    this.say(ok ? "Document reset (undo restores your edits)" : "Already at the original text");
    return ok;
  }
  say(msg, kind = "info") {
    const el = this.refs.statusEl;
    if (el) {
      el.textContent = msg;
      el.dataset.kind = kind;
    }
    this.lastStatus = msg;
  }
  updateHeader() {
    const { titleEl, subtitleEl } = this.refs, pl = this.panel;
    if (!titleEl) return;
    if (!pl) {
      titleEl.textContent = `BROWSE BY ${this.mode.toUpperCase()}`;
      subtitleEl.textContent = this.mode === "word" ? "pinch to explore alternatives" : this.mode === "sentence" ? "pinch to change the tone" : "pinch to reshape the paragraph";
    } else if (pl.type === "word") {
      titleEl.textContent = `FOCUS BY WORD  \u201C${pl.word}\u201D`;
      subtitleEl.textContent = pl.loading ? "LOOKING UP ALTERNATIVES..." : "EXPLORE WORD ALTERNATIVES";
    } else if (pl.type === "tone") {
      titleEl.textContent = "FOCUS BY SENTENCE";
      subtitleEl.textContent = `CHANGE SENTENCE TONE: ${pl.keys[pl.index].toUpperCase()}`;
    } else {
      titleEl.textContent = "FOCUS BY PARAGRAPH";
      subtitleEl.textContent = `ADJUST PARAGRAPH: ${OP_LABEL[pl.keys[pl.index]].toUpperCase()}`;
    }
  }
  _renderPanel() {
    const pl = this.panel, ov = this.refs.overlayEl, d = this.d;
    this.updateHeader();
    ov.replaceChildren();
    this.refs.docEl.classList.add("dimmed");
    if (pl.type === "word") this._renderWordPanel(ov, d, pl);
    else this._renderListPanel(ov, d, pl);
  }
  _renderWordPanel(ov, d, pl) {
    ov.className = "overlay show word";
    const stage = ov.getBoundingClientRect();
    const wEl = this.wordEls[pl.anchor];
    const wr = wEl ? wEl.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const W = stage.width || 600, H = stage.height || 500;
    const cx = clamp(wr.left - stage.left + wr.width / 2, 170, Math.max(170, W - 170));
    const cy = clamp(wr.top - stage.top + wr.height / 2, 120, Math.max(120, H - 120));
    const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "links");
    ov.append(svg);
    const center = d.createElement("div");
    center.className = "center-word";
    center.textContent = pl.word;
    center.style.left = cx + "px";
    center.style.top = cy + "px";
    ov.append(center);
    if (pl.loading || pl.error || !pl.items.length) {
      const note = d.createElement("div");
      note.className = "alt-note";
      note.textContent = pl.loading ? "looking up alternatives..." : pl.error || "no alternatives in the local lexicon";
      note.style.left = cx + "px";
      note.style.top = cy + 34 + "px";
      ov.append(note);
      return;
    }
    const n = pl.items.length, rx = Math.min(150, W / 2 - 70), ry = Math.min(95, H / 2 - 40);
    pl.items.forEach((text, i) => {
      const a = (-90 + 360 / n * i) * Math.PI / 180;
      const el = d.createElement("div");
      el.className = "alt" + (i === pl.index ? " on" : "");
      el.dataset.i = i;
      el.textContent = text;
      ov.append(el);
      const lw = el.offsetWidth || 90, lh = el.offsetHeight || 26;
      const x = clamp(cx + rx * Math.cos(a), lw / 2 + 6, W - lw / 2 - 6);
      const y = clamp(cy + ry * Math.sin(a) * 1.15, lh / 2 + 6, H - lh / 2 - 6);
      el.style.left = x + "px";
      el.style.top = y + "px";
      const path = d.createElementNS("http://www.w3.org/2000/svg", "path");
      const mx = (cx + x) / 2 - (y - cy) * 0.18, my = (cy + y) / 2 + (x - cx) * 0.18;
      path.setAttribute("d", `M${cx},${cy} Q${mx},${my} ${x},${y}`);
      path.setAttribute("class", i === pl.index ? "link on" : "link");
      svg.append(path);
    });
  }
  _renderListPanel(ov, d, pl) {
    ov.className = "overlay show list";
    const box = d.createElement("div");
    box.className = "chooser";
    const track = d.createElement("div");
    track.className = "track";
    const knob = d.createElement("div");
    knob.className = "knob";
    const n = pl.keys.length;
    knob.style.top = `calc(14px + (100% - 28px) * ${n > 1 ? pl.index / (n - 1) : 0})`;
    track.append(knob);
    box.append(track);
    const list = d.createElement("div");
    list.className = "opts";
    pl.keys.forEach((k, i) => {
      const o = d.createElement("div");
      o.className = "opt" + (i === pl.index ? " on" : "");
      o.dataset.i = i;
      o.textContent = pl.type === "tone" ? cap(k) : OP_LABEL[k];
      list.append(o);
    });
    box.append(list);
    ov.append(box);
    const pv = d.createElement("div");
    pv.className = "preview";
    const head = d.createElement("div");
    head.className = "pv-head";
    const body = d.createElement("div");
    body.className = "pv-body";
    if (pl.loading) {
      head.textContent = "PREVIEW";
      body.textContent = "Preparing preview...";
    } else if (pl.error || !pl.variants) {
      head.textContent = "PREVIEW";
      body.textContent = pl.error || "Text engine unavailable.";
    } else {
      const v = pl.variants[pl.keys[pl.index]];
      head.textContent = v.changed ? "PREVIEW - pinch and hold to apply" : "NO CHANGE";
      if (v.changed) {
        const b = d.createElement("div");
        b.className = "pv-before";
        b.textContent = pl.original;
        const a = d.createElement("div");
        a.className = "pv-after";
        a.textContent = v.text;
        body.append(b, a);
      } else body.textContent = v.note;
    }
    pv.append(head, body);
    ov.append(pv);
  }
  _bindMouse() {
    const { docEl, overlayEl } = this.refs;
    const pick = (e) => {
      const t = e.target;
      const word = t.closest?.(".word"), sent = t.closest?.(".sent"), para = t.closest?.(".para");
      if (this.mode === "word" && word) {
        this.sel = { p: +word.dataset.p, s: +word.dataset.s, w: +word.dataset.w };
        return true;
      }
      if (this.mode === "sentence" && sent) this.sel = { p: +sent.dataset.p, s: +sent.dataset.s, w: 0 };
      else if (this.mode === "paragraph" && para) this.sel = { p: +para.dataset.p, s: 0, w: 0 };
      else return false;
      this._fixWordIndex();
      return true;
    };
    docEl.addEventListener("click", (e) => {
      if (this.panel) {
        this.closePanel();
        return;
      }
      if (pick(e)) {
        this.refreshSelection();
        this.updateHeader();
      }
    });
    docEl.addEventListener("dblclick", (e) => {
      if (!this.panel && pick(e)) {
        this.refreshSelection();
        this.openPanel();
      }
    });
    overlayEl.addEventListener("click", (e) => {
      const item = e.target.closest?.("[data-i]");
      if (!item || !this.panel) {
        if (!item && this.panel && e.target === overlayEl) this.closePanel();
        return;
      }
      const i = +item.dataset.i;
      if (i === this.panel.index) this.confirm();
      else this.panelSet(i);
    });
  }
  handleKey(e) {
    const tag = e.target && e.target.tagName || "";
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return false;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === "z") {
      e.shiftKey ? this.redo() : this.undo();
      return true;
    }
    if (mod && k.toLowerCase() === "y") {
      this.redo();
      return true;
    }
    if (mod) return false;
    const map = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (map[k]) {
      this.move(...map[k]);
      return true;
    }
    if (k === "Tab") {
      this.cycleMode();
      return true;
    }
    if (k === "Enter") {
      this.panel ? this.confirm() : this.openPanel();
      return true;
    }
    if (k === "Escape") {
      this.back();
      return true;
    }
    return false;
  }
}
export {
  EditorController,
  OPS,
  TONES,
  makeApi
};
