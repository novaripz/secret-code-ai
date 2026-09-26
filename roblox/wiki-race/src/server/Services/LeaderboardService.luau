-- Global leaderboards (OrderedDataStores) for wins, completions and rank XP, plus the
-- GetLeaderboards / GetProfile requests. Writes are throttled per player; reads are cached.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Ranks = require(Shared.Ranks)
local Net = require(Shared.Net)
local Router = require(script.Parent.Router)
local DataService = require(script.Parent.DataService)
local CosmeticService = require(script.Parent.CosmeticService)
local RecordService = require(script.Parent.RecordService)
local Validate = require(script.Parent.Validate)

local LeaderboardService = {}

local ordered = {} -- board → OrderedDataStore
local boards = { wins = {}, completions = {}, xp = {} }
local lastWrite = {}
local nameCache = {}
local profileCache = {}

local function nameOf(userId: number): string
	if nameCache[userId] then
		return nameCache[userId]
	end
	local player = Players:GetPlayerByUserId(userId)
	if player then
		nameCache[userId] = player.DisplayName
		return player.DisplayName
	end
	local ok, name = pcall(Players.GetNameFromUserIdAsync, Players, userId)
	nameCache[userId] = ok and name or ("Player " .. userId)
	return nameCache[userId]
end

local function valuesFor(data)
	return {
		wins = data.stats.wins,
		completions = data.stats.completions,
		xp = Ranks.xpFromStats(data.stats),
	}
end

local function refresh()
	for board, store in ordered do
		local ok, pages = pcall(store.GetSortedAsync, store, false, Config.Leaderboards.Size)
		if ok then
			local rows = {}
			for index, entry in pages:GetCurrentPage() do
				local userId = tonumber(entry.key)
				if userId then
					table.insert(rows, { rank = index, userId = userId, name = nameOf(userId), value = entry.value })
				end
			end
			boards[board] = rows
		end
	end
	if next(ordered) == nil then
		-- Studio / no DataStores: build boards from players on this server.
		for _, board in { "wins", "completions", "xp" } do
			local rows = {}
			for _, player in Players:GetPlayers() do
				local data = DataService.get(player)
				if data then
					table.insert(
						rows,
						{ userId = player.UserId, name = player.DisplayName, value = valuesFor(data)[board] }
					)
				end
			end
			table.sort(rows, function(a, b)
				return a.value > b.value
			end)
			for index, row in rows do
				row.rank = index
			end
			boards[board] = rows
		end
	end
end

function LeaderboardService.submit(player: Player)
	local data = DataService.get(player)
	if not data or next(ordered) == nil then
		return
	end
	local now = os.clock()
	if lastWrite[player.UserId] and now - lastWrite[player.UserId] < 60 then
		return
	end
	lastWrite[player.UserId] = now
	local values = valuesFor(data)
	task.spawn(function()
		for board, store in ordered do
			pcall(store.SetAsync, store, tostring(player.UserId), values[board])
		end
	end)
end

local function publicProfile(userId: number)
	local player = Players:GetPlayerByUserId(userId)
	local data, look, name, displayName
	if player then
		data = DataService.get(player)
		look = CosmeticService.look(player)
		name, displayName = player.Name, player.DisplayName
	else
		local cached = profileCache[userId]
		if cached and os.clock() - cached.at < 120 then
			return cached.profile
		end
		data = DataService.readOffline(userId)
		name = nameOf(userId)
		displayName = name
	end
	if not data then
		return nil
	end
	local rank, _, progress, xp = Ranks.fromStats(data.stats)
	local profile = {
		userId = userId,
		name = name,
		displayName = displayName,
		online = player ~= nil,
		stats = data.stats,
		achievements = data.achievements,
		equipped = player and CosmeticService.equipped(player) or data.equipped,
		look = look,
		rank = { name = rank.name, emoji = rank.emoji, xp = xp, progress = progress },
	}
	if not player then
		profileCache[userId] = { profile = profile, at = os.clock() }
	end
	return profile
end

function LeaderboardService.init()
	if DataService.isPersistent() then
		for board, storeName in
			{
				wins = Config.Leaderboards.Stores.Wins,
				completions = Config.Leaderboards.Stores.Completions,
				xp = Config.Leaderboards.Stores.XP,
			}
		do
			local ok, store = pcall(DataStoreService.GetOrderedDataStore, DataStoreService, storeName)
			if ok then
				ordered[board] = store
			end
		end
	end
	task.spawn(function()
		while true do
			refresh()
			task.wait(next(ordered) and Config.Leaderboards.RefreshSeconds or 30)
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		lastWrite[player.UserId] = nil
		LeaderboardService.submit(player)
	end)

	Router.on(Net.Actions.GetLeaderboards, function()
		if next(ordered) == nil then
			refresh()
		end
		return { boards = boards, records = RecordService.all() }
	end, { rate = 1, burst = 3 })

	Router.on(Net.Actions.GetProfile, function(player, payload)
		local userId = Validate.userId(payload.userId) or player.UserId
		local profile = publicProfile(userId)
		if not profile then
			return nil, "That profile isn't available right now"
		end
		return profile
	end, { rate = 2, burst = 5 })
end

return LeaderboardService
