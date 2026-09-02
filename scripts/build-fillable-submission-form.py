"""
Build the awards submission form with selectable project categories.

Reads docs/forms/blank-submission-form-original.pdf -- the untouched form as it
came from the designer, already an AcroForm -- and:
  1. Replaces the free-text "Project Category or Categories for Consideration"
     field with a "PROJECT CATEGORY SELECTION" block holding one checkbox per
     row of ProjectCategories.csv plus an "Other (please specify)" field.
  2. Updates the submission fee from $70 to $80.

Existing pages, fields and glyphs are left untouched apart from the specific
runs rewritten here, so the original styling is preserved exactly.

    python scripts/build-fillable-submission-form.py

writes docs/forms/blank-submission-form.pdf -- the published form, which
terraform uploads to the public assets bucket for the submissions portal. Page 1
keeps PROJECT INFORMATION and SUBMITTER'S INFORMATION and gains the category
list; the whole PROJECT TEAM list moves onto a page of its own; PROJECT OVERVIEW
then gets a full page. Two earlier layouts are kept for comparison:

  --page5           a compact three-column grid in the blank lower half of the
                    existing page 5           -> blank-submission-form-v2.pdf
  --inserted-page   a dedicated page 2, cloned from page 5 so it inherits the
                    real footer and page furniture, with the categories set in
                    two roomy columns. The "Continued on next page" /
                    "Continued from last page" notes on the PROJECT TEAM spread
                    are re-pointed at the new page numbers.
                                              -> blank-submission-form-v3.pdf
"""
import csv
import re
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject,
    FloatObject, NameObject, NumberObject, TextStringObject,
)

ROOT = Path(__file__).resolve().parent.parent
# The untouched form as it came from the designer. Never written to, so the
# build is repeatable: re-running can never apply the edits twice.
SRC = ROOT / "docs/forms/blank-submission-form-original.pdf"
CSV_PATH = ROOT / "2025-11-11_UCD_Winner_Formatting/ProjectCategories.csv"

INSERTED = "--inserted-page" in sys.argv
PAGE5 = "--page5" in sys.argv
REFLOW = not (INSERTED or PAGE5)
MODE = "reflow" if REFLOW else "inserted" if INSERTED else "page5"
# The default layout is the published form; the alternates are kept for comparison.
OUT = ROOT / ("docs/forms/blank-submission-form.pdf" if REFLOW else
              "docs/forms/blank-submission-form-{}.pdf".format("v3" if INSERTED else "v2"))

CATEGORY_FIELD = "Project Category or Categories for Consideration"
OTHER_HINT = "(e.g., Parks & Recreation)"
HEADING = "PROJECT CATEGORY SELECTION"
SUBHEAD = "(Check every category in which this project should be considered)"

# Conferred by the publisher rather than entered into, so not self-selectable.
EXCLUDED = {"Project of the Year", "Publisher's Pick"}

# The form sets every labelled row on a 19pt baseline grid.
ROW_PITCH = 19.0008

# --- Helvetica / Helvetica-Bold AFM advance widths, ASCII 32..126 -------------
_W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
          556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
          1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
          667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
          333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
          556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
_W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
           556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
           975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
           667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
           333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
           611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]


def text_width(s, size, bold=False):
    table = _W_BOLD if bold else _W_REG
    return sum(table[ord(c) - 32] if 32 <= ord(c) <= 126 else 556 for c in s) * size / 1000.0


