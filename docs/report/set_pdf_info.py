#!/usr/bin/env python3
"""Sets the report PDF's author and subject.

Chrome's print-to-PDF leaves the Author property empty. This appends a
standard incremental update (a new document-information object, an xref
section and a trailer pointing back to the previous one), keeping the
title and dates Chrome wrote.

    python3 set_pdf_info.py Technical_Report.pdf
"""
import re
import sys

AUTHOR = "Nziza Aime Pacifique"
SUBJECT = "Capstone technical report, BSc Software Engineering, African Leadership University"


def literal(text: str) -> bytes:
    """A PDF text string: UTF-16 with a byte-order mark, as hex."""
    return b"<FEFF" + text.encode("utf-16-be").hex().upper().encode() + b">"


def main(path: str) -> None:
    data = open(path, "rb").read()
    prev = int(re.findall(rb"startxref\s+(\d+)\s+%%EOF\s*$", data)[-1])
    trailer = re.findall(rb"trailer\s*<<(.*?)>>\s*startxref", data, re.S)[-1]
    size = int(re.search(rb"/Size (\d+)", trailer).group(1))
    root = re.search(rb"/Root (\d+ \d+ R)", trailer).group(1)
    info = int(re.search(rb"/Info (\d+) 0 R", trailer).group(1))
    old = re.findall(rb"(?:^|\n)%d 0 obj\s*<<(.*?)>>\s*endobj" % info, data, re.S)[-1]

    entries = [b"/Author " + literal(AUTHOR), b"/Subject " + literal(SUBJECT)]
    for name in (b"Title", b"Creator", b"Producer", b"CreationDate", b"ModDate"):
        value = re.search(rb"/" + name + rb"\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]*>)", old)
        if value:
            entries.append(b"/" + name + b" " + value.group(1))

    if not data.endswith(b"\n"):
        data += b"\n"
    obj_at = len(data)
    data += b"%d 0 obj\n<<" % info + b" ".join(entries) + b">>\nendobj\n"
    xref_at = len(data)
    data += b"xref\n%d 1\n%010d 00000 n\r\n" % (info, obj_at)
    data += b"trailer\n<</Size %d /Root %s /Info %d 0 R /Prev %d>>\nstartxref\n%d\n%%%%EOF\n" % (size, root, info, prev, xref_at)
    open(path, "wb").write(data)


if __name__ == "__main__":
    main(sys.argv[1])
