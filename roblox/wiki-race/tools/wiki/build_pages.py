"""Builds the imported encyclopedia (Luau modules) from dump lead wikitext.

Inputs (this directory): dump_leads.jsonl, candidates.json, handwritten pages parsed from the
repo's src/wikidata/*.luau (hand-written + brainrot titles/aliases win every collision).
Outputs: out/Vital_NN.luau, out/Bridges.luau, out/photos.json, out/report.txt
"""
import glob, json, math, os, re, sys, unicodedata
from collections import Counter, defaultdict
import mwparserfromhell as mw
from wikitext import Renderer, clean_markup, SENTINEL, LISTMARK, tname, pos, named
from classify import SENTENCE_BLOCK, TITLE_BLOCK
import emoji_map
import exclusions

HERE = os.path.dirname(os.path.abspath(__file__))  # working files live next to this script
REPO_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "wikidata")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

SUMMARY_MAX = 700
OVERVIEW_MAX = 900
PAGES_PER_MODULE = 220

# ---- Luau-compatible normalization (mirrors src/server/Wiki/TextUtil.luau) --------------
FOLD = {}
for chars, rep in [("áàâäãåāÁÀÂÄÃÅĀ", "a"), ("éèêëēęěÉÈÊËĒ", "e"), ("íìîïīÍÌÎÏĪ", "i"), ("óòôöõøōÓÒÔÖÕØŌ", "o"),
                   ("úùûüūÚÙÛÜŪ", "u"), ("ñÑ", "n"), ("çÇčČ", "c"), ("ýÿÝ", "y"), ("šŠ", "s"), ("žŽ", "z"), ("łŁ", "l")]:
    for ch in chars:
        FOLD[ch] = rep
