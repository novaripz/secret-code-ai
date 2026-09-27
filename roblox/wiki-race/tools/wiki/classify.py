"""Section-path → game category, plus safety exclusions for a kid-friendly wiki."""
import re

EXCLUDE_PATHS = [
    ("People", "Criminals"),
    ("People", "Military leaders and theorists"),
    ("People", "Politicians and leaders", "Modern"),
    ("People", "Rebels, revolutionaries and activists"),
    ("People", "Religious figures"),
    ("Philosophy and religion", "Religion and spirituality", "Abrahamic religions"),
    ("Philosophy and religion", "Religion and spirituality", "Eastern religions"),
    ("Philosophy and religion", "Religion and spirituality", "Other religions"),
    ("Philosophy and religion", "Religion and spirituality", "Religion and spirituality: General"),
    ("Biology and health sciences", "Health, medicine and disease"),
    ("Biology and health sciences", "Anatomy and morphology", "Animal"),
    ("Biology and health sciences", "Biological processes and physiology", "Animal reproduction"),
    ("Biology and health sciences", "Biological processes and physiology", "Biological reproduction"),
    ("Everyday life", "Sexuality and gender"),
    ("Society and social sciences", "Law", "Crime"),
    ("Society and social sciences", "War and military"),
    ("Society and social sciences", "Society", "Issues"),
    ("Society and social sciences", "Politics and government", "Ideology and political theory"),
    ("Technology", "Military technology"),
    ("Technology", "Medical technology"),
]

TITLE_BLOCK = re.compile(
    r"\b(wars?|battles?|genocide|holocaust|massacres?|invasion|siege|terroris[mt]|bomb(ing|s)?|attacks?|"
    r"assassinations?|slave(ry|s)?|torture|executions?|murders?|crimes?|criminal|rape|sex|sexual(ity)?|porn\w*|"
    r"prostitution|drugs?|cocaine|heroin|cannabis|opium|morphine|alcohol(ic)?|beer|wines?|whisk(e)?y|vodka|"
    r"liquor|tobacco|smoking|cigarettes?|nicotine|gambling|casinos?|suicide|death|deaths|dead|disease|cancer|"
    r"aids|hiv|syndrome|disorder|pandemic|epidemic|plague|weapons?|guns?|firearms?|rifles?|missiles?|"
    r"nuclear weapons?|atomic bomb|nazi(sm)?|fascis[mt]|abortion|capital punishment|cults?|riots?|"
    r"uprising|rebellion|purges?|famine|conflict|crisis|occupation|coup|mutiny|revolt|piracy|"
    r"prison|jail|penis|vagina|anus|breast|puberty|pregnancy|contracept\w*|toilet paper)\b",
    re.I,
)

# Sentence-level scrub for anything graphic that survives page selection.
SENTENCE_BLOCK = re.compile(
    r"\b(kill(ed|ing|ings|s)?|murder(ed|s|ing)?|massacre(d|s)?|genocide|slaughter(ed)?|execut(ed|ion|ions)|"
    r"behead(ed|ing)?|tortur(e|ed|ing)|rap(e|ed|ing)|sexual(ly)?|sex|suicide|bomb(s|ed|ing|ings)?|terror(ism|ist|ists)?|"
    r"corpses?|casualties|deaths|atrocit(y|ies)|brutal(ly|ity)?|horrific|gruesome|bloody|bloodshed|holocaust|"
    r"nazis?|nazism|cocaine|heroin|opium|narcotics?|alcoholic|drunk(en)?|beer|wine|liquor|prostitut\w+|porn\w*|"
    r"nuclear weapons?|atomic bomb(s|ing)?|chemical weapons?|gas chambers?|concentration camps?|lynch\w*|"
    r"mutilat\w+|cannibal\w*|decapitat\w+|dismember\w*|poison(ed|ing)|shot dead|assassinat(ed|ion)|"
    r"hanged|crucifi\w+|sacrific(e|ed|es|ing)|war crimes?|ethnic cleansing|enslav\w+)\b",
    re.I,
)


def excluded(top, path):
    full = (top,) + tuple(path)
    for rule in EXCLUDE_PATHS:
        if full[: len(rule)] == rule:
            return True
    return False


def category(top, path, title):
    p = " > ".join(path)
    t = title
    if top == "People":
        if p.startswith("Entertainers"):
            return "Actor"
        if p.startswith("Musicians"):
            return "Musician"
        if p.startswith("Sports"):
            return "Athlete"
        return "Person"
    if top == "History":
        if p.startswith("Historical cities"):
            return "City"
        return "History"
    if top == "Geography":
        if p.startswith("Cities"):
            return "City"
        if p.startswith("Countries and other regions > Countries"):
            return "Country"
        if "Parks and preserves" in p:
            return "Landmark"
        return "Geography"
    if top == "Arts":
        if p.startswith("Architecture > Specific") or p.startswith("Cultural venues"):
            return "Landmark"
        if p.startswith("Fictional"):
            return "Fictional Character"
        if "television shows" in p:
            return "Television"
        if p.startswith("Film"):
            return "Film"
        if p.startswith("Literature"):
            return "Book"
        if p.startswith("Music"):
            return "Music"
        return "Art"
    if top == "Biology and health sciences":
        if p.startswith("Organisms > Animals"):
            return "Animal"
        if p.startswith("Organisms > Plants") or p.startswith("Organisms > Fungi") or "Plant" in p or "Botany" in p:
            return "Plant"
        return "Science"
    if top == "Everyday life":
        if p.startswith("Cooking"):
            return "Food"
        if p.startswith("Sports and recreation > Sports"):
            return "Sport"
        if re.search(r"video game|game console", t, re.I):
            return "Video Game"
        if p.startswith(("Clothing", "Household", "Housing")):
            return "Object"
        return "Concept"
    if top == "Philosophy and religion":
        if "Mythology" in p:
            return "Mythology"
        return "Concept"
    if top == "Physical sciences":
        if p.startswith("Astronomy"):
            return "Space"
        return "Science"
    if top == "Mathematics":
        return "Mathematics"
    if top == "Society and social sciences":
        if "Companies" in p:
            return "Company"
        if p.startswith("International organizations") or "Educational institutions" in p:
            return "Organization"
        if "Festivals" in p:
            return "Event"
        return "Concept"
    if top == "Technology":
        if p.startswith("Computing") and "Programming" in p:
            return "Programming"
        if p.startswith("Computing") or p.startswith("Electronics") or p.startswith("Media"):
            return "Technology"
        if p.startswith("Transportation"):
            return "Vehicle"
        if p.startswith("Space"):
            return "Space"
        if p.startswith(("Engineering", "Infrastructure")):
            return "Engineering"
        if p.startswith(("Machinery", "Navigation", "Optical")):
            return "Invention"
        if p.startswith("Textiles"):
            return "Object"
        return "Technology"
    return "Concept"
