"""Keyword → emoji for imported pages (title words first, then short description)."""

WORDS = {
    # animals
    "lion": "🦁", "tiger": "🐯", "cat": "🐈", "dog": "🐕", "wolf": "🐺", "fox": "🦊", "bear": "🐻", "panda": "🐼",
    "koala": "🐨", "monkey": "🐒", "ape": "🦍", "gorilla": "🦍", "orangutan": "🦧", "chimpanzee": "🐒", "horse": "🐎",
    "zebra": "🦓", "donkey": "🐴", "deer": "🦌", "cattle": "🐄", "cow": "🐄", "ox": "🐂", "bison": "🦬", "buffalo": "🐃",
    "pig": "🐖", "boar": "🐗", "sheep": "🐑", "goat": "🐐", "camel": "🐫", "llama": "🦙", "giraffe": "🦒", "elephant": "🐘",
    "mammoth": "🦣", "rhinoceros": "🦏", "hippopotamus": "🦛", "mouse": "🐭", "rat": "🐀", "hamster": "🐹", "rabbit": "🐇",
    "squirrel": "🐿️", "beaver": "🦫", "hedgehog": "🦔", "bat": "🦇", "kangaroo": "🦘", "badger": "🦡", "skunk": "🦨",
    "otter": "🦦", "sloth": "🦥", "chicken": "🐔", "turkey": "🦃", "duck": "🦆", "swan": "🦢", "owl": "🦉", "eagle": "🦅",
    "parrot": "🦜", "peacock": "🦚", "flamingo": "🦩", "penguin": "🐧", "dove": "🕊️", "pigeon": "🕊️", "bird": "🐦",
    "crow": "🐦", "frog": "🐸", "crocodile": "🐊", "alligator": "🐊", "turtle": "🐢", "tortoise": "🐢", "lizard": "🦎",
    "snake": "🐍", "dragon": "🐉", "dinosaur": "🦕", "whale": "🐋", "dolphin": "🐬", "seal": "🦭", "fish": "🐟",
    "shark": "🦈", "octopus": "🐙", "squid": "🦑", "shrimp": "🦐", "lobster": "🦞", "crab": "🦀", "oyster": "🦪",
    "snail": "🐌", "butterfly": "🦋", "caterpillar": "🐛", "ant": "🐜", "bee": "🐝", "honeybee": "🐝", "beetle": "🪲",
    "ladybird": "🐞", "cockroach": "🪳", "spider": "🕷️", "scorpion": "🦂", "mosquito": "🦟", "fly": "🪰",
    "worm": "🪱", "coral": "🐠", "jellyfish": "🌊", "bacteria": "🦠", "bacterium": "🦠", "virus": "🦠", "microbe": "🦠",
    "mammal": "🐾", "reptile": "🦎", "amphibian": "🐸", "insect": "🐞", "animal": "🐾", "leopard": "🐆", "cheetah": "🐆",
    "jaguar": "🐆", "hyena": "🐺", "moose": "🦌", "goose": "🦢", "jellyfishes": "🌊", "salmon": "🐟", "tuna": "🐟",
    # plants & food
    "tree": "🌳", "oak": "🌳", "pine": "🌲", "palm": "🌴", "cactus": "🌵", "flower": "🌸", "rose": "🌹", "tulip": "🌷",
    "sunflower": "🌻", "hibiscus": "🌺", "lotus": "🌸", "leaf": "🍃", "grass": "🌾", "herb": "🌿", "fern": "🌿",
    "mushroom": "🍄", "fungus": "🍄", "fungi": "🍄", "moss": "🌿", "algae": "🌿", "seed": "🌱", "plant": "🌱",
    "apple": "🍎", "pear": "🍐", "orange": "🍊", "lemon": "🍋", "lime": "🍋", "banana": "🍌", "watermelon": "🍉",
    "melon": "🍈", "grape": "🍇", "strawberry": "🍓", "blueberry": "🫐", "cherry": "🍒", "peach": "🍑", "mango": "🥭",
    "pineapple": "🍍", "coconut": "🥥", "kiwifruit": "🥝", "tomato": "🍅", "eggplant": "🍆", "avocado": "🥑",
    "olive": "🫒", "potato": "🥔", "carrot": "🥕", "maize": "🌽", "corn": "🌽", "pepper": "🌶️", "chili": "🌶️",
    "cucumber": "🥒", "lettuce": "🥬", "cabbage": "🥬", "broccoli": "🥦", "garlic": "🧄", "onion": "🧅", "peanut": "🥜",
    "bean": "🌱", "soybean": "🌱", "chestnut": "🌰", "ginger": "🌿", "bread": "🍞", "croissant": "🥐", "bagel": "🥯",
    "cheese": "🧀", "egg": "🥚", "meat": "🍖", "bacon": "🥓", "hamburger": "🍔", "sandwich": "🥪", "pizza": "🍕",
    "taco": "🌮", "burrito": "🌯", "salad": "🥗", "soup": "🍲", "rice": "🍚", "noodle": "🍜", "pasta": "🍝",
    "sushi": "🍣", "dumpling": "🥟", "cookie": "🍪", "cake": "🍰", "chocolate": "🍫", "candy": "🍬", "honey": "🍯",
    "milk": "🥛", "coffee": "☕", "tea": "🍵", "juice": "🧃", "ice": "🧊", "salt": "🧂", "butter": "🧈", "sugar": "🍬",
    "wheat": "🌾", "barley": "🌾", "oat": "🌾", "cereal": "🌾", "spice": "🌶️", "vanilla": "🍦", "cocoa": "🍫",
    "food": "🍽️", "cuisine": "🍽️", "cooking": "🍳", "pancake": "🥞", "waffle": "🧇", "popcorn": "🍿", "pie": "🥧",
    "tofu": "🧈", "yogurt": "🥛", "nut": "🥜", "fruit": "🍎", "vegetable": "🥕", "berry": "🍓", "cotton": "☁️",
    # earth & places
    "mountain": "⛰️", "mountains": "🏔️", "volcano": "🌋", "island": "🏝️", "islands": "🏝️", "desert": "🏜️",
    "river": "🏞️", "lake": "🏞️", "sea": "🌊", "ocean": "🌊", "gulf": "🌊", "bay": "🌊", "strait": "🌊", "canal": "🛶",
    "waterfall": "💦", "falls": "💦", "glacier": "🧊", "forest": "🌲", "rainforest": "🌴", "jungle": "🌴",
    "beach": "🏖️", "cave": "🕳️", "canyon": "🏜️", "valley": "🏞️", "plain": "🌾", "plateau": "⛰️", "peninsula": "🗺️",
    "continent": "🌍", "earth": "🌍", "world": "🌍", "city": "🏙️", "town": "🏘️", "village": "🏘️",
    "castle": "🏰", "palace": "🏯", "temple": "⛩️", "church": "⛪", "cathedral": "⛪", "mosque": "🕌", "tower": "🗼",
    "bridge": "🌉", "stadium": "🏟️", "museum": "🏛️", "park": "🌳", "garden": "🌷", "wall": "🧱", "pyramid": "🔺",
    "statue": "🗽", "house": "🏠", "home": "🏠", "building": "🏢", "school": "🏫", "university": "🎓", "hospital": "🏥",
    "factory": "🏭", "harbour": "⚓", "harbor": "⚓", "port": "⚓", "airport": "✈️", "station": "🚉", "road": "🛣️",
    "desertification": "🏜️", "weather": "🌦️", "climate": "🌡️", "rain": "🌧️", "snow": "❄️", "wind": "💨",
    "storm": "⛈️", "tornado": "🌪️", "cyclone": "🌀", "hurricane": "🌀", "cloud": "☁️", "lightning": "⚡",
    "rainbow": "🌈", "earthquake": "🌋", "tsunami": "🌊", "flood": "🌊", "fire": "🔥", "rock": "🪨", "stone": "🪨",
    "mineral": "💎", "crystal": "💎", "diamond": "💎", "gold": "🥇", "silver": "🥈", "iron": "⚙️", "copper": "🟠",
    "soil": "🟫", "sand": "🏖️", "fossil": "🦴", "coal": "🪨", "oil": "🛢️", "petroleum": "🛢️", "gas": "💨",
    # space & science
    "sun": "☀️", "moon": "🌙", "star": "⭐", "stars": "✨", "planet": "🪐", "galaxy": "🌌", "comet": "☄️",
    "asteroid": "☄️", "meteor": "☄️", "nebula": "🌌", "universe": "🌌", "cosmos": "🌌", "telescope": "🔭",
    "satellite": "🛰️", "rocket": "🚀", "spacecraft": "🚀", "astronaut": "🚀", "orbit": "🪐", "eclipse": "🌘",
    "mars": "🔴", "jupiter": "🪐", "saturn": "🪐", "venus": "🌕", "mercury": "🌑", "neptune": "🔵", "uranus": "🔵",
    "atom": "⚛️", "electron": "⚛️", "proton": "⚛️", "neutron": "⚛️", "quantum": "⚛️", "physics": "🔭",
    "chemistry": "🧪", "chemical": "🧪", "acid": "🧪", "element": "🧪", "molecule": "🧬", "gene": "🧬", "dna": "🧬",
    "cell": "🦠", "biology": "🧬", "evolution": "🐒", "magnet": "🧲", "magnetism": "🧲", "electricity": "⚡",
    "energy": "⚡", "light": "💡", "laser": "🔦", "sound": "🔊", "wave": "〰️", "heat": "🌡️", "temperature": "🌡️",
    "time": "⏳", "clock": "🕰️", "gravity": "🍎", "force": "🏋️", "motion": "🏃", "mass": "⚖️", "measurement": "📏",
    "microscope": "🔬", "science": "🔬", "experiment": "🧪", "hydrogen": "🎈", "oxygen": "💨", "water": "💧",
    "carbon": "⚫", "nitrogen": "🌬️", "helium": "🎈", "plastic": "♻️", "glass": "🥛", "paper": "📄", "wood": "🪵",
    "mathematics": "➗", "number": "🔢", "numbers": "🔢", "geometry": "📐", "algebra": "✖️", "equation": "🟰",
    "calculus": "∫", "statistics": "📊", "probability": "🎲", "logic": "🧠", "set": "🔣", "theorem": "📐",
    "triangle": "🔺", "circle": "⭕", "square": "🟥", "cube": "🧊", "sphere": "🔵", "graph": "📈", "function": "📈",
    "infinity": "♾️", "zero": "0️⃣", "pi": "π", "fraction": "½", "matrix": "🔢", "vector": "➡️", "angle": "📐",
    "brain": "🧠", "heart": "❤️", "eye": "👁️", "ear": "👂", "nose": "👃", "tooth": "🦷", "teeth": "🦷", "bone": "🦴",
    "skeleton": "🦴", "muscle": "💪", "lung": "🫁", "skin": "🖐️", "hair": "💇", "hand": "✋", "foot": "🦶",
    "sleep": "😴", "dream": "💭", "memory": "🧠", "emotion": "😊", "happiness": "😊", "love": "❤️", "laughter": "😂",
    # tech
    "computer": "💻", "computing": "💻", "internet": "🌐", "web": "🌐", "software": "💾", "program": "⌨️",
    "programming": "⌨️", "algorithm": "🧮", "robot": "🤖", "robotics": "🤖", "artificial": "🤖", "phone": "📱",
    "telephone": "☎️", "smartphone": "📱", "television": "📺", "radio": "📻", "camera": "📷", "photography": "📷",
    "film": "🎬", "cinema": "🎬", "video": "📹", "game": "🎮", "games": "🎮", "console": "🎮", "printing": "🖨️",
    "printer": "🖨️", "battery": "🔋", "engine": "⚙️", "machine": "⚙️", "tool": "🛠️", "tools": "🛠️", "hammer": "🔨",
    "wheel": "⚙️", "car": "🚗", "automobile": "🚗", "bus": "🚌", "truck": "🚚", "bicycle": "🚲", "motorcycle": "🏍️",
    "train": "🚆", "railway": "🚆", "rail": "🚆", "tram": "🚋", "subway": "🚇", "metro": "🚇", "ship": "🚢",
    "boat": "⛵", "sailing": "⛵", "canoe": "🛶", "submarine": "🌊", "airplane": "✈️", "aircraft": "✈️",
    "aviation": "✈️", "helicopter": "🚁", "balloon": "🎈", "airship": "🎈", "parachute": "🪂", "elevator": "🛗",
    "lamp": "💡", "bulb": "💡", "candle": "🕯️", "key": "🔑", "lock": "🔒", "door": "🚪", "window": "🪟",
    "chair": "🪑", "bed": "🛏️", "toilet": "🚽", "bath": "🛁", "shower": "🚿", "soap": "🧼", "broom": "🧹",
    "umbrella": "☂️", "scissors": "✂️", "needle": "🪡", "thread": "🧵", "knot": "🪢", "rope": "🪢", "clothing": "👕",
    "shirt": "👕", "dress": "👗", "hat": "🎩", "shoe": "👟", "sock": "🧦", "glasses": "👓", "jewellery": "💍",
    "jewelry": "💍", "ring": "💍", "crown": "👑", "coin": "🪙", "money": "💰", "bank": "🏦", "currency": "💱",
    "trade": "🤝", "market": "🛒", "shop": "🏪", "company": "🏢", "business": "💼", "economy": "📈",
    "economics": "📈", "tax": "🧾", "law": "⚖️", "court": "⚖️", "government": "🏛️", "democracy": "🗳️",
    "election": "🗳️", "parliament": "🏛️", "kingdom": "👑", "empire": "👑", "dynasty": "👑", "king": "🤴",
    "queen": "👸", "emperor": "👑", "pharaoh": "👑", "flag": "🏳️", "passport": "🛂", "post": "📮", "mail": "✉️",
    "letter": "✉️", "book": "📖", "books": "📚", "library": "📚", "novel": "📖", "poem": "📜", "poetry": "📜",
    "writing": "✍️", "alphabet": "🔤", "language": "🗣️", "languages": "🗣️", "word": "🔤", "dictionary": "📕",
    "encyclopedia": "📚", "newspaper": "📰", "magazine": "📰", "news": "📰", "education": "🎓", "philosophy": "🤔",
    "religion": "🕯️", "mythology": "🐉", "myth": "🐉", "god": "⚡", "goddess": "✨", "legend": "📜", "folklore": "🧚",
    "fairy": "🧚", "ghost": "👻", "witch": "🧙", "wizard": "🧙", "magic": "🪄", "art": "🎨", "painting": "🖼️",
    "painter": "🎨", "sculpture": "🗿", "drawing": "✏️", "architecture": "🏛️", "design": "📐", "fashion": "👗",
    "dance": "💃", "ballet": "🩰", "theatre": "🎭", "theater": "🎭", "opera": "🎭", "comedy": "😂", "circus": "🎪",
    "music": "🎵", "song": "🎶", "singer": "🎤", "band": "🎸", "guitar": "🎸", "piano": "🎹", "violin": "🎻",
    "drum": "🥁", "trumpet": "🎺", "saxophone": "🎷", "flute": "🎶", "harp": "🪕", "orchestra": "🎻", "jazz": "🎷",
    "pop": "🎤", "hip": "🎤", "rap": "🎤", "blues": "🎷", "symphony": "🎼", "album": "💿",
    "sport": "🏅", "sports": "🏅", "football": "⚽", "soccer": "⚽", "basketball": "🏀", "baseball": "⚾",
    "softball": "🥎", "volleyball": "🏐", "rugby": "🏉", "tennis": "🎾", "badminton": "🏸", "golf": "⛳",
    "hockey": "🏒", "cricket": "🏏", "skiing": "⛷️", "snowboarding": "🏂", "skating": "⛸️", "swimming": "🏊",
    "surfing": "🏄", "diving": "🤿", "rowing": "🚣", "cycling": "🚴", "running": "🏃", "marathon": "🏃",
    "athletics": "🏃", "gymnastics": "🤸", "boxing": "🥊", "wrestling": "🤼", "judo": "🥋", "karate": "🥋",
    "fencing": "🤺", "archery": "🏹", "bowling": "🎳", "billiards": "🎱", "chess": "♟️", "cards": "🃏",
    "olympic": "🏅", "olympics": "🏅", "cup": "🏆", "championship": "🏆", "league": "🏆", "trophy": "🏆",
    "toy": "🧸", "doll": "🪆", "puzzle": "🧩", "kite": "🪁", "yo": "🪀", "festival": "🎉", "holiday": "🎉",
    "party": "🎉", "birthday": "🎂", "christmas": "🎄", "new": "🎆", "calendar": "📅", "year": "📅",
    "week": "📅", "day": "🌞", "night": "🌙", "family": "👪", "child": "🧒", "children": "🧒", "baby": "👶",
    "friendship": "🤝", "human": "🧍", "humans": "🧍", "people": "👥", "person": "👤", "medicine": "💊",
    "health": "🩺", "doctor": "🩺", "nurse": "🩺", "exercise": "🏋️", "yoga": "🧘", "farm": "🚜",
    "agriculture": "🚜", "farming": "🚜", "fishing": "🎣", "hunting": "🏹", "tent": "⛺", "camping": "🏕️",
    "compass": "🧭", "navigation": "🧭", "exploration": "🧭", "explorer": "🧭", "pirate": "🏴", "knight": "🛡️",
    "shield": "🛡️", "armour": "🛡️", "castles": "🏰", "anchor": "⚓", "lighthouse": "🗼", "map": "🗺️",
}

