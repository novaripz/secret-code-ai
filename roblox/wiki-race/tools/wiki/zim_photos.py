"""Extracts each page's lead/infobox image from the Kiwix Wikipedia ZIM → photos/<key>.jpg (256px).
People pages are skipped (they get meme cards). Writes photos/index.json {title: {jpg, file}}.
"""
import glob, hashlib, html, io, json, os, re, sys, urllib.parse
from libzim.reader import Archive
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ZIM = os.path.join(HERE, "..", "zim", "top.zim")
OUT = os.path.join(HERE, "photos")
os.makedirs(OUT, exist_ok=True)
REPO_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "wikidata")
PEOPLE = {"Person", "Athlete", "Musician", "Actor", "Fictional Character"}
SKIP_FILE = re.compile(r"(signature|logo|seal|coat_of_arms|emblem|icon|symbol|portrait|headshot|stamp)", re.I)


def page_categories():
    cats = {}
    for f in glob.glob(os.path.join(REPO_DATA, "*.luau")) + glob.glob(os.path.join(REPO_DATA, "Vital", "*.luau")):
        for m in re.finditer(r'\n\t\{\n\t\ttitle = "((?:[^"\\]|\\.)*)",\n\t\tcategory = "([^"]+)"', open(f).read()):
            cats[m.group(1).replace('\\"', '"')] = m.group(2)
    return cats


def find_entry(zim, title):
    for path in (title.replace(" ", "_"), "A/" + title.replace(" ", "_")):
        try:
            e = zim.get_entry_by_path(path)
            return e.get_item() if not e.is_redirect else e.get_redirect_entry().get_item()
        except KeyError:
            continue
    return None


IMG = re.compile(r'<img[^>]+src="([^"]+)"[^>]*>', re.I)


def lead_image(html_text):
    # Prefer the infobox image, else the first sizable image before the first section heading.
    box = re.search(r'<table[^>]*class="[^"]*infobox[^"]*".*?</table>', html_text, re.S)
    candidates = []
    if box:
        candidates += IMG.findall(box.group(0))
    head = html_text.split("<h2", 1)[0]
    candidates += IMG.findall(head)
    for src in candidates:
        name = urllib.parse.unquote(src.split("/")[-1])
        if SKIP_FILE.search(name) or re.search(r"(Flag_of|\.svg\.|Commons-logo|Wiki|Question_book|Edit-clear|Crystal_Clear|Nuvola|Padlock)", name):
            continue
        return src, name
    return None


def resolve(base_path, src):
    path = urllib.parse.unquote(src)
    base = base_path.rsplit("/", 1)[0] if "/" in base_path else ""
    parts = (base.split("/") if base else []) + path.split("/")
    out = []
    for p in parts:
        if p == "..":
            if out:
                out.pop()
        elif p and p != ".":
            out.append(p)
    return "/".join(out)


def main():
    zim = Archive(ZIM)
    cats = page_categories()
    index = {}
    stats = {}
    for n, (title, cat) in enumerate(sorted(cats.items())):
        if cat in PEOPLE:
            stats["person"] = stats.get("person", 0) + 1
            continue
        item = find_entry(zim, title)
        if item is None:
            stats["no article"] = stats.get("no article", 0) + 1
            continue
        text = bytes(item.content).decode("utf-8", "ignore")
        found = lead_image(text)
        if not found:
            stats["no image"] = stats.get("no image", 0) + 1
            continue
        src, name = found
        try:
            blob = bytes(zim.get_entry_by_path(resolve(item.path, src)).get_item().content)
            im = Image.open(io.BytesIO(blob))
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
                bg.alpha_composite(im)
                im = bg
            im = im.convert("RGB")
            w, h = im.size
            if min(w, h) < 60:
                stats["tiny"] = stats.get("tiny", 0) + 1
                continue
            s = min(w, h)
            im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((256, 256), Image.LANCZOS)
            key = hashlib.sha1(title.encode()).hexdigest()[:16] + ".jpg"
            im.save(os.path.join(OUT, key), "JPEG", quality=84)
            file_name = re.sub(r"^\d+px-", "", name)
            file_name = re.sub(r"\.(webp|png)$", "", file_name) if re.search(r"\.(jpe?g|png|gif|tiff?)\.(webp|png)$", file_name, re.I) else file_name
            index[title] = {"jpg": key, "file": file_name.replace("_", " "), "category": cat}
            stats["ok"] = stats.get("ok", 0) + 1
        except Exception as e:
            stats["error"] = stats.get("error", 0) + 1
        if n % 500 == 0:
            print(n, stats, flush=True)
    json.dump(index, open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, indent=0)
    print("DONE", stats, flush=True)


if __name__ == "__main__":
    main()