FOLD.update({"ß": "ss", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-"})


def luau_normalize(text):
    out = []
    for ch in text:
        if ch in FOLD:
            out.append(FOLD[ch])
        elif ord(ch) < 128:
            out.append(ch.lower())
        else:
            out.append(" ")  # Luau's %w is ASCII-only: other letters become separators.
    s = "".join(out).replace("'", "")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


BANNED = ["timothee chalamet", "timothy chalamet", "chalamet", "john f kennedy", "john fitzgerald kennedy", "john kennedy",
          "jack kennedy", "president kennedy", "jfk", "j f k", "kennedy", "jacob elordi", "elordi", "armin arlert",
          "armin arlelt", "arlert", "armin"]


def banned(text):
    n = " " + luau_normalize(text) + " "
    return any(" " + p + " " in n for p in BANNED)


EXTRA_BLOCK = re.compile(
    r"\b(violen(t|ce)|gore|wound(ed|s)?|injur(y|ies|ed)|weapons?|guns?|firearms?|shooting|stabb(ed|ing)|hostages?|kidnap\w*|"
    r"abuse[ds]?|nudes?|mistress\w*|lovers?|sexual\w*|naked|nude|nudity|erotic\w*|genital\w*|penis|vagina|testic\w+|breast\w*|drugs?|overdose|"
    r"hitler|stalin|slave(s|ry)?|lynch\w*|blood|bleed\w*|die[ds]? in (battle|combat)|killed|victims?|war dead|"
    r"cigarettes?|tobacco|smok(ing|ers?)|whisk(e)?y|vodka|rum|gin|beer|wines?|alcohol\w*|brew(ed|ing|ery|eries)?|"
    r"casinos?|gambl\w+|opium|cannabis|marijuana|psychoactive|intoxica\w+|hallucinogen\w*|narcotic\w*|"
    r"poison\w*|venom\w*|toxic|prey on humans|man-eat\w*|maul\w*|attacks? on humans|fatal\w*|deadl(y|iest)|lethal|"
    r"infect\w*|diseases?|parasit\w+|feces|faeces|excrement|urine|vomit\w*|corpse|carcass\w*|dead bod\w+|"
    r"hell|satan\w*|demon\w*|occult|witchcraft|curse[ds]?)\b",
    re.I,
)


def unsafe(text):
    return bool(SENTENCE_BLOCK.search(text) or EXTRA_BLOCK.search(text))


# ---- hand-written titles -------------------------------------------------------------
def load_handwritten():
    titles, aliases = {}, {}
    for f in sorted(glob.glob(os.path.join(REPO_DATA, "*.luau"))):
        src = open(f).read()
        for m in re.finditer(r'\n\t\{\n\t\ttitle = "((?:[^"\\]|\\.)*)",(.*?)\n\t\},', src, re.S):
            t = m.group(1).replace('\\"', '"')
            am = re.search(r"aliases = \{(.*?)\}", m.group(2))
            al = [a.replace('\\"', '"') for a in re.findall(r'"((?:[^"\\]|\\.)*)"', am.group(1))] if am else []
            titles[t] = al
    return titles


# ---- sentence handling ---------------------------------------------------------------
def split_sentences(text):
    out, depth, start, i, n = [], 0, 0, 0, len(text)
    while i < n:
        two = text[i : i + 2]
        if two == "[[":
            depth += 1
            i += 2
            continue
        if two == "]]":
            depth = max(0, depth - 1)
            i += 2
            continue
        c = text[i]
        if depth == 0 and c in ".!?" and (i + 1 == n or text[i + 1] == " "):
            prev = text[max(0, i - 3) : i]
            # Don't split after common abbreviations / initials.
            if not re.search(r"(\b[A-Z]|\bc|\bSt|\bMt|\bDr|\bMr|\bMrs|\bvs|\be\.g|\bi\.e|\bNo|\bca|\bfl|\bBC|\bAD|\bJr|\bSr|\bU\.S)$", text[max(0, i - 5) : i]):
                out.append(text[start : i + 1].strip())
                start = i + 2
        i += 1
    if start < n:
        out.append(text[start:].strip())
    return [s for s in out if s]


NON_LATIN = re.compile(r"[\u0370-\u03ff\u0400-\u052f\u0590-\u08ff\u0900-\u0dff\u0e00-\u0eff\u0f00-\u0fff\u1000-\u109f\u10a0-\u10ff\u1100-\u11ff\u1200-\u139f\u1780-\u17ff\u1800-\u18af\u2e80-\u2fdf\u3000-\u9fff\ua000-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\U00020000-\U0002fa1f]")
PAREN_JUNK = re.compile(r"pronounc|ⓘ|\bIPA\b|listen|\blit\.|romani[sz]ed|\bromaji\b|\bpinyin\b|/[^/]{1,40}/|;\s*$|^\s*[,;]|\bborn\b|\bnée\b|\bmeaning\b|\bfrom\b.*\b(Latin|Greek|Old|Middle|Proto)|\b(Latin|Greek|French|German|Spanish|Italian|Arabic|Persian|Sanskrit|Hindi|Chinese|Japanese|Korean|Russian|Hebrew|Portuguese|Dutch|Turkish|Old English|Old Norse|Ancient Greek)\s*:", re.I)


def strip_parens(text):
    def repl(m):
        inner = m.group(1)
        if PAREN_JUNK.search(inner) or NON_LATIN.search(inner) or not re.search(r"[A-Za-z0-9]", inner):
            return ""
        return m.group(0)

    for _ in range(4):
        new = re.sub(r"\s?\(([^()]*)\)", repl, text)
        if new == text:
            break
        text = new
    text = NON_LATIN.sub("", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([,;:])\1+", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def visible(markup):
    s = re.sub(r"\[\[[^|\]]*\|([^\]]*)\]\]", r"\1", markup)
    return s.replace("**", "")


def fix_bold(s):
    # Balance ** pairs within a sentence.
    if s.count("**") % 2 == 1:
        s = s.replace("**", "")
    s = s.replace("****", "")
    return s


# ---- infobox ---------------------------------------------------------------------------
INFOBOX_SKIP = re.compile(
    r"(image|caption|alt|map|logo|flag|coat|seal|symbol_type|signature|website|url|footnote|notes?$|_ref$|^ref|pushpin|coord|"
    r"iso|code|timezone|utc|dst|postal|area_code|blank|native_name|conventional|common_name|^name$|^title$|embed|module|label|"
    r"mapframe|size|width|stat_ref|status_ref|status_system|subdivision_type|leader|key_people|spouse|children|parents?$|"
    r"relatives|partner|religion|party|death_cause|cause|resting|burial|criminal|conviction|victims|casualt|weapon|army|"
    r"allegiance|battles|commands|rank|unit|branch|servicenumber|awards?|honou?rs|signature|module|image|sound|audio|"
    r"motto|anthem|ethnic|genocide|sovereignty_type|established_event|drives_on|cctld|calling_code|gdp|hdi|gini|currency_code|"
    r"population_density|area_rank|population_.*rank|_rank|density|percent_water|water|smallcaps|nickname|"
    r"footnotes|pronunciation|also_known|other_names|synonyms?|authority|range_map|trinomial|binomial_authority|"
    r"fossil_range|display_parents|regnum|unranked|diversity|subdivision|type_species|parent_authority|species_text|"
    r"quote|slogan|founders?_|key|traded_as|isin|revenue|operating_income|net_income|assets|equity|num_employees|"
    r"subsid|divisions|homepage|screenshot|cover|poster|italic|misc|extra|note|temperature_|precip|record_|"
    r"elevation_ft|area_sq_mi|area_.*_sq_mi|_sq_mi|_mi$|_ft$|_sqmi|sq_mi|height_ft|length_mi|length_ft|imperial)",
    re.I,
)

LABELS = {
    "capital": "Capital", "largest_city": "Largest city", "official_languages": "Official languages",
    "languages": "Languages", "national_languages": "National languages", "demonym": "People are called",
    "government_type": "Government", "currency": "Currency", "population_estimate": "Population",
    "population_census": "Population", "population_total": "Population", "population": "Population",
    "area_km2": "Area (km²)", "area_total_km2": "Area (km²)", "founded": "Founded", "founder": "Founder",
    "established": "Established", "established_date1": "Established", "headquarters": "Headquarters",
    "hq_location": "Headquarters", "hq_location_city": "Headquarters", "industry": "Industry", "products": "Products",
    "developer": "Developer", "developers": "Developer", "publisher": "Publisher", "released": "Released",
    "release_date": "Released", "first_release": "First released", "genre": "Genre", "genres": "Genre",
    "platforms": "Platforms", "creator": "Created by", "created_by": "Created by", "author": "Author",
    "country": "Country", "location": "Location", "elevation_m": "Elevation (m)", "height": "Height",
    "length_km": "Length (km)", "mouth": "Mouth", "source1": "Source", "source": "Source", "type": "Type",
    "architect": "Architect", "built": "Built", "opened": "Opened", "completed": "Completed",
    "construction_start_date": "Construction began", "style": "Style", "architectural_style": "Style",
    "owner": "Owner", "operator": "Operator", "sport": "Sport", "members": "Members", "first_played": "First played",
    "inventor": "Inventor", "invented": "Invented", "manufacturer": "Manufacturer", "introduced": "Introduced",
    "discovered": "Discovered", "discovery_date": "Discovered", "discoverer": "Discovered by",
    "discovered_by": "Discovered by", "named_after": "Named after", "symbol": "Symbol", "number": "Atomic number",
    "atomic_number": "Atomic number", "category": "Category", "mean_radius": "Radius", "radius": "Radius",
    "mass": "Mass", "satellites": "Moons", "moons": "Moons", "orbital_period": "Orbital period",
    "surface_grav": "Surface gravity", "age": "Age", "distance": "Distance", "constellation": "Constellation",
    "birth_date": "Born", "birth_place": "Birthplace", "occupation": "Occupation", "occupations": "Occupation",
    "known_for": "Known for", "nationality": "Nationality", "citizenship": "Citizenship", "era": "Era",
    "region": "Region", "main_interests": "Main interests", "notable_works": "Notable works", "instrument": "Instruments",
    "instruments": "Instruments", "years_active": "Years active", "label": "Label", "medium": "Medium",
    "movement": "Movement", "field": "Field", "fields": "Fields", "language": "Language", "pub_date": "Published",
    "published": "Published", "set_in": "Setting", "series": "Series", "director": "Director", "directed_by": "Director",
    "starring": "Starring", "music": "Music", "studio": "Studio", "network": "Network", "num_seasons": "Seasons",
    "num_episodes": "Episodes", "first_aired": "First aired", "status": "Conservation status", "genus": "Genus",
    "species": "Species", "parent": "Part of", "taxon": "Scientific name", "ordo": "Order", "familia": "Family",
    "classis": "Class", "phylum": "Phylum", "kingdom": "Kingdom", "continent": "Continent", "coordinates": None,
    "area": "Area", "depth": "Depth", "max_depth": "Deepest point", "volume": "Volume", "basin_countries": "Countries",
    "cities": "Cities", "highest": "Highest point", "range": "Range", "first_ascent": "First climbed",
    "prominence_m": "Prominence (m)", "listing": "Listing", "designation1": "Designation", "visitors": "Visitors",
    "visitation_num": "Visitors per year", "date": "Date", "participants": "Participants", "venue": "Venue",
    "organizer": "Organizer", "first": "First held", "frequency": "Frequency", "teams": "Teams",
    "champion": "Current champion", "most_champs": "Most titles", "number_of_players": "Players", "players": "Players",
    "setup_time": "Setup time", "playing_time": "Playing time", "skills": "Skills needed", "ages": "Ages",
    "origin": "Origin", "region_of_origin": "Region", "main_ingredient": "Main ingredients",
    "main_ingredients": "Main ingredients", "course": "Course", "served": "Served", "calories": "Calories",
    "variations": "Variations", "colour": "Colour", "color": "Colour", "formula": "Formula", "melting_point": "Melts at",
    "boiling_point": "Boils at", "density_gpcm3": "Density", "appearance": "Appearance", "uses": "Uses",
    "unit_of": "Measures", "units": "Units", "si_unit": "SI unit", "dimension": "Dimension", "classification": "Classification",
    "family": "Family", "speakers": "Speakers", "script": "Writing system", "states": "Spoken in", "fam1": "Family",
    "iucn_status": None, "motto": None, "death_date": "Died", "alma_mater": "Education", "education": "Education",
    "notable_ideas": "Known for", "workplaces": "Worked at", "institutions": "Worked at", "doctoral_advisor": "Teacher",
    "tributaries_left": None, "etymology": "Name origin", "official_name": None, "authors": "Authors",
    "illustrator": "Illustrator", "characters": "Characters", "based_on": "Based on", "producer": "Producer",
    "chemical_formula": "Formula", "mineral_category": "Category", "hardness": "Hardness", "lustre": "Lustre",
    "wingspan": "Wingspan", "length": "Length", "weight": "Weight", "top_speed": "Top speed", "capacity": "Capacity",
    "first_flight": "First flight", "power": "Power", "date_of_invention": "Invented", "inventors": "Inventors",
}

TAXON_STATUS = {"LC": "Least Concern", "NT": "Near Threatened", "VU": "Vulnerable", "EN": "Endangered",
                "CR": "Critically Endangered", "EW": "Extinct in the wild", "EX": "Extinct", "DD": "Data Deficient",
                "DOM": "Domesticated", "secure": "Secure", "G5": "Secure"}


def humanize(key):
    k = re.sub(r"\d+$", "", key).strip("_ ")
    k = k.replace("_", " ").strip()
    if not k or len(k) > 22 or not re.match(r"^[A-Za-z ]+$", k):
        return None
    return k[0].upper() + k[1:]


def infobox_rows(tmpl, renderer):
    rows, seen = [], set()
    tn = tname(tmpl).lower()
    is_taxo = "taxobox" in tn or tn in ("speciesbox", "subspeciesbox")
    genus = species = None
    for p in tmpl.params:
        key = str(p.name).strip().lower().replace(" ", "_")
        if is_taxo:
            if key == "genus":
                genus = renderer.plain(p.value)
            if key == "species":
                species = renderer.plain(p.value)
            if key == "taxon":
                genus = renderer.plain(p.value)
            if key == "status":
                code = renderer.plain(p.value).strip()
                if code in TAXON_STATUS:
                    rows.append(["Conservation status", TAXON_STATUS[code]])
                continue
            if key not in ("genus", "species", "taxon", "status"):
                continue
            continue
        if key in LABELS and LABELS[key] is None:
            continue
        if INFOBOX_SKIP.search(key) and key not in LABELS:
            continue
        label = LABELS.get(key)
        if not label or label in seen:
            continue
        value = strip_parens(clean_markup(renderer.render(p.value)))
        value = re.sub(r"\s*\n\s*[\*#]?\s*", ", ", value).strip(" ,;")
        value = re.sub(r"(,\s*){2,}", ", ", value)
        value = fix_bold(value).replace("**", "")
        if not value or SENTINEL in value:
            continue
        vis = visible(value)
        if len(vis) > 80 or len(vis) < 1 or unsafe(vis) or unsafe(label) or banned(vis) or banned(label):
            continue
        if re.search(r"[{}<>|=]", vis):
            continue
        if key.startswith("area") and "km" in label:
            label = "Area"
            value = value if "km" in value else value + " km²"
        if re.fullmatch(r"\d{5,}", value):
            value = "{:,}".format(int(value))
        if key == "elevation_m":
            label, value = "Elevation", value if re.search(r"\bm\b", value) else value + " m"
        if key == "length_km":
            label, value = "Length", value if "km" in value else value + " km"
        if key == "prominence_m":
            label, value = "Prominence", value if re.search(r"\bm\b", value) else value + " m"
        seen.add(label)
        rows.append([label, value])
    if is_taxo and genus:
        name = genus if not species else "%s %s" % (genus, species)
        rows.insert(0, ["Scientific name", name])
    return rows[:7]


IMAGE_KEYS = ["image", "image_name", "image1", "photo", "picture", "image_skyline", "image_file", "img", "image_flag",
              "image_map", "logo"]


def find_image(tmpl, renderer):
    if tmpl is None:
        return None
    for key in IMAGE_KEYS:
        v = named(tmpl, key)
        if v is None:
            continue
        # Nested templates (e.g. {{multiple image}}) aren't handled; plain names only.
        raw = str(v).strip()
        m = re.search(r"([^\[\]|{}=\n]+\.(?:jpe?g|png|gif|svg|tiff?|webp))", raw, re.I)
        if m:
            name = m.group(1).strip()
            name = re.sub(r"^(File|Image):", "", name, flags=re.I).strip()
            return name, key
    return None


# ---- page conversion ---------------------------------------------------------------------
def convert(title, lead):
    code = mw.parse(lead)
    renderer = Renderer()
    shortdesc, infobox = None, None
    for t in code.filter_templates(recursive=False):
        n = tname(t).lower()
        if n == "short description" and shortdesc is None:
            p = pos(t)
            shortdesc = renderer.plain(p[0].value) if p else None
        elif infobox is None and (n.startswith("infobox") or "taxobox" in n or n in ("speciesbox", "subspeciesbox")):
            infobox = t
    body = clean_markup(renderer.render(code))
    image = find_image(infobox, renderer)
    if not image and renderer.images:
        image = (renderer.images[0].split("|")[0].strip(), "lead")
    rows = infobox_rows(infobox, Renderer()) if infobox is not None else []

    paragraphs = []
    for chunk in re.split(r"\n\s*\n", body):
        lines = []
        for line in chunk.split("\n"):
            s = line.strip()
            if not s or s[0] in "{|!=" or s[0] == LISTMARK or s.startswith("}}"):
                continue
            if s.replace(SENTINEL, "").strip() == "":
                continue
            lines.append(s)
        text = " ".join(lines).strip()
        if len(visible(text)) >= 40:
            paragraphs.append(text)

    kept_pars, blocked, total = [], 0, 0
    for par in paragraphs:
        par = re.sub(r"([.!?,;:])\s*" + SENTINEL + "+", r"\1", par)
        par = strip_parens(par)
        sentences = []
        for s in split_sentences(par):
            total += 1
            s = fix_bold(s)
            vis = visible(s)
            if SENTINEL in s or unsafe(vis) or banned(vis) or any(banned(t) for t in re.findall(r"\[\[([^|\]]*)\|", s)):
                blocked += 1
                continue
            if re.search(r"[{}<>|]|\[\[[^\]]*$|&[a-z]+;|\bref\b", re.sub(r"\[\[[^\]]*\]\]", "", s)):
                blocked += 1
                continue
            if len(vis) < 8:
                continue
            sentences.append(s)
        if sentences:
            kept_pars.append(sentences)
    return {
        "description": shortdesc,
        "paragraphs": kept_pars,
        "infobox": rows,
        "image": image,
        "blocked": blocked,
        "total": total,
        "infobox_type": tname(infobox) if infobox is not None else None,
    }


def take(sentences_list, limit):
    out, size = [], 0
    for s in sentences_list:
        n = len(visible(s))
        if out and size + n > limit:
            break
        out.append(s)
        size += n
    return out


def luau_str(s):
    s = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return '"' + s + '"'


def main():
    cand = json.load(open(os.path.join(HERE, "candidates.json")))
    hand = load_handwritten()
    leads = {}
    redirect_of = {}
    for line in open(os.path.join(HERE, "dump_leads.jsonl")):
        r = json.loads(line)
        if r.get("redirect"):
            redirect_of[r["title"]] = r["redirect"]
        else:
            leads[r["title"]] = r["lead"]

    def resolve_title(t):
        seen = 0
        while t in redirect_of and seen < 3:
            t = redirect_of[t]
            seen += 1
        return t

    taken = {}  # normalized name → owner title (hand-written first)
    for t, al in hand.items():
        taken.setdefault(luau_normalize(t), t)
    for t, al in hand.items():
        for a in al:
            taken.setdefault(luau_normalize(a), t)

    report = Counter()
    imported = {}
    title_map = {}  # vital title → final page title (after redirects)
    for vt, info in cand.items():
        final = resolve_title(vt)
        title_map[vt] = final
        if final not in leads:
            report["no lead"] += 1
            continue
        norm = luau_normalize(final)
        if not norm:
            report["empty norm"] += 1
            continue
        if norm in taken or luau_normalize(vt) in taken:
            report["hand-written wins"] += 1
            continue
        if final in imported:
            continue
        if exclusions.excluded(vt, info) or exclusions.excluded(final, info):
            report["manual kid-safety exclusion"] += 1
            continue
        if banned(final) or banned(vt) or TITLE_BLOCK.search(final) or SENTENCE_BLOCK.search(final):
            report["title blocked"] += 1
            continue
        if re.search(r"\(disambiguation\)|^List of|^Index of|^Outline of", final):
            report["list/disambig"] += 1
            continue
        imported[final] = {"vital": vt, "info": info}
        taken[norm] = final

    # Convert every imported page and every hand-written page (the latter only for bridges).
    converted = {}
    for i, t in enumerate(list(imported) + [h for h in hand if resolve_title(h) in leads]):
        src = resolve_title(t)
        try:
            converted[t] = convert(t, leads[src])
        except Exception as e:
            report["convert error"] += 1
            print("ERR", t, e, file=sys.stderr)
        if i % 1000 == 0:
            print("converted", i, file=sys.stderr)

    # Drop imported pages that are mostly blocked or too thin.
    for t in list(imported):
        c = converted.get(t)
        if not c or not c["paragraphs"]:
            report["empty after scrub"] += 1
            del imported[t]
            continue
        if c["total"] and c["blocked"] / c["total"] > 0.4:
            report["heavy topic (>40% blocked)"] += 1
            del imported[t]
            continue
        if len(visible(" ".join(c["paragraphs"][0]))) < 60:
            report["too short"] += 1
            del imported[t]

    # Final link resolution table: every page title + alias (hand-written, brainrot, imported).
    resolve = {}
    for t, al in hand.items():
        resolve.setdefault(luau_normalize(t), t)
        for a in al:
            resolve.setdefault(luau_normalize(a), t)
    for t in imported:
        resolve.setdefault(luau_normalize(t), t)
    for vt, final in title_map.items():
        if final in imported:
            resolve.setdefault(luau_normalize(vt), final)
    for red, target in redirect_of.items():
        tgt = resolve_title(target)
        if tgt in imported or tgt in hand:
            resolve.setdefault(luau_normalize(red), tgt)

    def relink(s, self_title):
        def rep(m):
            target, label = m.group(1), m.group(2)
            key = luau_normalize(target)
            dest = resolve.get(key)
            if dest and dest != self_title:
                return "[[%s|%s]]" % (dest, label) if dest != label else "[[%s]]" % dest
            return label

        return re.sub(r"\[\[([^|\]]*)\|([^\]]*)\]\]", rep, s)

    pages = {}
    edges = defaultdict(set)
    for t in imported:
        c = converted[t]
        pars = [[relink(s, t) for s in par] for par in c["paragraphs"]]
        summary = take(pars[0], SUMMARY_MAX)
        rest = pars[0][len(summary) :] + [s for par in pars[1:] for s in par]
        overview = take(rest, OVERVIEW_MAX) if rest else []
        rows = [[lbl, relink(val, t)] for lbl, val in c["infobox"]]
        page = {"title": t, "summary": " ".join(summary), "overview": " ".join(overview), "infobox": rows,
                "description": c["description"], "info": imported[t]["info"], "image": c["image"]}
        pages[t] = page
        for chunk in [page["summary"], page["overview"]] + [v for _, v in rows]:
            for m in re.finditer(r"\[\[([^|\]]*)(\|[^\]]*)?\]\]", chunk):
                edges[t].add(m.group(1))

    # Bridges: hand-written page → imported pages linked from its Wikipedia lead.
    bridges = {}
    for h in hand:
        c = converted.get(h)
        if not c:
            continue
        found = []
        for par in c["paragraphs"]:
            for s in par:
                for m in re.finditer(r"\[\[([^|\]]*)\|", relink(s, h)):
                    dest = m.group(1)
                    if dest in pages and dest not in found:
                        found.append(dest)
        for lbl, val in c["infobox"]:
            for m in re.finditer(r"\[\[([^|\]]*)(\||\]\])", relink(val, h)):
                dest = m.group(1)
                if dest in pages and dest not in found:
                    found.append(dest)
        if found:
            bridges[h] = found[:8]
            for d in bridges[h]:
                edges[h].add(d)

    # Hand-written + brainrot edges (links, related, patches), resolved like the game does.
    for f in sorted(glob.glob(os.path.join(REPO_DATA, "*.luau"))):
        src = open(f).read()
        for m in re.finditer(r'\n\t\{\n\t\ttitle = "((?:[^"\\]|\\.)*)",(.*?)\n\t\},', src, re.S):
            t = m.group(1).replace('\\"', '"')
            body = m.group(2)
            targets = re.findall(r"\[\[([^|\]]*)", body)
            rm = re.search(r"related = \{(.*?)\}", body, re.S)
            if rm:
                targets += re.findall(r'"((?:[^"\\]|\\.)*)"', rm.group(1))
            for x in targets:
                dest = resolve.get(luau_normalize(x))
                if dest and dest != t:
                    edges[t].add(dest)
        for m in re.finditer(r'\{\s*patch = "((?:[^"\\]|\\.)*)",\s*related = \{(.*?)\}', src, re.S):
            owner = resolve.get(luau_normalize(m.group(1)))
            if owner:
                for x in re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(2)):
                    dest = resolve.get(luau_normalize(x))
                    if dest and dest != owner:
                        edges[owner].add(dest)

    all_nodes = set(pages) | set(hand)

    def scc_main():
        order, seen = [], set()
        for root in sorted(all_nodes):
            if root in seen:
                continue
            seen.add(root)
            stack = [(root, iter(sorted(edges[root])))]
            while stack:
                node, it = stack[-1]
                nxt = next(it, None)
                if nxt is None:
                    order.append(node)
                    stack.pop()
                elif nxt in all_nodes and nxt not in seen:
                    seen.add(nxt)
                    stack.append((nxt, iter(sorted(edges[nxt]))))
        rev = defaultdict(list)
        for a in all_nodes:
            for b in edges[a]:
                if b in all_nodes:
                    rev[b].append(a)
        comp, best = {}, None
        for root in reversed(order):
            if root in comp:
                continue
            members, stack = [root], [root]
            comp[root] = root
            while stack:
                cur = stack.pop()
                for prev in rev[cur]:
                    if prev not in comp:
                        comp[prev] = root
                        members.append(prev)
                        stack.append(prev)
            if best is None or len(members) > len(best):
                best = members
        return set(best)

    # Connectivity: pages outside the main strongly connected component get "See also" links
    # to and from topical siblings (same Vital Articles section) that are already inside it.
    def group_key(t, depth):
        info = pages[t]["info"] if t in pages else None
        if not info:
            return None
        path = tuple(info["path"])
        return (info["top"],) + path[: max(0, len(path) - depth)]

    groups = defaultdict(list)
    for t in pages:
        for depth in range(0, 4):
            groups[(depth, group_key(t, depth))].append(t)
    added_related = defaultdict(list)  # page → extra related titles (imported pages)
    patch_related = defaultdict(list)  # hand-written page → extra related titles
    fanout = Counter()

    def add_see_also(src, dst):
        if dst in edges[src] or src == dst:
            return False
        edges[src].add(dst)
        (added_related if src in pages else patch_related)[src].append(dst)
        fanout[src] += 1
        return True

    for round_ in range(4):
        main_set = scc_main()
        outside = sorted(all_nodes - main_set)
        print("SCC round", round_, "main", len(main_set), "outside", len(outside), file=sys.stderr)
        if not outside:
            break
        for t in outside:
            if t not in pages:
                continue
            sibs = []
            for depth in range(0, 4):
                sibs = [s for s in groups[(depth, group_key(t, depth))] if s != t and s in main_set]
                if len(sibs) >= 2:
                    break
            if not sibs:
                continue
            h = int.from_bytes(t.encode()[:4].ljust(4, b"_"), "big")
            # Incoming: the least-loaded siblings mention this page in their See also.
            by_load = sorted(sibs, key=lambda s: (fanout[s], (hash(s) ^ h) & 0xFFFF))
            for s in by_load[:2]:
                add_see_also(s, t)
            # Outgoing: link back to well-connected siblings.
            by_hub = sorted(sibs, key=lambda s: -len(edges[s]))
            for s in by_hub[:2]:
                add_see_also(t, s)
    main_set = scc_main()
    print("final main", len(main_set), "of", len(all_nodes), file=sys.stderr)
    for t in pages:
        pages[t]["related"] = added_related.get(t, [])
    for h, extra in patch_related.items():
        bridges.setdefault(h, [])
        for x in extra:
            if x not in bridges[h]:
                bridges[h].append(x)

    # Fame from in-degree among imported + bridges.
    indeg = Counter()
    for src, dests in edges.items():
        for d in dests:
            indeg[d] += 1
    order = sorted(pages, key=lambda t: -indeg[t])
    n = len(order)
    for rank, t in enumerate(order):
        pages[t]["fame"] = 1 if rank < n * 0.18 else (2 if rank < n * 0.6 else 3)
        pages[t]["indeg"] = indeg[t]

    # Aliases: bold names in the first sentence that aren't taken.
    for t, p in pages.items():
        first = p["summary"].split(". ")[0]
        al = []
        for b in re.findall(r"\*\*([^*]{2,60})\*\*", first):
            b = visible(b).strip(" ,;:")
            nb = luau_normalize(b)
            if nb and nb != luau_normalize(t) and nb not in resolve and not banned(b) and len(al) < 3:
                b = b[0].upper() + b[1:]
                al.append(b)
                resolve[nb] = t
        for vt, final in title_map.items():
            if final == t and vt != t and luau_normalize(vt) != luau_normalize(t) and len(al) < 4:
                al.append(vt)
        p["aliases"] = al

    # Emit modules, grouped by category for stable diffs.
    def tags_for(info):
        path = [x for x in info["path"] if x and "General" not in x and len(x) < 40]
        out = []
        for x in path[-2:]:
            x = re.sub(r"^[^:]*:\s*", "", x).strip()
            if x and x not in out and not banned(x):
                out.append(x)
        return out

    ordered = sorted(pages.values(), key=lambda p: (p["info"]["category"], p["title"]))
    modules = [ordered[i : i + PAGES_PER_MODULE] for i in range(0, len(ordered), PAGES_PER_MODULE)]
    for f in glob.glob(os.path.join(OUT, "Vital_*.luau")):
        os.remove(f)
    total_bytes = 0
    for mi, group in enumerate(modules):
        lines = ["-- Imported from English Wikipedia lead sections (CC BY-SA 4.0), filtered for Wiki Race.",
                 "-- Generated by tools/wiki/build_pages.py — edit the generator, not this file.", "return {"]
        for p in group:
            cat = p["info"]["category"]
            emoji = emoji_map.pick(p["title"], p["description"], cat)
            lines.append("\t{")
            lines.append("\t\ttitle = %s," % luau_str(p["title"]))
            lines.append("\t\tcategory = %s," % luau_str(cat))
            lines.append("\t\tfame = %d," % p["fame"])
            lines.append("\t\temoji = %s," % luau_str(emoji))
            lines.append('\t\tsource = "wikipedia",')
            if p["description"] and not unsafe(p["description"]) and not banned(p["description"]) and len(p["description"]) < 120:
                lines.append("\t\tdescription = %s," % luau_str(p["description"]))
            tg = tags_for(p["info"])
            if tg:
                lines.append("\t\ttags = { %s }," % ", ".join(luau_str(x) for x in tg))
            if p["aliases"]:
                lines.append("\t\taliases = { %s }," % ", ".join(luau_str(x) for x in p["aliases"]))
            lines.append("\t\tsummary = %s," % luau_str(p["summary"]))
            if p["overview"]:
                lines.append("\t\tsections = { { \"Overview\", %s } }," % luau_str(p["overview"]))
            if p.get("related"):
                lines.append("\t\trelated = { %s }," % ", ".join(luau_str(x) for x in p["related"]))
            if p["infobox"]:
                lines.append("\t\tinfobox = {")
                for lbl, val in p["infobox"]:
                    lines.append("\t\t\t{ %s, %s }," % (luau_str(lbl), luau_str(val)))
                lines.append("\t\t},")
            lines.append("\t},")
        lines.append("}")
        src = "\n".join(lines) + "\n"
        total_bytes += len(src.encode())
        with open(os.path.join(OUT, "Vital_%02d.luau" % (mi + 1)), "w") as f:
            f.write(src)

    blines = ["-- \"See also\" links from hand-written pages to imported ones, taken from each subject's",
              "-- Wikipedia lead. Generated by tools/wiki/build_pages.py.", "return {"]
    for h in sorted(bridges):
        blines.append("\t{ patch = %s, related = { %s } }," % (luau_str(h), ", ".join(luau_str(x) for x in bridges[h])))
    blines.append("}")
    with open(os.path.join(OUT, "Bridges.luau"), "w") as f:
        f.write("\n".join(blines) + "\n")

    photos = {}
    for t, p in pages.items():
        if p["image"]:
            photos[t] = {"file": p["image"][0], "key": p["image"][1], "category": p["info"]["category"]}
    for h in hand:
        c = converted.get(h)
        if c and c["image"]:
            photos.setdefault(h, {"file": c["image"][0], "key": c["image"][1], "category": "handwritten"})
    json.dump(photos, open(os.path.join(OUT, "photos.json"), "w"), ensure_ascii=False, indent=0)
    json.dump({t: {"edges": sorted(edges[t])} for t in edges}, open(os.path.join(OUT, "edges.json"), "w"), ensure_ascii=False)

    # Sampled distance histogram (reverse BFS from random targets inside the main component).
    import random
    rng = random.Random(5)
    rev = defaultdict(list)
    for a in main_set:
        for b in edges[a]:
            if b in main_set:
                rev[b].append(a)
    hist = Counter()
    for target in rng.sample(sorted(main_set), 150):
        dist = {target: 0}
        queue = [target]
        for cur in queue:
            for prev in rev[cur]:
                if prev not in dist:
                    dist[prev] = dist[cur] + 1
                    queue.append(prev)
        for d in dist.values():
            if d:
                hist[d] += 1
    tot = sum(hist.values())
    hist_line = " ".join("%d:%.1f%%" % (d, 100 * hist[d] / tot) for d in sorted(hist))
    cats = Counter(p["info"]["category"] for p in pages.values())
    with open(os.path.join(OUT, "report.txt"), "w") as f:
        f.write("pages %d modules %d bytes %d bridges %d photos %d\n" % (len(pages), len(modules), total_bytes, len(bridges), len(photos)))
        f.write("%r\n%r\n" % (report, cats))
        outdeg = [len(edges[t]) for t in pages]
        f.write("main SCC %d/%d; distances %s\n" % (len(main_set), len(all_nodes), hist_line))
        f.write("avg out %.1f, zero-out %d, zero-in %d\n" % (sum(outdeg) / max(1, len(outdeg)), sum(1 for x in outdeg if x == 0), sum(1 for t in pages if indeg[t] == 0)))
    print(open(os.path.join(OUT, "report.txt")).read())


if __name__ == "__main__":
    main()