def esc(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def show(x, y, s, font, size, thin=0.0):
    """Draw text. `thin` erodes the glyphs with a white stroke, which lets a
    base-14 face stand in for one of the lighter subset faces in the original."""
    state = "0 g" if not thin else "0 g 1 G {:g} w 2 Tr".format(thin)
    reset = "" if not thin else " 0 Tr"
    return "BT {} {:g} Tf {} 1 0 0 1 {:.2f} {:.2f} Tm ({}) Tj{} ET\n".format(
        font, size, state, x, y, esc(s), reset)


def fix_fee(data):
    """Raise the submission fee from $70 to $80 on page 1.

    Whiting it out would leave the old glyphs behind for text extraction and
    copy/paste, so the show-text operator itself is rewritten. The sentence is
    one Identity-H Tj in a HelveticaNeue subset that has no "8" glyph, so "$70"
    (CIDs 0007 001A 0013) is dropped and the rest is nudged back into place with
    a TJ kern -- every digit in the face is 556/1000, so 1668 units is exactly
    the width that came out.
    """
    i = data.index("<0007001A0013")
    j = data.index(">Tj", i)
    return data[:i] + "[-1668<" + data[i + 13:j] + ">]TJ" + data[j + 3:]


def edit_page1_stream(data):
    """Fee, plus swapping the category rule for a pointer at the block."""
    data = fix_fee(data)

    # The rule following "Project Category or Categories for Consideration:".
    # The trailing Td is relative to the line matrix, not the pen, so dropping
    # this Tj does not move the "Cost:" line that follows it.
    data = drop_underscore_run(data, "8.7 0 0 8.7 229.5228 513.384 Tm\n")

    if INSERTED:
        # PROJECT TEAM now resumes on page 3. The Helvetica-LightOblique subset
        # carries no digits, so the wording is trimmed to a prefix it can set
        # and only the numeral is stamped alongside in Helvetica-Oblique.
        data = replace_once(data, "(Continued on next page)Tj", "(Continued on page )Tj")
    return data


def edit_page2_stream(data):
    """Re-point the PROJECT TEAM continuation note at page 1."""
    return replace_once(data, "(Continued from last page)Tj", "(Continued from page )Tj")


def strip_page5_heading(data):
    """Drop the "6. Overcoming ..." heading from a clone of page 5.

    Everything after it -- the footer block and the rule across the foot of the
    page -- is what makes the inserted page look native, so it is kept as is.
    """
    assert data.startswith("BT\n")
    end = data.index("ET\n") + 3
    assert "Overcoming Unique Challenges/Obstacles" in data[:end]
    return "/CS0 cs 0 0 0  scn\n/GS0 gs\n" + data[end:]


def replace_once(data, old, new):
    assert data.count(old) == 1, "expected exactly one {!r}".format(old)
    return data.replace(old, new)


def std_font(writer, base_font):
    d = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/" + base_font),
    })
    if base_font != "ZapfDingbats":
        d[NameObject("/Encoding")] = NameObject("/WinAnsiEncoding")
    return writer._add_object(d)


def add_page_fonts(writer, page, fonts):
    """fonts: {resource_name: font_indirect_ref}"""
    res = page[NameObject("/Resources")]
    if "/Font" not in res:
        res[NameObject("/Font")] = DictionaryObject()
    font_res = res[NameObject("/Font")]
    if hasattr(font_res, "get_object"):
        font_res = font_res.get_object()
    for name, ref in fonts.items():
        font_res[NameObject(name)] = ref


def append_content(writer, page, ops, rewrite=None):
    """Append ops to the page, wrapping the original content in q/Q first.

    If `rewrite` is given it is applied to the decoded original content stream,
    which is then replaced with the rewritten version.
    """
    existing = page.raw_get("/Contents")
    resolved = existing.get_object()
    existing_list = list(resolved) if isinstance(resolved, ArrayObject) else [existing]

    if rewrite is not None:
        assert len(existing_list) == 1, "expected a single content stream to rewrite"
        edited = DecodedStreamObject()
        edited.set_data(rewrite(existing_list[0].get_object().get_data().decode("latin-1")).encode("latin-1"))
        existing_list = [writer._add_object(edited)]

    pre = DecodedStreamObject()
    pre.set_data(b"q\n")
    post = DecodedStreamObject()
    post.set_data(b"Q\nq\n" + ops.encode("latin-1") + b"Q\n")
    page[NameObject("/Contents")] = ArrayObject(
        [writer._add_object(pre)] + existing_list + [writer._add_object(post)]
    )


def rect(x0, y0, x1, y1):
    return ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])


