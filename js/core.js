// dev/creator=tubakhxn
const ABBR = new Set(["e.g", "i.e", "dr", "mr", "mrs", "ms", "prof", "vs", "etc", "u.s", "fig", "inc", "st", "no"]);
const WORD_RE = /\p{L}+(?:['’\-]\p{L}+)*/gu;
function analyze(text) {
  const sentences = [];
  const push = (s, e) => {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) sentences.push({ start: s, end: e, words: [] });
  };
  const re = /[.!?…]+["'”’)\]]*(?=\s|$)/g;
  let start = 0, m;
  while (m = re.exec(text)) {
    const end = m.index + m[0].length;
    const prev = text.slice(start, m.index).match(/([A-Za-z.]+)$/);
    const pw = prev ? prev[1].toLowerCase().replace(/\.$/, "") : "";
    if (m[0][0] === "." && ABBR.has(pw)) continue;
    push(start, end);
    start = end;
  }
  push(start, text.length);
  for (const s of sentences) {
    const chunk = text.slice(s.start, s.end);
    for (const w of chunk.matchAll(WORD_RE)) {
      s.words.push({ start: s.start + w.index, end: s.start + w.index + w[0].length });
    }
  }
  return sentences;
}
function parseParagraphs(raw) {
  return String(raw).replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim()).filter(Boolean);
}
class DocModel {
  constructor(paras = []) {
    this.setDocument(paras);
  }
  setDocument(paras) {
    this.original = paras.slice();
    this.paras = paras.slice();
    this.undoStack = [];
    this.redoStack = [];
  }
  commit(next) {
    this.undoStack.push(this.paras.slice());
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.paras = next.slice();
    this.redoStack = [];
  }
  replaceRange(p, start, end, text) {
    const t = this.paras[p];
    const next = this.paras.slice();
    next[p] = t.slice(0, start) + text + t.slice(end);
    this.commit(next);
  }
  replaceParagraph(p, text) {
    const next = this.paras.slice();
    next[p] = text;
    this.commit(next);
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  undo() {
    if (!this.canUndo) return false;
    this.redoStack.push(this.paras);
    this.paras = this.undoStack.pop();
    return true;
  }
  redo() {
    if (!this.canRedo) return false;
    this.undoStack.push(this.paras);
    this.paras = this.redoStack.pop();
    return true;
  }
  reset() {
    if (this.paras.length === this.original.length && this.paras.every((t, i) => t === this.original[i])) return false;
    this.commit(this.original);
    return true;
  }
  get text() {
    return this.paras.join("\n\n");
  }
}
export {
  DocModel,
  analyze,
  parseParagraphs
};
