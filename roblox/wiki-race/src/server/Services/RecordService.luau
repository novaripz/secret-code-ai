-- Global world records (server-authoritative only).
--
-- Boards: fastest overall, fastest per difficulty, fewest clicks, and per-challenge fastest
-- times ("pair:<start>><target>") for future challenge-specific leaderboards. Submissions come
-- only from finished rounds computed by the server; rigged rounds never count. Records are
-- compared inside UpdateAsync so two servers can't clobber each other, and new records are
-- broadcast to every server with MessagingService.

local DataStoreService = game:GetService("DataStoreService")
local MessagingService = game:GetService("MessagingService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Difficulty = require(Shared.Difficulty)
local Net = require(Shared.Net)
local Router = require(script.Parent.Router)
local DataService = require(script.Parent.DataService)
local AchievementService = require(script.Parent.AchievementService)

local RecordService = {}

local GLOBAL_KEY = "global_v1"
local TOPIC = "WikiRaceRecords_v1"

local store = nil
local cache = {} -- board → record
local pairCache = {}

local function better(board: string, candidate, existing): boolean
	if not existing then
		return true
	end
	if board == "fewest_clicks" then
		if candidate.clicks ~= existing.clicks then
			return candidate.clicks < existing.clicks
		end
		return candidate.ms < existing.ms
	end
	return candidate.ms < existing.ms
end

local function refresh()
	if not store then
		return
	end
	local ok, result = pcall(store.GetAsync, store, GLOBAL_KEY)
	if ok and type(result) == "table" then
		cache = result
	end
end

function RecordService.init()
	local ok, result = pcall(DataStoreService.GetDataStore, DataStoreService, Config.Data.RecordStore)
	if ok and DataService.isPersistent() then
		store = result
	end
	refresh()
	pcall(function()
		MessagingService:SubscribeAsync(TOPIC, function(message)
			local data = message.Data
			if type(data) == "table" and type(data.board) == "string" and type(data.record) == "table" then
				if better(data.board, data.record, cache[data.board]) then
					cache[data.board] = data.record
				end
				Router.pushAll(Net.Events.RecordBroken, data)
			end
		end)
	end)
	task.spawn(function()
		while true do
			task.wait(Config.Leaderboards.RefreshSeconds)
			refresh()
		end
	end)
end

function RecordService.all()
	return cache
end

local function commit(board: string, record)
	if not store then
		if better(board, record, cache[board]) then
			cache[board] = record
			return true
		end
		return false
	end
	local won = false
	local ok = pcall(function()
		store:UpdateAsync(GLOBAL_KEY, function(old)
			old = old or {}
			if better(board, record, old[board]) then
				old[board] = record
				won = true
				return old
			end
			cache = old
			won = false
			return nil
		end)
	end)
	if ok and won then
		cache[board] = record
	end
	return ok and won
end

local function commitPair(pairKey: string, record)
	local existing = pairCache[pairKey]
	if existing and existing.ms <= record.ms then
		return false
	end
	if not store then
		pairCache[pairKey] = record
		return true
	end
	local won = false
	pcall(function()
		store:UpdateAsync("pair_" .. pairKey, function(old)
			if old and old.ms <= record.ms then
				pairCache[pairKey] = old
				won = false
				return nil
			end
			won = true
			return record
		end)
	end)
	if won then
		pairCache[pairKey] = record
	end
	return won
end

-- Called by Match with a finished, server-scored result.
function RecordService.submit(player: Player, result, ctx)
	if not result.completed or ctx.rigged or not result.time then
		return
	end
	local record = {
		ms = math.floor(result.time * 1000 + 0.5),
		clicks = result.clicks,
		userId = player.UserId,
		name = player.DisplayName,
		start = ctx.startTitle,
		target = ctx.targetTitle,
		difficulty = ctx.difficulty,
		at = os.time(),
	}
	local boards = { "fastest_overall", "fewest_clicks" }
	if table.find(Difficulty.RecordBoards, ctx.difficulty) then
		table.insert(boards, "fastest_" .. ctx.difficulty)
	end
	task.spawn(function()
		local brokeAny = false
		for _, board in boards do
			if better(board, record, cache[board]) and commit(board, record) then
				brokeAny = true
				local payload = { board = board, record = record }
				Router.pushAll(Net.Events.RecordBroken, payload)
				pcall(MessagingService.PublishAsync, MessagingService, TOPIC, payload)
			end
		end
		if ctx.pairKey then
			commitPair(ctx.pairKey, record)
		end
		if brokeAny and player.Parent then
			DataService.update(player, function(data)
				data.stats.recordsSet += 1
			end)
			AchievementService.unlock(player, "record_breaker")
		end
	end)
end

return RecordService
