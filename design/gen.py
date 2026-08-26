#!/usr/bin/env python3
"""Generates the Pandai artboards.

Artboards share nothing at runtime, so every screen needs its own copy of the
sidebar, the panda and the keyframes. Rather than hand-maintain six divergent
copies, the shared pieces live here once and get inlined into each file.

Edit this, run it, then re-seed the canvas.
"""

import pathlib

OUT = pathlib.Path(__file__).parent

# Lifted from src/app/globals.css.
BG, S0, S1, S2, S3 = "#0d0d0d", "#171717", "#1e1e1e", "#262626", "#333333"
LINE, LINE_STRONG = "#2a2a2a", "#3d3d3d"
TEXT, DIM, FAINT = "#ececec", "#b4b4b4", "#8a8a8a"
BUBBLE = "#2f2f2f"
GREEN, AMBER = "#4ade80", "#fbbf24"

# Panda palette.
FUR, INK, EAR_IN = "#fafafa", "#1a1a1a", "#4a4a4a"
PATCH = "#1c1c1c"      # eye patch, a touch off the ink so the orb reads
ORB = "#000000"        # boba eye
ORB_RIM = "#3d3d3d"
BAMBOO, BAMBOO_LEAF = "#6aa84f", "#8fbc6b"

FONT = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Geist:wght@400;500;600;700&display=swap">')
FAMILY = '"Geist", ui-sans-serif, system-ui, -apple-system, sans-serif'


# --------------------------------------------------------------------------
# The panda.
#
# Proportions reworked: the head was too big and floated free of the body.
# Head is now rx 47 against a body of rx 58, and the two overlap by ~16 units
# so they read as one animal instead of a snowman.
# --------------------------------------------------------------------------

def eye(cx, cy, r=8.4):
    """A glossy black boba eye. The shine is what makes it read as an eye,
    since the orb sits on an almost-black patch."""
    return f'''
      <circle cx="{cx}" cy="{cy}" r="{r}" fill="{ORB}" stroke="{ORB_RIM}" stroke-width="1"/>
      <circle cx="{cx - r*0.34:.1f}" cy="{cy - r*0.36:.1f}" r="{r*0.32:.1f}" fill="#ffffff" opacity=".92"/>
      <circle cx="{cx + r*0.3:.1f}" cy="{cy + r*0.34:.1f}" r="{r*0.14:.1f}" fill="#ffffff" opacity=".45"/>'''


def closed_eye(cx, cy, w=9):
    """Lashes-down arc, for the rolling/logo panda."""
    return (f'<path d="M{cx-w} {cy} Q{cx} {cy+6} {cx+w} {cy}" stroke="{INK}" '
            f'stroke-width="3" fill="none" stroke-linecap="round"/>')


def panda_facing(eye_cls="eye", extra_head="", arms="idle"):
    """Front-facing panda, seated, holding bamboo. viewBox 0 0 200 250."""
    if arms == "idle":
        arm_markup = f'''
      <ellipse cx="52" cy="176" rx="14" ry="23" fill="{INK}" transform="rotate(20 52 176)"/>
      <ellipse cx="148" cy="176" rx="14" ry="23" fill="{INK}" transform="rotate(-20 148 176)"/>'''
    elif arms == "wave":
        arm_markup = f'''
      <ellipse cx="52" cy="176" rx="14" ry="23" fill="{INK}" transform="rotate(20 52 176)"/>
      <ellipse class="wave-arm" cx="150" cy="168" rx="13" ry="23" fill="{INK}" transform="rotate(-30 150 168)"/>'''
    else:
        arm_markup = ""

    return f'''
      <g class="bamboo">
        <rect x="150" y="112" width="11" height="80" rx="5" fill="{BAMBOO}"/>
        <rect x="150" y="136" width="11" height="4" fill="#4e7d3a"/>
        <rect x="150" y="164" width="11" height="4" fill="#4e7d3a"/>
        <ellipse cx="176" cy="116" rx="18" ry="7" fill="{BAMBOO_LEAF}" transform="rotate(-24 176 116)"/>
        <ellipse cx="137" cy="104" rx="16" ry="6" fill="{BAMBOO_LEAF}" transform="rotate(20 137 104)"/>
      </g>

      <!-- body, large; head overlaps it so there is no floating-head gap -->
      <ellipse cx="100" cy="180" rx="58" ry="60" fill="{FUR}"/>
      {arm_markup}
      <ellipse cx="76" cy="235" rx="17" ry="11" fill="{INK}"/>
      <ellipse cx="124" cy="235" rx="17" ry="11" fill="{INK}"/>

      <g class="ear-l"><circle cx="64" cy="54" r="17" fill="{INK}"/><circle cx="64" cy="54" r="8" fill="{EAR_IN}"/></g>
      <g class="ear-r"><circle cx="136" cy="54" r="17" fill="{INK}"/><circle cx="136" cy="54" r="8" fill="{EAR_IN}"/></g>

      <ellipse cx="100" cy="88" rx="47" ry="44" fill="{FUR}"/>
      {extra_head}
      <ellipse cx="82" cy="86" rx="14" ry="17" fill="{PATCH}" transform="rotate(-14 82 86)"/>
      <ellipse cx="118" cy="86" rx="14" ry="17" fill="{PATCH}" transform="rotate(14 118 86)"/>
      <g class="{eye_cls}">{eye(82, 86)}</g>
      <g class="{eye_cls}">{eye(118, 86)}</g>
      <ellipse cx="100" cy="106" rx="7.5" ry="5.5" fill="{INK}"/>
      <path d="M100 111 L100 115" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M89 117 Q100 126 111 117" stroke="{INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>'''


def panda_ball(r=46, closed=True):
    """Tucked into a ball for rolling. viewBox 0 0 100 100.

    Eyes closed, because a rolling panda squeezes them shut."""
    eyes = (closed_eye(35, 50, 8) + closed_eye(65, 50, 8)) if closed else (eye(35, 50, 7) + eye(65, 50, 7))
    return f'''
      <circle cx="50" cy="50" r="{r}" fill="{FUR}"/>
      <circle cx="26" cy="24" r="13" fill="{INK}"/><circle cx="26" cy="24" r="6" fill="{EAR_IN}"/>
      <circle cx="74" cy="24" r="13" fill="{INK}"/><circle cx="74" cy="24" r="6" fill="{EAR_IN}"/>
      <ellipse cx="35" cy="50" rx="12" ry="14" fill="{PATCH}"/>
      <ellipse cx="65" cy="50" rx="12" ry="14" fill="{PATCH}"/>
      {eyes}
      <ellipse cx="50" cy="68" rx="6" ry="4.5" fill="{INK}"/>
      <path d="M43 76 Q50 82 57 76" stroke="{INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="22" cy="72" rx="11" ry="9" fill="{INK}" transform="rotate(-24 22 72)"/>
      <ellipse cx="78" cy="72" rx="11" ry="9" fill="{INK}" transform="rotate(24 78 72)"/>'''


def logo_mark(px=20):
    """Sidebar mark: the rolling, eyes-closed panda, turning slowly."""
    return f'''<svg class="logo-roll" viewBox="0 0 100 100" style="width: {px}px; height: {px}px;">{panda_ball()}</svg>'''


# --------------------------------------------------------------------------
# Chrome
# --------------------------------------------------------------------------

