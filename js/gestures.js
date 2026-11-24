// dev/creator=tubakhxn
const CONFIG = {
  pinchOn: 0.3,
  pinchOff: 0.48,
  voteWindow: 5,
  voteNeed: 3,
  dwell: { PEACE: 350, PALM: 250 },
  cooldown: { cycle: 1e3, open: 900, back: 700, undo: 1600, confirm: 900 },
  holdConfirmMs: 650,
  holdUndoMs: 800,
  stepInterval: 100,
  settleMs: 180,
  lostResetMs: 500,
  deadzone: 12e-4
};
const LM = { WRIST: 0, THUMB_TIP: 4, INDEX_TIP: 8, MIDDLE_MCP: 9 };
const FINGERS = [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]];
function dist(a, b, ar = 1) {
  return Math.hypot((a.x - b.x) * ar, a.y - b.y);
}
function analyzeHand(lm, ar = 4 / 3) {
  const w = lm[0];
  const palm = Math.max(dist(w, lm[9], ar), 1e-6);
  const ext = FINGERS.map(([tip, pip, mcp]) => {
    const dt = dist(lm[tip], w, ar), dp = dist(lm[pip], w, ar), dm = dist(lm[mcp], w, ar);
    return dt > dp * 1.08 && dt > dm * 1.35;
  });
  return { ext, palm, pinchRatio: dist(lm[4], lm[8], ar) / palm };
}
function classifyFingers([i, m, r, p]) {
  if (i && !m && !r && !p) return "POINT";
  if (i && m && !r && !p) return "PEACE";
  if (i && m && r && p) return "PALM";
  if (!i && !m && !r && !p) return "FIST";
  return "OTHER";
}
class OneEuro {
  constructor(minCutoff = 1, beta = 10, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }
  static alpha(cutoff, dt) {
    return 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
  }
  filter(v, t) {
    if (this.x === null) {
      this.x = v;
      this.t = t;
      return v;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    this.dx = ad * ((v - this.x) / dt) + (1 - ad) * this.dx;
    const a = OneEuro.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt);
    this.x = a * v + (1 - a) * this.x;
    return this.x;
  }
}
class GestureEngine {
  constructor(cfg = CONFIG) {
    this.cfg = cfg;
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.ctx = { editing: false, stepX: 0.04, stepY: 0.075 };
    this.lostSince = null;
    this._reset();
  }
  _reset() {
    this.history = [];
    this.pose = "NONE";
    this.gesture = "NONE";
    this.gestureSince = 0;
    this.fired = new Set();
    this.pinchDown = false;
    this.pinchFlip = 0;
    this.pinchSince = 0;
    this.needRelease = false;
    this.holdFired = false;
    this.lastPos = null;
    this.acc = { x: 0, y: 0 };
    this.lastStep = -1e9;
    this.cool = {};
    this.fx.reset();
    this.fy.reset();
  }
  setContext(c) {
    const was = this.ctx.editing;
    Object.assign(this.ctx, c);
    if (this.ctx.editing !== was) {
      if (this.pinchDown) this.needRelease = true;
      this.acc = { x: 0, y: 0 };
    }
  }
  _ready(name, t) {
    return t - (this.cool[name] ?? -1e9) >= this.cfg.cooldown[name];
  }
  _mark(name, t) {
    this.cool[name] = t;
  }
  update(lm, t, ar = 4 / 3) {
    const cfg = this.cfg, events = [];
    if (!lm) {
      if (this.lostSince === null) this.lostSince = t;
      const lostFor = t - this.lostSince;
      if (lostFor > cfg.lostResetMs && (this.gesture !== "NONE" || this.pinchDown || this.history.length)) this._reset();
      return { hand: false, gesture: "NONE", pinch: false, pointer: null, progress: null, events, lostFor };
    }
    this.lostSince = null;
    const h = analyzeHand(lm, ar);
    const wantPinch = this.pinchDown ? h.pinchRatio < cfg.pinchOff : h.pinchRatio < cfg.pinchOn;
    let pinchEdge = false;
    if (wantPinch !== this.pinchDown) {
      if (++this.pinchFlip >= 2) {
        this.pinchDown = wantPinch;
        this.pinchFlip = 0;
        if (wantPinch) {
          this.pinchSince = t;
          this.holdFired = false;
          pinchEdge = true;
        } else this.needRelease = false;
      }
    } else this.pinchFlip = 0;
    this.history.push(classifyFingers(h.ext));
    if (this.history.length > cfg.voteWindow) this.history.shift();
    const counts = {};
    for (const p of this.history) counts[p] = (counts[p] || 0) + 1;
    for (const [p, n] of Object.entries(counts)) if (n >= cfg.voteNeed) this.pose = p;
    const g = this.pinchDown ? "PINCH" : this.pose;
    if (g !== this.gesture) {
      this.gesture = g;
      this.gestureSince = t;
      this.fired.clear();
    }
    const held = t - this.gestureSince;
    const px = this.fx.filter(lm[8].x, t / 1e3), py = this.fy.filter(lm[8].y, t / 1e3);
    if (g === "POINT" && held > cfg.settleMs && this.lastPos) {
      const dx = px - this.lastPos.x, dy = py - this.lastPos.y;
      if (Math.abs(dx) > cfg.deadzone) this.acc.x += dx;
      if (Math.abs(dy) > cfg.deadzone) this.acc.y += dy;
      const { stepX, stepY } = this.ctx;
      const nx = Math.abs(this.acc.x) / stepX, ny = Math.abs(this.acc.y) / stepY;
      if ((nx >= 1 || ny >= 1) && t - this.lastStep >= cfg.stepInterval) {
        if (nx >= ny) {
          const s = Math.sign(this.acc.x);
          events.push({ type: "move", dx: s, dy: 0 });
          this.acc.x -= s * stepX;
          this.acc.y = 0;
        } else {
          const s = Math.sign(this.acc.y);
          events.push({ type: "move", dx: 0, dy: s });
          this.acc.y -= s * stepY;
          this.acc.x = 0;
        }
        this.lastStep = t;
      }
    } else if (g !== "POINT") this.acc = { x: 0, y: 0 };
    this.lastPos = { x: px, y: py };
    const fire = (key, name, ev) => {
      if (this.fired.has(key) || !this._ready(name, t)) return;
      this.fired.add(key);
      this._mark(name, t);
      events.push(ev);
    };
    if (g === "PEACE" && held >= cfg.dwell.PEACE) fire("PEACE", "cycle", { type: "cycle-mode" });
    if (g === "PALM" && held >= cfg.dwell.PALM) fire("PALM", "back", { type: "back" });
    if (pinchEdge && !this.ctx.editing && this._ready("open", t)) {
      this._mark("open", t);
      events.push({ type: "open" });
    }
    let progress = null;
    if (this.pinchDown && this.ctx.editing && !this.needRelease && !this.holdFired) {
      const v = Math.min(1, (t - this.pinchSince) / cfg.holdConfirmMs);
      progress = { kind: "confirm", value: v };
      if (v >= 1 && this._ready("confirm", t)) {
        this.holdFired = true;
        this._mark("confirm", t);
        events.push({ type: "confirm" });
      }
    }
    if (g === "FIST" && !this.fired.has("FIST")) {
      const v = Math.min(1, held / cfg.holdUndoMs);
      progress = { kind: "undo", value: v };
      if (v >= 1) fire("FIST", "undo", { type: "undo" });
    }
    return { hand: true, gesture: g, pinch: this.pinchDown, pointer: { x: px, y: py }, progress, events, pinchRatio: h.pinchRatio, ext: h.ext };
  }
}
export {
  CONFIG,
  GestureEngine,
  LM,
  OneEuro,
  analyzeHand,
  classifyFingers,
  dist
};