def make_checkbox(writer, page_ref, name, x, y, size=8.5):
    """A standalone AcroForm checkbox with baked-in /Off and /Yes appearances."""
    frame = ("q 1 1 1 rg 0 0 {0:g} {0:g} re f 0 G 0.6 w "
             "0.3 0.3 {1:g} {1:g} re S Q\n").format(size, size - 0.6)

    off = DecodedStreamObject()
    off.set_data(frame.encode("latin-1"))
    on = DecodedStreamObject()
    on.set_data((frame + "q BT /ZaDb {:g} Tf 0 g 1.05 1.45 Td (4) Tj ET Q\n".format(size - 1.2)).encode("latin-1"))
    zadb = std_font(writer, "ZapfDingbats")
    for ap in (off, on):
        ap[NameObject("/Type")] = NameObject("/XObject")
        ap[NameObject("/Subtype")] = NameObject("/Form")
        ap[NameObject("/FormType")] = NumberObject(1)
        ap[NameObject("/BBox")] = rect(0, 0, size, size)
        ap[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/ZaDb"): zadb})
        })

    widget = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Btn"),
        NameObject("/Ff"): NumberObject(0),
        NameObject("/F"): NumberObject(4),
        NameObject("/T"): TextStringObject(name),
        NameObject("/TU"): TextStringObject(name),
        NameObject("/Rect"): rect(x, y, x + size, y + size),
        NameObject("/V"): NameObject("/Off"),
        NameObject("/AS"): NameObject("/Off"),
        NameObject("/DA"): TextStringObject("/ZaDb 0 Tf 0 g"),
        NameObject("/MK"): DictionaryObject({
            NameObject("/BC"): ArrayObject([NumberObject(0)] * 3),
            NameObject("/BG"): ArrayObject([NumberObject(1)] * 3),
            NameObject("/CA"): TextStringObject("4"),
        }),
        NameObject("/AP"): DictionaryObject({
            NameObject("/N"): DictionaryObject({
                NameObject("/Yes"): writer._add_object(on),
                NameObject("/Off"): writer._add_object(off),
            })
        }),
        NameObject("/P"): page_ref,
    })
    return writer._add_object(widget)


def make_textfield(writer, page_ref, name, x0, y0, x1, y1):
    widget = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Tx"),
        NameObject("/Ff"): NumberObject(0),
        NameObject("/F"): NumberObject(4),
        NameObject("/T"): TextStringObject(name),
        NameObject("/TU"): TextStringObject("{} {}".format(name, OTHER_HINT)),
        NameObject("/Rect"): rect(x0, y0, x1, y1),
        NameObject("/V"): TextStringObject(""),
        NameObject("/DA"): TextStringObject("/Helv 9 Tf 0 g"),
        NameObject("/MK"): DictionaryObject(),
        NameObject("/P"): page_ref,
    })
    return writer._add_object(widget)


def make_form_xobject(writer, content, resources):
    """Wrap a span lifted out of a page so it can be drawn on another page.

    The span keeps its own /Resources, so it is immune to the fact that every
    page in this file binds /TT0, /C2_0 and friends to a different font subset.
    """
    st = DecodedStreamObject()
    st.set_data(content.encode("latin-1"))
    st[NameObject("/Type")] = NameObject("/XObject")
    st[NameObject("/Subtype")] = NameObject("/Form")
    st[NameObject("/FormType")] = NumberObject(1)
    st[NameObject("/BBox")] = rect(0, 0, 612, 792)
    st[NameObject("/Resources")] = resources
    return writer._add_object(st)


def add_page_xobjects(writer, page, xobjects):
    res = page[NameObject("/Resources")]
    if "/XObject" not in res:
        res[NameObject("/XObject")] = DictionaryObject()
    slot = res[NameObject("/XObject")]
    if hasattr(slot, "get_object"):
        slot = slot.get_object()
    for name, ref in xobjects.items():
        slot[NameObject(name)] = ref


def delete_bt_block(data, marker):
    """Remove the whole BT..ET text object containing `marker`."""
    i = data.index(marker)
    start = data.rindex("BT\n", 0, i)
    end = data.index("ET\n", i) + 3
    return data[:start] + data[end:]


def drop_underscore_run(data, anchor):
    """Remove the rule of underscores drawn immediately after `anchor`."""
    k = data.index(anchor) + len(anchor)
    assert data[k] == "(" and set(data[k + 1:data.index(")Tj", k)]) == {"_"}
    return data[:k] + data[data.index(")Tj", k) + 3:]


_NUM_RE = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)$")