NAV = [
    ("chat", "Chat", '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-2.8-.4L3 21l1.9-5.1A8.3 8.3 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>'),
    ("search", "Search", '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.9-3.9"/>'),
    ("watch", "Watch", '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9.2l5.5 2.8L10 14.8z"/>'),
    ("build", "Build", '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    ("settings", "Settings", '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
]

CHATS = ["Photosynthesis notes", "Algebra 2 — quadratics", "Essay hook ideas", "Bio flashcards"]


def sidebar(active="chat", chats=None, active_chat=0):
    chats = CHATS if chats is None else chats
    rows = []
    for i, t in enumerate(chats):
        on = (i == active_chat and active == "chat")
        bg = f"background: {S2}; " if on else ""
        col = TEXT if on else DIM
        rows.append(f'<div style="{bg}border-radius: 8px; padding: 8px; font-size: 14px; color: {col};">{t}</div>')

    navs = []
    for key, label, path in NAV:
        on = key == active
        bg = f"background: {S2}; " if on else ""
        col = TEXT if on else DIM
        navs.append(f'''
      <div style="display: flex; align-items: center; gap: 10px; {bg}border-radius: 8px; padding: 9px 8px; font-size: 14px; color: {col};">
        <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;" fill="none" stroke="{col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{path}</svg>
        {label}
      </div>''')

    return f'''
  <div style="display: flex; flex-direction: column; width: 260px; flex-shrink: 0; background: {S0}; border-right: 1px solid {LINE};">
    <div style="display: flex; align-items: center; gap: 9px; padding: 12px;">
      <span style="display: flex; height: 28px; width: 28px; align-items: center; justify-content: center; border-radius: 9px; background: {S2}; flex-shrink: 0;">
        {logo_mark(21)}
      </span>
      <span style="font-size: 14px; font-weight: 600; letter-spacing: -0.01em;">Pandai</span>
    </div>

    <div style="padding: 0 12px 10px;">
      <div style="display: flex; align-items: center; gap: 8px; border: 1px solid {LINE_STRONG}; border-radius: 12px; padding: 10px 12px; font-size: 14px; font-weight: 500;">
        <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;" fill="none" stroke="{TEXT}" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        New chat
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 2px; padding: 0 8px 10px;">{''.join(navs)}</div>

    <div style="flex: 1; min-height: 0; overflow: hidden; border-top: 1px solid {LINE}; padding: 10px 8px;">
      <p style="margin: 0 0 6px; padding: 0 8px; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: {FAINT};">Chats</p>
      <div style="display: flex; flex-direction: column; gap: 2px;">{''.join(rows)}</div>
    </div>

    <div style="display: flex; align-items: center; gap: 10px; border-top: 1px solid {LINE}; padding: 13px 12px;">
      <span style="display: flex; height: 26px; width: 26px; align-items: center; justify-content: center; border-radius: 999px; background: {BUBBLE}; font-size: 12px; font-weight: 600;">J</span>
      <span style="font-size: 13px; color: {DIM};">Jaden</span>
    </div>
  </div>'''


def composer(placeholder="Ask Pandai anything…", busy=False):
    if busy:
        return f'''
      <div style="display: flex; align-items: center; gap: 10px; background: {S1}; border: 1px solid {LINE}; border-radius: 26px; padding: 12px 12px 12px 18px;">
        <span style="flex: 1; font-size: 15px; color: {FAINT};">Pandai is answering…</span>
        <span style="display: flex; height: 34px; width: 34px; align-items: center; justify-content: center; border-radius: 999px; background: {S3}; flex-shrink: 0;">
          <span style="height: 11px; width: 11px; border-radius: 2px; background: {TEXT}; display: block;"></span>
        </span>
      </div>'''
    return f'''
      <div style="display: flex; align-items: center; gap: 10px; background: {S1}; border: 1px solid {LINE_STRONG}; border-radius: 26px; padding: 12px 12px 12px 18px;">
        <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; flex-shrink: 0;" fill="none" stroke="{FAINT}" stroke-width="2" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        <span style="flex: 1; font-size: 15px; color: {FAINT};">{placeholder}</span>
        <span style="display: flex; height: 34px; width: 34px; align-items: center; justify-content: center; border-radius: 999px; background: #ffffff; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" style="width: 17px; height: 17px;" fill="none" stroke="{BG}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </span>
      </div>'''


# --------------------------------------------------------------------------
# The right rail: Explain, its depth slider, and Humanize.
# --------------------------------------------------------------------------

DEPTHS = ["Minimal", "Fair", "Normal", "Extra", "Overload"]


def pill(label, on, color=GREEN):
    """Outline-only box. Green outline and text when on, grey when off."""
    c = color if on else FAINT
    border = color if on else LINE_STRONG
    return f'''<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid {border}; border-radius: 12px; padding: 11px 14px;">
          <span style="font-size: 14px; font-weight: 500; color: {c};">{label}</span>
          <span style="font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: {c};">{'On' if on else 'Off'}</span>
        </div>'''


def depth_slider(idx):
    stops = []
    for i, d in enumerate(DEPTHS):
        on = i == idx
        stops.append(f'''<div style="display: flex; flex-direction: column; align-items: center; gap: 7px; flex: 1;">
            <span style="height: {9 if on else 7}px; width: {9 if on else 7}px; border-radius: 999px; background: {GREEN if on else S3}; display: block;"></span>
            <span style="font-size: 10px; color: {GREEN if on else FAINT}; white-space: nowrap;">{d}</span>
          </div>''')
    pct = (idx / (len(DEPTHS) - 1)) * 100
    return f'''
        <div style="padding: 2px 2px 0;">
          <p style="margin: 0 0 11px; font-size: 12px; color: {DIM};">How much explaining</p>
          <div style="position: relative; height: 4px; border-radius: 999px; background: {S3}; margin: 0 4px 9px;">
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: {pct}%; border-radius: 999px; background: {GREEN};"></div>
            <div style="position: absolute; left: {pct}%; top: 50%; height: 15px; width: 15px; margin: -7.5px 0 0 -7.5px; border-radius: 999px; background: {GREEN}; box-shadow: 0 0 0 4px rgba(74,222,128,.16);"></div>
          </div>
          <div style="display: flex; gap: 2px;">{''.join(stops)}</div>
        </div>'''


def right_rail(explain_on=True, depth=2, humanize_on=False, note=None):
    inner = pill("Explain", explain_on)
    if explain_on:
        inner += depth_slider(depth)
    else:
        inner += f'<p style="margin: 0; padding: 2px; font-size: 12px; line-height: 1.55; color: {FAINT};">Off means the answer only. No workings, no build-up.</p>'

    note_html = ""
    if note:
        note_html = f'''
      <div style="border-top: 1px solid {LINE}; padding-top: 16px;">
        <p style="margin: 0; font-size: 12px; line-height: 1.6; color: {FAINT};">{note}</p>
      </div>'''

    return f'''
  <div style="display: flex; flex-direction: column; gap: 16px; width: 250px; flex-shrink: 0; background: {S0}; border-left: 1px solid {LINE}; padding: 18px 16px;">
    <p style="margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: {FAINT};">Modes</p>
    <div style="display: flex; flex-direction: column; gap: 13px;">{inner}</div>
    <div style="display: flex; flex-direction: column; gap: 9px;">
      {pill("Humanize", humanize_on)}
      <p style="margin: 0; padding: 0 2px; font-size: 12px; line-height: 1.55; color: {FAINT};">Plain, everyday writing for essays and emails.</p>
    </div>
    {note_html}
  </div>'''


# --------------------------------------------------------------------------
# Page assembly
# --------------------------------------------------------------------------

def page(title_comment, styles, body):
    return f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONT}
  <style>
    body {{ margin: 0; font-family: {FAMILY}; }}
    a {{ color: {TEXT}; }} a:hover {{ color: #ffffff; }}

    /* {title_comment} */
    @keyframes logoRoll {{ to {{ transform: rotate(360deg) }} }}
    .logo-roll {{ animation: logoRoll 9s linear infinite; }}
{styles}
  </style>
</helmet>

{body}
</x-dc>
</body>
</html>
'''


IDLE_STYLES = f'''
    @keyframes bob {{ 0%,100% {{ transform: translateY(0) }} 50% {{ transform: translateY(-8px) }} }}
    @keyframes earTwitch {{ 0%,86%,100% {{ transform: rotate(0deg) }} 90% {{ transform: rotate(-9deg) }} 95% {{ transform: rotate(6deg) }} }}
    @keyframes blink {{ 0%,93%,100% {{ transform: scaleY(1) }} 96% {{ transform: scaleY(.06) }} }}
    @keyframes sway {{ 0%,100% {{ transform: rotate(-4deg) }} 50% {{ transform: rotate(5deg) }} }}
    @keyframes rise {{ from {{ opacity: 0; transform: translateY(9px) }} to {{ opacity: 1; transform: none }} }}
    .panda {{ animation: bob 3.2s ease-in-out infinite; }}
    .ear-l {{ animation: earTwitch 5s ease-in-out infinite; transform-origin: 64px 54px; }}
    .ear-r {{ animation: earTwitch 5s ease-in-out infinite .1s; transform-origin: 136px 54px; }}
    .eye {{ animation: blink 4.2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }}
    .bamboo {{ animation: sway 3.8s ease-in-out infinite; transform-origin: 155px 192px; }}
    .rise {{ animation: rise .42s ease-out both; }}
    .r1 {{ animation-delay: .06s }} .r2 {{ animation-delay: .14s }} .r3 {{ animation-delay: .22s }} .r4 {{ animation-delay: .3s }}
'''


def shell(inner, rail=None):
    return f'''<div style="display: flex; height: 900px; width: 1440px; background: {BG}; color: {TEXT}; overflow: hidden;">
{inner}
{rail or ''}
</div>'''


def topbar(label, right=None):
    r = right or ""
    return f'''
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid {LINE};">
      <span style="font-size: 13px; color: {FAINT};">{label}</span>
      {r}
    </div>'''


# ---------------------------------------------------------------- 1. Home
def build_main():
    body = shell(
        sidebar("chat", chats=CHATS) + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("New chat")}
    <div style="display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 28px; padding: 0 24px;">
      <div class="rise">
        <svg class="panda" viewBox="0 0 200 250" style="width: 210px; height: 262px;">{panda_facing()}</svg>
      </div>
      <h1 class="rise r1" style="margin: 0; font-size: 34px; font-weight: 600; letter-spacing: -0.02em;">What&#39;s up, Jaden</h1>
      <div class="rise r2" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 620px;">
        <div style="border: 1px solid {LINE}; border-radius: 999px; padding: 9px 15px; font-size: 13px; color: {DIM};">Help with my homework</div>
        <div style="border: 1px solid {LINE}; border-radius: 999px; padding: 9px 15px; font-size: 13px; color: {DIM};">Write me an email</div>
        <div style="border: 1px solid {LINE}; border-radius: 999px; padding: 9px 15px; font-size: 13px; color: {DIM};">Quiz me before my test</div>
      </div>
      <div class="rise r3" style="width: 100%; max-width: 720px;">
        {composer()}
        <p style="margin: 10px 0 0; text-align: center; font-size: 11px; color: {FAINT};">Pandai remembers what you tell it across every chat.</p>
      </div>
    </div>
  </div>''',
        rail=right_rail(explain_on=True, depth=2, humanize_on=False))
    return page("Idle panda: breathing bob, ear twitch, blink, swaying bamboo.", IDLE_STYLES, body)


# ------------------------------------------------- 2. Streaming / rolling
STREAM_TEXT = [
    "Okay", "so", "light", "isn&#39;t", "the", "ingredient,", "it&#39;s", "the", "<strong>energy</strong>.",
    "The", "plant", "already", "has", "what", "it", "needs", "sitting", "there:", "water", "from",
    "the", "roots,", "CO&#8322;", "from", "the", "air.", "What", "it", "doesn&#39;t", "have", "is",
    "a", "way", "to", "force", "those", "two", "to", "react.",
]

CYCLE = 9.0          # whole loop
WRITE_END = 0.72     # fraction of the loop spent writing


def build_streaming():
    n = len(STREAM_TEXT)
    words = []
    for i, w in enumerate(STREAM_TEXT):
        delay = (i / n) * CYCLE * WRITE_END
        words.append(f'<span class="w" style="animation-delay: {delay:.2f}s">{w} </span>')

    roll_pct = WRITE_END * 100
    styles = f'''
    @keyframes wordIn {{ 0% {{ opacity: 0; filter: blur(3px) }} 6%,{roll_pct:.0f}% {{ opacity: 1; filter: blur(0) }} 100% {{ opacity: 1; filter: blur(0) }} }}
    @keyframes rollAcross {{
      0%   {{ transform: translateX(0) rotate(0deg); opacity: 1 }}
      {roll_pct - 4:.0f}%  {{ transform: translateX(224px) rotate(1160deg); opacity: 1 }}
      {roll_pct:.0f}%  {{ transform: translateX(236px) rotate(1200deg); opacity: 0 }}
      100% {{ transform: translateX(236px) rotate(1200deg); opacity: 0 }}
    }}
    @keyframes settleIn {{
      0%,{roll_pct - 1:.0f}% {{ opacity: 0; transform: translateY(6px) scale(.9) }}
      {roll_pct + 3:.0f}% {{ opacity: 1; transform: translateY(0) scale(1) }}
      100% {{ opacity: 1; transform: none }}
    }}
    @keyframes trackHide {{ 0%,{roll_pct - 1:.0f}% {{ opacity: 1 }} {roll_pct:.0f}%,100% {{ opacity: 0 }} }}
    @keyframes bob {{ 0%,100% {{ transform: translateY(0) }} 50% {{ transform: translateY(-5px) }} }}
    @keyframes blink {{ 0%,93%,100% {{ transform: scaleY(1) }} 96% {{ transform: scaleY(.06) }} }}
    @keyframes dot {{ 0%,80%,100% {{ opacity: .25; transform: translateY(0) }} 40% {{ opacity: 1; transform: translateY(-3px) }} }}
    @keyframes stepIn {{ from {{ opacity: 0; transform: translateX(-6px) }} to {{ opacity: 1; transform: none }} }}
    @keyframes sweep {{ 0% {{ background-position: -200px 0 }} 100% {{ background-position: 320px 0 }} }}

    /* Each word fades up out of a blur as it arrives, the way a real stream
       lands a token at a time. The panda rolls the length of the line while
       that happens, then stops and turns to face you when the text is done. */
    .w {{ animation: wordIn {CYCLE}s ease-out infinite both; }}
    .roller {{ animation: rollAcross {CYCLE}s cubic-bezier(.42,0,.58,1) infinite both; }}
    .track {{ animation: trackHide {CYCLE}s linear infinite both; }}
    .settled {{ animation: settleIn {CYCLE}s ease-out infinite both; }}
    .settled-bob {{ animation: bob 3s ease-in-out infinite; }}
    .eye {{ animation: blink 4.2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }}
    .d1 {{ animation: dot 1.3s ease-in-out infinite }}
    .d2 {{ animation: dot 1.3s ease-in-out infinite .16s }}
    .d3 {{ animation: dot 1.3s ease-in-out infinite .32s }}
    .s1 {{ animation: stepIn .35s ease-out both .05s }}
    .s2 {{ animation: stepIn .35s ease-out both .3s }}
    .s3 {{ animation: stepIn .35s ease-out both .55s }}
    .shimmer {{
      background: linear-gradient(90deg, {FAINT} 0%, {TEXT} 45%, {FAINT} 70%);
      background-size: 320px 100%;
      -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: sweep 2.1s linear infinite;
    }}
'''

    body = shell(
        sidebar("chat") + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("Photosynthesis notes")}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; padding: 32px 24px;">
      <div style="display: flex; flex-direction: column; gap: 26px; width: 100%; max-width: 700px;">

        <div style="display: flex; justify-content: flex-end;">
          <div style="max-width: 78%; background: {BUBBLE}; border-radius: 20px 20px 6px 20px; padding: 12px 16px; font-size: 15px; line-height: 1.55;">
            wait so why do plants even need light for this
          </div>
        </div>

        <div style="display: flex; gap: 14px; align-items: flex-start;">
          <!-- avatar slot: rolls away while writing, settles back facing you -->
          <div style="position: relative; width: 56px; height: 56px; flex-shrink: 0;">
            <div class="settled settled-bob" style="position: absolute; inset: 0;">
              <svg viewBox="0 0 200 250" style="width: 56px; height: 70px; margin-top: -8px;">{panda_facing(arms="none")}</svg>
            </div>
          </div>

          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px;">

            <div style="border: 1px solid {LINE}; border-radius: 14px; background: {S0}; padding: 14px 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span class="shimmer" style="font-size: 13px; font-weight: 500;">Thinking</span>
                <span style="display: flex; gap: 3px; align-items: center;">
                  <span class="d1" style="height: 4px; width: 4px; border-radius: 999px; background: {TEXT}; display: block;"></span>
                  <span class="d2" style="height: 4px; width: 4px; border-radius: 999px; background: {TEXT}; display: block;"></span>
                  <span class="d3" style="height: 4px; width: 4px; border-radius: 999px; background: {TEXT}; display: block;"></span>
                </span>
                <span style="margin-left: auto; font-size: 11px; color: {FAINT};">4.2s</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 9px;">
                <div class="s1" style="display: flex; gap: 10px; align-items: flex-start;">
                  <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px;" fill="none" stroke="{GREEN}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  <span style="font-size: 13px; color: {DIM}; line-height: 1.5;">Checked what you already know, you covered chloroplasts last week</span>
                </div>
                <div class="s2" style="display: flex; gap: 10px; align-items: flex-start;">
                  <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px;" fill="none" stroke="{GREEN}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  <span style="font-size: 13px; color: {DIM}; line-height: 1.5;">Explain is set to Normal, so a middle amount of build-up</span>
                </div>
                <div class="s3" style="display: flex; gap: 10px; align-items: flex-start;">
                  <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px;" fill="none" stroke="{FAINT}" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                  <span style="font-size: 13px; color: {FAINT}; line-height: 1.5;">Writing the answer…</span>
                </div>
              </div>
            </div>

            <div style="font-size: 15px; line-height: 1.75; color: {TEXT};">{''.join(words)}</div>

            <!-- the panda literally rolls the width of the text as it lands -->
            <div class="track" style="position: relative; height: 30px;">
              <svg class="roller" viewBox="0 0 100 100" style="width: 28px; height: 28px; position: absolute; left: 0; top: 0;">{panda_ball()}</svg>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div style="display: flex; justify-content: center; padding: 0 24px 26px;">
      <div style="width: 100%; max-width: 700px;">{composer(busy=True)}</div>
    </div>
  </div>''',
        rail=right_rail(explain_on=True, depth=2, humanize_on=False))
    return page("Streaming: words fade up out of blur while the panda rolls along.", styles, body)


# ------------------------------------------------------- 3. Explain is off
def build_explainoff():
    styles = IDLE_STYLES + f'''
    @keyframes wordIn {{ from {{ opacity: 0; filter: blur(3px) }} to {{ opacity: 1; filter: blur(0) }} }}
    .w {{ animation: wordIn .5s ease-out both; }}
'''
    ans = ["6CO&#8322;", "+", "6H&#8322;O", "&#8594;", "C&#8326;H&#8321;&#8322;O&#8326;", "+", "6O&#8322;"]
    words = "".join(
        f'<span class="w" style="animation-delay: {0.1 + i*0.07:.2f}s">{w} </span>' for i, w in enumerate(ans))

    body = shell(
        sidebar("chat", active_chat=0) + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("Photosynthesis notes")}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; padding: 32px 24px;">
      <div style="display: flex; flex-direction: column; gap: 26px; width: 100%; max-width: 700px;">
        <div style="display: flex; justify-content: flex-end;">
          <div style="max-width: 78%; background: {BUBBLE}; border-radius: 20px 20px 6px 20px; padding: 12px 16px; font-size: 15px; line-height: 1.55;">
            whats the equation for photosynthesis
          </div>
        </div>
        <div style="display: flex; gap: 14px; align-items: flex-start;">
          <div class="panda" style="flex-shrink: 0;">
            <svg viewBox="0 0 200 250" style="width: 56px; height: 70px; margin-top: -8px;">{panda_facing(arms="none")}</svg>
          </div>
          <div style="flex: 1; min-width: 0; padding-top: 4px;">
            <div style="font-size: 19px; line-height: 1.6; color: {TEXT}; font-weight: 500;">{words}</div>
            <p style="margin: 16px 0 0; font-size: 12px; color: {FAINT};">Explain is off, so that&#39;s just the answer. Flip it on for the why.</p>
          </div>
        </div>
      </div>
    </div>
    <div style="display: flex; justify-content: center; padding: 0 24px 26px;">
      <div style="width: 100%; max-width: 700px;">{composer()}</div>
    </div>
  </div>''',
        rail=right_rail(explain_on=False, humanize_on=False))
    return page("Explain off: the answer only, nothing else.", styles, body)


