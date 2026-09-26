-- Free Roam practice: untimed browsing with search, categories, random pages, and full
-- back/forward/refresh/history. Search and arbitrary jumps are only available here — never
-- during a race, where the only way to move is to follow a real link.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Difficulty = require(Shared.Difficulty)
local Net = require(Shared.Net)

local Router = require(script.Parent.Router)
local Validate = require(script.Parent.Validate)
local WikiService = require(script.Parent.WikiService)
local DataService = require(script.Parent.DataService)
local AchievementService = require(script.Parent.AchievementService)
local LobbyService = require(script.Parent.LobbyService)
local RaceSession = require(script.Parent.Parent.Race.RaceSession)

local FreeRoamService = {}

local sessions = {} -- [userId] = RaceSession (mode "free")
local rng = Random.new()

local function result(session)
	return {
		page = WikiService.repo:payload(session:current()),
		state = session:snapshot(),
	}
end

local function countVisit(player: Player, before: number, session)
	if session.visitedCount <= before then
		return
	end
	local visits = 0
	DataService.update(player, function(data)
		data.stats.freeRoamPages += 1
		visits = data.stats.freeRoamPages
		if visits % 10 == 0 then
			data.coins += Config.Coins.FreeRoamPerTenPages
		end
	end)
	AchievementService.onStatsChanged(player)
end

-- Arbitrary jumps (search results, categories, random) are free-roam only.
local function jump(session, pageId: string)
	session.history:push(pageId)
	session:_arrive(os.clock())
end

function FreeRoamService.init()
	local A = Net.Actions

	Router.on(A.StartFreeRoam, function(player, payload)
		local pageId = Validate.id(payload.pageId)
		if not pageId or not WikiService.repo:exists(pageId) then
			pageId = WikiService.repo:randomId(rng)
		end
		local session = RaceSession.new({ graph = WikiService.graph, start = pageId, mode = "free" })
		sessions[player.UserId] = session
		return result(session)
	end, { rate = 1, burst = 3 })

	Router.on(A.FreeNavigate, function(player, payload)
		local session = sessions[player.UserId]
		if not session then
			return nil, "Free Roam isn't open."
		end
		local op = Validate.string(payload.op, 12)
		local before = session.visitedCount
		if op == "open" then
			local pageId = Validate.id(payload.pageId)
			if not pageId or not WikiService.repo:exists(pageId) then
				return nil, "That page doesn't exist."
			end
			jump(session, pageId)
		elseif op == "random" then
			jump(session, WikiService.repo:randomId(rng))
		else
			if not op or not RaceSession.Ops[op] or op == "restart" then
				return nil, "Unknown action."
			end
			local argument = nil
			if op == "link" or op == "history" then
				argument = Validate.id(payload.pageId)
			end
			local ok, err = session:apply(op, argument, os.clock())
			if not ok then
				return nil, err == "NotALink" and "That link isn't on this page." or "Can't go there."
			end
		end
		countVisit(player, before, session)
		return result(session)
	end, { rate = 8, burst = 14 })

	Router.on(A.Search, function(player, payload)
		if LobbyService.isRacing(player) then
			return nil, "Search is disabled during races — follow the links!"
		end
		local query = Validate.string(payload.query, 60)
		if not query then
			return {}
		end
		return WikiService.repo:search(query, 12)
	end, { rate = 5, burst = 10 })

	Router.on(A.GetCategory, function(player, payload)
		if LobbyService.isRacing(player) then
			return nil, "Categories can't be browsed during a race."
		end
		local name = Validate.string(payload.name, 60)
		if not name then
			return { categories = WikiService.repo:categoryList() }
		end
		local category = WikiService.repo:category(name)
		if not category then
			return nil, "Unknown category."
		end
		return category
	end, { rate = 3, burst = 6 })

	Router.on(A.StartSoloRace, function(player, payload)
		local difficulty = payload.difficulty
		if not Difficulty.isValid(difficulty) then
			return nil, "Pick a difficulty."
		end
		local fixedStart = nil
		if payload.fromCurrent == true then
			local session = sessions[player.UserId]
			fixedStart = session and session:current()
		end
		return LobbyService.startSolo(player, difficulty, fixedStart)
	end, { rate = 0.5, burst = 2 })

	Players.PlayerRemoving:Connect(function(player)
		sessions[player.UserId] = nil
	end)
end

return FreeRoamService
