"""Collects the Level-4 vital articles with their section paths."""
import json, re
from wp import api

TOP = ["People", "History", "Geography", "Arts", "Everyday life", "Philosophy and religion",
       "Society and social sciences", "Biology and health sciences", "Physical sciences",
       "Mathematics", "Technology"]

def wikitext(title):
    d = api({"action": "parse", "page": title, "prop": "wikitext", "redirects": 1})
    if "error" in d:
        return None, title
    return d["parse"]["wikitext"], d["parse"]["title"]

HEAD = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$")
LINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")
SUB = re.compile(r"\[\[(Wikipedia:Vital articles/Level/4/[^\]|#]+)")

articles = {}
visited = set()

def clean_heading(h):
    h = re.sub(r"\{\{[^}]*\}\}", "", h)
    h = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", h)
    h = re.sub(r"\(\d[\d,]*\s*articles?\)", "", h)
    h = re.sub(r"<[^>]+>", "", h)
    return h.strip(" :'")

def crawl(title, top, path):
    text, canonical = wikitext(title)
    if not text or canonical in visited:
        return
    visited.add(canonical)
    stack = list(path)
    for line in text.split("\n"):
        m = HEAD.match(line)
        if m:
            level = len(m.group(1))
            name = clean_heading(m.group(2))
            stack = stack[: max(0, level - 2)] + [name]
            continue
        s = line.lstrip()
        if not s.startswith(("#", "*")):
            sub = SUB.search(line)
            continue
        for sub in SUB.findall(line):
            if sub.rstrip("/") != canonical and sub not in visited and not sub.endswith(("Removed", "Draft", "draft", "Article alerts", "Candidates")):
                crawl(sub, top, stack)
        for target in LINK.findall(line):
            target = target.strip().replace("_", " ")
            if ":" in target and target.split(":")[0] in ("Wikipedia", "File", "Category", "Template", "Talk", "WP", "Help", "Portal", "User"):
                continue
            if target and target not in articles:
                articles[target] = {"top": top, "path": [p for p in stack if p]}

for top in TOP:
    crawl("Wikipedia:Vital articles/Level 4/" + top, top, [])
print(len(articles))
json.dump(articles, open("vital4.json", "w"), indent=0)
from collections import Counter
print(Counter(a["top"] for a in articles.values()))