# ---------------------------------------------------------- 4. Humanize on
def build_humanize():
    styles = IDLE_STYLES + f'''
    @keyframes wordIn {{ from {{ opacity: 0; filter: blur(3px) }} to {{ opacity: 1; filter: blur(0) }} }}
    .w {{ animation: wordIn .5s ease-out both; }}
'''
    draft = ("Hi Mr. Alvarez, I wanted to ask about the lab report that is due on Friday and "
             "whether we are supposed to include the second trial in it, because my group ran "
             "it twice and the numbers came out pretty different so I am not sure which set you "
             "want. Let me know when you get a chance. Thanks, Jaden")
    words = "".join(
        f'<span class="w" style="animation-delay: {0.08 + i*0.028:.2f}s">{w} </span>'
        for i, w in enumerate(draft.split()))

    body = shell(
        sidebar("chat", chats=["Email to Mr. Alvarez"] + CHATS[1:], active_chat=0) + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("Email to Mr. Alvarez")}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; padding: 32px 24px;">
      <div style="display: flex; flex-direction: column; gap: 26px; width: 100%; max-width: 700px;">
        <div style="display: flex; justify-content: flex-end;">
          <div style="max-width: 78%; background: {BUBBLE}; border-radius: 20px 20px 6px 20px; padding: 12px 16px; font-size: 15px; line-height: 1.55;">
            write an email to my chem teacher asking about the lab report
          </div>
        </div>
        <div style="display: flex; gap: 14px; align-items: flex-start;">
          <div class="panda" style="flex-shrink: 0;">
            <svg viewBox="0 0 200 250" style="width: 56px; height: 70px; margin-top: -8px;">{panda_facing(arms="none")}</svg>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: inline-flex; align-items: center; gap: 7px; border: 1px solid {GREEN}; border-radius: 999px; padding: 4px 11px; margin-bottom: 13px;">
              <span style="height: 5px; width: 5px; border-radius: 999px; background: {GREEN}; display: block;"></span>
              <span style="font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: {GREEN};">Humanize</span>
            </div>
            <div style="font-size: 15px; line-height: 1.75; color: {TEXT};">{words}</div>
            <div style="display: flex; gap: 8px; margin-top: 18px;">
              <span style="border: 1px solid {LINE_STRONG}; border-radius: 10px; padding: 7px 13px; font-size: 12px; color: {DIM};">Copy</span>
              <span style="border: 1px solid {LINE_STRONG}; border-radius: 10px; padding: 7px 13px; font-size: 12px; color: {DIM};">Make it shorter</span>
              <span style="border: 1px solid {LINE_STRONG}; border-radius: 10px; padding: 7px 13px; font-size: 12px; color: {DIM};">Try again</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div style="display: flex; justify-content: center; padding: 0 24px 26px;">
      <div style="width: 100%; max-width: 700px;">{composer()}</div>
    </div>
  </div>''',
        rail=right_rail(explain_on=False, humanize_on=True,
                        note="Plain words, no dashes, a few run on sentences. Reads like you wrote it in a hurry."))
    return page("Humanize on: plain everyday writing.", styles, body)


# ------------------------------------------------------------- 5. Search
SEARCH_RESULTS = [
    ("Photosynthesis - National Geographic Education", "education.nationalgeographic.org",
     "Photosynthesis is the process by which plants use sunlight, water and carbon dioxide to create oxygen and energy in the form of sugar."),
    ("Light-dependent reactions review", "khanacademy.org",
     "In the light-dependent reactions, energy from sunlight is absorbed by chlorophyll and converted into stored chemical energy."),
    ("Why do plants need light? - BBC Bitesize", "bbc.co.uk",
     "Plants need light to photosynthesise. Without light the reaction cannot happen and the plant cannot make its own food."),
]


def build_search():
    styles = IDLE_STYLES
    results = []
    for i, (title, site, snip) in enumerate(SEARCH_RESULTS):
        results.append(f'''
          <div class="rise r{min(i+1,4)}" style="display: flex; flex-direction: column; gap: 5px; padding: 16px 0; border-bottom: 1px solid {LINE};">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="height: 16px; width: 16px; border-radius: 4px; background: {S3}; flex-shrink: 0; display: block;"></span>
              <span style="font-size: 12px; color: {FAINT};">{site}</span>
            </div>
            <p style="margin: 0; font-size: 16px; font-weight: 500; color: #a8c7fa;">{title}</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.6; color: {DIM};">{snip}</p>
            <div style="display: flex; gap: 8px; margin-top: 6px;">
              <span style="border: 1px solid {LINE_STRONG}; border-radius: 8px; padding: 5px 10px; font-size: 11px; color: {DIM};">Open here</span>
              <span style="border: 1px solid {LINE_STRONG}; border-radius: 8px; padding: 5px 10px; font-size: 11px; color: {DIM};">Ask Pandai about this</span>
            </div>
          </div>''')

    body = shell(
        sidebar("search") + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("Search", f'<span style="font-size: 11px; color: {FAINT};">Results open inside Pandai</span>')}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; padding: 30px 24px;">
      <div style="width: 100%; max-width: 720px;">

        <div class="rise" style="display: flex; align-items: center; gap: 11px; background: {S1}; border: 1px solid {LINE_STRONG}; border-radius: 26px; padding: 13px 18px; margin-bottom: 8px;">
          <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; flex-shrink: 0;" fill="none" stroke="{FAINT}" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.9-3.9"/></svg>
          <span style="flex: 1; font-size: 15px;">why do plants need light</span>
        </div>

        <div class="rise r1" style="display: flex; align-items: center; gap: 9px; padding: 10px 4px 4px;">
          <span style="border-radius: 999px; background: {S2}; padding: 6px 13px; font-size: 12px;">All</span>
          <span style="border-radius: 999px; padding: 6px 13px; font-size: 12px; color: {DIM};">Images</span>
          <span style="border-radius: 999px; padding: 6px 13px; font-size: 12px; color: {DIM};">Videos</span>
          <span style="margin-left: auto; font-size: 11px; color: {FAINT};">About 4,120,000 results</span>
        </div>

        <div style="display: flex; flex-direction: column;">{''.join(results)}</div>
      </div>
    </div>
  </div>''')
    return page("Search: results rendered natively, links open in-app.", styles, body)


