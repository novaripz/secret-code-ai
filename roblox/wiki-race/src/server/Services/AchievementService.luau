-- Server-side achievement evaluation. Unlocks are driven only by authoritative race results.

local BadgeService = game:GetService("BadgeService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Achievements = require(Shared.Achievements)
local Net = require(Shared.Net)
local Router = require(script.Parent.Router)
local DataService = require(script.Parent.DataService)

local AchievementService = {}

local SPEED_READER_SECONDS = 45
local COMPLETIONIST = { "SuperEasy", "Easy", "Medium", "Hard", "Extreme" }

function AchievementService.unlock(player: Player, id: string): boolean
	local def = Achievements.ById[id]
	local data = DataService.get(player)
	if not def or not data or data.achievements[id] then
		return false
	end
	DataService.update(player, function(profile)
		profile.achievements[id] = os.time()
		profile.coins += def.coins or 0
	end)
	Router.push(player, Net.Events.Achievement, { id = id })
	local badgeId = Config.Badges[id]
	if badgeId and badgeId ~= 0 then
		task.spawn(pcall, BadgeService.AwardBadge, BadgeService, player.UserId, badgeId)
	end
	return true
end

local function checkCounters(player: Player, stats)
	for _, def in Achievements.List do
		if def.goal and def.stat and (stats[def.stat] or 0) >= def.goal then
			AchievementService.unlock(player, def.id)
		end
	end
end

-- result: authoritative round result for this player; ctx: { difficulty, optimal, rigged }
function AchievementService.onRoundResult(player: Player, result, ctx)
	local data = DataService.get(player)
	if not data then
		return
	end
	if result.reachedBurning then
		AchievementService.unlock(player, "burning")
	end
	if ctx.rigged then
		AchievementService.unlock(player, "rigged")
	end
	if result.gaveUp then
		AchievementService.unlock(player, "honorable_surrender")
	end
	if result.completed then
		AchievementService.unlock(player, "first_race")
		if result.time and result.time < SPEED_READER_SECONDS then
			AchievementService.unlock(player, "speed_reader")
		end
		if result.effectiveClicks and ctx.optimal and result.effectiveClicks <= ctx.optimal then
			AchievementService.unlock(player, "minimalist")
		end
		if (result.redos or 0) == 0 then
			AchievementService.unlock(player, "perfect_run")
		end
		if ctx.difficulty == "Extreme" then
			AchievementService.unlock(player, "extreme_explorer")
		elseif ctx.difficulty == "GiveUp" then
			AchievementService.unlock(player, "give_up_legend")
		end
		local all = true
		for _, key in COMPLETIONIST do
			if (data.stats.difficultyCompletions[key] or 0) == 0 then
				all = false
			end
		end
		if all then
			AchievementService.unlock(player, "completionist")
		end
	end
	checkCounters(player, data.stats)
end

function AchievementService.onMatchWon(player: Player)
	AchievementService.unlock(player, "first_win")
	local data = DataService.get(player)
	if data then
		checkCounters(player, data.stats)
	end
end

function AchievementService.onStatsChanged(player: Player)
	local data = DataService.get(player)
	if data then
		checkCounters(player, data.stats)
	end
end

return AchievementService
