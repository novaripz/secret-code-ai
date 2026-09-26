-- Cosmetic catalog. Every item is purely visual. Items are bought with Wiki Coins (earned by
-- playing, optionally topped up with a developer product), granted by a game pass, or
-- unlocked by an achievement. Nothing here touches race stats.

local Catalog = {}

Catalog.ShopCategories = { "UI", "Profile", "Victory", "Lobby", "Effects", "Sounds", "Badges", "Titles" }

Catalog.Slots = {
	theme = { name = "UI Theme", category = "UI", default = "theme_classic" },
	frame = { name = "Profile Frame", category = "Profile", default = "frame_none" },
	victory = { name = "Victory Effect", category = "Victory", default = "victory_confetti" },
	podium = { name = "Podium Effect", category = "Victory", default = "podium_spotlight" },
	lobbyBg = { name = "Lobby Background", category = "Lobby", default = "lobby_default" },
	meter = { name = "Meter Effect", category = "Effects", default = "meter_classic" },
	transition = { name = "Page Transition", category = "Effects", default = "transition_fade" },
	cursor = { name = "Cursor Trail", category = "Effects", default = "cursor_none" },
	sound = { name = "Sound Pack", category = "Sounds", default = "sound_classic" },
	badge = { name = "Profile Badge", category = "Badges", default = "badge_none" },
	title = { name = "Title", category = "Titles", default = "title_none" },
}

Catalog.SlotOrder = {
	"theme",
	"frame",
	"title",
	"badge",
	"victory",
	"podium",
	"lobbyBg",
	"meter",
	"transition",
	"cursor",
	"sound",
}

local function item(slot, id, name, price, description, extra)
	local entry = { slot = slot, id = id, name = name, price = price, description = description }
	for k, v in extra or {} do
		entry[k] = v
	end
	return entry
end