# -------------------------------------------------------------- 6. Watch
VIDEOS = [
    ("Photosynthesis: Light Reactions", "Amoeba Sisters", "7:42", True),
    ("How Plants Make Food", "Crash Course Biology", "11:05", False),
    ("Chloroplast structure explained", "Bozeman Science", "6:18", False),
    ("ATP and NADPH in 5 minutes", "Study Lab", "5:02", False),
]


def build_watch():
    styles = IDLE_STYLES
    watch_badge = topbar("Watch", f'''<div style="display: flex; align-items: center; gap: 7px; border: 1px solid {LINE}; border-radius: 999px; padding: 5px 11px;">
        <svg viewBox="0 0 24 24" style="width: 12px; height: 12px;" fill="none" stroke="{GREEN}" stroke-width="2.5" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <span style="font-size: 11px; color: {GREEN};">Locked to Pandai</span>
      </div>''')
    cards = []
    for i, (title, chan, dur, big) in enumerate(VIDEOS):
        if big:
            continue
        cards.append(f'''
            <div class="rise r{min(i+1,4)}" style="display: flex; gap: 11px;">
              <div style="position: relative; width: 132px; height: 76px; border-radius: 10px; background: {S2}; flex-shrink: 0; overflow: hidden;">
                <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;">
                  <svg viewBox="0 0 24 24" style="width: 22px; height: 22px; opacity: .5;" fill="{FAINT}"><path d="M8 5.5v13l11-6.5z"/></svg>
                </div>
                <span style="position: absolute; right: 6px; bottom: 6px; background: rgba(0,0,0,.78); border-radius: 4px; padding: 1px 5px; font-size: 10px;">{dur}</span>
              </div>
              <div style="min-width: 0;">
                <p style="margin: 0 0 4px; font-size: 13px; font-weight: 500; line-height: 1.4;">{title}</p>
                <p style="margin: 0; font-size: 12px; color: {FAINT};">{chan}</p>
              </div>
            </div>''')

    body = shell(
        sidebar("watch") + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {watch_badge}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; gap: 22px; padding: 24px;">

      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 15px;">
        <div style="position: relative; width: 100%; aspect-ratio: 16/9; border-radius: 14px; background: {S1}; border: 1px solid {LINE}; overflow: hidden; display: flex; align-items: center; justify-content: center;">
          <span style="display: flex; height: 58px; width: 58px; align-items: center; justify-content: center; border-radius: 999px; background: rgba(255,255,255,.1);">
            <svg viewBox="0 0 24 24" style="width: 26px; height: 26px; margin-left: 3px;" fill="{TEXT}"><path d="M8 5.5v13l11-6.5z"/></svg>
          </span>
          <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: {S3};">
            <div style="height: 100%; width: 34%; background: {GREEN};"></div>
          </div>
        </div>
        <div>
          <h1 style="margin: 0 0 6px; font-size: 19px; font-weight: 600; letter-spacing: -0.01em;">{VIDEOS[0][0]}</h1>
          <p style="margin: 0; font-size: 13px; color: {FAINT};">{VIDEOS[0][1]} · 1.2M views</p>
        </div>
        <div style="display: flex; gap: 9px;">
          <span style="display: flex; align-items: center; gap: 7px; border: 1px solid {LINE_STRONG}; border-radius: 10px; padding: 8px 13px; font-size: 12px; color: {DIM};">Ask Pandai about this video</span>
          <span style="border: 1px solid {LINE_STRONG}; border-radius: 10px; padding: 8px 13px; font-size: 12px; color: {DIM};">Save</span>
        </div>
      </div>

      <div style="width: 292px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 10px; background: {S1}; border: 1px solid {LINE_STRONG}; border-radius: 22px; padding: 10px 15px;">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; flex-shrink: 0;" fill="none" stroke="{FAINT}" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.9-3.9"/></svg>
          <span style="flex: 1; font-size: 13px; color: {FAINT};">Search videos</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 14px;">{''.join(cards)}</div>
      </div>
    </div>
  </div>''')
    return page("Watch: search and playback in-app, no way out to the open web.", styles, body)


# ------------------------------------------------------------ 7. Settings
def toggle(on):
    return f'''<span style="display: flex; align-items: center; width: 46px; height: 27px; border-radius: 999px; background: {GREEN if on else S3}; padding: 3px; flex-shrink: 0; justify-content: {'flex-end' if on else 'flex-start'};">
                <span style="height: 21px; width: 21px; border-radius: 999px; background: {BG if on else FAINT}; display: block;"></span>
              </span>'''


def setting_row(title, desc, on, last=False):
    border = "" if last else f"border-bottom: 1px solid {LINE};"
    return f'''
            <div style="display: flex; align-items: flex-start; gap: 16px; padding: 15px 0; {border}">
              <div style="flex: 1; min-width: 0;">
                <p style="margin: 0 0 3px; font-size: 15px; font-weight: 500;">{title}</p>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: {FAINT}; text-wrap: pretty;">{desc}</p>
              </div>
              {toggle(on)}
            </div>'''


def build_settings():
    body = shell(
        sidebar("settings") + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("Settings")}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; padding: 30px 24px;">
      <div style="width: 100%; max-width: 660px; display: flex; flex-direction: column; gap: 22px;">

        <div class="rise" style="display: flex; align-items: center; gap: 14px;">
          <div class="panda" style="flex-shrink: 0;">
            <svg viewBox="0 0 200 250" style="width: 54px; height: 68px; margin-top: -6px;">{panda_facing(arms="none")}</svg>
          </div>
          <div>
            <h1 style="margin: 0 0 3px; font-size: 24px; font-weight: 600; letter-spacing: -0.02em;">Settings</h1>
            <p style="margin: 0; font-size: 13px; color: {FAINT};">Everything here applies to every chat.</p>
          </div>
        </div>

        <div class="rise r1" style="background: {S0}; border: 1px solid {LINE}; border-radius: 18px; padding: 20px;">
          <p style="margin: 0 0 14px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: {FAINT};">Appearance</p>
          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
            <div style="border: 2px solid {TEXT}; border-radius: 14px; padding: 13px; display: flex; flex-direction: column; gap: 10px;">
              <div style="height: 42px; border-radius: 9px; background: {BG}; border: 1px solid {LINE}; display: flex; gap: 5px; padding: 7px;">
                <div style="width: 15px; border-radius: 3px; background: {S2};"></div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                  <div style="height: 5px; width: 70%; border-radius: 2px; background: {S3};"></div>
                  <div style="height: 5px; width: 45%; border-radius: 2px; background: {S2};"></div>
                </div>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 14px; font-weight: 500;">Dark</span>
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px;" fill="none" stroke="{TEXT}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
            </div>
            <div style="border: 1px solid {LINE}; border-radius: 14px; padding: 13px; display: flex; flex-direction: column; gap: 10px;">
              <div style="height: 42px; border-radius: 9px; background: #ffffff; border: 1px solid #e5e5e5; display: flex; gap: 5px; padding: 7px;">
                <div style="width: 15px; border-radius: 3px; background: #ececec;"></div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                  <div style="height: 5px; width: 70%; border-radius: 2px; background: #d0d0d0;"></div>
                  <div style="height: 5px; width: 45%; border-radius: 2px; background: #ececec;"></div>
                </div>
              </div>
              <span style="font-size: 14px; color: {DIM};">Light</span>
            </div>
          </div>
        </div>

        <div class="rise r2" style="background: {S0}; border: 1px solid {LINE}; border-radius: 18px; padding: 20px;">
          <p style="margin: 0 0 14px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: {FAINT};">About you</p>
          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
            <div><label style="display: block; margin-bottom: 6px; font-size: 13px; color: {DIM};">Name</label>
              <div style="background: {S2}; border: 1px solid {LINE}; border-radius: 11px; padding: 10px 13px; font-size: 14px;">Jaden</div></div>
            <div><label style="display: block; margin-bottom: 6px; font-size: 13px; color: {DIM};">Nickname</label>
              <div style="background: {S2}; border: 1px solid {LINE}; border-radius: 11px; padding: 10px 13px; font-size: 14px;">J</div></div>
            <div><label style="display: block; margin-bottom: 6px; font-size: 13px; color: {DIM};">Birthday</label>
              <div style="background: {S2}; border: 1px solid {LINE}; border-radius: 11px; padding: 10px 13px; font-size: 14px;">March 14</div></div>
            <div><label style="display: block; margin-bottom: 6px; font-size: 13px; color: {DIM};">Grade</label>
              <div style="background: {S2}; border: 1px solid {LINE}; border-radius: 11px; padding: 10px 13px; font-size: 14px;">10th</div></div>
          </div>
        </div>

        <div class="rise r3" style="background: {S0}; border: 1px solid {LINE}; border-radius: 18px; padding: 20px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: {FAINT};">Modes</p>
          <div style="display: flex; flex-direction: column;">
            {setting_row("Explain", "Adds the why behind an answer. Off gives you the answer alone. The depth slider lives beside the chat.", True)}
            {setting_row("Humanize", "Plain everyday writing for essays and emails. No dashes, simple words, a little loose.", False)}
            {setting_row("Homework Help", "Walks you through problems with questions instead of handing over the answer.", True)}
            {setting_row("AI Homie", "Drops the formal voice. Casual and chill, talks to you like a friend.", False, last=True)}
          </div>
        </div>

      </div>
    </div>
  </div>''')
    return page("Settings.", IDLE_STYLES, body)


