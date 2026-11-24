# dev/creator=tubakhxn
import re
from collections import Counter

from . import lexicon as L

WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]*")
TONES = ["professional", "friendly", "formal", "concise", "conversational"]
PARA_OPS = ["shorten", "expand", "simplify", "clarify", "professional"]

_SYN = {}


def _load():
    for line in L.SYNONYM_DATA.strip().splitlines():
        line = line.strip()
        if not line or "=" not in line:
            continue
        head, alts = line.split("=", 1)
        pos, lemma = head.split()
        _SYN.setdefault(lemma, []).append((pos, [a.strip() for a in alts.split(",") if a.strip()]))


_load()

_CVC = re.compile(r"[^aeiou][aeiou][^aeiouwxy]$")


def _candidates(word):
    w = word.lower()
    c = [(w, "base")]
    if w.endswith("ies") and len(w) > 4:
        c.append((w[:-3] + "y", "s"))
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        c.append((w[:-1], "s"))
    if w.endswith("es") and len(w) > 3:
        c.append((w[:-2], "s"))
    if w.endswith("ied") and len(w) > 4:
        c.append((w[:-3] + "y", "ed"))
    if w.endswith("ed") and len(w) > 3:
        c.append((w[:-1], "ed"))
        c.append((w[:-2], "ed"))
        if len(w) > 4 and w[-3] == w[-4]:
            c.append((w[:-3], "ed"))
    if w.endswith("ing") and len(w) > 4:
        stem = w[:-3]
        c.append((stem + "e", "ing"))
        c.append((stem, "ing"))
        if len(stem) > 2 and stem[-1] == stem[-2]:
            c.append((stem[:-1], "ing"))
    return c


def _lookup(word):
    for lemma, form in _candidates(word):
        if lemma in _SYN:
            return lemma, form
    return None


def _inflect(w, form, pos):
    if form == "base":
        return w
    if form == "s" and pos in ("n", "v"):
        if re.search(r"[^aeiou]y$", w):
            return w[:-1] + "ies"
        if re.search(r"(s|x|z|ch|sh)$", w):
            return w + "es"
        return w + "s"
    if form == "ed" and pos == "v":
        if w in L.IRREGULAR_PAST:
            return L.IRREGULAR_PAST[w]
        if w.endswith("e"):
            return w + "d"
        if re.search(r"[^aeiou]y$", w):
            return w[:-1] + "ied"
        if len(w) <= 4 and _CVC.search(w):
            return w + w[-1] + "ed"
        return w + "ed"
    if form == "ing" and pos == "v":
        if w.endswith("ie"):
            return w[:-2] + "ying"
        if w.endswith("e") and not w.endswith(("ee", "oe", "ye")):
            return w[:-1] + "ing"
        if len(w) <= 4 and _CVC.search(w):
            return w + w[-1] + "ing"
        return w + "ing"
    return None


def _inflect_phrase(alt, form, pos):
    if form == "base":
        return alt
    parts = alt.split(" ")
    idx = 0 if pos == "v" else len(parts) - 1
    out = _inflect(parts[idx], form, pos)
    if out is None:
        return None
    parts[idx] = out
    return " ".join(parts)


def _match_case(src, alt):
    if len(src) > 1 and src.isupper():
        return alt.upper()
    if src[:1].isupper():
        return alt[:1].upper() + alt[1:]
    return alt


def synonyms(word, limit=7):
    word = word.strip()
    hit = _lookup(word)
    if not hit:
        return []
    lemma, form = hit
    out, seen = [], {word.lower()}
    for pos, alts in _SYN[lemma]:
        if form != "base" and pos == "a":
            continue
        for alt in alts:
            inflected = _inflect_phrase(alt, form, pos)
            if not inflected:
                continue
            key = inflected.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(_match_case(word, inflected))
    return out[:limit]


_ABBR = {"e.g", "i.e", "dr", "mr", "mrs", "ms", "prof", "vs", "etc", "u.s", "fig", "inc", "st", "no"}


def split_sentences(text):
    parts, start = [], 0
    for m in re.finditer(r"[.!?…]+[\"'”’)\]]*(?=\s|$)", text):
        prev = re.search(r"([A-Za-z.]+)$", text[start:m.start()])
        pw = prev.group(1).lower().rstrip(".") if prev else ""
        if m.group().startswith(".") and pw in _ABBR:
            continue
        parts.append(text[start:m.end()].strip())
        start = m.end()
    tail = text[start:].strip()
    if tail:
        parts.append(tail)
    return [p for p in parts if p]