CATEGORY = {
    "Person": "👤", "Athlete": "🏅", "Musician": "🎤", "Actor": "🎭", "Fictional Character": "🦸", "Anime": "🌸",
    "Film": "🎬", "Television": "📺", "Book": "📚", "Video Game": "🎮", "Company": "🏢", "Organization": "🏛️",
    "Country": "🗺️", "City": "🏙️", "Landmark": "🗽", "Geography": "🏔️", "Animal": "🐾", "Plant": "🌿", "Food": "🍽️",
    "Sport": "⚽", "Science": "🔬", "Space": "🪐", "Mathematics": "➗", "Technology": "💻", "Programming": "⌨️",
    "Invention": "💡", "Engineering": "⚙️", "Vehicle": "🚗", "History": "📜", "Event": "📅", "Art": "🎨",
    "Music": "🎵", "Mythology": "🐉", "Object": "📦", "Concept": "💭", "Meme": "🤪",
}


def words(text):
    import re
    out = []
    for w in re.findall(r"[a-z]+", text.lower()):
        out.append(w)
        if w.endswith("ies") and len(w) > 4:
            out.append(w[:-3] + "y")
        elif w.endswith("es") and len(w) > 4:
            out.append(w[:-2])
            out.append(w[:-1])
        elif w.endswith("s") and len(w) > 3:
            out.append(w[:-1])
    return out


def pick(title, description, category):
    tw = words(title)
    # Head noun is usually last: "Polar bear" → bear. Try whole title, then words right-to-left.
    whole = title.lower()
    if whole in WORDS:
        return WORDS[whole]
    for w in reversed(tw):
        if w in WORDS:
            return WORDS[w]
    if category not in ("Person", "Athlete", "Musician", "Actor", "Country", "City"):
        for w in words(description or "")[:8]:
            if w in WORDS:
                return WORDS[w]
    return CATEGORY.get(category, "📄")
