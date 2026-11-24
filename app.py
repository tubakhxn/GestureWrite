# dev/creator=tubakhxn
import argparse
import mimetypes
import os
import socket
import sys
import threading
import urllib.request
import webbrowser

from flask import Flask, jsonify, request, send_from_directory

from documents import DOCUMENTS
import textengine as te

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
MODEL_PATH = os.path.join(STATIC, "models", "hand_landmarker.task")
MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
             "hand_landmarker/float16/1/hand_landmarker.task")

app = Flask(__name__, static_folder=STATIC, static_url_path="/static")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024


def _json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.get("/api/health")
def health():
    return jsonify(status="ok", model_present=os.path.isfile(MODEL_PATH), engine="local-rules")


@app.get("/api/documents")
def documents():
    return jsonify(DOCUMENTS)


@app.post("/api/synonyms")
def api_synonyms():
    word = str(_json().get("word", "")).strip()
    if not word or len(word) > 40:
        return jsonify(error="word required"), 400
    return jsonify(word=word, alternatives=te.synonyms(word))


@app.post("/api/sentence")
def api_sentence():
    d = _json()
    text, tone = str(d.get("text", "")), str(d.get("tone", ""))
    if not text.strip() or tone not in te.TONES:
        return jsonify(error="text and a valid tone are required"), 400
    return jsonify(te.rewrite_sentence(text, tone))


@app.post("/api/sentence/all")
def api_sentence_all():
    text = str(_json().get("text", ""))
    if not text.strip():
        return jsonify(error="text required"), 400
    return jsonify(te.all_sentence_variants(text))


@app.post("/api/paragraph")
def api_paragraph():
    d = _json()
    text, op = str(d.get("text", "")), str(d.get("op", ""))
    if not text.strip() or op not in te.PARA_OPS:
        return jsonify(error="text and a valid operation are required"), 400
    return jsonify(te.transform_paragraph(text, op))


@app.post("/api/paragraph/all")
def api_paragraph_all():
    text = str(_json().get("text", ""))
    if not text.strip():
        return jsonify(error="text required"), 400
    return jsonify(te.all_paragraph_variants(text))


def ensure_model():
    if os.path.isfile(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 1_000_000:
        return True
    print("[setup] Hand model missing - trying to download it once...")
    try:
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        return True
    except Exception as exc:
        print("[setup] Could not download the model (%s)." % exc)
        print("        The page will try the same URL from the browser instead.")
        return False


def free_port(start):
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5000)))
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--check", action="store_true", help="print environment info and exit")
    args = ap.parse_args()

    if args.check:
        print("python", sys.version.split()[0])
        import flask
        print("flask", flask.__version__)
        print("model present:", os.path.isfile(MODEL_PATH))
        return

    ensure_model()
    port = free_port(args.port)
    url = "http://127.0.0.1:%d/" % port
    print("\n  Gesture Text Editor running at %s\n  Use Chrome or Edge, allow camera access. Ctrl+C to stop.\n" % url)
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
