"""Wikitext (lead section) → Wiki Race markup.

Output markup: [[Raw target|label]] links, **bold**, plain text. Unknown templates inside
prose become SENTINEL so the sentence containing them can be dropped instead of shipping a
sentence with a hole in it.
"""
import html, re
import mwparserfromhell as mw
from mwparserfromhell.nodes import Text, Wikilink, Template, Tag, ExternalLink, Comment, HTMLEntity, Heading, Argument

SENTINEL = "\x00"
LISTMARK = "\x01"

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

UNITS = {
    "km2": "km²", "sqkm": "km²", "m2": "m²", "sqmi": "sq mi", "mi2": "sq mi", "ha": "ha", "acre": "acres", "acres": "acres",
    "km": "km", "m": "m", "cm": "cm", "mm": "mm", "nm": "nm", "um": "μm", "μm": "μm", "mi": "mi", "ft": "ft", "in": "in", "yd": "yd",
    "nmi": "nmi", "ly": "light-years", "AU": "AU", "au": "AU", "pc": "parsecs", "kg": "kg", "g": "g", "mg": "mg", "t": "tonnes",
    "lb": "lb", "oz": "oz", "ST": "short tons", "LT": "long tons", "C": "°C", "F": "°F", "K": "K", "°C": "°C", "°F": "°F",
    "km/h": "km/h", "kph": "km/h", "mph": "mph", "m/s": "m/s", "kn": "knots", "l": "L", "L": "L", "ml": "mL", "USgal": "US gal",
    "impgal": "imp gal", "cuft": "cu ft", "m3": "m³", "km3": "km³", "cumi": "cu mi", "W": "W", "kW": "kW", "MW": "MW", "GW": "GW",
    "hp": "hp", "J": "J", "kJ": "kJ", "cal": "cal", "kcal": "kcal", "kWh": "kWh", "V": "V", "Hz": "Hz", "kPa": "kPa", "Pa": "Pa",
    "atm": "atm", "bar": "bar", "psi": "psi", "m3/s": "m³/s", "cuft/s": "cu ft/s", "km/s": "km/s", "g/cm3": "g/cm³",
    "sqft": "sq ft", "ft2": "sq ft", "e6km2": "million km²", "e6sqmi": "million sq mi", "e3km2": "thousand km²", "Mm": "Mm",
    "e6km": "million km", "e6mi": "million mi", "Gm": "Gm", "Tm": "Tm", "e9km": "billion km", "ml/kg": "ml/kg",
}

DROP = re.compile(
    r"^(cn|citation needed|citation needed span|fact|when|clarify|clarification needed|dubious|by whom|who\??|which|according to whom|vague|verify.*|"
    r"better source.*|update.*|needs update|failed verification|page needed|full citation needed|original research|or|disputed.*|"
    r"efn.*|refn|sfn.*|harv.*|r|rp|ref|ref label|note|notetag|nb\d*|citation|cite.*|webarchive|dead link|zwsp|wbr|anchors?|"
    r"pb|clear|-|short description|use .*|engvar.*|pp.*|good article|featured article|italic title|displaytitle.*|coord.*|"
    r"portal.*|.*sidebar.*|infobox.*|.*taxobox|speciesbox|subspeciesbox|about|for|for2|redirect.*|distinguish.*|other uses.*|"
    r"other people|see also|main|main article|further|hatnote|multiple issues|toc.*|authority control|sister project.*|"
    r"commons.*|wiktionary|wikisource.*|wikiquote|wikivoyage|spoken wikipedia|pronunciation|ipa.*|ipac.*|respell|audio.*|"
    r"listen|flagicon.*|flagdeco|lang-?x?x?-?|zh|chinese|contains special characters|good article|featured list|"
    r"primary sources?|unreferenced.*|more citations needed|refimprove|expand.*|lead too.*|cleanup.*|tone|pov|peacock.*|"
    r"weasel.*|sfnp|sfnm|citeref|dagger|double-dagger|col-.*|div col.*|reflist|notelist.*|external media|"
    r"image frame|multiple image|location map.*|clade|chem box|chembox|drugbox|redirect-distinguish|self-reference|"
    r"not to be confused with|confused|similar names|wikt-lang-hidden|hidden|nbsp|thin space|thinsp|hair space|figure space|"
    r"shy|zero width space|skip to.*|as of\?|sic\?|abbr\?|cbignore|bots|dmoz|official website|wide image|panorama|"
    r"interlanguage link multi|small caps|lang rtl|rtl-lang|nastaliq|script/.*|transl-?|translation|ill-wd)$",
    re.I,
)