Catalog.Items = {
	-- UI themes (theme ids map 1:1 onto client/UI/Themes)
	item("theme", "theme_classic", "Classic Wiki", 0, "The timeless encyclopedia look.", { theme = "classic" }),
	item("theme", "theme_dark", "Dark", 0, "Easy on the eyes for late-night rabbit holes.", { theme = "dark" }),
	item("theme", "theme_minimal", "Minimal", 250, "Nothing but the words.", { theme = "minimal" }),
	item("theme", "theme_glass", "Glass", 600, "Frosted panels floating over color.", { theme = "glass" }),
	item("theme", "theme_retro", "Retro", 800, "Like browsing in 1996. Beige is back.", { theme = "retro" }),
	item(
		"theme",
		"theme_neon",
		"Neon",
		900,
		"Animated glowing edges and electric links.",
		{ theme = "neon", animated = true }
	),
	item(
		"theme",
		"theme_cyber",
		"Cyber",
		1200,
		"Terminal greens on a hacker grid.",
		{ theme = "cyber", animated = true }
	),
	item(
		"theme",
		"theme_cosmic",
		"Cosmic",
		1500,
		"A drifting nebula behind every article.",
		{ theme = "cosmic", animated = true }
	),
	item(
		"theme",
		"theme_vip",
		"VIP Gold",
		0,
		"Black and gold. VIP exclusive.",
		{ theme = "vip", requires = "VIP", animated = true }
	),

	-- Profile frames
	item("frame", "frame_none", "No Frame", 0, "Clean and simple."),
	item(
		"frame",
		"frame_silver",
		"Silver Frame",
		300,
		"A polished silver ring.",
		{ colors = { Color3.fromRGB(226, 232, 240), Color3.fromRGB(148, 163, 184) } }
	),
	item(
		"frame",
		"frame_gold",
		"Gold Frame",
		900,
		"Shiny. Very shiny.",
		{ colors = { Color3.fromRGB(253, 224, 71), Color3.fromRGB(202, 138, 4) } }
	),
	item(
		"frame",
		"frame_neon",
		"Neon Frame",
		1200,
		"Pulsing cyan and magenta.",
		{ colors = { Color3.fromRGB(34, 211, 238), Color3.fromRGB(232, 121, 249) }, animated = true }
	),
	item(
		"frame",
		"frame_rainbow",
		"Rainbow Frame",
		2000,
		"A spinning rainbow halo.",
		{ rainbow = true, animated = true }
	),
	item(
		"frame",
		"frame_vip",
		"VIP Frame",
		0,
		"Rotating gold crown ring.",
		{ requires = "VIP", colors = { Color3.fromRGB(255, 215, 0), Color3.fromRGB(20, 20, 20) }, animated = true }
	),
	item("frame", "frame_skull", "Spooky Frame", 0, "For those who jumpscare.", {
		requires = "Jumpscares",
		colors = { Color3.fromRGB(168, 85, 247), Color3.fromRGB(15, 23, 42) },
		animated = true,
	}),

	-- Titles
	item("title", "title_none", "No Title", 0, "Let your wins speak."),
	item("title", "title_hopper", "Link Hopper", 200, "Displayed under your name.", { text = "Link Hopper" }),
	item(
		"title",
		"title_rabbit",
		"Rabbit Hole Diver",
		400,
		"Displayed under your name.",
		{ text = "Rabbit Hole Diver" }
	),
	item(
		"title",
		"title_citation",
		"Citation Needed",
		500,
		"Displayed under your name.",
		{ text = "[citation needed]" }
	),
	item("title", "title_speed", "Speedrunner", 700, "Displayed under your name.", { text = "Speedrunner" }),
	item("title", "title_lord", "Link Lord", 1200, "Displayed under your name.", { text = "Link Lord" }),
	item("title", "title_librarian", "The Librarian", 1500, "Displayed under your name.", { text = "The Librarian" }),
	item(
		"title",
		"title_burning",
		"Always Burning",
		0,
		"Unlocked by the Burning achievement.",
		{ text = "Always Burning", achievement = "burning" }
	),
	item("title", "title_vip", "VIP", 0, "VIP exclusive title.", { text = "★ VIP ★", requires = "VIP" }),
	item(
		"title",
		"title_menace",
		"Server Menace",
		0,
		"Jumpscare Pack exclusive.",
		{ text = "Server Menace", requires = "Jumpscares" }
	),

	-- Victory + podium effects
	item("victory", "victory_confetti", "Confetti", 0, "A classic confetti burst when you win."),
	item(
		"victory",
		"victory_emoji",
		"Emoji Storm",
		600,
		"Your win rains 🏆 🎉 ⭐.",
		{ emojis = { "🏆", "🎉", "⭐", "🥳" } }
	),
	item("victory", "victory_fireworks", "Fireworks", 800, "Bursting fireworks behind the podium."),
	item("victory", "victory_lightning", "Lightning", 1200, "Thunder cracks when you take first."),
	item("victory", "victory_vip", "Royal Crown", 0, "A giant crown descends. VIP exclusive.", { requires = "VIP" }),
	item("podium", "podium_spotlight", "Spotlight", 0, "A soft spotlight on your podium."),
	item("podium", "podium_sparkles", "Sparkles", 700, "Your podium glitters."),
	item("podium", "podium_goldrain", "Gold Rain", 1400, "Coins rain on your podium."),
	item("podium", "podium_vip", "VIP Carpet", 0, "Red carpet treatment. VIP exclusive.", { requires = "VIP" }),

	-- Lobby backgrounds
	item("lobbyBg", "lobby_default", "Encyclopedia", 0, "Soft paper texture."),
	item("lobbyBg", "lobby_aurora", "Aurora", 600, "Slow-moving northern lights.", { animated = true }),
	item("lobbyBg", "lobby_grid", "Synth Grid", 600, "A scrolling neon grid.", { animated = true }),
	item("lobbyBg", "lobby_starfield", "Starfield", 900, "Drifting stars.", { animated = true }),
	item(
		"lobbyBg",
		"lobby_vip",
		"Golden Hall",
		0,
		"VIP exclusive lobby styling.",
		{ requires = "VIP", animated = true }
	),

	-- Effects: meter, page transitions, cursor trails
	item("meter", "meter_classic", "Classic Meter", 0, "Clean glow and pulse."),
	item("meter", "meter_embers", "Embers", 500, "Extra sparks when you heat up.", { particle = "✦" }),
	item("meter", "meter_frost", "Frost", 500, "Snowflakes swirl when you're cold.", { particle = "❄" }),
	item("meter", "meter_electric", "Electric", 900, "Crackling lightning.", { particle = "⚡" }),
	item(
		"meter",
		"meter_vip",
		"Golden Aura",
		0,
		"A golden aura. VIP exclusive.",
		{ requires = "VIP", particle = "★" }
	),
	item("transition", "transition_fade", "Fade", 0, "Quick crossfade between articles."),
	item("transition", "transition_slide", "Slide", 300, "Articles slide in from the side."),
	item("transition", "transition_zoom", "Zoom", 400, "Zoom into each new article."),
	item("transition", "transition_flip", "Page Flip", 600, "Flip like a real book."),
	item("cursor", "cursor_none", "No Trail", 0, "Plain cursor."),
	item("cursor", "cursor_sparkle", "Sparkle Trail", 500, "Sparkles follow your cursor.", { glyph = "✦" }),
	item("cursor", "cursor_comet", "Comet Trail", 800, "A blazing comet tail.", { glyph = "●" }),
	item(
		"cursor",
		"cursor_vip",
		"Gold Dust",
		0,
		"Gold dust trail. VIP exclusive.",
		{ requires = "VIP", glyph = "★" }
	),

	-- Sound packs (pitch/volume profiles applied to every UI sound)
	item("sound", "sound_classic", "Classic", 0, "Crisp, friendly clicks.", { pitch = 1, volume = 1 }),
	item("sound", "sound_soft", "Soft", 400, "Muted, cozy clicks.", { pitch = 0.85, volume = 0.7 }),
	item("sound", "sound_arcade", "Arcade", 600, "High-pitched arcade bleeps.", { pitch = 1.35, volume = 1 }),
	item(
		"sound",
		"sound_vip",
		"VIP Chime",
		0,
		"Bright crystalline chimes. VIP exclusive.",
		{ requires = "VIP", pitch = 1.18, volume = 1.05 }
	),

	-- Profile badges
	item("badge", "badge_none", "No Badge", 0, "No badge."),
	item("badge", "badge_bookworm", "Bookworm", 300, "📚 next to your name.", { glyph = "📚" }),
	item("badge", "badge_globe", "Globetrotter", 300, "🌍 next to your name.", { glyph = "🌍" }),
	item("badge", "badge_rocket", "Rocket", 600, "🚀 next to your name.", { glyph = "🚀" }),
	item("badge", "badge_brain", "Big Brain", 800, "🧠 next to your name.", { glyph = "🧠" }),
	item(
		"badge",
		"badge_fire",
		"On Fire",
		0,
		"🔥 — unlocked by Burning.",
		{ glyph = "🔥", achievement = "burning" }
	),
	item(
		"badge",
		"badge_record",
		"World Record",
		0,
		"🌐 — unlocked by setting a world record.",
		{ glyph = "🌐", achievement = "record_breaker" }
	),
	item("badge", "badge_crown", "Crown", 0, "👑 VIP exclusive.", { glyph = "👑", requires = "VIP" }),
	item(
		"badge",
		"badge_skull",
		"Skull",
		0,
		"💀 Jumpscare Pack exclusive.",
		{ glyph = "💀", requires = "Jumpscares" }
	),
}

