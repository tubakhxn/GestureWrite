<!-- dev/creator=tubakhxn -->
# Gesture Text Editor

## What is this project?

A text editor you control with your hand instead of a keyboard or mouse. Your webcam fills the screen, the document floats over it, and a hand-tracking model reads your fingers in real time:

- **Browse** a document word by word, sentence by sentence or paragraph by paragraph.
- **Words**: pinch to see alternative words floating around the selection, pick one, and it replaces the original.
- **Sentences**: rewrite in a Professional, Friendly, Formal, Concise or Conversational tone.
- **Paragraphs**: shorten, expand, simplify, clarify or rewrite professionally.
- Undo, redo, reset, three sample documents, paste your own text, save as `.txt`, and a full mouse and keyboard fallback.

Everything runs locally and offline. No API keys, no paid services. Hand tracking uses [MediaPipe](https://en.wikipedia.org/wiki/MediaPipe) Hand Landmarker in the browser; a small [Flask](https://en.wikipedia.org/wiki/Flask_(web_framework)) server provides a rule-based text engine (synonyms, tone and paragraph rewrites). It is not a language model: if no rule applies, it says "NO CHANGE" instead of faking an edit.

## Run it

Windows: install Python 3.9+, then double-click `run.bat`. Or in a terminal:

```
pip install -r requirements.txt
python app.py
```

Open the address it prints (usually `http://127.0.0.1:5000`) in Chrome or Edge and allow the camera.

| Gesture | Action |
|---|---|
| Point and move | Move the selection |
| Two fingers | Switch word / sentence / paragraph |
| Pinch | Open the edit options |
| Point left / right | Choose an option |
| Hold pinch | Apply it |
| Open palm | Back to browsing |
| Hold fist | Undo |

## How to fork

1. Click **Fork** at the top right of the repository page on GitHub.
2. Clone your fork:
   ```
   git clone https://github.com/<your-username>/gesture-text-editor.git
   cd gesture-text-editor
   ```
3. Create a branch for your change:
   ```
   git checkout -b my-change
   ```
4. Run it (see above), edit, and test.
5. Commit and push:
   ```
   git add .
   git commit -m "Describe your change"
   git push origin my-change
   ```
6. Open a **Pull Request** from your branch on GitHub if you want to share it back.

Where to start:

- `static/js/gestures.js` - gesture thresholds and timings (`CONFIG`)
- `static/js/editor.js` - selection, edit panels, applying edits
- `textengine/lexicon.py` - synonyms and rewrite rules
- `documents.py` - sample documents
- `static/css/style.css` - look and feel

## Dev/Creator

**tubakhxn** - [github.com/tubakhxn](https://github.com/tubakhxn)

## Learn more

- [Gesture recognition](https://en.wikipedia.org/wiki/Gesture_recognition)
- [Computer vision](https://en.wikipedia.org/wiki/Computer_vision)
- [Human-computer interaction](https://en.wikipedia.org/wiki/Human%E2%80%93computer_interaction)
- [Natural user interface](https://en.wikipedia.org/wiki/Natural_user_interface)
- [MediaPipe](https://en.wikipedia.org/wiki/MediaPipe)
- [OpenCV](https://en.wikipedia.org/wiki/OpenCV)
- [Natural language processing](https://en.wikipedia.org/wiki/Natural_language_processing)
- [Thesaurus](https://en.wikipedia.org/wiki/Thesaurus)
- [Flask (web framework)](https://en.wikipedia.org/wiki/Flask_(web_framework))