def tname(t):
    return re.sub(r"\s+", " ", str(t.name).strip().replace("_", " ")).strip()


def pos(t):
    return [p for p in t.params if not p.showkey]


def named(t, key):
    for p in t.params:
        if p.showkey and str(p.name).strip() == key:
            return p.value
    return None


class Renderer:
    def __init__(self):
        self.images = []

    def render(self, code):
        if code is None:
            return ""
        if isinstance(code, str):
            code = mw.parse(code)
        out = []
        for node in code.nodes:
            piece = self.node(node)
            if isinstance(node, Text):
                # Mark wikitext list/indent lines (at a real line start) so callers can drop them.
                at_line_start = not out or "".join(out[-3:]).endswith("\n")
                piece = re.sub(r"\n[*#:;]+", "\n" + LISTMARK, piece)
                if at_line_start and re.match(r"[*#:;]", piece):
                    piece = LISTMARK + piece.lstrip("*#:;")
            out.append(piece)
        return "".join(out)

    def plain(self, code):
        s = self.render(code)
        s = re.sub(r"\[\[[^|\]]*\|([^\]]*)\]\]", r"\1", s)
        return s.replace("**", "").strip()

    def node(self, n):
        if isinstance(n, Text):
            return str(n.value)
        if isinstance(n, HTMLEntity):
            try:
                return n.normalize()
            except Exception:
                return html.unescape(str(n))
        if isinstance(n, (Comment, Heading, Argument)):
            return ""
        if isinstance(n, Wikilink):
            return self.link(n)
        if isinstance(n, ExternalLink):
            return self.plain(n.title) if n.title else ""
        if isinstance(n, Tag):
            return self.tag(n)
        if isinstance(n, Template):
            return self.template(n)
        return str(n)

    def link(self, n):
        target = str(n.title).strip()
        low = target.lower().lstrip(":")
        if re.match(r"^(file|image|media):", low):
            self.images.append(target.split(":", 1)[1].strip())
            return ""
        if re.match(r"^(category):", target.lower()):
            return ""
        label = self.plain(n.text) if n.text is not None else target.lstrip(":").split("#")[0] if not target.startswith("#") else target[1:]
        label = label.replace("[[", "").replace("]]", "").replace("|", "/").strip()
        if target.startswith(":") or re.match(r"^[a-z\-]{1,12}:", target) or target.startswith("#"):
            return label
        target = target.split("#")[0].replace("_", " ").strip()
        target = re.sub(r"\s+", " ", html.unescape(target))
        if not target or not label:
            return label
        target = target[0].upper() + target[1:]
        return "[[%s|%s]]" % (target, label)

    def tag(self, n):
        t = str(n.tag).lower()
        if t == "b":
            inner = self.render(n.contents)
            return "**" + inner.replace("**", "") + "**" if inner.strip() else inner
        if t in ("ref", "templatestyles", "gallery", "imagemap", "mapframe", "maplink", "graph", "timeline", "references", "table", "section", "indicator", "categorytree"):
            return ""
        if t in ("math", "chem", "ce", "score", "hiero", "syntaxhighlight", "source", "code", "poem", "blockquote", "inputbox"):
            return SENTINEL
        if t == "br" or t == "hr":
            return " "
        if n.contents is None:
            return ""
        return self.render(n.contents)

    def template(self, t):
        name = tname(t)
        low = name.lower()
        p = pos(t)
        P = lambda i: self.render(p[i].value).strip() if len(p) > i else ""

        if low.startswith("formatnum:"):
            return name.split(":", 1)[1].strip()
        if low.startswith("#") or low.startswith("safesubst:") or low.startswith("subst:"):
            return SENTINEL
        if low in ("currentyear", "current year"):
            return "2026"
        if DROP.match(low):
            return ""
        if low in ("convert", "cvt", "convinfobox"):
            return self.convert(t)
        if low == "val":
            v = P(0)
            u = named(t, "u") or named(t, "ul")
            e = named(t, "e")
            s = v
            if e is not None:
                s += "×10^" + self.plain(e)
            if u is not None:
                s += " " + self.plain(u)
            return s
        if low in ("frac", "sfrac", "fraction"):
            vals = [P(i) for i in range(len(p))]
            if len(vals) == 3:
                return "%s %s/%s" % tuple(vals)
            if len(vals) == 2:
                return "%s/%s" % tuple(vals)
            if len(vals) == 1:
                return "1/" + vals[0]
            return SENTINEL
        if low in ("circa", "c.", "ca.", "ca"):
            return ("c. " + P(0)) if p else "c."
        if low in ("floruit", "fl.", "fl"):
            return "fl. " + P(0)
        if low in ("as of", "asof"):
            year, month = P(0), P(1)
            prefix = "as of" if (named(t, "lc") is not None and self.plain(named(t, "lc")) in ("y", "yes")) else "As of"
            if named(t, "bare") is not None and self.plain(named(t, "bare")) in ("y", "yes"):
                prefix = ""
            if month.isdigit() and 1 <= int(month) <= 12:
                return ("%s %s %s" % (prefix, MONTHS[int(month) - 1], year)).strip()
            return ("%s %s" % (prefix, year)).strip()
        if re.match(r"^(birth|death|start|end|film|release|first|launch)[ -]?(date|year)( and age| and given age)?$", low) or low in ("dts", "date", "death date and age", "birth date and age", "bda", "dda", "dob"):
            return self.date(p, P)
        if low in ("bce", "bc"):
            return P(0) + " " + name.upper() if p else name.upper()
        if low in ("ce",):
            return P(0) + " CE" if p else "CE"
        if low in ("ad",):
            return "AD " + P(0) if p else "AD"
        if low in ("nowrap", "nobr", "no wrap", "nowrap begin", "small", "smaller", "big", "larger", "large", "sup", "sub", "mvar", "math",
                   "var", "smallcaps", "sc", "small caps", "sic", "gloss", "keypress", "not a typo", "proper name", "visible anchor",
                   "linktext", "nobold", "noitalic", "lang-en", "italics correction", "vanchor", "strong", "em", "code", "samp",
                   "bold", "b", "i", "u", "underline", "ubr", "center", "centre", "angbr", "text", "script/latn", "transl"):
            if low in ("linktext",):
                return " ".join(P(i) for i in range(len(p)))
            if low in ("strong", "bold", "b"):
                return "**" + P(0) + "**"
            if low == "transl":
                return P(len(p) - 1)
            return P(0) if low not in ("sic",) else P(len(p) - 1)
        if low in ("resize", "font", "font color", "color", "colour", "tooltip", "abbr", "abbrlink", "sort", "sortname", "tt", "tooltip2"):
            if low == "sortname":
                return (P(0) + " " + P(1)).strip()
            if low in ("abbr", "abbrlink", "tooltip", "tooltip2"):
                return P(0)
            return P(len(p) - 1)
        if low in ("'", "' \"", "'\"", "\"'", "-'", "'-"):
            return "'"
        if low in ("ndash", "en dash", "endash", "–"):
            return "–"
        if low in ("snd", "spnd", "sndash", "spaced ndash", "spaced en dash", "dash"):
            return " – "
        if low in ("mdash", "em dash", "emdash", "—"):
            return "—"
        if low in ("spaced mdash", "spaced em dash", "spmdash"):
            return " — "
        if low in ("nbsp", "space", "sp"):
            return " "
        if low in ("okina", "ʻ"):
            return "ʻ"
        if low in ("·", "dot", "middot", "•", "bull", "bullet"):
            return " · "
        if low == "pi":
            return "π"
        if low in ("degree", "°"):
            return "°"
        if low in ("sqrt", "radic"):
            return "√" + P(0)
        if low in ("times", "×", "x"):
            return "×"
        if low in ("us$", "usd", "us dollar", "us$ link"):
            return "US$" + P(0)
        if low in ("£", "gbp"):
            return "£" + P(0)
        if low in ("€", "euro", "eur"):
            return "€" + P(0)
        if low in ("¥", "jpy", "yen"):
            return "¥" + P(0)
        if low in ("inrconvert", "inr", "₹"):
            return "₹" + P(0)
        if low in ("format price", "formatprice", "number", "ordinal"):
            return P(0)
        if low in ("flag", "flagcountry", "flagu", "flag country", "flagathlete", "country", "flagu+"):
            return P(0)
        if low.startswith("lang-") or low in ("lang", "langx", "langnf", "wikt-lang", "native name", "nativename", "lang2", "transliteration", "translit"):
            if low.startswith("lang-"):
                return P(0)
            if low in ("native name", "nativename", "lang", "wikt-lang", "langx", "langnf", "lang2"):
                return P(1)
            return P(len(p) - 1)
        if low in ("nihongo", "nihongo2", "nihongo3", "nihongo foot"):
            return P(0) or P(2)
        if low in ("ill", "interlanguage link", "ill2"):
            return P(1) if (named(t, "lt") is None and len(p) > 1 and False) else P(0)
        if low in ("hlist", "flatlist", "plainlist", "ubl", "unbulleted list", "bulleted list", "collapsible list", "plain list", "flat list", "enum", "cslist", "comma separated entries", "nowrap list", "endash list"):
            items = []
            for q in p:
                txt = self.render(q.value).strip()
                for line in re.split(r"\n\s*[\*#]\s*", "\n" + txt):
                    line = line.strip()
                    if line:
                        items.append(line)
            if not p:
                # {{plainlist}} opened as a wrapper; content follows in the parent. Nothing here.
                return ""
            return ", ".join(items)
        if low in ("marriage", "married"):
            return P(0)
        if low in ("height",):
            parts = []
            for key, unit in (("m", "m"), ("cm", "cm"), ("ft", "ft"), ("in", "in")):
                v = named(t, key)
                if v is not None:
                    parts.append(self.plain(v) + " " + unit)
            return " ".join(parts) if parts else SENTINEL
        if low in ("chem", "chem2", "chem name"):
            return "".join(P(i) for i in range(len(p)))
        if low in ("lit", "literally", "literal translation"):
            return "lit. " + P(0)
        if low in ("iucn status", "iucnstatus"):
            return P(0)
        if low in ("citation needed span", "cns"):
            return P(0)
        if low in ("section link", "slink"):
            return P(0)
        if low in ("wikt", "wiktionary link"):
            return P(1) or P(0)
        if low in ("quote", "blockquote", "cquote", "quote box", "rquote"):
            return SENTINEL
        if low in ("age", "inflation", "tmath", "big number", "nts", "ntsh", "rnd", "round", "percentage", "pct", "decrease", "increase", "steady"):
            if low in ("decrease", "increase", "steady"):
                return ""
            return SENTINEL
        return SENTINEL

    def date(self, p, P):
        nums = [P(i) for i in range(min(3, len(p)))]
        nums = [n for n in nums if n]
        if not nums:
            return SENTINEL
        y = nums[0]
        if len(nums) >= 2 and nums[1].isdigit() and 1 <= int(nums[1]) <= 12:
            m = MONTHS[int(nums[1]) - 1]
            if len(nums) >= 3 and nums[2].isdigit():
                return "%s %s %s" % (int(nums[2]), m, y)
            return "%s %s" % (m, y)
        return y

    def convert(self, t):
        p = pos(t)
        vals = [self.plain(q.value) for q in p]
        if not vals:
            return SENTINEL
        joiners = ("to", "-", "–", "and", "or", "by", "x", "×", "+", "and(-)", "to(-)", "+/-", "±")
        if len(vals) >= 4 and vals[1] in joiners:
            unit = UNITS.get(vals[3], vals[3])
            j = {"-": "–", "x": "×", "and(-)": "and", "to(-)": "to"}.get(vals[1], vals[1])
            sep = "" if j == "–" else " "
            return "%s%s%s%s%s %s" % (vals[0], sep, j, sep, vals[2], unit)
        if len(vals) >= 2:
            return "%s %s" % (vals[0], UNITS.get(vals[1], vals[1]))
        return vals[0]


def clean_markup(s):
    s = s.replace("​", "").replace(" ", " ").replace("&nbsp;", " ")
    s = re.sub(r"'''''(.+?)'''''", r"**\1**", s)
    s = re.sub(r"'''(.+?)'''", r"**\1**", s)
    s = re.sub(r"''(.+?)''", r"\1", s)
    s = s.replace("'''", "").replace("''", "")
    s = re.sub(r"<[^>]{1,80}>", "", s)
    # Link trails: [[Forest|forest]]s → [[Forest|forests]]
    s = re.sub(r"\[\[([^|\]]*)\|([^\]]*)\]\]([a-z]+)", r"[[\1|\2\3]]", s)
    s = re.sub(r"\b(as of|As of) (as of|As of) ", r"\1 ", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s