def tokenize(data):
    """Yield (start, end, text) for every content-stream token.

    Strings and dictionaries are emitted whole so that text which happens to
    contain something like "Td" can never be mistaken for an operator.
    """
    i, n = 0, len(data)
    while i < n:
        c = data[i]
        if c in " \t\r\n":
            i += 1
        elif c == "%":
            j = data.find("\n", i)
            i = n if j < 0 else j
        elif c == "(":
            depth, j = 1, i + 1
            while depth:
                if data[j] == "\\":
                    j += 2
                    continue
                depth += (data[j] == "(") - (data[j] == ")")
                j += 1
            yield i, j, data[i:j]
            i = j
        elif data.startswith("<<", i):
            depth, j = 1, i + 2
            while depth:
                if data.startswith("<<", j):
                    depth, j = depth + 1, j + 2
                elif data.startswith(">>", j):
                    depth, j = depth - 1, j + 2
                elif data[j] == "(":
                    for s, e, _ in tokenize(data[j:j + 1] + data[j + 1:]):
                        j += e
                        break
                else:
                    j += 1
            yield i, j, data[i:j]
            i = j
        elif c == "<":
            j = data.index(">", i) + 1
            yield i, j, data[i:j]
            i = j
        elif c in "[]{}":
            yield i, i + 1, c
            i += 1
        else:
            j = i
            while j < n and data[j] not in " \t\r\n%()<>[]{}/":
                j += 1
            if j == i:            # a name: /Foo
                j += 1
                while j < n and data[j] not in " \t\r\n%()<>[]{}/":
                    j += 1
            yield i, j, data[i:j]
            i = j


def shift_text_band(data, y_lo, y_hi, dy):
    """Move text whose baseline falls in (y_lo, y_hi] up by `dy`.

    The page does not draw strictly top to bottom -- the masthead and the
    deadline lines are emitted after the body -- so the rows to move have to be
    picked out by where they land, not by where they sit in the stream. Rows
    hang their labels off a Td relative to the previous Tm, so the walk tracks
    both the original and the rewritten baseline and re-derives any Td that
    straddles the edge of the band.
    """
    in_band = lambda y: y_lo < y <= y_hi
    edits, operands = [], []
    orig_y = new_y = 0.0
    scale = 1.0

    for start, end, tok in tokenize(data):
        if _NUM_RE.match(tok):
            operands.append((start, end, float(tok)))
            continue
        if tok == "BT":
            orig_y = new_y = 0.0
            scale = 1.0
        elif tok == "Tm" and len(operands) >= 6:
            args = operands[-6:]
            scale = args[3][2] or 1.0
            orig_y = args[5][2]
            new_y = orig_y + dy if in_band(orig_y) else orig_y
            edits.append((args[5][0], args[5][1], "{:.4f}".format(new_y)))
        elif tok == "Td" and len(operands) >= 2:
            args = operands[-2:]
            orig_y += args[1][2] * scale
            target = orig_y + dy if in_band(orig_y) else orig_y
            edits.append((args[1][0], args[1][1], "{:.4f}".format((target - new_y) / scale)))
            new_y = target
        operands = []

    for start, end, text in reversed(edits):
        data = data[:start] + text + data[end:]
    return data


class Layout(object):
    def __init__(self, **kw):
        self.__dict__.update(kw)


# Squeezed into the ~200pt of blank space at the foot of the existing page 5.
PAGE5_LAYOUT = Layout(
    heading_y=255.0, note=None, note_y=None,
    col_x=[35.8, 220.0, 404.2], right_edge=567.0, rows_per_col=11,
    top=232.0, pitch=13.2, box=8.5, size=8.0,
    other_gap=18.0, field_x1=400.0,
)

# A page of its own, so the categories get room to breathe.
INSERTED_LAYOUT = Layout(
    heading_y=747.985,
    note="If none of the categories below apply, check Other and name the category.",
    note_y=731.0,
    col_x=[45.0, 320.0], right_edge=567.0, rows_per_col=17,
    top=692.0, pitch=32.0, box=10.5, size=10.0,
    other_gap=38.0, field_x1=430.0,
)

# In the space PROJECT TEAM vacates on page 1, on the form's own 19pt rhythm.
REFLOW_LAYOUT = Layout(
    heading_y=340.6,
    note="If none of the categories below apply, check Other and name the category.",
    note_y=327.0,
    col_x=[36.0, 216.0, 396.0], right_edge=576.0, rows_per_col=11,
    top=309.0, pitch=ROW_PITCH, box=9.5, size=9.0,
    other_gap=24.0, field_x1=400.0,
)


