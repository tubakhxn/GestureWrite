// dev/creator=tubakhxn
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
const BASE = process.argv[2] || "http://127.0.0.1:5055";
const dom = new JSDOM(`<!doctype html><body>
  <div id="stage"><div id="doc"></div><div id="overlay" class="overlay"></div></div>
  <h1 id="title"></h1><div id="sub"></div><div id="status"></div></body>`, { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { EditorController, makeApi } = await import("../../static/js/editor.js");
const { GestureEngine } = await import("../../static/js/gestures.js");
const $ = (id) => document.getElementById(id);
const ctrl = new EditorController({
  refs: { docEl: $("doc"), overlayEl: $("overlay"), titleEl: $("title"), subtitleEl: $("sub"), statusEl: $("status") },
  api: makeApi(BASE)
});
const docs = await (await fetch(BASE + "/api/documents")).json();
assert.equal(docs.length >= 3, true, "three sample documents");
ctrl.loadParagraphs(docs[0].paragraphs, docs[0].title);
function hand(pose, ox = 0.5, oy = 0.8, pinch = false) {
  const lm = Array.from({ length: 21 }, () => ({ x: ox, y: oy, z: 0 }));
  const P = (i, x, y) => {
    lm[i] = { x: ox + x, y: oy + y, z: 0 };
  };
  P(0, 0, 0);
  P(9, 0, -0.12);
  const ext = { POINT: [1, 0, 0, 0], PEACE: [1, 1, 0, 0], PALM: [1, 1, 1, 1], FIST: [0, 0, 0, 0] }[pose];
  [[5, 6, 8, -0.03, -0.115], [9, 10, 12, 0, -0.12], [13, 14, 16, 0.03, -0.115], [17, 18, 20, 0.055, -0.1]].forEach(([mcp, pip, tip, bx, by], f) => {
    P(mcp, bx, by);
    P(pip, bx, by - 0.05);
    if (ext[f]) P(tip, bx, by - 0.11);
    else P(tip, bx, by + 0);
  });
  P(4, -0.1, -0.05);
  if (pinch) {
    const t2 = lm[8];
    lm[4] = { x: t2.x + 0.01, y: t2.y, z: 0 };
  }
  return lm;
}
let t = 1e3;
const eng = new GestureEngine();
const seen = [];
async function run(pose, frames, { dx = 0, dy = 0, pinch = false, x = 0.5, y = 0.8, absent = false } = {}) {
  let cx = x, cy = y;
  for (let i = 0; i < frames; i++) {
    t += 33;
    cx += dx / frames;
    cy += dy / frames;
    const f = eng.update(absent ? null : hand(pose, cx, cy, pinch), t, 4 / 3);
    for (const ev of f.events) {
      seen.push(ev.type);
      ctrl.handleGestureEvent(ev);
      if (ev.type === "open") await ctrl.lastOpen;
    }
    eng.setContext(ctrl.context());
  }
  return { x: cx, y: cy };
}
const count = (type) => seen.filter((e) => e === type).length;
const wordText = () => {
  const w = ctrl.wordEls[ctrl._curWord()];
  return w && w.textContent;
};
const results = [];
const ok = (name) => {
  results.push(name);
  console.log("  ok -", name);
};
let pos = await run("POINT", 12);
assert.equal(count("move"), 0, "holding still must not move the cursor");
const start = ctrl._curWord();
pos = await run("POINT", 24, { dx: 0.2, x: pos.x, y: pos.y });
const moved = ctrl._curWord() - start;
assert.ok(count("move") >= 3 && moved === count("move"), `moved ${moved} words for ${count("move")} moves`);
ok(`pointing right moves the word selection (${moved} words, jitter-free when still)`);
pos = await run("POINT", 20, { dx: -0.2, x: pos.x, y: pos.y });
assert.ok(ctrl._curWord() < start + moved, "moving left steps backwards");
ok("pointing left steps backwards");
pos = await run("PEACE", 20, { x: 0.5, y: 0.8 });
assert.equal(ctrl.mode, "sentence");
assert.equal(count("cycle-mode"), 1, "one gesture -> one switch");
ok("two fingers switch word -> sentence exactly once");
pos = await run("POINT", 12);
pos = await run("POINT", 20, { dy: 0.3, x: pos.x, y: pos.y });
assert.ok(ctrl.sel.s > 0 || ctrl.sel.p > 0, "sentence selection advanced");
assert.ok($("doc").querySelector(".sent.sel"), "a sentence is highlighted");
ok("browse by sentence highlights and moves");
await run("POINT", 40);
t += 1200;
await run("PEACE", 20);
assert.equal(ctrl.mode, "paragraph");
assert.ok($("doc").querySelector(".para.sel"), "paragraph highlighted");
ok("browse by paragraph highlights a paragraph");
await run("POINT", 12);
t += 1200;
await run("PEACE", 20);
assert.equal(ctrl.mode, "word");
ok("mode cycle wraps back to word");
const target = [...$("doc").querySelectorAll(".word")].find((w) => w.textContent === "important" && w.dataset.p === "0");
target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
assert.equal(wordText(), "important");
ok("mouse click selects a word");
await run("POINT", 12);
t += 1e3;
const before = ctrl.getText();
await run("POINT", 3, { pinch: true });
assert.ok(ctrl.panel && ctrl.panel.type === "word", "panel opened");
assert.equal(count("open"), 1);
assert.ok(ctrl.panel.items.includes("significant") && ctrl.panel.items.includes("essential"), "synonyms listed: " + ctrl.panel.items);
assert.ok($("overlay").querySelectorAll(".alt").length >= 5, "floating labels rendered");
ok("pinch opens word alternatives (" + ctrl.panel.items.join(", ") + ")");
await run("POINT", 30, { pinch: true });
assert.equal(count("confirm"), 0, "the opening pinch must be released before it can confirm");
assert.equal(ctrl.getText(), before);
ok("the opening pinch cannot accidentally confirm");
await run("POINT", 4);
await run("POINT", 20, { dx: 0.2, x: 0.4, y: 0.8 });
assert.ok(ctrl.panel.index >= 1, "moving right advances to the next suggestion (index " + ctrl.panel.index + ")");
const chosen = ctrl.panel.items[ctrl.panel.index];
ok("moving the hand cycles suggestions -> " + chosen);
await run("POINT", 10);
t += 1e3;
await run("POINT", 8, { pinch: true });
assert.equal(count("confirm"), 0, "a short pinch does not confirm");
await run("POINT", 25, { pinch: true });
assert.equal(count("confirm"), 1, "holding the pinch confirms");
assert.ok(!ctrl.panel);
assert.ok(ctrl.getText().includes(chosen), "replacement in document");
assert.ok(!ctrl.getText().startsWith(before.slice(0, 0) + "zzz"));
assert.notEqual(ctrl.getText(), before);
ok(`hold-pinch replaces "important" with "${chosen}" in the document`);
await run("POINT", 6);
t += 1700;
await run("FIST", 12);
assert.equal(count("undo"), 0, "fist must be held");
await run("FIST", 20);
assert.equal(count("undo"), 1);
assert.equal(ctrl.getText(), before);
ok("holding a fist undoes the edit");
ctrl.redo();
assert.ok(ctrl.getText().includes(chosen));
ok("redo re-applies it");
ctrl.undo();
assert.equal(ctrl.getText(), before);
ctrl.setMode("sentence");
const cant = [...$("doc").querySelectorAll(".sent")].find((s) => s.textContent.includes("can't question"));
cant.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
await ctrl.openPanel();
assert.equal(ctrl.panel.type, "tone");
assert.equal(ctrl.panel.keys.length, 5);
ctrl.panelSet(0);
assert.ok(ctrl.panel.variants.professional.changed);
assert.ok($("overlay").querySelector(".pv-after").textContent.includes("cannot"), "preview shows the rewrite");
const sub = $("sub").textContent;
assert.ok(sub.includes("PROFESSIONAL"), sub);
assert.ok(ctrl.confirm());
assert.ok(ctrl.getText().includes("cannot question") && !ctrl.getText().includes("can't question"));
ok('sentence tone "Professional" rewrites the sentence in the document');
ctrl.undo();
for (const tone of ["friendly", "formal", "concise", "conversational"]) {
  await ctrl.openPanel();
  ctrl.panelSet(["professional", "friendly", "formal", "concise", "conversational"].indexOf(tone));
  const v = ctrl.panel.variants[tone];
  const applied = ctrl.confirm();
  assert.equal(applied, v.changed, tone + " applied iff the engine changed something");
  if (applied) ctrl.undo();
}
ok("all five tones run; unchanged results are reported, not faked");
ctrl.setMode("paragraph");
ctrl.sel = { p: 1, s: 0, w: 0 };
ctrl.refreshSelection();
const p1 = ctrl.paras[1];
for (const op of ["shorten", "expand", "simplify", "clarify", "professional"]) {
  await ctrl.openPanel();
  ctrl.panelSet(["shorten", "expand", "simplify", "clarify", "professional"].indexOf(op));
  const v = ctrl.panel.variants[op];
  const applied = ctrl.confirm();
  assert.equal(applied, v.changed);
  if (op === "shorten") assert.ok(ctrl.paras[1].length < p1.length, "shorten is shorter");
  if (op === "expand") assert.ok(ctrl.paras[1].length > p1.length, "expand is longer");
  if (applied) {
    assert.notEqual(ctrl.paras[1], p1);
    ctrl.undo();
  }
  assert.equal(ctrl.paras[1], p1);
}
ok("paragraph shorten / expand / simplify / clarify / professional apply real transformations");
await ctrl.openPanel();
assert.ok(ctrl.panel);
await run("PALM", 15);
assert.ok(!ctrl.panel, "open palm closes the panel");
ok("open palm returns to browsing");
await run("POINT", 10, { absent: true });
await run("POINT", 20, { absent: true });
assert.doesNotThrow(() => eng.update(null, t += 33));
await run("POINT", 12);
ok("losing the hand does not break anything; tracking resumes");
ctrl.setMode("word");
ctrl.sel = { p: 0, s: 0, w: 0 };
ctrl.model.replaceParagraph(0, "Changed.");
ctrl.render();
assert.ok(ctrl.reset());
assert.equal(ctrl.paras[0], docs[0].paragraphs[0]);
assert.ok(ctrl.undo());
assert.equal(ctrl.paras[0], "Changed.");
ok("reset restores the original; undo of reset works");
ctrl.loadParagraphs(["One two three. Four five.", "Second paragraph here."], "pasted");
assert.equal(ctrl.flatWords.length, 8);
ok("custom text loads and tokenizes");
ctrl.loadParagraphs(docs[1].paragraphs);
ctrl.loadParagraphs(docs[2].paragraphs);
ok("all three sample documents load");
console.log(`
ALL ${results.length} INTEGRATION CHECKS PASSED`);
process.exit(0);
