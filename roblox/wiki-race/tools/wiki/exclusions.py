"""Manual kid-safety exclusions from a full review of the imported titles and sections."""

EXCLUDE_PATH_PARTS = [
    "Alcoholic drinks",
    "Horror/Thriller",
    "Abrahamic mythology",
    "Interpersonal relationships",
    "Specific films > Western",
    "Specific films > Epic/Historical",
]

EXCLUDE_TITLES = set("""
The Godfather|La Dolce Vita|Breathless (1960 film)|Battleship Potemkin|The Birth of a Nation|The Seventh Seal|Seven Samurai
Psycho (1960 film)|Jaws (film)|Vertigo (film)|The Good, the Bad and the Ugly|The Sopranos|Lawrence of Arabia (film)
The Bacchae|The Golden Ass|Lysistrata|Oresteia|Oedipus Rex|Lolita|Madame Bovary|Anna Karenina|The Color Purple
Uncle Tom's Cabin|Heart of Darkness|Ulysses (novel)|Metamorphoses
Black Sabbath|Nirvana (band)|Janis Joplin|Tupac Shakur|Marvin Gaye|Serge Gainsbourg
Burlesque|Fetus|Defecation|Excretion|Development of the human body|Estrogen|Pheromone|Salmonella|Amanita muscaria
Intimate relationship|Breakup|Cohabitation|Concubinage|Infidelity|Dating|Courtship|Divorce|Polygamy|Family planning
Arranged marriage|Romance|Orphan
Poker|Lottery|Roulette|Slot machine|Tarot|Casino
Congo Free State|Great Leap Forward|Cultural Revolution|Partition of India|1970 Bhola cyclone
2004 Indian Ocean earthquake and tsunami|Gulag|Holodomor|Spanish conquest of the Aztec Empire
Spanish conquest of the Inca Empire|Early Muslim conquests|Muslim conquests in the Indian subcontinent
Muslim conquest of Persia|Crusades|Crusader states|Fall of Constantinople|Reconquista|Chernobyl disaster
Sinking of the Titanic|Scramble for Africa|Apartheid
Bill Cosby|Richard Pryor|George Carlin|Mae West|Hunter S. Thompson|H. P. Lovecraft|Sylvia Plath|Yukio Mishima
Anne Frank|Elie Wiesel|Salman Rushdie|Giacomo Casanova|Brigitte Bardot|Roman Polanski|Woody Allen
Leni Riefenstahl|D. W. Griffith|Quentin Tarantino
Caligula|Nero|Domitian|Vlad the Impaler|Ivan the Terrible|Attila|Timur|Herod the Great|Cesare Borgia
Pope Alexander VI|Nader Shah|Hulegu Khan|Aurangzeb|Wernher von Braun|Fritz Haber|William Shockley|Francis Galton
Edward Teller|J. Robert Oppenheimer
Lilith|Devil|Zombie|Cain and Abel
Body modification|Body piercing|Circumcision|Tattoo|Taboo|Forensic science|Playboy|Photojournalism
Lust|Hatred|Revenge|Eunuch|Criminology|Deviance (sociology)|Explosive|Dynamite|Machete|Propaganda
-logy|Antisemitism|Depression (mood)|Military|Central Intelligence Agency|United States Air Force|United States Navy|Vladimir Lenin|Deng Xiaoping|Metabolic waste|Commander-in-chief|Puppet state|Ghetto|Slavery|Human trafficking|Prostitution|Pornography
""".replace("\n", "|").split("|")) - {""}


def excluded(title, info):
    if title in EXCLUDE_TITLES:
        return True
    path = " > ".join([info.get("top", "")] + list(info.get("path", [])))
    return any(part in path for part in EXCLUDE_PATH_PARTS)