Catalog.ById = {}
for index, entry in Catalog.Items do
	entry.order = index
	entry.category = Catalog.Slots[entry.slot].category
	Catalog.ById[entry.id] = entry
end

function Catalog.defaults()
	local equipped = {}
	for slot, def in Catalog.Slots do
		equipped[slot] = def.default
	end
	return equipped
end

-- Game pass perk descriptions shown in the shop.
Catalog.GamePassInfo = {
	VIP = {
		emoji = "⭐",
		tagline = "Cosmetic VIP perks — never a competitive advantage.",
		perks = {
			"VIP Gold UI theme",
			"VIP profile frame, title and crown badge",
			"Royal Crown victory + red carpet podium",
			"Golden Hall lobby styling",
			"VIP Chime sound pack and Golden Aura meter",
		},
	},
	Jumpscares = {
		emoji = "😱",
		tagline = "Unlocks funny jumpscare effects you can send to friends.",
		perks = {
			"Send jumpscares to lobby-mates (60s cooldown)",
			"Fake Crash and Scream jumpscares",
			"Spooky frame, Skull badge, Server Menace title",
			"Recipients can always disable jumpscares in Settings",
		},
	},
}

-- Targeted chaos effects. All are short, harmless and never block input.
Catalog.ChaosEffects = {
	{ id = "clown", name = "Clown Rain", emoji = "🤡", description = "Clowns rain down their screen." },
	{ id = "wobble", name = "Jelly Wobble", emoji = "🌀", description = "Their UI wobbles for a moment." },
	{
		id = "fakeburn",
		name = "Fake Burning",
		emoji = "🔥",
		description = "Their meter screams BURNING… then “jk”.",
	},
	{ id = "airhorn", name = "Airhorn", emoji = "📯", description = "An airhorn blast and a screen shake." },
	{
		id = "warning",
		name = "Dramatic Warning",
		emoji = "⚠️",
		description = "A very serious, completely fake warning.",
	},
	{
		id = "scream",
		name = "Jumpscare",
		emoji = "😱",
		description = "A sudden scream face.",
		jumpscare = true,
		requires = "Jumpscares",
	},
	{
		id = "crash",
		name = "Fake Crash",
		emoji = "💥",
		description = "A fake “WIKI HAS CRASHED” screen.",
		jumpscare = true,
		requires = "Jumpscares",
	},
}

Catalog.ChaosById = {}
for _, effect in Catalog.ChaosEffects do
	Catalog.ChaosById[effect.id] = effect
end

return Catalog