# --------------------------------------------------------- 8. Panda sheet
def build_pandasheet():
    styles = IDLE_STYLES + f'''
    @keyframes rollLoop {{ to {{ transform: rotate(360deg) }} }}
    .roll-demo {{ animation: rollLoop 2.4s linear infinite; }}
'''

    def cell(label, svg, note):
        return f'''
        <div style="display: flex; flex-direction: column; align-items: center; gap: 14px; background: {S0}; border: 1px solid {LINE}; border-radius: 18px; padding: 26px 20px;">
          <div style="height: 150px; display: flex; align-items: center; justify-content: center;">{svg}</div>
          <div style="text-align: center;">
            <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600;">{label}</p>
            <p style="margin: 0; font-size: 12px; line-height: 1.55; color: {FAINT};">{note}</p>
          </div>
        </div>'''

    eye_svg = f'<svg viewBox="0 0 120 120" style="width: 116px; height: 116px;"><ellipse cx="60" cy="60" rx="40" ry="48" fill="{PATCH}"/>{eye(60, 60, 26)}</svg>'
    eye_cell = cell("Eye", eye_svg, "Black and glossy. One big shine, one small.")

    body = f'''<div style="width: 1200px; height: 640px; background: {BG}; color: {TEXT}; padding: 34px; overflow: hidden;">
      <div style="margin-bottom: 24px;">
        <h1 style="margin: 0 0 5px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em;">The panda</h1>
        <p style="margin: 0; font-size: 13px; color: {FAINT};">Smaller head, joined to the body. Glossy black boba eyes with one bright shine.</p>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;">
        {cell("Idle", f'<svg class="panda" viewBox="0 0 200 250" style="width: 118px; height: 148px;">{panda_facing()}</svg>', "Bobs, blinks, ears twitch, bamboo sways.")}
        {cell("Rolling", f'<svg class="roll-demo" viewBox="0 0 100 100" style="width: 108px; height: 108px;">{panda_ball()}</svg>', "Eyes shut. Rolls while the answer writes.")}
        {cell("Logo", f'<span style="display: flex; height: 84px; width: 84px; align-items: center; justify-content: center; border-radius: 24px; background: {S2};"><svg class="logo-roll" viewBox="0 0 100 100" style="width: 62px; height: 62px;">{panda_ball()}</svg></span>', "Same ball, turning slowly, top left.")}
        {eye_cell}
      </div>
    </div>'''
    return page("Panda reference sheet.", styles, body)