def category_section(writer, page_ref, categories, cfg):
    """Draw the heading + checkbox grid + "Other" row; return (ops, fields)."""
    ops = [
        show(35.805, cfg.heading_y, HEADING, "/XHelvB", 11),
        show(35.805 + text_width(HEADING, 11, bold=True) + 4.5, cfg.heading_y,
             SUBHEAD, "/XHelv", 8),
    ]
    if cfg.note:
        ops.append(show(35.805, cfg.note_y, cfg.note, "/XHelvO", 8))

    edges = cfg.col_x[1:] + [cfg.right_edge]
    fields = []
    for i, cat in enumerate(categories):
        col = i // cfg.rows_per_col
        x, y = cfg.col_x[col], cfg.top - cfg.pitch * (i % cfg.rows_per_col)
        label_x = x + cfg.box + 4.0
        assert label_x + text_width(cat, cfg.size) < edges[col], "label overflows column: " + cat
        ops.append(show(label_x, y + cfg.size * 0.22, cat, "/XHelv", cfg.size))
        fields.append(make_checkbox(writer, page_ref, "Category: " + cat, x, y, cfg.box))

    y = cfg.top - cfg.pitch * (cfg.rows_per_col - 1) - cfg.other_gap
    other_label = "Other (please specify):"
    label_x = cfg.col_x[0] + cfg.box + 4.0
    ops.append(show(label_x, y + cfg.size * 0.22, other_label, "/XHelv", cfg.size))
    fields.append(make_checkbox(writer, page_ref, "Category: Other", cfg.col_x[0], y, cfg.box))

    fx0 = label_x + text_width(other_label, cfg.size) + 6.0
    fx1 = cfg.field_x1
    ops.append("0 G 0.5 w {:.2f} {:.2f} m {:.2f} {:.2f} l S\n".format(fx0, y - 1.0, fx1, y - 1.0))
    ops.append(show(fx1 + 6.0, y + cfg.size * 0.22, OTHER_HINT, "/XHelvO", cfg.size))
    fields.append(make_textfield(writer, page_ref, "Category Other Specify",
                                 fx0, y - 1.0, fx1, y + cfg.box + 3.5))
    return "".join(ops), fields


# --- --reflow: PROJECT TEAM off page 1 and onto a page of its own -------------
#
# Page 1 keeps PROJECT INFORMATION and SUBMITTER'S INFORMATION and gains the
# category list; the whole PROJECT TEAM list -- the 14 rows that were at the
# foot of page 1 plus the 19 trade rows from page 2 -- lands on a new page 2;
# what is left of the old page 2 becomes the PROJECT OVERVIEW page.
TEAM_DY = 426.4     # PROJECT TEAM heading 321.6 -> 748.0, matching pages 4-6
TRADES_DY = -297.0  # keeps the trade rows on the same 19pt grid as the rows above


def page_stream(page):
    return page.raw_get("/Contents").get_object().get_data().decode("latin-1")


def carve_page1(data):
    """Return (page 1 without PROJECT TEAM, the PROJECT TEAM span)."""
    rule = re.search(r"q\n1 0 0 1 36 335 cm\n0 0 m\n540 0 l\nS\nQ\n", data)
    team_end = data.index("/PlacedGraphic")          # the header logo, drawn last
    team = data[rule.end():team_end]
    assert team.count("q\n") == team.count("Q\n"), "unbalanced graphics state in span"
    team = replace_once(team, "(Continued on next page)Tj", "")

    head, tail = data[:rule.start()], data[team_end:]

    # Delete the category row, then lift everything below it by one row so the
    # gap it leaves closes up.
    head = delete_bt_block(head, "8.7 0 0 8.7 36 513.384 Tm")        # the label
    head = delete_bt_block(head, "8.7 0 0 8.7 228.9225 513.384 Tm")  # its /ActualText space
    head = drop_underscore_run(head, "8.7 0 0 8.7 229.5228 513.384 Tm\n")
    head = replace_once(head, "1 0 0 1 36 421.8327 cm",
                        "1 0 0 1 36 {:.4f} cm".format(421.8327 + ROW_PITCH))
    # 514 catches the now-empty anchor the "Cost:" row hangs its Td off; 335 is
    # the divider the vacated PROJECT TEAM block sat under.
    head = shift_text_band(head, 335.0, 514.0, ROW_PITCH)
    return head + tail, team


