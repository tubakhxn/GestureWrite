# dev/creator=tubakhxn
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import textengine as te
from documents import DOCUMENTS


class SynonymTests(unittest.TestCase):
    def test_important(self):
        alts = te.synonyms("important")
        for w in ("significant", "essential", "crucial", "meaningful", "valuable"):
            self.assertIn(w, alts)

    def test_case_preserved(self):
        self.assertTrue(te.synonyms("Important")[0][0].isupper())

    def test_inflection(self):
        self.assertIn("builds", te.synonyms("develops") + te.synonyms("develops"))
        self.assertIn("built", te.synonyms("developed"))
        self.assertIn("constructing", te.synonyms("building"))
        self.assertIn("instruments", te.synonyms("tools"))
        self.assertIn("discovers", te.synonyms("learns"))

    def test_unknown_is_empty(self):
        self.assertEqual(te.synonyms("zxqvbn"), [])


class SentenceTests(unittest.TestCase):
    def test_all_tones_run(self):
        s = "Nobody should have to accept an answer they can't question."
        res = te.all_sentence_variants(s)
        self.assertEqual(set(res), set(te.TONES))
        self.assertIn("cannot", res["professional"]["text"])
        self.assertIn("No one", res["formal"]["text"])
        self.assertTrue(res["friendly"]["changed"])

    def test_concise_removes_filler(self):
        r = te.rewrite_sentence("In order to catch mistakes early, they really test the system.", "concise")
        self.assertTrue(r["changed"])
        self.assertNotIn("really", r["text"])
        self.assertTrue(r["text"].startswith("To catch"))

    def test_unchanged_is_reported(self):
        r = te.rewrite_sentence("Stars burn.", "concise")
        self.assertFalse(r["changed"])
        self.assertEqual(r["text"], "Stars burn.")

    def test_no_stacked_prefix(self):
        a = te.rewrite_sentence("The moon rises.", "friendly")["text"]
        b = te.rewrite_sentence(a, "friendly")["text"]
        self.assertEqual(a, b)

    def test_unknown_start_not_lowercased(self):
        r = te.rewrite_sentence("Nietzsche wrote slowly.", "friendly")
        self.assertFalse(r["changed"])


class ParagraphTests(unittest.TestCase):
    P = DOCUMENTS[0]["paragraphs"][1]

    def test_shorten_is_shorter(self):
        r = te.transform_paragraph(self.P, "shorten")
        self.assertTrue(r["changed"])
        self.assertLess(len(r["text"]), len(self.P))

    def test_expand_is_longer(self):
        r = te.transform_paragraph(self.P, "expand")
        self.assertGreater(len(r["text"]), len(self.P))
        self.assertIn("Taken together", r["text"])

    def test_simplify_and_clarify_and_professional_run(self):
        for op in ("simplify", "clarify", "professional"):
            r = te.transform_paragraph(DOCUMENTS[0]["paragraphs"][2], op)
            self.assertIn("changed", r)
        self.assertTrue(te.transform_paragraph(self.P, "clarify")["changed"])

    def test_split_long(self):
        long = ("People want to know why a system made a decision, and they want to be able to correct it "
                "when it is wrong and they should be able to ask for a clear explanation at any time.")
        r = te.transform_paragraph(long, "simplify")
        self.assertGreater(len(te.split_sentences(r["text"])), 1)

    def test_every_sample_doc_paragraph_has_a_working_op(self):
        for d in DOCUMENTS:
            self.assertGreaterEqual(len(d["paragraphs"]), 3)
            for p in d["paragraphs"]:
                res = te.all_paragraph_variants(p)
                self.assertTrue(any(v["changed"] for v in res.values()))

    def test_bad_op(self):
        with self.assertRaises(ValueError):
            te.transform_paragraph("Hello there.", "nope")


class SplitTests(unittest.TestCase):
    def test_abbreviations(self):
        self.assertEqual(len(te.split_sentences("Use tools, e.g. a pen. Then write.")), 2)


if __name__ == "__main__":
    unittest.main()
