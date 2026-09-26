-- Persistent player profiles.
--
-- * Session-locked: a profile is claimed by one server (JobId) at a time, so two servers can
--   never overwrite each other's progress.
-- * Autosaved, saved on leave and on shutdown (BindToClose).
-- * If DataStores are unavailable (e.g. an unpublished place in Studio) the game keeps working
--   with in-memory profiles and tells the player progress won't be saved.
-- * Only the server writes profiles. Clients receive read-only snapshots.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Catalog = require(Shared.Catalog)
local Ranks = require(Shared.Ranks)
local Net = require(Shared.Net)
local Signal = require(Shared.Signal)
local Router = require(script.Parent.Router)

local DataService = {}
DataService.ProfileLoaded = Signal.new()

local store = nil
local memoryMode = false
local records = {} -- [Player] = { data, dirty, offline, loaded }
local snapshotProviders = {}
local pushScheduled = {}

local function template()
	return {
		version = 1,
		stats = {
			races = 0,
			matches = 0,
			wins = 0,
			roundWins = 0,
			completions = 0,
			giveUps = 0,
			totalClicks = 0,
			totalRedos = 0,
			fastestTime = nil,
			fewestClicks = nil,
			bestRoundScore = 0,
			totalScore = 0,
			difficultyCompletions = {},
			burningReached = 0,
			freeRoamPages = 0,
			rigsSurvived = 0,
			recordsSet = 0,
		},
		achievements = {},
		coins = 0,
		owned = {},
		equipped = Catalog.defaults(),
		settings = {
			sfx = 0.8,
			jumpscares = true,
			chaos = true,
			reducedMotion = false,
			hints = true,
		},
		rigCredits = 0,
		receipts = {},
		receiptOrder = {},
		firstJoin = os.time(),
	}
end

-- Adds any fields introduced by newer versions without touching existing values.
local function reconcile(data, defaults)
	for key, value in defaults do
		if data[key] == nil then
			data[key] = type(value) == "table" and table.clone(value) or value
		elseif type(value) == "table" and type(data[key]) == "table" then
			reconcile(data[key], value)
		end
	end
	return data
end

local function keyFor(userId: number): string
	return "user_" .. userId
end

local function takeSession(key: string)
	local claimed = false
	local ok, result = pcall(function()
		return store:UpdateAsync(key, function(old)
			old = old or template()
			local lock = old._lock
			if lock and lock.job ~= game.JobId and os.time() - (lock.t or 0) < Config.Data.SessionLockSeconds then
				claimed = false
				return nil -- someone else holds it; don't write
			end
			old._lock = { job = game.JobId, t = os.time() }
			claimed = true
			return old
		end)
	end)
	return ok, claimed, result
end

local function loadProfile(player: Player)
	if memoryMode then
		return reconcile(template(), template()), false
	end
	local key = keyFor(player.UserId)
	for attempt = 1, 7 do
		local ok, claimed, result = takeSession(key)
		if ok and claimed and type(result) == "table" then
			return reconcile(result, template()), false
		end
		if not player.Parent then
			return nil, false
		end
		if ok and not claimed and attempt >= 5 then
			-- The other server is almost certainly gone; steal the stale lock.
			local stolen = false
			local stealOk, stealResult = pcall(function()
				return store:UpdateAsync(key, function(old)
					old = old or template()
					old._lock = { job = game.JobId, t = os.time() }
					stolen = true
					return old
				end)
			end)
			if stealOk and stolen and type(stealResult) == "table" then
				return reconcile(stealResult, template()), false
			end
		end
		task.wait(math.min(2 ^ attempt * 0.5, 10))
	end
	return reconcile(template(), template()), true
end

local function saveProfile(player: Player, release: boolean): boolean
	local record = records[player]
	if not record or record.offline or memoryMode or not record.loaded then
		return true
	end
	local data = record.data
	local key = keyFor(player.UserId)
	local lostLock = false
	local ok, err = pcall(function()
		store:UpdateAsync(key, function(old)
			if old and old._lock and old._lock.job ~= game.JobId then
				lostLock = true
				return nil
			end
			if release then
				data._lock = nil
			else
				data._lock = { job = game.JobId, t = os.time() }
			end
			return data
		end)
	end)
	if not ok then
		warn(("[WikiRace] Save failed for %s: %s"):format(player.Name, tostring(err)))
		return false
	end
	if lostLock then
		warn(("[WikiRace] %s's profile is owned by another server; not overwriting."):format(player.Name))
		record.offline = true
		return false
	end
	record.dirty = false
	return true
end