def _apply(text, rules):
    for pat, rep in rules:
        def sub(m, rep=rep):
            out = m.expand(rep)
            if out and m.group(0)[:1].isupper():
                out = out[0].upper() + out[1:]
            return out
        text = re.sub(pat, sub, text, flags=re.I)
    return text


def _tidy(s):
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    s = re.sub(r",\s*,", ",", s)
    s = re.sub(r"^[,;:]\s*", "", s)
    s = re.sub(r",\s*([.!?])", r"\1", s)
    s = re.sub(r"\(\s*\)", "", s)
    for i, ch in enumerate(s):
        if ch.isalpha():
            s = s[:i] + ch.upper() + s[i + 1:]
            break
        if ch.isdigit():
            break
    return s


TONE_PREFIX = {
    "professional": "Notably, ",
    "formal": "It should be noted that ",
    "friendly": "Just so you know, ",
    "conversational": "So, ",
}
_PREFIX_RE = re.compile(r"^(?:Notably,|It should be noted that|Just so you know,|So,)\s+")


def _safe_to_lower_first(s):
    m = re.match(r"[A-Za-z']+", s)
    if not m:
        return False
    w = m.group()
    if len(w) > 1 and w.isupper():
        return False
    lw = w.lower()
    if lw in L.COMMON_STARTERS:
        return True
    return _lookup(lw) is not None and lw != "i"


def _lower_first(s):
    return s[:1].lower() + s[1:]


def rewrite_sentence(text, tone, fallback=True):
    tone = tone.lower()
    if tone not in TONES:
        raise ValueError("unknown tone: %s" % tone)
    original = text.strip()
    base = _PREFIX_RE.sub("", original)
    s = base
    if tone == "professional":
        s = _apply(_apply(s, L.EXPAND), L.PROFESSIONAL)
    elif tone == "formal":
        s = _apply(_apply(s, L.EXPAND), L.FORMAL)
    elif tone == "friendly":
        s = _apply(_apply(s, L.CONTRACT), L.FRIENDLY)
    elif tone == "conversational":
        s = _apply(_apply(s, L.CONTRACT), L.CONVERSATIONAL)
    elif tone == "concise":
        s = _apply(s, L.CONCISE)
    s = _tidy(s)
    has_lead_in = re.match(r"^[A-Za-z]+(?: [A-Za-z]+)?,", s) is not None
    if fallback and tone in TONE_PREFIX and s == _tidy(base) and not has_lead_in and _safe_to_lower_first(s):
        s = TONE_PREFIX[tone] + _lower_first(s)
    changed = s != original
    note = "" if changed else (
        "Already concise - nothing to trim." if tone == "concise"
        else "No rule in the local engine changes this sentence for this tone.")
    return {"text": s if changed else original, "changed": changed, "note": note}


