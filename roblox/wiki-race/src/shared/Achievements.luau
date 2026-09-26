-- Achievement definitions (display data). Unlock conditions are evaluated only on the server
-- in AchievementService; `goal` + `stat` describe progress bars for counter achievements.

local Achievements = {}

Achievements.List = {
	{ id = "first_race", name = "First Race", emoji = "🏁", coins = 50, description = "Complete your first race." },
	{ id = "burning", name = "Burning", emoji = "🔥", coins = 25, description = "Reach Burning status." },
	{
		id = "speed_reader",
		name = "Speed Reader",
		emoji = "⚡",
		coins = 150,
		description = "Finish a challenge in under 45 seconds.",
	},
	{
		id = "minimalist",
		name = "Minimalist",
		emoji = "🎯",
		coins = 150,
		description = "Finish using the shortest possible number of clicks.",
	},
	{
		id = "perfect_run",
		name = "Perfect Run",
		emoji = "✨",
		coins = 75,
		description = "Finish a challenge without a redo.",
	},
	{
		id = "extreme_explorer",
		name = "Extreme Explorer",
		emoji = "🧭",
		coins = 250,
		description = "Complete an Extreme challenge.",
	},
	{
		id = "marathon",
		name = "Marathon",
		emoji = "🏃",
		coins = 300,
		description = "Play 50 races.",
		goal = 50,
		stat = "races",
	},
	{ id = "first_win", name = "First Victory", emoji = "🥇", coins = 100, description = "Win a multiplayer match." },
	{
		id = "hat_trick",
		name = "Hat Trick",
		emoji = "🎩",
		coins = 200,
		description = "Win 3 multiplayer matches.",
		goal = 3,
		stat = "wins",
	},
	{
		id = "honorable_surrender",
		name = "Honorable Surrender",
		emoji = "🏳️",
		coins = 10,
		description = "Give up a race. Sometimes the wiki wins.",
	},
	{ id = "rigged", name = "It's Rigged!", emoji = "🎰", coins = 40, description = "Race through a rigged round." },
	{
		id = "give_up_legend",
		name = "Never Surrender",
		emoji = "🦾",
		coins = 400,
		description = "Complete a Give Up Mode challenge.",
	},
	{
		id = "record_breaker",
		name = "Record Breaker",
		emoji = "🌍",
		coins = 500,
		description = "Set a world record.",
	},
	{
		id = "completionist",
		name = "Completionist",
		emoji = "🗺️",
		coins = 300,
		description = "Complete a race on every difficulty from Super Easy to Extreme.",
	},
	{
		id = "encyclopedic",
		name = "Encyclopedic",
		emoji = "📚",
		coins = 500,
		description = "Complete 100 races.",
		goal = 100,
		stat = "completions",
	},
	{
		id = "wanderer",
		name = "Wanderer",
		emoji = "🚶",
		coins = 100,
		description = "Visit 100 pages in Free Roam.",
		goal = 100,
		stat = "freeRoamPages",
	},
}

Achievements.ById = {}
for index, achievement in Achievements.List do
	achievement.order = index
	Achievements.ById[achievement.id] = achievement
end

return Achievements
