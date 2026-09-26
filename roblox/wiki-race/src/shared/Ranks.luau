-- Rank progression. XP is derived deterministically from persisted stats, so it can never
-- drift from the numbers it is built on and cannot be bought.

local Ranks = {}

Ranks.List = {
	{ key = "Rookie", name = "Rookie", xp = 0, emoji = "🌱", color = Color3.fromRGB(148, 163, 184) },
	{ key = "Explorer", name = "Explorer", xp = 600, emoji = "🧭", color = Color3.fromRGB(56, 189, 248) },
	{ key = "Navigator", name = "Navigator", xp = 2000, emoji = "🗺️", color = Color3.fromRGB(52, 211, 153) },
	{ key = "Researcher", name = "Researcher", xp = 5000, emoji = "🔎", color = Color3.fromRGB(250, 204, 21) },
	{ key = "Scholar", name = "Scholar", xp = 11000, emoji = "🎓", color = Color3.fromRGB(251, 146, 60) },
	{ key = "WikiMaster", name = "Wiki Master", xp = 22000, emoji = "👑", color = Color3.fromRGB(244, 114, 182) },
}

local DIFFICULTY_XP = { SuperEasy = 10, Easy = 20, Medium = 40, Hard = 70, Extreme = 120, GiveUp = 150 }

function Ranks.xpFromStats(stats): number
	stats = stats or {}
	local xp = (stats.races or 0) * 30
		+ (stats.completions or 0) * 90
		+ (stats.roundWins or 0) * 60
		+ (stats.wins or 0) * 250
		+ (stats.matches or 0) * 40
	local byDifficulty = stats.difficultyCompletions or {}
	for key, bonus in DIFFICULTY_XP do
		xp += (byDifficulty[key] or 0) * bonus
	end
	return math.floor(xp)
end

function Ranks.fromXP(xp: number)
	local current, nextRank = Ranks.List[1], nil
	for i, rank in Ranks.List do
		if xp >= rank.xp then
			current = rank
			nextRank = Ranks.List[i + 1]
		end
	end
	local progress = 1
	if nextRank then
		progress = math.clamp((xp - current.xp) / (nextRank.xp - current.xp), 0, 1)
	end
	return current, nextRank, progress
end

function Ranks.fromStats(stats)
	local xp = Ranks.xpFromStats(stats)
	local rank, nextRank, progress = Ranks.fromXP(xp)
	return rank, nextRank, progress, xp
end

return Ranks