# --------------------------------------------------------------------------

# ---------------------------------------------------------- 0. First run
def build_onboarding():
    styles = f'''
    @keyframes arrive {{ 0% {{ opacity: 0; transform: translateY(24px) scale(.86) }} 60% {{ transform: translateY(-6px) scale(1.02) }} 100% {{ opacity: 1; transform: none }} }}
    @keyframes bob {{ 0%,100% {{ transform: translateY(0) }} 50% {{ transform: translateY(-7px) }} }}
    @keyframes wave {{ 0%,58%,100% {{ transform: rotate(-30deg) }} 68% {{ transform: rotate(-58deg) }} 78% {{ transform: rotate(-38deg) }} 88% {{ transform: rotate(-54deg) }} }}
    @keyframes blink {{ 0%,93%,100% {{ transform: scaleY(1) }} 96% {{ transform: scaleY(.06) }} }}
    @keyframes sway {{ 0%,100% {{ transform: rotate(-4deg) }} 50% {{ transform: rotate(5deg) }} }}
    @keyframes rise {{ from {{ opacity: 0; transform: translateY(10px) }} to {{ opacity: 1; transform: none }} }}
    @keyframes caret {{ 0%,49% {{ opacity: 1 }} 50%,100% {{ opacity: 0 }} }}
    .arrive {{ animation: arrive .62s cubic-bezier(.22,1,.36,1) both; }}
    .bob {{ animation: bob 3.2s ease-in-out infinite .7s; }}
    .wave-arm {{ animation: wave 3.6s ease-in-out infinite; transform-origin: 150px 162px; }}
    .eye {{ animation: blink 4.2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }}
    .bamboo {{ animation: sway 3.8s ease-in-out infinite; transform-origin: 155px 192px; }}
    .rise {{ animation: rise .5s ease-out both; }}
    .r1 {{ animation-delay: .18s }} .r2 {{ animation-delay: .3s }} .r3 {{ animation-delay: .42s }} .r4 {{ animation-delay: .54s }}
    .caret {{ animation: caret 1.05s step-end infinite; }}
'''
    chips_on = ["Basketball", "Music production"]
    chips_off = ["Gaming", "Art", "Coding", "Anime"]
    chips = "".join(
        f'<span style="border-radius: 999px; background: {TEXT}; color: {BG}; padding: 8px 14px; font-size: 13px; font-weight: 500;">{c}</span>'
        for c in chips_on)
    chips += "".join(
        f'<span style="border-radius: 999px; border: 1px solid {LINE_STRONG}; padding: 8px 14px; font-size: 13px; color: {DIM};">{c}</span>'
        for c in chips_off)
    chips += f'<span style="border-radius: 999px; border: 1px dashed {LINE_STRONG}; padding: 8px 14px; font-size: 13px; color: {FAINT};">+ add your own</span>'

    body = f'''<div style="display: flex; height: 900px; width: 1440px; background: {BG}; color: {TEXT}; align-items: center; justify-content: center; overflow: hidden;">
  <div style="display: flex; flex-direction: column; align-items: center; gap: 22px; width: 100%; max-width: 560px; padding: 0 24px;">

    <div class="arrive"><div class="bob">
      <svg viewBox="0 0 200 250" style="width: 176px; height: 220px;">{panda_facing(arms="wave")}</svg>
    </div></div>

    <div class="rise r1" style="text-align: center;">
      <h1 style="margin: 0 0 8px; font-size: 30px; font-weight: 600; letter-spacing: -0.02em;">Hey, I&#39;m Pandai</h1>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: {DIM}; text-wrap: pretty;">Tell me a bit about you and I&#39;ll remember it in every chat from here on.</p>
    </div>

    <div class="rise r2" style="width: 100%; display: flex; flex-direction: column; gap: 18px; background: {S0}; border: 1px solid {LINE}; border-radius: 20px; padding: 24px;">
      <div>
        <label style="display: block; margin-bottom: 7px; font-size: 13px; font-weight: 500;">What should I call you?</label>
        <div style="display: flex; align-items: center; background: {S2}; border: 1px solid {LINE_STRONG}; border-radius: 12px; padding: 11px 14px; font-size: 15px;">
          Jaden<span class="caret" style="display: inline-block; width: 2px; height: 18px; background: {TEXT}; margin-left: 2px;"></span>
        </div>
      </div>
      <div>
        <label style="display: block; margin-bottom: 7px; font-size: 13px; font-weight: 500;">Birthday</label>
        <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px;">
          <div style="background: {S2}; border: 1px solid {LINE}; border-radius: 12px; padding: 11px 14px; font-size: 15px;">March</div>
          <div style="background: {S2}; border: 1px solid {LINE}; border-radius: 12px; padding: 11px 14px; font-size: 15px;">14</div>
          <div style="background: {S2}; border: 1px solid {LINE}; border-radius: 12px; padding: 11px 14px; font-size: 15px; color: {FAINT};">Year</div>
        </div>
        <p style="margin: 7px 0 0; font-size: 12px; color: {FAINT};">Year is optional, skip it if you would rather.</p>
      </div>
      <div>
        <label style="display: block; margin-bottom: 9px; font-size: 13px; font-weight: 500;">What are you into?</label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">{chips}</div>
      </div>
    </div>

    <div class="rise r3" style="width: 100%; display: flex; align-items: center; gap: 14px;">
      <div style="flex: 1; height: 3px; border-radius: 999px; background: {S2}; overflow: hidden;">
        <div style="height: 100%; width: 66%; border-radius: 999px; background: {TEXT};"></div>
      </div>
      <span style="font-size: 12px; color: {FAINT}; flex-shrink: 0;">Step 2 of 3</span>
    </div>

    <div class="rise r4" style="width: 100%; display: flex; align-items: center; gap: 12px;">
      <span style="flex: 1; text-align: center; border-radius: 14px; background: #ffffff; color: {BG}; padding: 13px; font-size: 15px; font-weight: 600;">Continue</span>
      <span style="border-radius: 14px; border: 1px solid {LINE_STRONG}; padding: 13px 20px; font-size: 15px; color: {DIM};">Skip</span>
    </div>
  </div>
</div>'''
    return page("First run: the panda arrives and waves, then settles.", styles, body)