def carve_page2(data):
    """Return (page 2 without the team rows, the trade-row span)."""
    header = "BT\n/TT0 1 Tf\n-0.03 Tc 0 Tw 100 Tz 11 0 0 11 36 756.35 Tm"
    note = "(Continued from last page)Tj\n"
    trades = "BT\n" + data[data.index(note) + len(note):]

    kept = data[:data.index(header)]
    # the divider that used to separate the trade rows from PROJECT OVERVIEW;
    # pages 4-6 carry no rule above their heading, so drop it rather than move it
    kept = re.sub(r"q\n1 0 0 1 36 385\.04 cm\n0 0 m\n540 0 l\nS\nQ\n", "", kept)
    # lift the heading to where pages 4-6 put theirs; its parenthetical wraps to
    # a second line, so shift by position rather than editing the first Td
    kept = shift_text_band(kept, 350.0, 390.0, 747.985 - 370.79)
    return kept, trades


def reflow(writer, reader):
    p1, p2 = writer.pages[0], writer.pages[1]
    new_p1, team_src = carve_page1(fix_fee(page_stream(p1)))
    new_p2, trades_src = carve_page2(page_stream(p2))

    team_x = make_form_xobject(
        writer, "/CS0 cs 0 0 0 scn\n/GS0 gs\n0 Tc 0 Tw\n" + team_src,
        p1.raw_get("/Resources"))
    trades_x = make_form_xobject(
        writer, "/CS0 cs 0 0 0 scn\n/GS0 gs\n0 Tc 0 Tw 100 Tz\n" + trades_src,
        p2.raw_get("/Resources"))

    # the PROJECT TEAM page: page 5 cloned for its footer, then the two spans
    page = writer.add_page(reader.pages[4])
    if "/Annots" in page:
        del page[NameObject("/Annots")]
    add_page_xobjects(writer, page, {"/FmTeam": team_x, "/FmTrades": trades_x})
    append_content(writer, page,
                   "q 1 0 0 1 0 {:.4f} cm /FmTeam Do Q\n"
                   "q 1 0 0 1 0 {:.4f} cm /FmTrades Do Q\n".format(TEAM_DY, TRADES_DY),
                   rewrite=strip_page5_heading)

    # follow the rows with their widgets
    def nudge(annot, dy, to_page=None):
        r = [float(v) for v in annot["/Rect"]]
        annot[NameObject("/Rect")] = rect(r[0], r[1] + dy, r[2], r[3] + dy)
        if to_page is not None:
            annot[NameObject("/P")] = to_page.indirect_reference

    moved = []
    for src, belongs_to_team, dy in ((p1, lambda b: b < 300.0, TEAM_DY),
                                     (p2, lambda b: b > 380.0, TRADES_DY)):
        keep = []
        for ref in src.raw_get("/Annots").get_object():
            annot = ref.get_object()
            bottom = float(annot["/Rect"][1])
            if belongs_to_team(bottom):
                nudge(annot, dy, page)
                moved.append(ref)
            else:
                if src is p1 and 300.0 < bottom < 500.0:
                    nudge(annot, ROW_PITCH)   # rows closing the gap left on page 1
                keep.append(ref)
        src[NameObject("/Annots")] = ArrayObject(keep)
    assert len(moved) == 33, "expected 33 team rows, moved {}".format(len(moved))
    page[NameObject("/Annots")] = ArrayObject(moved)

    # PROJECT OVERVIEW now owns a whole page, so let its box fill it
    overview = [r.get_object() for r in p2.raw_get("/Annots").get_object()
                if r.get_object().get("/T") == "Project Overview"]
    assert len(overview) == 1, "Project Overview field not found"
    overview[0][NameObject("/Rect")] = rect(35.6, 55.4, 575.9, 732.0)

    append_content(writer, p2, "", rewrite=lambda _: new_p2)

    # a section divider above the category block, matching the other three
    y = 335.0 + ROW_PITCH
    rule_op = "q 0 G 2 w 4 M {:.1f} {:.4f} m {:.1f} {:.4f} l S Q\n".format(36.0, y, 576.0, y)
    return new_p1, rule_op