function DataService.init()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.Data.ProfileStore)
	end)
	if ok then
		store = result
		-- Probe access; unpublished places in Studio throw here.
		local probeOk = pcall(function()
			store:GetAsync("__probe")
		end)
		if not probeOk then
			memoryMode = true
		end
	else
		memoryMode = true
	end
	if memoryMode then
		warn("[WikiRace] DataStores unavailable — using in-memory profiles (progress will not persist).")
	end

	local function onPlayerAdded(player: Player)
		local data, offline = loadProfile(player)
		if not player.Parent or not data then
			return
		end
		data.lastJoin = os.time()
		records[player] = { data = data, dirty = true, offline = offline or memoryMode, loaded = true }
		DataService.ProfileLoaded:Fire(player, data)
		DataService.pushProfile(player)
		if offline then
			Router.toast(
				player,
				"Couldn't load your saved progress. Playing with a temporary profile this session.",
				"error"
			)
		elseif memoryMode and RunService:IsStudio() then
			Router.toast(player, "Studio: DataStores disabled — stats reset when you stop.", "info")
		end
	end

	Players.PlayerAdded:Connect(onPlayerAdded)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	Players.PlayerRemoving:Connect(function(player)
		saveProfile(player, true)
		records[player] = nil
		pushScheduled[player] = nil
	end)

	task.spawn(function()
		while true do
			task.wait(Config.Data.AutosaveSeconds)
			for player, record in records do
				if record.dirty then
					task.spawn(saveProfile, player, false)
					task.wait(0.5)
				end
			end
		end
	end)

	game:BindToClose(function()
		if RunService:IsStudio() and memoryMode then
			return
		end
		local pending = 0
		for player in records do
			pending += 1
			task.spawn(function()
				saveProfile(player, true)
				pending -= 1
			end)
		end
		local deadline = os.clock() + 25
		while pending > 0 and os.clock() < deadline do
			task.wait(0.1)
		end
	end)

	Router.on(Net.Actions.UpdateSettings, function(player, payload)
		local data = DataService.get(player)
		if not data then
			return nil, "Profile still loading"
		end
		local settings = data.settings
		if type(payload.sfx) == "number" and payload.sfx == payload.sfx then
			settings.sfx = math.clamp(payload.sfx, 0, 1)
		end
		for _, key in { "jumpscares", "chaos", "reducedMotion", "hints" } do
			if type(payload[key]) == "boolean" then
				settings[key] = payload[key]
			end
		end
		DataService.markChanged(player)
		return settings
	end, { rate = 2, burst = 6 })
end

function DataService.isPersistent(): boolean
	return not memoryMode
end

function DataService.get(player: Player)
	local record = records[player]
	return record and record.data or nil
end

function DataService.waitFor(player: Player, timeout: number?)
	local deadline = os.clock() + (timeout or 15)
	while player.Parent and os.clock() < deadline do
		local data = DataService.get(player)
		if data then
			return data
		end
		task.wait(0.1)
	end
	return DataService.get(player)
end

-- Mutates a profile through a callback, marks it dirty and schedules a client refresh.
function DataService.update(player: Player, mutate)
	local record = records[player]
	if not record then
		return false
	end
	mutate(record.data)
	record.dirty = true
	DataService.markChanged(player)
	return true
end

function DataService.markChanged(player: Player)
	local record = records[player]
	if record then
		record.dirty = true
	end
	if pushScheduled[player] then
		return
	end
	pushScheduled[player] = true
	task.delay(0.2, function()
		pushScheduled[player] = nil
		if player.Parent then
			DataService.pushProfile(player)
		end
	end)
end

function DataService.saveNow(player: Player): boolean
	return saveProfile(player, false)
end

-- Other services add fields (game passes, derived ownership) to the client snapshot.
function DataService.addSnapshotProvider(provider)
	table.insert(snapshotProviders, provider)
end

function DataService.snapshot(player: Player)
	local data = DataService.get(player)
	if not data then
		return nil
	end
	local rank, nextRank, progress, xp = Ranks.fromStats(data.stats)
	local snap = {
		userId = player.UserId,
		coins = data.coins,
		owned = data.owned,
		equipped = data.equipped,
		settings = data.settings,
		stats = data.stats,
		achievements = data.achievements,
		rigCredits = data.rigCredits,
		rank = {
			key = rank.key,
			name = rank.name,
			emoji = rank.emoji,
			xp = xp,
			floor = rank.xp,
			next = nextRank and nextRank.xp or nil,
			nextName = nextRank and nextRank.name or nil,
			progress = progress,
		},
		persistent = not memoryMode and not (records[player] and records[player].offline),
	}
	for _, provider in snapshotProviders do
		provider(player, snap)
	end
	return snap
end

function DataService.pushProfile(player: Player)
	local snap = DataService.snapshot(player)
	if snap then
		Router.push(player, Net.Events.Profile, snap)
	end
end

-- Read-only lookup of an offline player's saved profile (used by "inspect player").
function DataService.readOffline(userId: number)
	if memoryMode or not store then
		return nil
	end
	local ok, result = pcall(function()
		return store:GetAsync(keyFor(userId))
	end)
	if ok and type(result) == "table" then
		return reconcile(result, template())
	end
	return nil
end

-- Idempotent developer-product bookkeeping.
function DataService.hasReceipt(player: Player, purchaseId: string): boolean
	local data = DataService.get(player)
	return data ~= nil and data.receipts[purchaseId] == true
end

function DataService.recordReceipt(player: Player, purchaseId: string)
	DataService.update(player, function(data)
		data.receipts[purchaseId] = true
		table.insert(data.receiptOrder, purchaseId)
		while #data.receiptOrder > Config.Data.MaxReceiptHistory do
			local oldest = table.remove(data.receiptOrder, 1)
			data.receipts[oldest] = nil
		end
	end)
end

return DataService