# --------------------------------------------------- 9. Reading an image
def panda_reading():
    """Same proportions as the seated panda, tipped down over a book with a
    monocle. viewBox 0 0 200 250."""
    return f'''
      <g class="page">
        <path d="M44 206 L100 196 L100 232 L44 240 Z" fill="#e8e4da"/>
        <path d="M156 206 L100 196 L100 232 L156 240 Z" fill="#d8d3c7"/>
        <path d="M42 204 L100 194 L158 204 L158 210 L100 200 L42 210 Z" fill="{BAMBOO}"/>
        <path d="M56 216 L88 211" stroke="#a9a396" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M56 224 L84 219" stroke="#a9a396" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M112 211 L144 216" stroke="#b7b2a5" stroke-width="2.5" stroke-linecap="round"/>
      </g>

      <ellipse cx="100" cy="182" rx="56" ry="56" fill="{FUR}"/>
      <ellipse cx="54" cy="200" rx="14" ry="10" fill="{INK}" transform="rotate(-14 54 200)"/>
      <ellipse cx="146" cy="200" rx="14" ry="10" fill="{INK}" transform="rotate(14 146 200)"/>

      <circle cx="64" cy="56" r="17" fill="{INK}"/><circle cx="64" cy="56" r="8" fill="{EAR_IN}"/>
      <circle cx="136" cy="56" r="17" fill="{INK}"/><circle cx="136" cy="56" r="8" fill="{EAR_IN}"/>

      <ellipse cx="100" cy="94" rx="47" ry="44" fill="{FUR}"/>
      <ellipse cx="82" cy="97" rx="14" ry="17" fill="{PATCH}" transform="rotate(-14 82 97)"/>
      <ellipse cx="118" cy="97" rx="14" ry="17" fill="{PATCH}" transform="rotate(14 118 97)"/>
      <g class="scan-eye">{eye(82, 99)}{eye(118, 99)}</g>
      <ellipse cx="100" cy="115" rx="7.5" ry="5.5" fill="{INK}"/>
      <path d="M91 126 Q100 131 109 126" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>

      <circle cx="118" cy="98" r="24" fill="{BAMBOO}" opacity=".07"/>
      <circle cx="118" cy="98" r="24" fill="none" stroke="#d4b872" stroke-width="4"/>
      <circle cx="118" cy="98" r="28" fill="none" stroke="#b39a58" stroke-width="1.5"/>
      <path class="glint" d="M107 89 L114 83" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M140 110 Q154 130 147 150" stroke="#d4b872" stroke-width="2" fill="none" stroke-linecap="round"/>'''


