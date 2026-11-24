// dev/creator=tubakhxn
import { GestureEngine } from "./gestures.js";
import { EditorController, makeApi } from "./editor.js";
import { parseParagraphs } from "./core.js";
const $ = (id) => document.getElementById(id);
const REMOTE_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const LOCAL_MODEL = new URL("../models/hand_landmarker.task", import.meta.url).href;
const BUNDLE = new URL("../vendor/vision_bundle.mjs", import.meta.url).href;
const WASM = new URL("../vendor/wasm", import.meta.url).href;
const ctrl = new EditorController({
  refs: {
    docEl: $("doc"),
    overlayEl: $("overlay"),
    titleEl: $("title"),
    subtitleEl: $("subtitle"),
    statusEl: $("status"),
    modeEls: Object.fromEntries([...document.querySelectorAll("#modeSeg button")].map((b) => [b.dataset.mode, b]))
  },
  api: makeApi(""),
  onChange: () => {
    $("btnUndo").disabled = !ctrl.model.canUndo;
    $("btnRedo").disabled = !ctrl.model.canRedo;
  }
});
let docs = [], docTitle = "document";
async function loadDocs() {
  try {
    docs = await (await fetch("/api/documents")).json();
    $("docSelect").replaceChildren(...docs.map((d, i) => Object.assign(document.createElement("option"), { value: i, textContent: d.title })));
    useDoc(0);
  } catch (e) {
    ctrl.say("Could not reach the local server - start it with run.bat", "error");
  }
}
function useDoc(i) {
  docTitle = docs[i].title;
  ctrl.loadParagraphs(docs[i].paragraphs, docTitle);
  $("docSelect").value = i;
}
$("docSelect").addEventListener("change", (e) => useDoc(+e.target.value));
$("btnUndo").onclick = () => ctrl.undo();
$("btnRedo").onclick = () => ctrl.redo();
$("btnReset").onclick = () => ctrl.reset();
$("btnSave").onclick = () => {
  const blob = new Blob([ctrl.getText() + "\n"], { type: "text/plain;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: docTitle.replace(/[^\w-]+/g, "_") + "_edited.txt" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
  ctrl.say("Saved " + a.download, "ok");
};
$("btnPaste").onclick = () => {
  $("pasteText").value = "";
  $("pasteDlg").showModal();
  $("pasteText").focus();
};
$("pasteForm").addEventListener("submit", (e) => {
  if (e.submitter && e.submitter.value === "ok") {
    const paras = parseParagraphs($("pasteText").value);
    if (paras.length) {
      docTitle = "pasted text";
      ctrl.loadParagraphs(paras, "your text");
    } else ctrl.say("Nothing to load - the text was empty", "error");
  }
});
$("fileInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $("pasteText").value = await f.text();
  docTitle = f.name.replace(/\.\w+$/, "");
  e.target.value = "";
});
document.querySelectorAll("#modeSeg button").forEach((b) => b.addEventListener("click", () => ctrl.setMode(b.dataset.mode)));
window.addEventListener("keydown", (e) => {
  if (ctrl.handleKey(e)) e.preventDefault();
});
const video = $("video"), fx = $("fx"), g2 = fx.getContext("2d");
const engine = new GestureEngine();
let tracker = null, delegate = "GPU", lastVideoTime = -1, errStreak = 0, running = false;
const trail = [];
let frames = 0, fpsT = performance.now();
function camMsg(text, retry = false) {
  $("camText").textContent = text;
  $("camRetry").hidden = !retry;
  $("camMsg").classList.toggle("off", !text);
}
function camError(e) {
  const n = e && e.name;
  if (!navigator.mediaDevices) return "The camera needs a secure page. Open http://127.0.0.1 (not a file:// path) in Chrome or Edge.";
  if (n === "NotAllowedError" || n === "SecurityError") return "Camera access was blocked. Click the camera icon in the address bar, allow access, then press Retry. Mouse and keyboard still work.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "No camera was found. Plug one in, then press Retry. Mouse and keyboard still work.";
  if (n === "NotReadableError" || n === "AbortError") return "The browser could not open the camera. Something else is using it: close Zoom/Teams/Camera/OBS, any Python or OpenCV script, and any other tab of this page, then press Retry. Also check Windows Settings > Privacy > Camera is on for desktop apps.";
  return "The camera could not start (" + (n || e) + "). Mouse and keyboard still work.";
}
async function getStream() {
  const md = navigator.mediaDevices;
  const tries = [
    { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false },
    { video: true, audio: false }
  ];
  let err;
  for (const c of tries) {
    try {
      return await md.getUserMedia(c);
    } catch (e) {
      err = e;
      if (e.name === "NotAllowedError" || e.name === "SecurityError") throw e;
    }
  }
  try {
    const cams = (await md.enumerateDevices()).filter((d) => d.kind === "videoinput");
    for (const d of cams) {
      try {
        return await md.getUserMedia({ video: { deviceId: { exact: d.deviceId } }, audio: false });
      } catch (e) {
        err = e;
      }
    }
  } catch (e) {
  }
  throw err;
}
async function openCamera() {
  try {
    if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
    const stream = await getStream();
    video.srcObject = stream;
    if (video.readyState < 1) await new Promise((res) => video.addEventListener("loadedmetadata", res, { once: true }));
    await video.play();
    return true;
  } catch (e) {
    console.warn("camera error", e);
    camMsg(camError(e), true);
    setChip("NO CAMERA", "off");
    return false;
  }
}
async function loadTracker() {
  const vision = await import(BUNDLE);
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
  const make = (model, del) => vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate: del },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5
  });
  let lastErr;
  for (const model of [LOCAL_MODEL, REMOTE_MODEL]) {
    for (const del of [delegate, "CPU"]) {
      try {
        const t = await make(model, del);
        delegate = del;
        t._make = () => make(model, "CPU");
        return t;
      } catch (e) {
        lastErr = e;
        console.warn("tracker init failed", model, del, e);
      }
    }
  }
  throw lastErr;
}
async function start() {
  $("camRetry").hidden = true;
  camMsg("Requesting camera access...");
  if (!await openCamera()) return;
  camMsg("Loading hand-tracking model...");
  try {
    tracker = await loadTracker();
  } catch (e) {
    camMsg("Hand tracking could not start (" + (e.message || e) + "). Mouse and keyboard still work.", true);
    setChip("NO TRACKER", "off");
    return;
  }
  camMsg("");
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}
$("camRetry").onclick = start;
const NAMES = { NONE: "NO HAND", POINT: "POINT", PEACE: "TWO FINGERS", PALM: "OPEN PALM", FIST: "FIST", PINCH: "PINCH", OTHER: "HAND" };
function setChip(text, cls) {
  $("gName").textContent = text;
  $("gChip").className = "chip " + (cls || "");
}
function loop() {
  requestAnimationFrame(loop);
  if (!tracker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const now = performance.now();
  let lm = null;
  try {
    const res = tracker.detectForVideo(video, now);
    if (res.landmarks && res.landmarks.length) lm = res.landmarks[0].map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
    errStreak = 0;
  } catch (e) {
    if (++errStreak === 5 && delegate === "GPU" && tracker._make) {
      const make = tracker._make;
      tracker = null;
      make().then((t) => {
        delegate = "CPU";
        tracker = t;
        errStreak = 0;
      }).catch(() => camMsg("Hand tracking stopped unexpectedly. Press Retry.", true));
    }
  }
  const frame = engine.update(lm, now, video.videoWidth / video.videoHeight);
  for (const ev of frame.events) ctrl.handleGestureEvent(ev);
  engine.setContext(ctrl.context());
  draw(lm, frame);
  setChip(NAMES[frame.gesture] || frame.gesture, frame.hand ? frame.gesture === "PINCH" ? "live pinch" : "live" : "");
  if (++frames >= 20) {
    $("fps").textContent = Math.round(frames * 1e3 / (now - fpsT)) + " fps";
    frames = 0;
    fpsT = now;
  }
}
const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const TIPS = [4, 8, 12, 16, 20];
function draw(lm, frame) {
  const dpr = window.devicePixelRatio || 1, w = fx.clientWidth, h = fx.clientHeight;
  if (fx.width !== Math.round(w * dpr) || fx.height !== Math.round(h * dpr)) {
    fx.width = Math.round(w * dpr);
    fx.height = Math.round(h * dpr);
  }
  g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  g2.clearRect(0, 0, w, h);
  if (!lm) {
    trail.length = 0;
    return;
  }
  const vw = video.videoWidth || 4, vh = video.videoHeight || 3, sc = Math.max(w / vw, h / vh);
  const ox = (w - vw * sc) / 2, oy = (h - vh * sc) / 2;
  const map = (x, y) => [x * vw * sc + ox, y * vh * sc + oy];
  const P = lm.map((p) => map(p.x, p.y));
  g2.lineWidth = 1;
  g2.strokeStyle = "rgba(255,170,60,.5)";
  g2.beginPath();
  for (const [a, b] of LINKS) {
    g2.moveTo(...P[a]);
    g2.lineTo(...P[b]);
  }
  g2.stroke();
  g2.fillStyle = "rgba(255,210,140,.75)";
  P.forEach(([x, y], i) => {
    if (!TIPS.includes(i)) {
      g2.beginPath();
      g2.arc(x, y, 2, 0, 6.283);
      g2.fill();
    }
  });
  if (frame.pointer) {
    trail.push(map(frame.pointer.x, frame.pointer.y));
    if (trail.length > 14) trail.shift();
  }
  for (let i = 1; i < trail.length; i++) {
    g2.strokeStyle = `rgba(255,190,50,${i / trail.length * 0.45})`;
    g2.lineWidth = 1 + i / trail.length * 2;
    g2.beginPath();
    g2.moveTo(...trail[i - 1]);
    g2.lineTo(...trail[i]);
    g2.stroke();
  }
  for (const i of TIPS) {
    const [x, y] = P[i], idx = i === 8;
    g2.beginPath();
    g2.arc(x, y, idx ? 9 : 5.5, 0, 6.283);
    g2.fillStyle = idx ? "#ffc21a" : "#ffa21f";
    g2.shadowColor = "#ffb020";
    g2.shadowBlur = idx ? 18 : 8;
    g2.fill();
    g2.shadowBlur = 0;
    if (idx) {
      g2.beginPath();
      g2.arc(x, y, 15, 0, 6.283);
      g2.strokeStyle = "rgba(255,194,26,.5)";
      g2.lineWidth = 1;
      g2.stroke();
    }
  }
  if (frame.pinchRatio < 0.7) {
    const [ax, ay] = P[4], [bx, by] = P[8], mx = (ax + bx) / 2, my = (ay + by) / 2;
    g2.strokeStyle = frame.pinch ? "#fff" : "rgba(255,255,255,.45)";
    g2.lineWidth = frame.pinch ? 2 : 1;
    g2.beginPath();
    g2.moveTo(ax, ay);
    g2.lineTo(bx, by);
    g2.stroke();
    if (frame.progress && frame.progress.kind === "confirm") ring(mx, my, frame.progress.value, "APPLY");
  }
  if (frame.progress && frame.progress.kind === "undo") ring(P[9][0], P[9][1], frame.progress.value, "UNDO");
}
function ring(x, y, v, label) {
  g2.lineWidth = 3;
  g2.strokeStyle = "rgba(255,255,255,.2)";
  g2.beginPath();
  g2.arc(x, y, 18, 0, 6.283);
  g2.stroke();
  g2.strokeStyle = "#ff8a1f";
  g2.beginPath();
  g2.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + v * 6.283);
  g2.stroke();
  g2.fillStyle = "#fff";
  g2.font = "10px monospace";
  g2.textAlign = "center";
  g2.fillText(label, x, y - 26);
}
loadDocs();
start();
