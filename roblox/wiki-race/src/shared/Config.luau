-- Central tunables for Wiki Race. Anything a designer might want to tweak lives here.
-- Asset / product IDs of 0 mean "not configured yet" — every system degrades gracefully.

local Config = {}

Config.GameName = "Wiki Race"
Config.Version = "1.0.0"

Config.Lobby = {
	MaxPlayers = 10,
	MaxLobbiesPerServer = 16,
	NameMaxLength = 28,
	CodeLength = 6,
	CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
	-- Public lobbies auto-start this many seconds after every member is ready (min 2 players).
	PublicAutoStartSeconds = 8,
	-- Standing public lobbies that always exist on every server, host-less when empty.
	StandingLobbies = {
		{ name = "Quick Race · Easy", difficulty = "Easy", timer = "300", rounds = 3 },
		{ name = "Quick Race · Medium", difficulty = "Medium", timer = "300", rounds = 3 },
		{ name = "Speed Round · Super Easy", difficulty = "SuperEasy", timer = "120", rounds = 5 },
	},
	-- Cross-server lobby directory (MemoryStore). Entries expire if a server stops refreshing.
	DirectoryTTL = 75,
	DirectoryRefresh = 25,
}

Config.Race = {
	MinStartDistance = 4, -- a round may never start Warm/Hot/Burning
	FreezingDistance = 5, -- Medium/Hard/Extreme must start at least this far away
	TimerOptions = { "120", "300", "unlimited", "custom" },
	DefaultTimer = "300",
	CustomTimerMin = 30,
	CustomTimerMax = 3600,
	DefaultCustomSeconds = 180,
	RoundOptions = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0 }, -- 0 = unlimited (host ends the match)
	DefaultRounds = 3,
	-- Reveal choreography (seconds). The race clock starts after all three phases.
	RevealStartSeconds = 3.4,
	RevealTargetSeconds = 4.6,
	CountdownSeconds = 3,
	RoundResultsSeconds = 15,
	-- Unlimited timer: once half the lobby has finished, everyone else gets this long.
	UnlimitedClosingSeconds = 90,
	-- Reference duration used by the time score when the timer is unlimited.
	UnlimitedReferenceSeconds = 300,
	MaxClicksPerRound = 500,
	OpponentUpdateHz = 4,
	RollTitleCount = 36,
}

Config.Coins = {
	RoundComplete = 20,
	RoundFirstPlace = 15,
	MatchPlayed = 10,
	MatchWin = 60,
	FreeRoamPerTenPages = 5,
}

Config.GamePasses = {
	VIP = { id = 0, name = "VIP", price = 299 },
	Jumpscares = { id = 0, name = "Jumpscare Pack", price = 149 },
}

Config.Products = {
	ServerRig = { id = 0, name = "Server Rig", price = 199 },
	RigPlayer = { id = 0, name = "Rig a Player", price = 49 },
	Coins500 = { id = 0, name = "500 Wiki Coins", price = 49, coins = 500 },
	Coins1500 = { id = 0, name = "1,500 Wiki Coins", price = 129, coins = 1500 },
	Coins5000 = { id = 0, name = "5,000 Wiki Coins", price = 349, coins = 5000 },
}

Config.Chaos = {
	-- Rounds that START within this window after a Server Rig are also rigged.
	ServerRigWindowSeconds = 90,
	ServerRigCooldownSeconds = 45,
	-- A rigged in-progress round always leaves players at least this long to react.
	ServerRigMinRemainingSeconds = 90,
	RigPlayerSenderCooldown = 20,
	RigPlayerTargetProtection = 30,
	JumpscareSenderCooldown = 60,
	EffectSeconds = 4,
}

-- Studio conveniences. These are ignored on live servers.
Config.Studio = {
	GrantAllGamePasses = true,
	AllowDebugPurchases = true,
}

Config.Data = {
	ProfileStore = "WikiRace_Profiles_v1",
	RecordStore = "WikiRace_Records_v1",
	AutosaveSeconds = 120,
	SessionLockSeconds = 900,
	MaxReceiptHistory = 60,
}

Config.Leaderboards = {
	RefreshSeconds = 300,
	Size = 50,
	Stores = {
		Wins = "WikiRace_LB_Wins_v1",
		Completions = "WikiRace_LB_Completions_v1",
		XP = "WikiRace_LB_XP_v1",
	},
}

-- Roblox badge IDs for achievements (optional). Leave 0 to only track in-game.
Config.Badges = {
	first_race = 0,
	burning = 0,
	speed_reader = 0,
	minimalist = 0,
	perfect_run = 0,
	extreme_explorer = 0,
	marathon = 0,
}

-- Uploaded sound asset IDs. Generated .wav files for every key live in /assets/sounds.
-- Upload them (Asset Manager or tools/upload_assets.py) and paste the IDs here.
Config.Sounds = {
	click = "",
	hover = "",
	link = "",
	back = "",
	error = "",
	tick = "",
	revealStart = "",
	revealTarget = "",
	whoosh = "",
	countdown = "",
	go = "",
	tempUp = "",
	tempDown = "",
	burning = "",
	heartbeat = "",
	complete = "",
	finishOther = "",
	roundEnd = "",
	drumroll = "",
	podium = "",
	fanfare = "",
	award = "",
	achievement = "",
	coin = "",
	purchase = "",
	siren = "",
	boom = "",
	jumpscare = "",
	boing = "",
	airhorn = "",
	freeze = "",
}

-- Optional page images hosted on Roblox (rbxassetid://...). Keyed by page id (slug of the title).
-- Pages without an image get a generated category card instead.
Config.PageImages = {
	-- pizza = "rbxassetid://0",
}

return Config
