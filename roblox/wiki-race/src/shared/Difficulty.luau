-- Difficulty definitions. These drive real challenge generation on the server (distance band,
-- how famous the pages are, how many routes lead into the target) as well as redo budgets and
-- scoring multipliers. `fame`: 1 = household name, 2 = well known, 3 = niche.

local Difficulty = {}

Difficulty.Order = { "SuperEasy", "Easy", "Medium", "Hard", "Extreme", "GiveUp" }

-- Difficulties that can be selected as a lobby's base setting.
Difficulty.Selectable = { "SuperEasy", "Easy", "Medium", "Hard", "Extreme", "GiveUp" }

-- Difficulties that have their own world-record board.
Difficulty.RecordBoards = { "SuperEasy", "Easy", "Medium", "Hard", "Extreme" }

Difficulty.Defs = {
	SuperEasy = {
		key = "SuperEasy",
		name = "Super Easy",
		emoji = "🟢",
		color = Color3.fromRGB(74, 222, 128),
		description = "Famous pages with obvious connections. Great for your first race.",
		minDistance = 4,
		maxDistance = 4,
		targetFame = { 1, 1 },
		startFame = { 1, 2 },
		minTargetInDegree = 5,
		crossGroup = "prefer",
		redos = 8,
		multiplier = 0.8,
	},
	Easy = {
		key = "Easy",
		name = "Easy",
		emoji = "🔵",
		color = Color3.fromRGB(96, 165, 250),
		description = "Intuitive relationships that take a little navigating.",
		minDistance = 4,
		maxDistance = 5,
		targetFame = { 1, 2 },
		startFame = { 1, 3 },
		minTargetInDegree = 3,
		crossGroup = "prefer",
		redos = 6,
		multiplier = 1.0,
	},
	Medium = {
		key = "Medium",
		name = "Medium",
		emoji = "🟡",
		color = Color3.fromRGB(250, 204, 21),
		description = "Real route planning. Always starts Freezing.",
		minDistance = 5,
		maxDistance = 5,
		mustFreeze = true,
		targetFame = { 1, 2 },
		startFame = { 1, 3 },
		minTargetInDegree = 2,
		crossGroup = "require",
		redos = 4,
		multiplier = 1.3,
	},
	Hard = {
		key = "Hard",
		name = "Hard",
		emoji = "🟠",
		color = Color3.fromRGB(251, 146, 60),
		description = "Less obvious connections and longer routes. Always starts Freezing.",
		minDistance = 5,
		maxDistance = 7,
		preferDistance = 6,
		mustFreeze = true,
		targetFame = { 2, 3 },
		startFame = { 1, 3 },
		crossGroup = "require",
		redos = 3,
		multiplier = 1.6,
	},
	Extreme = {
		key = "Extreme",
		name = "Extreme",
		emoji = "🔴",
		color = Color3.fromRGB(248, 113, 113),
		description = "Obscure pairings with the longest routes in the wiki. Always starts Freezing.",
		minDistance = 6,
		maxDistance = 8,
		preferDistance = 7,
		mustFreeze = true,
		targetFame = { 3, 3 },
		startFame = { 2, 3 },
		maxTargetInDegree = 3,
		crossGroup = "require",
		redos = 2,
		multiplier = 2.0,
	},
	GiveUp = {
		key = "GiveUp",
		name = "Give Up Mode",
		emoji = "🏳️",
		color = Color3.fromRGB(203, 213, 225),
		description = "Absurd pairings, zero redos. Surrendering is allowed — and tracked.",
		minDistance = 6,
		maxDistance = 99,
		preferFarthest = true,
		mustFreeze = true,
		targetFame = { 3, 3 },
		startFame = { 1, 3 },
		crossGroup = "require",
		redos = 0,
		multiplier = 1.5,
		giveUpMode = true,
	},
}

function Difficulty.get(key: string?)
	return (key and Difficulty.Defs[key]) or Difficulty.Defs.Easy
end

function Difficulty.isValid(key: any): boolean
	return type(key) == "string" and Difficulty.Defs[key] ~= nil
end

-- The absolute minimum starting distance for a difficulty. Never relaxed.
function Difficulty.floor(key: string, minStart: number, freezing: number): number
	local def = Difficulty.get(key)
	local floor = math.max(minStart, def.minDistance)
	if def.mustFreeze then
		floor = math.max(floor, freezing)
	end
	return floor
end

return Difficulty
