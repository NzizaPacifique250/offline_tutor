#!/usr/bin/env python3
"""
extract_corpus.py - PDF -> markdown extractor for the REB S6 Advanced Mathematics
Student's Book (pymupdf based).

    ./.venv/bin/python tools/extract_corpus.py --unit 1 --start 1 --end 84 \
        --title 'Complex Numbers' --out curriculum/rw_s6_mathematics/lessons/unit_1.md

Two problems specific to this PDF are handled here:

1. Shifted font encodings.  Several fonts are embedded as Type0 / Identity-H
   CIDFontType2 subsets with NO ToUnicode CMap and NO cmap/post table, so every
   PDF text extractor emits the raw glyph id (CID) as if it were a character:
   'Square root' -> '6TXDUH URRW'.  The fonts affected (base names, after the
   subset prefix) are Arial-BoldMT (section / sub-section headings), ArialMT
   (table of contents), Avenir-Book, Avenir-Roman and Avenir-Oblique (figure
   captions and the Summative Evaluation pages).  The glyph orders were
   recovered from the *simple* TrueType subsets of the same fonts elsewhere in
   the file (which keep the original glyph ids and carry a cmap), and verified
   against the /W width arrays of the broken CIDFonts (100 % agreement).
   Mapping (glyph id -> character):
       Arial (Bold/Regular):  gid 3..97 -> chr(gid + 29)  (3 = space, 36 = 'A',
                              68 = 'a'), 179 = left double quote, 182 = right
                              single quote, 191 = 'fi' ligature, ...
       Avenir-Roman/Oblique:  gid 2 = space, gid 3..96 -> chr(gid + 30),
                              386/387 = 'fi'/'fl', 360 = minus
       Avenir-Book:           irregular order (explicit table below)
   Only glyphs that MuPDF reports as *unmappable* (unicode U+FFFD) are decoded,
   which is exactly the set coming from those broken subsets; the normal
   (WinAnsi) instances of the same font names are left untouched, so real
   digits in body text are never shifted.
   SymbolMT (MathType operators) is the same kind of font: gid 3..97 = Symbol
   code gid+29, gid >= 98 = Symbol code gid+63 (verified against the Adobe
   Symbol AFM widths).  MT-Extra gid 92 = R (double struck), 94 = C.

2. Equations are MathType objects: individually positioned glyphs in
   TimesNewRoman / SymbolMT / MT-Extra plus vector drawings (fraction bars,
   radicals).  Text extraction cannot recover them, so every run of math
   glyphs is either (a) reproduced verbatim when it is provably a flat, single
   baseline, uniform size run of decodable glyphs with no drawing touching it
   (e.g. 'z = a + bi', 'a, b', '3.5 - 2i'), or (b) replaced by a placeholder:
   '[math]' inline, or '[equation omitted, see book p. N]' when one or more
   whole lines are math.  Runs that look like figure labels (many tiny glyphs
   or many vector paths) become '[figure omitted, see book p. N]'.

Book page numbering: pdf_index = book_page + page_offset; the offset is read
from the printed page numbers (CenturyGothic-Bold, bottom of page) and is 7
for this file.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

try:
    import pymupdf as fitz
except ImportError:  # older wheels
    import fitz  # type: ignore

DEFAULT_PDF = os.path.join(
    "curriculum", "rw_s6_mathematics", "sources", "S6_Advanced_Math_StudentBook.pdf"
)

# --------------------------------------------------------------------------
# Glyph-id -> unicode tables for the broken (no ToUnicode) font subsets.
# --------------------------------------------------------------------------

# Arial / Arial Bold native glyph order (gids 0..2 are .notdef/.null/CR).
# gid 3..97 are the printable ASCII characters in order -> chr(gid + 29).
_ARIAL_EXTRA = {
    98: 0x00C4, 99: 0x00C5, 100: 0x00C7, 101: 0x00C9, 102: 0x00D1, 103: 0x00D6,
    104: 0x00DC, 105: 0x00E1, 106: 0x00E0, 107: 0x00E2, 108: 0x00E4, 109: 0x00E3,
    110: 0x00E5, 111: 0x00E7, 112: 0x00E9, 113: 0x00E8, 114: 0x00EA, 115: 0x00EB,
    116: 0x00ED, 117: 0x00EC, 118: 0x00EE, 119: 0x00EF, 120: 0x00F1, 121: 0x00F3,
    122: 0x00F2, 123: 0x00F4, 124: 0x00F6, 125: 0x00F5, 126: 0x00FA, 127: 0x00F9,
    128: 0x00FB, 129: 0x00FC, 130: 0x2020, 131: 0x00B0, 132: 0x00A2, 133: 0x00A3,
    134: 0x00A7, 135: 0x2022, 136: 0x00B6, 137: 0x00DF, 138: 0x00AE, 139: 0x00A9,
    140: 0x2122, 141: 0x00B4, 142: 0x00A8, 143: 0x2260, 144: 0x00C6, 145: 0x00D8,
    146: 0x221E, 147: 0x00B1, 148: 0x2264, 149: 0x2265, 150: 0x00A5, 151: 0x00B5,
    152: 0x2202, 153: 0x2211, 154: 0x220F, 155: 0x03C0, 156: 0x222B, 157: 0x00AA,
    158: 0x00BA, 159: 0x2126, 160: 0x00E6, 161: 0x00F8, 162: 0x00BF, 163: 0x00A1,
    164: 0x00AC, 165: 0x221A, 166: 0x0192, 167: 0x2248, 168: 0x2206, 169: 0x00AB,
    170: 0x00BB, 171: 0x2026, 172: 0x00C0, 173: 0x00C3, 174: 0x00D5, 175: 0x0152,
    176: 0x0153, 177: 0x2013, 178: 0x2014, 179: 0x201C, 180: 0x201D, 181: 0x2018,
    182: 0x2019, 183: 0x00F7, 184: 0x25CA, 185: 0x00FF, 186: 0x0178, 187: 0x2044,
    188: 0x20AC, 189: 0x2039, 190: 0x203A, 191: 0xFB01, 192: 0xFB02, 193: 0x2021,
    194: 0x2219, 195: 0x201A, 196: 0x201E, 197: 0x2030, 198: 0x00C2, 199: 0x00CA,
    200: 0x00C1, 201: 0x00CB, 202: 0x00C8, 203: 0x00CD, 204: 0x00CE, 205: 0x00CF,
    206: 0x00CC, 207: 0x00D3, 208: 0x00D4, 209: 0x00D2, 210: 0x00DA, 211: 0x00DB,
    212: 0x00D9, 213: 0x0131, 214: 0x02C6, 215: 0x02DC, 216: 0x02C9, 217: 0x02D8,
    218: 0x02D9, 219: 0x02DA, 220: 0x00B8, 221: 0x02DD, 222: 0x02DB, 223: 0x02C7,
    224: 0x0141, 225: 0x0142, 226: 0x0160, 227: 0x0161, 228: 0x017D, 229: 0x017E,
    230: 0x00A6, 231: 0x00D0, 232: 0x00F0, 233: 0x00DD, 234: 0x00FD, 235: 0x00DE,
    236: 0x00FE, 237: 0x2212, 238: 0x00D7, 239: 0x00B9, 240: 0x00B2, 241: 0x00B3,
    242: 0x00BD, 243: 0x00BC, 244: 0x00BE, 245: 0x20A3, 246: 0x011E, 247: 0x011F,
    248: 0x0130, 249: 0x015E, 250: 0x015F, 251: 0x0106, 252: 0x0107, 253: 0x010C,
    254: 0x010D, 255: 0x0111, 256: 0x00AF, 257: 0x00B7, 258: 0x0102, 259: 0x0103,
}
ARIAL_TABLE: Dict[int, str] = {g: chr(g + 29) for g in range(3, 98)}
ARIAL_TABLE.update({g: chr(u) for g, u in _ARIAL_EXTRA.items()})

# Avenir Roman / Oblique (Mac ordered TrueType): gid 2 = space, 3..96 -> +30
AVENIR_MAC_TABLE: Dict[int, str] = {2: " "}
AVENIR_MAC_TABLE.update({g: chr(g + 30) for g in range(3, 97)})
AVENIR_MAC_TABLE.update({111: "’", 115: "–", 196: "è", 197: "é",
                         360: "−", 386: "ﬁ", 387: "ﬂ"})

# Avenir Book: irregular order, recovered from the WinAnsi subsets' cmap
# (+ a few ids inferred from word context: 119 fi, 142 k, 34 O, 29 L, 81/82 [ ], 42 P).
_AVENIR_BOOK = {
    3: 0x0020, 9: 0x0042, 10: 0x0043, 12: 0x0044, 13: 0x0045, 19: 0x0046, 20: 0x0047,
    21: 0x0048, 22: 0x0049, 29: 0x004C, 32: 0x004E, 34: 0x004F, 42: 0x0050, 44: 0x0052,
    45: 0x0053, 47: 0x0054, 49: 0x0055, 55: 0x0057, 62: 0x0061, 76: 0x0062, 81: 0x005B,
    82: 0x005D, 85: 0x2022, 86: 0x0063, 92: 0x003A, 93: 0x002C, 96: 0x0064, 105: 0x0065,
    110: 0x0038, 114: 0x003D, 118: 0x0066, 119: 0xFB01, 120: 0x0035, 123: 0x0034,
    125: 0x0067, 133: 0x0068, 135: 0x002D, 136: 0x0069, 142: 0x006B, 143: 0x006C,
    147: 0x006D, 152: 0x006E, 153: 0x0039, 156: 0x006F, 163: 0x0031, 171: 0x0070,
    173: 0x0028, 174: 0x0029, 176: 0x002E, 181: 0x0071, 182: 0x003F, 192: 0x0072,
    195: 0x0073, 199: 0x0037, 200: 0x0036, 204: 0x0074, 206: 0x0033, 211: 0x0032,
    213: 0x0075, 219: 0x0076, 220: 0x0077, 221: 0x0078, 222: 0x0079, 226: 0x007A,
    228: 0x0030, 386: 0x0041,
}
AVENIR_BOOK_TABLE = {g: chr(u) for g, u in _AVENIR_BOOK.items()}

# Adobe Symbol encoding (code -> unicode); SymbolMT gid 3..97 -> code gid+29,
# gid >= 98 -> code gid+63 (0xA0 'Euro' is absent from the glyph order).
_SYMBOL_ENC = {
    0x20: " ", 0x21: "!", 0x22: "∀", 0x23: "#", 0x24: "∃", 0x25: "%", 0x26: "&",
    0x27: "∋", 0x28: "(", 0x29: ")", 0x2A: "∗", 0x2B: "+", 0x2C: ",", 0x2D: "−",
    0x2E: ".", 0x2F: "/", 0x30: "0", 0x31: "1", 0x32: "2", 0x33: "3", 0x34: "4", 0x35: "5",
    0x36: "6", 0x37: "7", 0x38: "8", 0x39: "9", 0x3A: ":", 0x3B: ";", 0x3C: "<", 0x3D: "=",
    0x3E: ">", 0x3F: "?", 0x40: "≅", 0x41: "Α", 0x42: "Β", 0x43: "Χ",
    0x44: "Δ", 0x45: "Ε", 0x46: "Φ", 0x47: "Γ", 0x48: "Η",
    0x49: "Ι", 0x4A: "ϑ", 0x4B: "Κ", 0x4C: "Λ", 0x4D: "Μ",
    0x4E: "Ν", 0x4F: "Ο", 0x50: "Π", 0x51: "Θ", 0x52: "Ρ",
    0x53: "Σ", 0x54: "Τ", 0x55: "Υ", 0x56: "ς", 0x57: "Ω",
    0x58: "Ξ", 0x59: "Ψ", 0x5A: "Ζ", 0x5B: "[", 0x5C: "∴", 0x5D: "]",
    0x5E: "⊥", 0x5F: "_", 0x60: "‾", 0x61: "α", 0x62: "β", 0x63: "χ",
    0x64: "δ", 0x65: "ε", 0x66: "φ", 0x67: "γ", 0x68: "η",
    0x69: "ι", 0x6A: "ϕ", 0x6B: "κ", 0x6C: "λ", 0x6D: "μ",
    0x6E: "ν", 0x6F: "ο", 0x70: "π", 0x71: "θ", 0x72: "ρ",
    0x73: "σ", 0x74: "τ", 0x75: "υ", 0x76: "ϖ", 0x77: "ω",
    0x78: "ξ", 0x79: "ψ", 0x7A: "ζ", 0x7B: "{", 0x7C: "|", 0x7D: "}",
    0x7E: "∼",
    0xA1: "ϒ", 0xA2: "′", 0xA3: "≤", 0xA4: "⁄", 0xA5: "∞",
    0xA6: "ƒ", 0xA7: "♣", 0xA8: "♦", 0xA9: "♥", 0xAA: "♠",
    0xAB: "↔", 0xAC: "←", 0xAD: "↑", 0xAE: "→", 0xAF: "↓",
    0xB0: "°", 0xB1: "±", 0xB2: "″", 0xB3: "≥", 0xB4: "×",
    0xB5: "∝", 0xB6: "∂", 0xB7: "•", 0xB8: "÷", 0xB9: "≠",
    0xBA: "≡", 0xBB: "≈", 0xBC: "…", 0xBD: "⏐", 0xBE: "⎯",
    0xBF: "↵", 0xC0: "ℵ", 0xC1: "ℑ", 0xC2: "ℜ", 0xC3: "℘",
    0xC4: "⊗", 0xC5: "⊕", 0xC6: "∅", 0xC7: "∩", 0xC8: "∪",
    0xC9: "⊃", 0xCA: "⊇", 0xCB: "⊄", 0xCC: "⊂", 0xCD: "⊆",
    0xCE: "∈", 0xCF: "∉", 0xD0: "∠", 0xD1: "∇", 0xD2: "®",
    0xD3: "©", 0xD4: "™", 0xD5: "∏", 0xD6: "√", 0xD7: "⋅",
    0xD8: "¬", 0xD9: "∧", 0xDA: "∨", 0xDB: "⇔", 0xDC: "⇐",
    0xDD: "⇑", 0xDE: "⇒", 0xDF: "⇓", 0xE0: "◊", 0xE1: "〈",
    0xE2: "®", 0xE3: "©", 0xE4: "™", 0xE5: "∑", 0xE6: "⎛",
    0xE7: "⎜", 0xE8: "⎝", 0xE9: "⎡", 0xEA: "⎢", 0xEB: "⎣",
    0xEC: "⎧", 0xED: "⎨", 0xEE: "⎩", 0xEF: "⎪", 0xF1: "〉",
    0xF2: "∫", 0xF3: "⌠", 0xF4: "⎮", 0xF5: "⌡", 0xF6: "⎞",
    0xF7: "⎟", 0xF8: "⎠", 0xF9: "⎤", 0xFA: "⎥", 0xFB: "⎦",
    0xFC: "⎫", 0xFD: "⎬", 0xFE: "⎭",
}
SYMBOL_TABLE: Dict[int, str] = {}
for _g in range(3, 98):
    SYMBOL_TABLE[_g] = _SYMBOL_ENC[_g + 29]
for _g in range(98, 98 + (0xFE - 0xA1) + 1):
    _c = _g + 63
    if _c in _SYMBOL_ENC:
        SYMBOL_TABLE[_g] = _SYMBOL_ENC[_c]

MTEXTRA_TABLE = {92: "ℝ", 94: "ℂ"}  # R and C double-struck

# font base name -> gid table (used only for glyphs MuPDF reports as U+FFFD)
GID_TABLES: Dict[str, Dict[int, str]] = {
    "Arial-BoldMT": ARIAL_TABLE,
    "ArialMT": ARIAL_TABLE,
    "Arial-BoldItalicMT": ARIAL_TABLE,
    "Arial-ItalicMT": ARIAL_TABLE,
    "Avenir-Roman": AVENIR_MAC_TABLE,
    "Avenir-Oblique": AVENIR_MAC_TABLE,
    "Avenir-Book": AVENIR_BOOK_TABLE,
    "SymbolMT": SYMBOL_TABLE,
    "MT-Extra": MTEXTRA_TABLE,
}

# Fonts that carry MathType equation glyphs (never prose in this book).
MATH_FONTS = {
    "SymbolMT", "MT-Extra", "EuclidSymbol", "EuclidSymbol-Italic",
    "TimesNewRomanPSMT", "TimesNewRomanPS-ItalicMT", "TimesNewRomanPS-BoldMT",
    "TimesNewRomanPS-BoldItal", "TimesNewRomanPS-BoldItalicMT",
    "ArialUnicodeMS-KSCms-UHC", "Cambria", "Cambria-Italic", "Cambria-BoldItalic",
    "MinionPro-Bold", "MinionPro-It",
}
# Fonts whose whole-line use marks a heading / label.
HEADING_FONTS = {
    "Arial-BoldMT", "AvenirNextLTPro-Bold", "Arial-Black", "Avenir-Black",
    "Calibri-Bold", "Avenir-BlackOblique", "NewsGothicBT-Bold",
}
ITALIC_FONTS = {"AvenirNextLTPro-It", "Avenir-Oblique", "Avenir-BlackOblique"}
PAGENUM_FONTS = {"CenturyGothic-Bold", "Avenir-Roman"}

LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
             " ": " ", "­": "", "−": "−"}

LABEL_RE = re.compile(
    r"^(Example|Activity|Application activity|Introductory activity|Solution|Notice|"
    r"Objectives|Remark|Note|Definition|Theorem|Properties|Exercise|End of unit assessment|"
    r"Unit summary|Summary|Evaluation|SECTION)\b",
    re.I,
)
LIST_RE = re.compile(r"^(\(?[0-9]{1,2}[.)]|\(?[a-hj-z][.)]|\(?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)[.)]|[•▪»–-])(\s|$)")
SECTION_RE = re.compile(r"^\d{1,2}\.\d{1,2}\.?\s")
SUBSECTION_RE = re.compile(r"^\d{1,2}\.\d{1,2}\.\d{1,2}\.?\s?")

# Characters accepted inside a "simple" (verbatim) math run.
SIMPLE_MATH_OK = set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;'?!%"
    "+−-=()[]{}|<>/≤≥≠±×÷⋅∈∉∞"
    "→←↔⇒⇔…°′ℝℂℕℤℚ"
    "αβγδεθλμπρστφω"
    "ΔΣΠΩ∧∨∩∪⊂⊆∅∀∃"
)
DELIMS = set("()[]{}|")


# --------------------------------------------------------------------------
# Data structures
# --------------------------------------------------------------------------
@dataclass
class Glyph:
    x0: float
    y0: float
    x1: float
    y1: float
    ox: float
    oy: float
    size: float
    font: str
    text: Optional[str]      # None = undecodable
    gid: int
    is_math: bool
    bold: bool
    italic: bool
    decoded: bool = False     # came from a shifted-encoding font


@dataclass
class Segment:
    kind: str                 # 'prose' | 'math'
    glyphs: List[Glyph]
    text: str = ""            # rendered text
    simple: bool = False      # math run reproduced verbatim


@dataclass
class Line:
    glyphs: List[Glyph]
    y0: float = 0.0
    y1: float = 0.0
    x0: float = 0.0
    x1: float = 0.0
    baseline: float = 0.0
    size: float = 0.0
    segments: List[Segment] = field(default_factory=list)
    kind: str = "text"        # 'text' | 'math' | 'heading' | 'pagenum' | 'empty'
    level: int = 0            # heading level
    text: str = ""
    opaque: bool = False      # math line that could not be reproduced
    figure: bool = False


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def base_font(name: str) -> str:
    return name.split("+")[-1]


def norm_char(ch: str) -> str:
    if ch in LIGATURES:
        return LIGATURES[ch]
    o = ord(ch)
    if 0x80 <= o <= 0x9F:  # cp1252 control range leaked from a cmap
        try:
            return bytes([o]).decode("cp1252")
        except UnicodeDecodeError:
            return ""
    return ch


def is_bold_font(font: str, flags: int) -> bool:
    return font in HEADING_FONTS or "Bold" in font or "Black" in font or bool(flags & 16)


def is_italic_font(font: str, flags: int) -> bool:
    return font in ITALIC_FONTS or "It" in font.split("-")[-1] or "Oblique" in font


def rect_intersects(a, b, pad=0.0) -> bool:
    return not (a[2] + pad < b[0] or b[2] < a[0] - pad or a[3] + pad < b[1] or b[3] < a[1] - pad)


# --------------------------------------------------------------------------
# Page processing
# --------------------------------------------------------------------------
class PageExtractor:
    def __init__(self, page, book_page: int, keep_simple_math: bool = True, debug: bool = False):
        self.page = page
        self.book_page = book_page
        self.keep_simple_math = keep_simple_math
        self.debug = debug
        self.W = page.rect.width
        self.H = page.rect.height
        self.stats = Counter()
        self.drawings: List[Tuple[float, float, float, float]] = []
        self.small_drawings: List[Tuple[float, float, float, float]] = []

    # -- glyph collection ---------------------------------------------------
    def collect_glyphs(self) -> List[Glyph]:
        glyphs: List[Glyph] = []
        for span in self.page.get_texttrace():
            if span.get("type", 0) != 0:      # stroke / clip text: ignore
                continue
            d = span.get("dir", (1, 0))
            if abs(d[0] - 1) > 0.01 or abs(d[1]) > 0.01:   # rotated text (figures)
                self.stats["rotated_glyphs_dropped"] += len(span["chars"])
                continue
            font = base_font(span["font"])
            size = float(span["size"])
            flags = int(span.get("flags", 0))
            math = font in MATH_FONTS
            bold = is_bold_font(font, flags)
            italic = is_italic_font(font, flags)
            table = GID_TABLES.get(font)
            span_decoded = False
            for uni, gid, origin, bbox in span["chars"]:
                x0, y0, x1, y1 = bbox
                if x1 < 0 or y1 < 0 or x0 > self.W or y0 > self.H:
                    continue
                if uni == 0xFFFD:
                    ch = table.get(gid) if table else None
                    if ch is None:
                        if not math:
                            self.stats["undecodable_glyphs"] += 1
                        text = None
                    else:
                        text = norm_char(ch)
                        if not math:
                            span_decoded = True
                    dec = table is not None and ch is not None and not math
                else:
                    text = norm_char(chr(uni))
                    dec = False
                glyphs.append(Glyph(x0, y0, x1, y1, origin[0], origin[1], size, font,
                                    text, gid, math, bold, italic, dec))
            if span_decoded:
                self.stats["shifted_spans_decoded"] += 1
        return glyphs

    def collect_drawings(self):
        try:
            paths = self.page.get_drawings()
        except Exception:
            paths = []
        for p in paths:
            r = p.get("rect")
            if r is None:
                continue
            rect = (r.x0, r.y0, r.x1, r.y1)
            if r.x1 < 0 or r.y1 < 0 or r.x0 > self.W or r.y0 > self.H:
                continue
            self.drawings.append(rect)
            if (r.x1 - r.x0) <= 260 and (r.y1 - r.y0) <= 60:
                self.small_drawings.append(rect)

    # -- line clustering ----------------------------------------------------
    def cluster_lines(self, glyphs: List[Glyph]) -> List[Line]:
        glyphs = sorted(glyphs, key=lambda g: (g.oy, g.x0))
        lines: List[Line] = []
        for g in glyphs:
            gh = max(g.y1 - g.y0, 1.0)
            best = None
            best_ov = 0.0
            for ln in lines[-6:]:
                ov = min(g.y1, ln.y1) - max(g.y0, ln.y0)
                ref = min(gh, max(ln.size, 1.0) * 1.2)
                if ov >= 0.5 * ref and ov > best_ov:
                    best, best_ov = ln, ov
            if best is None:
                lines.append(Line([g], g.y0, g.y1, g.x0, g.x1, g.oy, g.size))
            else:
                best.glyphs.append(g)
                best.y0 = min(best.y0, g.y0)
                best.y1 = max(best.y1, g.y1)
                best.x0 = min(best.x0, g.x0)
                best.x1 = max(best.x1, g.x1)
        for ln in lines:
            ln.glyphs.sort(key=lambda g: (g.x0, g.oy))
            prose = [g for g in ln.glyphs if not g.is_math]
            ref = prose if prose else ln.glyphs
            ln.baseline = statistics.median(g.oy for g in ref)
            ln.size = statistics.median(g.size for g in ref)
        lines.sort(key=lambda l: (l.baseline, l.x0))
        return lines

    # -- rendering of glyph runs --------------------------------------------
    @staticmethod
    def render_run(glyphs: List[Glyph], gap_factor: float = 0.18) -> str:
        out: List[str] = []
        prev: Optional[Glyph] = None
        for g in glyphs:
            t = g.text if g.text is not None else "�"
            if prev is not None:
                gap = g.x0 - prev.x1
                if gap > gap_factor * min(g.size, prev.size) and out and not out[-1].endswith(" ") and not t.startswith(" "):
                    out.append(" ")
            out.append(t)
            prev = g
        return "".join(out)

    def render_prose(self, glyphs: List[Glyph]) -> str:
        """Prose with **bold** / *italic* runs."""
        out: List[str] = []
        prev: Optional[Glyph] = None
        cur_style = None
        buf: List[str] = []

        def flush():
            nonlocal buf, cur_style
            s = "".join(buf)
            if s and cur_style:
                lead = len(s) - len(s.lstrip())
                trail = len(s.rstrip())
                core = s[lead:trail]
                if core:
                    mark = "**" if cur_style == "b" else "*"
                    s = s[:lead] + mark + core + mark + s[trail:]
            out.append(s)
            buf = []

        for g in glyphs:
            t = g.text if g.text is not None else "�"
            style = "b" if g.bold else ("i" if g.italic else None)
            if prev is not None:
                gap = g.x0 - prev.x1
                if gap > 0.18 * min(g.size, prev.size) and not (buf and buf[-1].endswith(" ")) and not t.startswith(" "):
                    if style != cur_style:
                        flush(); out.append(" ")
                    else:
                        buf.append(" ")
            if style != cur_style:
                if t.strip() == "" and buf:
                    # whitespace keeps the current style run open
                    buf.append(t); prev = g
                    continue
                flush()
                cur_style = style
            buf.append(t)
            prev = g
        flush()
        return "".join(out)

    def simple_math_text(self, glyphs: List[Glyph]) -> Optional[str]:
        """Return verbatim text for a flat, single-baseline math run or None."""
        vis = [g for g in glyphs if g.text is not None and g.text.strip() != ""]
        if not vis:
            return ""
        if any(g.text is None for g in glyphs):
            return None
        for g in vis:
            for ch in g.text:
                if ch not in SIMPLE_MATH_OK:
                    return None
        sizes = [g.size for g in vis if not (g.text in DELIMS)]
        base_size = statistics.median(sizes) if sizes else vis[0].size
        for g in vis:
            if g.text in DELIMS:
                if g.size > base_size * 1.7:
                    return None
            elif abs(g.size - base_size) > 1.5:
                return None
        oys = [g.oy for g in vis if g.text not in DELIMS]
        base_oy = statistics.median(oys) if oys else vis[0].oy
        for g in vis:
            tol = 0.3 * g.size if g.text in DELIMS else 1.2
            if abs(g.oy - base_oy) > tol:
                return None
        x0 = min(g.x0 for g in vis); x1 = max(g.x1 for g in vis)
        y0 = min(g.oy - 0.75 * g.size for g in vis); y1 = max(g.oy + 0.35 * g.size for g in vis)
        for r in self.small_drawings:
            if rect_intersects((x0, y0, x1, y1), r, pad=0.5):
                return None
        return self.render_run(vis, gap_factor=0.2).strip()

    # -- line analysis ------------------------------------------------------
    def analyse_line(self, ln: Line):
        gl = ln.glyphs
        # bullet: Symbol bullet glyph at the start becomes prose
        if gl and gl[0].is_math and gl[0].text == "•":
            gl[0].is_math = False
        # blank / page number handling
        visible = [g for g in gl if g.text is not None and g.text.strip()]
        if not visible:
            ln.kind = "empty"
            return
        raw = self.render_run(gl).strip()
        if re.fullmatch(r"\d{1,3}", raw) and (ln.y0 > self.H - 60 or ln.y1 < 50):
            ln.kind = "pagenum"
            ln.text = raw
            return
        # segments
        segs: List[Segment] = []
        for g in gl:
            if segs and segs[-1].kind == ("math" if g.is_math else "prose"):
                segs[-1].glyphs.append(g)
            else:
                segs.append(Segment("math" if g.is_math else "prose", [g]))
        # merge prose segments separated by whitespace-only math glyphs
        has_prose = any(s.kind == "prose" and any((x.text or "").strip() for x in s.glyphs) for s in segs)
        n_math_vis = 0
        parts: List[str] = []
        for s in segs:
            if s.kind == "prose":
                s.text = self.render_prose(s.glyphs)
            else:
                vis = [g for g in s.glyphs if g.text is None or g.text.strip()]
                if not vis:
                    s.text = " "
                    continue
                n_math_vis += len(vis)
                st = self.simple_math_text(s.glyphs) if self.keep_simple_math else None
                if st is not None:
                    s.text = st
                    s.simple = True
                    self.stats["math_runs_kept"] += 1
                else:
                    s.text = "[math]"
        ln.segments = segs
        if not has_prose:
            ln.kind = "math"
            ln.opaque = any(s.kind == "math" and not s.simple and s.text == "[math]" for s in segs)
            ln.text = " ".join(s.text.strip() for s in segs if s.text.strip())
            tiny = sum(1 for g in visible if g.size <= 9)
            ln.figure = tiny >= max(4, 0.6 * len(visible))
            return
        # text line: join segments with sensible spacing
        text = ""
        prev_seg = None
        for s in segs:
            t = s.text
            if not t:
                continue
            if prev_seg is not None:
                gap = s.glyphs[0].x0 - prev_seg.glyphs[-1].x1
                if gap > 0.15 * ln.size and not text.endswith(" ") and not t.startswith(" "):
                    text += " "
                elif s.kind == "math" and not text.endswith(" ") and not t.startswith(" "):
                    text += " "
                elif s.kind == "prose" and prev_seg.kind == "math" and t and t[0].isalnum() and not text.endswith(" "):
                    text += " "
            text += t
            if s.kind == "math" and s.text == "[math]":
                self.stats["inline_math_omitted"] += 1
            prev_seg = s
        text = re.sub(r"[ \t]{2,}", " ", text).strip()
        ln.text = text
        # heading?
        prose_glyphs = [g for g in gl if not g.is_math and g.text and g.text.strip()]
        all_bold = prose_glyphs and all(g.bold for g in prose_glyphs)
        big = ln.size >= 15
        plain = re.sub(r"\*+", "", text).strip()
        if (all_bold or big) and len(plain) <= 110 and plain:
            if big and plain.lower() in ("unit",) or (big and re.fullmatch(r"\d+", plain)):
                ln.kind = "empty"   # unit banner pieces
                return
            ln.kind = "heading"
            if big:
                ln.level = 2
            elif SUBSECTION_RE.match(plain):
                ln.level = 3
            elif SECTION_RE.match(plain):
                ln.level = 2
            else:
                ln.level = 4
            ln.text = plain
        else:
            ln.kind = "text"

    # -- page assembly ------------------------------------------------------
    def run(self) -> Tuple[List[str], Counter, Optional[int]]:
        glyphs = self.collect_glyphs()
        self.collect_drawings()
        lines = self.cluster_lines(glyphs)
        for ln in lines:
            self.analyse_line(ln)
        printed: Optional[int] = None
        for ln in lines:
            if ln.kind == "pagenum" and printed is None:
                printed = int(ln.text)
        content = [ln for ln in lines if ln.kind in ("text", "math", "heading")]
        if self.debug:
            for ln in content:
                sys.stderr.write(f"  [{ln.kind:7s} L{ln.level} y={ln.baseline:6.1f} x={ln.x0:5.1f}-{ln.x1:5.1f} sz={ln.size:4.1f}] {ln.text[:100]!r}\n")
        right_edge = max((ln.x1 for ln in content if ln.kind == "text"), default=self.W)
        blocks: List[str] = []
        para: List[str] = []
        prev: Optional[Line] = None
        math_group: List[Line] = []

        def flush_para():
            nonlocal para
            if para:
                blocks.append(" ".join(para))
                para = []

        def flush_math():
            nonlocal math_group
            if not math_group:
                return
            gx0 = min(l.x0 for l in math_group); gx1 = max(l.x1 for l in math_group)
            gy0 = min(l.y0 for l in math_group); gy1 = max(l.y1 for l in math_group)
            n_paths = sum(1 for r in self.drawings if rect_intersects((gx0, gy0, gx1, gy1), r))
            small = sum(1 for r in self.small_drawings if rect_intersects((gx0, gy0, gx1, gy1), r, pad=1))
            figure = any(l.figure for l in math_group) or n_paths >= 15
            if figure:
                blocks.append(f"[figure omitted, see book p. {self.book_page}]")
                self.stats["figures_omitted"] += 1
            elif len(math_group) >= 2 and (small > 0 or any(l.opaque for l in math_group)):
                # stacked construct (fraction, matrix, system) -> one placeholder
                blocks.append(f"[equation omitted, see book p. {self.book_page}]")
                self.stats["equations_omitted"] += 1
                self.stats["math_runs_kept"] -= sum(
                    1 for l in math_group for s in l.segments if s.kind == "math" and s.simple and s.text.strip())
            else:
                pending_placeholder = False
                for l in math_group:
                    if l.opaque:
                        if not pending_placeholder:
                            blocks.append(f"[equation omitted, see book p. {self.book_page}]")
                            self.stats["equations_omitted"] += 1
                            pending_placeholder = True
                    else:
                        blocks.append(l.text)
                        pending_placeholder = False
            math_group = []

        for ln in content:
            if ln.kind == "math":
                flush_para()
                math_group.append(ln)
                prev = ln
                continue
            flush_math()
            if ln.kind == "heading":
                flush_para()
                # merge wrapped multi-line headings of same level/size
                if blocks and blocks[-1].startswith("#" * ln.level + " ") and prev is not None and prev.kind == "heading" \
                        and abs(prev.size - ln.size) < 0.6 and (ln.baseline - prev.baseline) < 1.8 * ln.size \
                        and not LABEL_RE.match(ln.text) and not LABEL_RE.match(blocks[-1].lstrip("# ")) \
                        and not SECTION_RE.match(ln.text):
                    blocks[-1] = blocks[-1] + " " + ln.text
                else:
                    blocks.append("#" * ln.level + " " + ln.text)
                prev = ln
                continue
            # text line
            new_para = False
            if prev is None or prev.kind != "text":
                new_para = True
            else:
                pitch = ln.baseline - prev.baseline
                if pitch > 1.9 * max(ln.size, 10):
                    new_para = True
                elif LIST_RE.match(ln.text):
                    new_para = True
                elif abs(ln.size - prev.size) >= 2:
                    new_para = True
                elif ln.x0 < prev.x0 - 12:
                    new_para = True
                elif re.search(r"[.?!:]\s*\**\s*$", prev.text) and prev.x1 < 0.72 * right_edge and ln.text[:1].isupper():
                    new_para = True
            if new_para:
                flush_para()
                para.append(ln.text)
            else:
                if para and para[-1].endswith("-") and ln.text[:1].islower():
                    para[-1] = para[-1][:-1] + ln.text
                else:
                    para.append(ln.text)
            prev = ln
        flush_para()
        flush_math()
        return blocks, self.stats, printed


# --------------------------------------------------------------------------
# Offset detection
# --------------------------------------------------------------------------
def printed_page_number(page) -> Optional[int]:
    H = page.rect.height
    best = None
    for span in page.get_texttrace():
        font = base_font(span["font"])
        if font not in PAGENUM_FONTS:
            continue
        chars = span["chars"]
        if not chars:
            continue
        txt = "".join(chr(c[0]) for c in chars).strip()
        y = chars[0][3][3]
        if re.fullmatch(r"\d{1,3}", txt) and (y > H - 60 or y < 50):
            best = int(txt)
    return best


def detect_offset(doc, start_book_page: int, assumed: int = 7) -> Optional[int]:
    votes = Counter()
    lo = max(0, start_book_page + assumed - 12)
    hi = min(doc.page_count, start_book_page + assumed + 12)
    for pi in range(lo, hi):
        p = printed_page_number(doc[pi])
        if p is not None:
            votes[pi - p] += 1
    if not votes:
        return None
    return votes.most_common(1)[0][0]


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--pdf", default=DEFAULT_PDF)
    ap.add_argument("--unit", type=int, required=True)
    ap.add_argument("--start", type=int, required=True, help="first book page")
    ap.add_argument("--end", type=int, required=True, help="last book page (inclusive)")
    ap.add_argument("--title", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--page-offset", type=int, default=None,
                    help="pdf_index - book_page (default: detected from printed page numbers)")
    ap.add_argument("--no-simple-math", action="store_true",
                    help="never reproduce flat math runs verbatim; always use placeholders")
    ap.add_argument("--debug-page", type=int, action="append", default=[],
                    help="book page(s) for which to dump line classification to stderr")
    args = ap.parse_args(argv)

    doc = fitz.open(args.pdf)
    offset = args.page_offset
    if offset is None:
        offset = detect_offset(doc, args.start)
        if offset is None:
            print("WARNING: could not detect page offset from printed numbers; assuming 7", file=sys.stderr)
            offset = 7
    last_pdf = doc.page_count - 1
    end = args.end
    if end + offset > last_pdf:
        print(f"NOTE: --end {end} is beyond the document (last pdf index {last_pdf}); "
              f"clamping to book page {last_pdf - offset}", file=sys.stderr)
        end = last_pdf - offset

    md: List[str] = [f"# Unit {args.unit}: {args.title}", "",
                     f"<!-- source: {os.path.basename(args.pdf)}; book pages {args.start}-{end}; "
                     f"pdf index = book page + {offset} -->", ""]
    per_page = []
    totals = Counter()
    mismatches = []
    for bp in range(args.start, end + 1):
        pi = bp + offset
        page = doc[pi]
        ex = PageExtractor(page, bp, keep_simple_math=not args.no_simple_math, debug=bp in args.debug_page)
        if bp in args.debug_page:
            sys.stderr.write(f"--- book page {bp} (pdf {pi})\n")
        blocks, stats, printed = ex.run()
        if printed is not None and printed != bp:
            mismatches.append((bp, printed))
        md.append(f"<!-- book page {bp} -->")
        md.append("")
        for b in blocks:
            md.append(b)
            md.append("")
        text = "\n".join(blocks)
        rec = {
            "book_page": bp,
            "pdf_index": pi,
            "printed_page_number": printed,
            "chars": len(text),
            "lines": len(blocks),
            "equations_omitted": stats["equations_omitted"],
            "inline_math_omitted": stats["inline_math_omitted"],
            "math_runs_kept": max(0, stats["math_runs_kept"]),
            "figures_omitted": stats["figures_omitted"],
            "shifted_spans_decoded": stats["shifted_spans_decoded"],
            "undecodable_glyphs": stats["undecodable_glyphs"],
        }
        per_page.append(rec)
        for k, v in rec.items():
            if k not in ("book_page", "pdf_index", "printed_page_number"):
                totals[k] += v

    out_path = args.out
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md).rstrip() + "\n")
    side = {
        "unit": args.unit,
        "title": args.title,
        "source_pdf": os.path.abspath(args.pdf),
        "book_pages": [args.start, end],
        "page_offset": offset,
        "printed_number_mismatches": mismatches,
        "totals": dict(totals),
        "pages": per_page,
    }
    side_path = os.path.splitext(out_path)[0] + ".json"
    with open(side_path, "w", encoding="utf-8") as f:
        json.dump(side, f, indent=2, ensure_ascii=False)

    print(f"Unit {args.unit}: {args.title}")
    print(f"  book pages {args.start}-{end}  (pdf index = book page + {offset})")
    print(f"  pages: {len(per_page)}  chars: {totals['chars']}  blocks: {totals['lines']}")
    print(f"  equations omitted (display): {totals['equations_omitted']}   "
          f"inline [math] markers: {totals['inline_math_omitted']}   "
          f"flat math runs kept verbatim: {totals['math_runs_kept']}   "
          f"figures omitted: {totals['figures_omitted']}")
    print(f"  shifted-font spans decoded: {totals['shifted_spans_decoded']}   "
          f"undecodable glyphs: {totals['undecodable_glyphs']}")
    if mismatches:
        print(f"  WARNING printed page number mismatches: {mismatches[:10]}")
    print(f"  markdown: {out_path}\n  sidecar : {side_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