def _stem(w):
    w = w.lower()
    for suf in ("ing", "es", "s", "ed"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w


def _keywords(sents, n=3):
    freq, first, surface = Counter(), {}, {}
    i = 0
    for s in sents:
        for w in WORD_RE.findall(s):
            lw = w.lower()
            if len(lw) < 6 or lw in L.STOPWORDS or lw.endswith(("ing", "ly", "ed")):
                continue
            st = _stem(lw)
            freq[st] += 1
            first.setdefault(st, i)
            surface.setdefault(st, lw)
            i += 1
    ranked = sorted(freq, key=lambda k: (-freq[k], -len(surface[k]), first[k]))
    return [surface[k] for k in ranked[:n]]


def _score(sents):
    freq = Counter()
    for s in sents:
        for w in WORD_RE.findall(s):
            lw = w.lower()
            if lw not in L.STOPWORDS and len(lw) > 3:
                freq[_stem(lw)] += 1
    scores = []
    for i, s in enumerate(sents):
        ws = [_stem(w) for w in WORD_RE.findall(s) if w.lower() not in L.STOPWORDS and len(w) > 3]
        val = sum(freq[w] for w in ws) / ((len(ws) + 1) ** 0.6)
        if i == 0:
            val *= 1.8
        scores.append(val)
    return scores


_SPLIT_RE = re.compile(
    r"(,\s+(?:and|but|so)\s+|;\s+)(?=(?:they|it|we|you|he|she|those|these|this|that|there|the|a|an|people|nobody|everyone)\b)",
    re.I)


def _split_long(s, limit):
    if len(s.split()) <= limit:
        return [s]
    for m in _SPLIT_RE.finditer(s):
        left, right = s[: m.start()].rstrip(), s[m.end():].strip()
        if len(left.split()) < 6 or len(right.split()) < 6:
            continue
        if left[-1] not in ".!?":
            left += "."
        conj = m.group(1).lower()
        right = ("But " + right) if "but" in conj else (right[:1].upper() + right[1:])
        return [left] + _split_long(right, limit)
    return [s]


def _simple_words(s):
    def sub(m):
        w = m.group(0)
        rep = L.SIMPLE_WORDS[w.lower()]
        return rep[:1].upper() + rep[1:] if w[:1].isupper() else rep
    pat = r"\b(" + "|".join(sorted(L.SIMPLE_WORDS, key=len, reverse=True)) + r")\b"
    return re.sub(pat, sub, s, flags=re.I)


def _shorten(sents):
    n = len(sents)
    if n == 1:
        s = rewrite_sentence(sents[0], "concise", fallback=False)["text"]
        if len(s.split()) > 20:
            head = re.split(r",\s+(?:which|because|while|although|so that)\b", s)[0]
            if head != s:
                end = s.rstrip()[-1] if s.rstrip()[-1] in ".!?" else "."
                s = head.rstrip(",;: ") + end
        return [s]
    keep = max(1, (n + 1) // 2)
    scores = _score(sents)
    ranked = sorted(range(n), key=lambda i: -scores[i])
    if n >= 3:
        ranked = [0] + [i for i in ranked if i != 0]
    top = sorted(ranked[:keep])
    return [rewrite_sentence(sents[i], "concise", fallback=False)["text"] for i in top]


_TRANSITION_WORDS = ("however", "but", "so", "therefore", "moreover", "also", "in addition",
                     "instead", "still", "then", "beyond", "taken", "yet", "and")


def _expand(sents):
    out, trans = [], ["In addition, ", "Moreover, ", "Beyond that, "]
    t = 0
    for i, s in enumerate(sents):
        s = _apply(s, L.EXPAND)
        low = s.lower()
        if i % 2 == 1 and not low.startswith(_TRANSITION_WORDS) and _safe_to_lower_first(s):
            s = trans[t % len(trans)] + _lower_first(s)
            t += 1
        out.append(s)
    kws = _keywords(sents, 3)
    if len(kws) >= 2:
        listed = ", ".join(kws[:-1]) + " and " + kws[-1]
        out.append("Taken together, these points center on %s." % listed)
    return out


def _simplify(sents):
    out = []
    for s in sents:
        s = _apply(s, L.SIMPLE_PHRASES)
        s = _simple_words(s)
        out.extend(_split_long(_tidy(s), 18))
    return out


def _clarify(sents):
    out = []
    for s in sents:
        s = _tidy(_apply(s, L.CLARITY_PHRASES))
        out.extend(_split_long(s, 22))
    return out


def _professional(sents):
    return [rewrite_sentence(s, "professional", fallback=False)["text"] for s in sents]


_OPS = {"shorten": _shorten, "expand": _expand, "simplify": _simplify,
        "clarify": _clarify, "professional": _professional}


def transform_paragraph(text, op):
    op = op.lower()
    if op not in _OPS:
        raise ValueError("unknown operation: %s" % op)
    original = " ".join(text.split())
    sents = split_sentences(original)
    if not sents:
        return {"text": text, "changed": False, "note": "The paragraph is empty."}
    result = " ".join(_OPS[op](sents)).strip()
    changed = result != original
    if op == "shorten" and changed and len(result) >= len(original):
        changed = False
    return {
        "text": result if changed else text,
        "changed": changed,
        "note": "" if changed else "No rule in the local engine changes this paragraph for this operation.",
    }


def all_sentence_variants(text):
    return {t: rewrite_sentence(text, t) for t in TONES}


def all_paragraph_variants(text):
    return {o: transform_paragraph(text, o) for o in PARA_OPS}
