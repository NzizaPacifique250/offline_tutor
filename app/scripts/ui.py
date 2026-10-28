#!/usr/bin/env python3
"""Drive and photograph the app on the tablet over adb, for reproducible checks.

Every hand-driven tablet check in the P2/P3 records was done with these
commands typed one at a time; this puts them in the repository.

    scripts/ui.py dump                 print the visible texts (uiautomator)
    scripts/ui.py find "text"          print the centre of the first node whose text contains it
    scripts/ui.py tap "text"           tap that node
    scripts/ui.py type "text"          type into the focused field
    scripts/ui.py clear [n]            delete up to n characters from the focused field
    scripts/ui.py hidekb               close the soft keyboard if it is shown
    scripts/ui.py scrollto "text" [n]  swipe up until the text is on screen
    scripts/ui.py top [n]              swipe down n times to the top
    scripts/ui.py tapxy x y            tap coordinates (for screens that never go idle)
    scripts/ui.py shot name            save a PNG under $OUT (default: /tmp)
    scripts/ui.py wait "text" [secs]   poll until the text is on screen
    scripts/ui.py airplane on|off      toggle airplane mode and print the state
    scripts/ui.py relaunch             force-stop and start the app

Only text is matched, because React Native does not expose testID as an
Android resource-id; button labels are unique enough on these screens.
"""

from __future__ import annotations

import os
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

APP_ID = os.environ.get("APP_ID", "rw.offlinetutor")
OUT = os.environ.get("OUT", "/tmp")


def adb(*args: str, capture: bool = True) -> str:
    r = subprocess.run(["adb", *args], capture_output=capture, text=True, check=False)
    return (r.stdout or "") if capture else ""


def dump() -> ET.Element:
    """The screen's view hierarchy. uiautomator refuses to dump while the app
    keeps redrawing ("could not get idle state") and leaves the previous
    file in place, so the old file is removed first and a failed dump is
    retried; after three failures the screen reads as empty, never stale."""
    for _ in range(3):
        out = adb("shell", "rm -f /sdcard/ui.xml; uiautomator dump /sdcard/ui.xml")
        if "dumped" in out:
            xml = adb("exec-out", "cat", "/sdcard/ui.xml")
            try:
                return ET.fromstring(xml)
            except ET.ParseError:
                pass
        time.sleep(1)
    return ET.Element("hierarchy")


def nodes(root: ET.Element):
    for n in root.iter("node"):
        yield n


def bounds(n: ET.Element) -> tuple[int, int]:
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds", ""))
    if not m:
        raise SystemExit("node has no bounds")
    x1, y1, x2, y2 = map(int, m.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def hide_keyboard() -> bool:
    """Close the soft keyboard if it is up; it hides the lower half of the screen."""
    if "mInputShown=true" in adb("shell", "dumpsys", "input_method"):
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(0.8)
        return True
    return False


def find(text: str, root: ET.Element | None = None) -> ET.Element | None:
    root = root or dump()
    for n in nodes(root):
        if text in (n.get("text") or "") or text in (n.get("content-desc") or ""):
            return n
    return None


def texts(root: ET.Element) -> list[str]:
    return [n.get("text") for n in nodes(root) if n.get("text")]


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd, args = argv[0], argv[1:]
    if cmd == "dump":
        for t in texts(dump()):
            print(t)
    elif cmd == "find":
        n = find(args[0])
        if n is None:
            print("not found")
            return 1
        print(*bounds(n))
    elif cmd == "tap":
        hide_keyboard()
        n = find(args[0])
        if n is None:
            print(f"not found: {args[0]!r}")
            return 1
        x, y = bounds(n)
        # The bottom 60 px are the navigation bar; a control sitting there is
        # scrolled up first, or the tap lands on Home.
        if y > 720:
            adb("shell", "input", "swipe", "640", "600", "640", "350", "300")
            time.sleep(1)
            n = find(args[0])
            if n is None:
                print(f"lost after scrolling: {args[0]!r}")
                return 1
            x, y = bounds(n)
        adb("shell", "input", "tap", str(x), str(y))
        print(f"tapped {args[0]!r} at {x},{y}")
    elif cmd == "type":
        # `input text` treats %s as a space and reads a leading "-" as an
        # option, and the device shell sees the text, so it is quoted for it.
        text = args[0]
        if text.startswith("-"):
            adb("shell", "input", "keyevent", "KEYCODE_MINUS")
            text = text[1:]
        if text:
            adb("shell", "input", "text", shlex.quote(text.replace(" ", "%s")))
        print(f"typed {args[0]!r}")
    elif cmd == "clear":
        # Select-all is not reliable on every keyboard; delete a bounded run.
        n = int(args[0]) if args else 20
        adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
        for _ in range(n):
            adb("shell", "input", "keyevent", "KEYCODE_DEL")
        print(f"cleared {n}")
    elif cmd == "shot":
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, f"{args[0]}.png")
        with open(path, "wb") as f:
            subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, check=True)
        print(path)
    elif cmd == "wait":
        deadline = time.time() + (float(args[1]) if len(args) > 1 else 15)
        while time.time() < deadline:
            if find(args[0]) is not None:
                print(f"seen {args[0]!r}")
                return 0
            time.sleep(0.7)
        print(f"timed out waiting for {args[0]!r}")
        return 1
    elif cmd == "airplane":
        adb("shell", "cmd", "connectivity", "airplane-mode", "enable" if args[0] == "on" else "disable")
        time.sleep(1.5)
        mode = adb("shell", "settings", "get", "global", "airplane_mode_on").strip()
        wifi = adb("shell", "settings", "get", "global", "wifi_on").strip()
        print(f"airplane_mode_on={mode} wifi_on={wifi}")
    elif cmd == "scrollto":
        # Swipe up (scroll down) until the text is on screen. A screen whose
        # content keeps changing (the guidance ticker) never reports idle to
        # uiautomator, so tap such controls by coordinates instead.
        limit = int(args[1]) if len(args) > 1 else 12
        hide_keyboard()
        for _ in range(limit):
            if find(args[0]) is not None:
                print(f"seen {args[0]!r}")
                return 0
            adb("shell", "input", "swipe", "640", "650", "640", "250", "250")
            time.sleep(0.7)
        print(f"not reached: {args[0]!r}")
        return 1
    elif cmd == "top":
        for _ in range(int(args[0]) if args else 6):
            adb("shell", "input", "swipe", "640", "250", "640", "700", "200")
            time.sleep(0.4)
        print("scrolled to top")
    elif cmd == "tapxy":
        adb("shell", "input", "tap", args[0], args[1])
        print(f"tapped {args[0]},{args[1]}")
    elif cmd == "hidekb":
        # BACK closes the soft keyboard when it is up; otherwise it would pop
        # the screen, so it is only sent when the IME reports itself shown.
        print(f"keyboard {'hidden' if hide_keyboard() else 'was not shown'}")
    elif cmd == "relaunch":
        adb("shell", "am", "force-stop", APP_ID)
        time.sleep(1)
        # The activity class keeps its name in every build; only the pilot
        # build changes the application ID (APP_ID=rw.offlinetutor.pilot).
        adb("shell", "am", "start", "-n", f"{APP_ID}/rw.offlinetutor.MainActivity")
        print("relaunched")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
