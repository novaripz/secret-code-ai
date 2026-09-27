"""Extracts lead-section wikitext for a list of titles from the enwiki multistream dump using
HTTP range requests (only the ~100-page bz2 streams that contain wanted pages are downloaded).

Usage: python dump_extract.py titles.json out.jsonl
Follows redirects once (second pass). Resumable: titles already in out.jsonl are skipped.
"""
import bz2, html, json, os, re, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "dump", "index.txt.bz2")
DUMP = "https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-pages-articles-multistream.xml.bz2"
UA = "WikiRaceRobloxBuilder/1.0 (https://github.com/novaripz/secret-code-ai; snicholaslopez@gmail.com) python-requests"
local = threading.local()


def sess():
    if not hasattr(local, "s"):
        local.s = requests.Session()
        local.s.headers["User-Agent"] = UA
    return local.s


def scan_index(wanted):
    """Returns ({title: offset}, sorted list of every stream offset)."""
    found, offsets = {}, []
    last = -1
    with bz2.open(INDEX, "rt", encoding="utf-8") as f:
        for line in f:
            a = line.find(":")
            off = int(line[:a])
            if off != last:
                offsets.append(off)
                last = off
            b = line.find(":", a + 1)
            title = line[b + 1 : -1]
            if title in wanted:
                found[title] = off
    return found, offsets


PAGE = re.compile(r"<page>(.*?)</page>", re.S)
TITLE = re.compile(r"<title>(.*?)</title>")
NS = re.compile(r"<ns>(\d+)</ns>")
REDIR = re.compile(r'<redirect title="(.*?)"\s*/>')
TEXT = re.compile(r"<text[^>]*>(.*?)</text>", re.S)


def lead_of(text):
    m = re.search(r"\n==[^=]", text)
    return text[: m.start()] if m else text


def fetch_range(start, end):
    for attempt in range(8):
        try:
            r = sess().get(DUMP, headers={"Range": "bytes=%d-%d" % (start, end - 1)}, timeout=120)
            if r.status_code == 206:
                return r.content
            print("HTTP", r.status_code, start, flush=True)
        except requests.RequestException as e:
            print("ERR", e, flush=True)
        time.sleep(2 ** attempt)
    raise RuntimeError("range failed %d" % start)


def pages_in(blob, cuts):
    """Decompresses each stream (split at known offsets) and yields page dicts."""
    for s, e in cuts:
        xml = bz2.decompress(blob[s:e]).decode("utf-8")
        for m in PAGE.finditer(xml):
            body = m.group(1)
            ns = NS.search(body)
            if not ns or ns.group(1) != "0":
                continue
            title = html.unescape(TITLE.search(body).group(1))
            red = REDIR.search(body)
            tm = TEXT.search(body)
            text = html.unescape(tm.group(1)) if tm else ""
            yield title, (html.unescape(red.group(1)) if red else None), text


def extract(wanted, out_path, label):
    done = set()
    if os.path.exists(out_path):
        for line in open(out_path):
            done.add(json.loads(line)["title"])
    wanted = set(t for t in wanted if t not in done)
    if not wanted:
        return []
    t0 = time.time()
    found, offsets = scan_index(wanted)
    print(label, "index scan %.0fs: found %d/%d" % (time.time() - t0, len(found), len(wanted)), flush=True)
    nxt = {offsets[i]: offsets[i + 1] for i in range(len(offsets) - 1)}
    streams = sorted(set(found.values()))
    # Coalesce nearby streams into one range request.
    groups, cur = [], None
    for off in streams:
        end = nxt.get(off)
        if end is None:
            continue
        if cur and off - cur["end"] < 400_000 and end - cur["start"] < 6_000_000:
            cur["end"] = end
            cur["cuts"].append((off, end))
        else:
            cur = {"start": off, "end": end, "cuts": [(off, end)]}
            groups.append(cur)
    total = sum(g["end"] - g["start"] for g in groups)
    print(label, "streams %d, requests %d, %.0f MB" % (len(streams), len(groups), total / 1e6), flush=True)
    lock = threading.Lock()
    redirects = []
    count = [0]

    def job(g):
        blob = fetch_range(g["start"], g["end"])
        cuts = [(s - g["start"], e - g["start"]) for s, e in g["cuts"]]
        recs = []
        for title, red, text in pages_in(blob, cuts):
            if title in wanted:
                recs.append({"title": title, "redirect": red, "lead": None if red else lead_of(text), "size": len(text)})
        with lock:
            with open(out_path, "a") as f:
                for r in recs:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
                    if r["redirect"]:
                        redirects.append(r["redirect"])
            count[0] += 1
            if count[0] % 100 == 0:
                print(label, count[0], "/", len(groups), "%.0fs" % (time.time() - t0), flush=True)

    with ThreadPoolExecutor(3) as pool:
        list(pool.map(job, groups))
    missing = wanted - set(found)
    print(label, "done; missing", len(missing), sorted(missing)[:40], flush=True)
    return redirects


if __name__ == "__main__":
    titles = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    reds = extract(set(titles), out, "pass1")
    if reds:
        extract(set(reds), out, "pass2")
    print("ALL DONE", flush=True)