def main():
    categories = []
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            categories.append(row["ProjectCategory"].strip())
    categories = [c for c in categories if c not in EXCLUDED]
    cfg = REFLOW_LAYOUT if REFLOW else INSERTED_LAYOUT if INSERTED else PAGE5_LAYOUT
    assert len(categories) <= cfg.rows_per_col * len(cfg.col_x), \
        "{} categories will not fit {} columns of {}".format(
            len(categories), len(cfg.col_x), cfg.rows_per_col)

    reader = PdfReader(str(SRC))
    writer = PdfWriter(clone_from=str(SRC))
    acro = writer._root_object[NameObject("/AcroForm")]
    p1 = writer.pages[0]

    # --- 1. drop the free-text category field ---------------------------------
    def drop(container, key):
        arr = container.raw_get(key).get_object()
        keep = ArrayObject([r for r in arr if r.get_object().get("/T") != CATEGORY_FIELD])
        removed = len(arr) - len(keep)
        container[NameObject(key)] = keep
        return removed

    assert drop(acro, "/Fields") == 1, "category field not found in /Fields"
    assert drop(p1, "/Annots") == 1, "category widget not found on page 1"

    helv = std_font(writer, "Helvetica")
    helv_b = std_font(writer, "Helvetica-Bold")
    helv_o = std_font(writer, "Helvetica-Oblique")

    # --- 2. page 1 -------------------------------------------------------------
    add_page_fonts(writer, p1, {"/XHelv": helv, "/XHelvB": helv_b, "/XHelvO": helv_o})

    if REFLOW:
        # The category block lands on page 1 itself, so the row under PROJECT
        # INFORMATION would only repeat it; reflow() deletes that row outright
        # and closes the gap rather than leaving a pointer behind.
        new_p1, rule_op = reflow(writer, reader)
        ops, new_fields = category_section(writer, p1.indirect_reference,
                                           categories, REFLOW_LAYOUT)
        append_content(writer, p1, show(100.4, 595.6, "$80", "/XHelv", 10) + rule_op + ops,
                       rewrite=lambda _: new_p1)
        p1[NameObject("/Annots")] = ArrayObject(
            list(p1.raw_get("/Annots").get_object()) + new_fields)
        kids = writer._root_object[NameObject("/Pages")].get_object()[NameObject("/Kids")]
        kids.insert(1, kids.pop())
        acro[NameObject("/Fields")] = ArrayObject(list(acro["/Fields"]) + new_fields)
        acro[NameObject("/NeedAppearances")] = BooleanObject(True)
        with OUT.open("wb") as fh:
            writer.write(fh)
        print("wrote {}  ({} pages, {} new fields)".format(
            OUT.relative_to(ROOT), len(writer.pages), len(new_fields)))
        return

    ops = [
        show(100.4, 595.6, "$80", "/XHelv", 10),
        show(231.5, 513.4,
             "Check all that apply under {} on page {}.".format(HEADING, 2 if INSERTED else 5),
             "/XHelvO", 8.7),
    ]
    if INSERTED:
        # the numeral for the re-pointed "Continued on page 3" note, placed at
        # the exact advance of the prefix left in the original subset font
        ops.append(show(107.144, 16.486, "3", "/XHelvO", 8, thin=0.22))
    append_content(writer, p1, "".join(ops), rewrite=edit_page1_stream)

    # --- 3. the category block ------------------------------------------------
    if INSERTED:
        p2 = writer.pages[1]
        add_page_fonts(writer, p2, {"/XHelvO": helv_o})
        append_content(writer, p2, show(201.464, 756.35, "1", "/XHelvO", 8, thin=0.22),
                       rewrite=edit_page2_stream)

        # Clone page 5 so the new page inherits its footer, rules and fonts,
        # then strip the essay heading and its widget back off.
        page = writer.add_page(reader.pages[4])
        if "/Annots" in page:
            del page[NameObject("/Annots")]
        rewrite, existing_annots = strip_page5_heading, []
    else:
        page = writer.pages[4]
        rewrite, existing_annots = None, list(page.raw_get("/Annots").get_object())

    add_page_fonts(writer, page, {"/XHelv": helv, "/XHelvB": helv_b, "/XHelvO": helv_o})

    ops, new_fields = category_section(writer, page.indirect_reference, categories, cfg)
    append_content(writer, page, ops, rewrite=rewrite)
    page[NameObject("/Annots")] = ArrayObject(existing_annots + new_fields)

    if INSERTED:
        kids = writer._root_object[NameObject("/Pages")].get_object()[NameObject("/Kids")]
        kids.insert(1, kids.pop())

    # --- 4. register the new widgets ------------------------------------------
    acro[NameObject("/Fields")] = ArrayObject(list(acro["/Fields"]) + new_fields)
    acro[NameObject("/NeedAppearances")] = BooleanObject(True)

    with OUT.open("wb") as fh:
        writer.write(fh)
    print("wrote {}  ({} pages, {} new fields)".format(
        OUT.relative_to(ROOT), len(writer.pages), len(new_fields)))


if __name__ == "__main__":
    main()