def build_imageread():
    styles = f'''
    @keyframes lean {{ 0%,100% {{ transform: rotate(-3deg) }} 50% {{ transform: rotate(2deg) }} }}
    @keyframes scanEye {{ 0%,100% {{ transform: translateX(-2px) }} 50% {{ transform: translateX(3px) }} }}
    @keyframes glint {{ 0%,72%,100% {{ opacity: 0 }} 80% {{ opacity: .85 }} 88% {{ opacity: 0 }} }}
    @keyframes pageFlick {{ 0%,88%,100% {{ transform: rotateY(0deg) }} 94% {{ transform: rotateY(-22deg) }} }}
    @keyframes scanline {{ 0% {{ top: 0; opacity: 0 }} 12% {{ opacity: 1 }} 88% {{ opacity: 1 }} 100% {{ top: 100%; opacity: 0 }} }}
    @keyframes dot {{ 0%,80%,100% {{ opacity: .25 }} 40% {{ opacity: 1 }} }}
    @keyframes sweep {{ 0% {{ background-position: -200px 0 }} 100% {{ background-position: 320px 0 }} }}
    .lean {{ animation: lean 3.4s ease-in-out infinite; transform-origin: 50% 84%; }}
    .scan-eye {{ animation: scanEye 2.2s ease-in-out infinite; }}
    .glint {{ animation: glint 3.6s ease-in-out infinite; }}
    .page {{ animation: pageFlick 5s ease-in-out infinite; transform-origin: 100px 210px; }}
    .scanline {{ animation: scanline 2.4s ease-in-out infinite; }}
    .d1 {{ animation: dot 1.3s ease-in-out infinite }}
    .d2 {{ animation: dot 1.3s ease-in-out infinite .16s }}
    .d3 {{ animation: dot 1.3s ease-in-out infinite .32s }}
    .shimmer {{
      background: linear-gradient(90deg, {FAINT} 0%, {TEXT} 45%, {FAINT} 70%);
      background-size: 320px 100%;
      -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: sweep 2.1s linear infinite;
    }}
'''
    bars = "".join(
        f'<div style="height: 6px; width: {w}%; border-radius: 3px; background: {S3};"></div>'
        for w in [88, 80, 46, 84, 70, 58])

    body = shell(
        sidebar("chat", chats=["Chem worksheet pic"] + CHATS[:3], active_chat=0) + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("Chem worksheet pic")}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; padding: 32px 24px;">
      <div style="display: flex; flex-direction: column; gap: 26px; width: 100%; max-width: 700px;">

        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
          <div style="position: relative; width: 268px; border-radius: 16px; overflow: hidden; border: 1px solid {LINE_STRONG}; background: {S1};">
            <div style="height: 176px; background: {S2}; padding: 18px 20px; display: flex; flex-direction: column; gap: 9px;">
              <div style="height: 8px; width: 62%; border-radius: 3px; background: {LINE_STRONG};"></div>
              {bars}
            </div>
            <div class="scanline" style="position: absolute; left: 0; right: 0; height: 2px; background: {BAMBOO}; box-shadow: 0 0 14px 2px rgba(106,168,79,.65);"></div>
          </div>
          <div style="max-width: 78%; background: {BUBBLE}; border-radius: 20px 20px 6px 20px; padding: 12px 16px; font-size: 15px; line-height: 1.55;">
            can u do number 4
          </div>
        </div>

        <div style="display: flex; gap: 14px; align-items: flex-start;">
          <svg class="lean" viewBox="0 0 200 250" style="width: 76px; height: 95px; flex-shrink: 0; margin-top: -10px;">{panda_reading()}</svg>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px;">
            <div style="border: 1px solid {LINE}; border-radius: 14px; background: {S0}; padding: 14px 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span class="shimmer" style="font-size: 13px; font-weight: 500;">Reading your photo</span>
                <span style="display: flex; gap: 3px; align-items: center;">
                  <span class="d1" style="height: 4px; width: 4px; border-radius: 999px; background: {TEXT}; display: block;"></span>
                  <span class="d2" style="height: 4px; width: 4px; border-radius: 999px; background: {TEXT}; display: block;"></span>
                  <span class="d3" style="height: 4px; width: 4px; border-radius: 999px; background: {TEXT}; display: block;"></span>
                </span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 9px;">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px;" fill="none" stroke="{GREEN}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  <span style="font-size: 13px; color: {DIM}; line-height: 1.5;">Found 6 questions on the sheet</span>
                </div>
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                  <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px;" fill="none" stroke="{GREEN}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  <span style="font-size: 13px; color: {DIM}; line-height: 1.5;">Pulled out #4, balancing a combustion equation</span>
                </div>
              </div>
            </div>
            <div style="font-size: 15px; line-height: 1.7; color: {TEXT};">
              Got it, #4 is the combustion one. Before I say anything, what do you get when you count the oxygens on the left side?
            </div>
          </div>
        </div>
      </div>
    </div>
    <div style="display: flex; justify-content: center; padding: 0 24px 26px;">
      <div style="width: 100%; max-width: 700px;">{composer()}</div>
    </div>
  </div>''',
        rail=right_rail(explain_on=True, depth=1, humanize_on=False))
    return page("Reading an image: monocle, eyes tracking down the page.", styles, body)


# ------------------------------------------------------------- 10. Build
def build_build():
    cards = f'''
            <div style="background: {S0}; border: 1px solid {LINE}; border-radius: 16px; overflow: hidden;">
              <div style="height: 104px; background: {S1}; border-bottom: 1px solid {LINE}; padding: 14px; display: flex; flex-direction: column; gap: 7px;">
                <div style="height: 7px; width: 55%; border-radius: 3px; background: {GREEN};"></div>
                <div style="height: 5px; width: 82%; border-radius: 3px; background: {S3};"></div>
                <div style="height: 5px; width: 68%; border-radius: 3px; background: {BUBBLE};"></div>
                <div style="margin-top: auto; height: 18px; width: 52px; border-radius: 5px; background: {S3};"></div>
              </div>
              <div style="padding: 13px 14px;">
                <p style="margin: 0 0 3px; font-size: 14px; font-weight: 500;">Free throw tracker</p>
                <p style="margin: 0; font-size: 12px; color: {FAINT};">3 files · yesterday</p>
              </div>
            </div>
            <div style="background: {S0}; border: 1px solid {LINE}; border-radius: 16px; overflow: hidden;">
              <div style="height: 104px; background: {S1}; border-bottom: 1px solid {LINE}; padding: 14px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <div style="height: 40px; width: 13px; border-radius: 3px; background: {S3};"></div>
                <div style="height: 58px; width: 13px; border-radius: 3px; background: {AMBER};"></div>
                <div style="height: 30px; width: 13px; border-radius: 3px; background: {S3};"></div>
                <div style="height: 48px; width: 13px; border-radius: 3px; background: {S3};"></div>
              </div>
              <div style="padding: 13px 14px;">
                <p style="margin: 0 0 3px; font-size: 14px; font-weight: 500;">Bio study quiz</p>
                <p style="margin: 0; font-size: 12px; color: {FAINT};">5 files · 3 days ago</p>
              </div>
            </div>
            <div style="border: 1px dashed {LINE_STRONG}; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; min-height: 178px; color: {FAINT};">
              <svg viewBox="0 0 24 24" style="width: 22px; height: 22px;" fill="none" stroke="{FAINT}" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
              <span style="font-size: 13px;">Start a new one</span>
            </div>'''

    body = shell(
        sidebar("build") + f'''
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
    {topbar("Build")}
    <div style="flex: 1; min-height: 0; overflow: hidden; display: flex; justify-content: center; padding: 34px 24px;">
      <div style="width: 100%; max-width: 860px; display: flex; flex-direction: column; gap: 24px;">

        <div class="rise" style="display: flex; align-items: center; gap: 16px;">
          <div class="panda" style="flex-shrink: 0;">
            <svg viewBox="0 0 200 250" style="width: 68px; height: 85px;">{panda_facing()}</svg>
          </div>
          <div style="flex: 1; min-width: 0;">
            <h1 style="margin: 0 0 4px; font-size: 26px; font-weight: 600; letter-spacing: -0.02em;">Build something</h1>
            <p style="margin: 0; font-size: 14px; color: {FAINT}; text-wrap: pretty;">Sites, games, whatever. Everything lives here in Pandai, nothing to install and nothing to sign into.</p>
          </div>
        </div>

        <div class="rise r1" style="display: flex; gap: 12px;">
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 9px; border-radius: 14px; background: #ffffff; color: {BG}; padding: 14px; font-size: 15px; font-weight: 600;">
            <svg viewBox="0 0 24 24" style="width: 17px; height: 17px;" fill="none" stroke="{BG}" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New project
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 9px; border: 1px solid {LINE_STRONG}; border-radius: 14px; padding: 14px 22px; font-size: 15px; color: {DIM};">
            <svg viewBox="0 0 24 24" style="width: 17px; height: 17px;" fill="none" stroke="{DIM}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Import a .zip
          </div>
        </div>

        <div class="rise r2">
          <p style="margin: 0 0 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: {FAINT};">Your projects</p>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;">{cards}</div>
        </div>

        <div class="rise r3" style="display: flex; align-items: flex-start; gap: 13px; background: {S0}; border: 1px solid {LINE}; border-radius: 16px; padding: 16px 18px;">
          <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; flex-shrink: 0; margin-top: 1px;" fill="none" stroke="{BAMBOO}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
          <p style="margin: 0; font-size: 13px; line-height: 1.6; color: {DIM}; text-wrap: pretty;">Your projects save straight into Pandai as you work. No downloads, no file pickers, no other accounts. Export a .zip whenever you actually want the files.</p>
        </div>
      </div>
    </div>
  </div>''')
    return page("Build: projects live in-app.", IDLE_STYLES, body)


FILES = {
    "ImageRead.dc.html": build_imageread,
    "Build.dc.html": build_build,
    "Onboarding.dc.html": build_onboarding,
    "Main.dc.html": build_main,
    "Streaming.dc.html": build_streaming,
    "ExplainOff.dc.html": build_explainoff,
    "Humanize.dc.html": build_humanize,
    "Search.dc.html": build_search,
    "Watch.dc.html": build_watch,
    "Settings.dc.html": build_settings,
    "PandaSheet.dc.html": build_pandasheet,
}

if __name__ == "__main__":
    for name, fn in FILES.items():
        (OUT / name).write_text(fn())
        print("wrote", name)
