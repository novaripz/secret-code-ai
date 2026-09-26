-- Cross-server lobby directory backed by MemoryStore.
--
-- Every server publishes its lobbies (with a short TTL) so the public lobby browser can list
-- lobbies on other servers and lobby codes work across servers: joining a code that lives
-- elsewhere teleports the player straight into that server, where they auto-join by code.
-- Disabled in Studio (no JobId / teleports), where lobbies are simply local.

local MemoryStoreService = game:GetService("MemoryStoreService")
local RunService = game:GetService("RunService")
local TeleportService = game:GetService("TeleportService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("WikiRaceShared").Config)

local LobbyDirectory = {}

local enabled = false
local map = nil
local remoteCache = { list = {}, at = 0 }

local function entryFor(lobby)
	return {
		jobId = game.JobId,
		placeId = game.PlaceId,
		code = lobby.code,
		name = lobby.name,
		isPublic = lobby.isPublic,
		count = #lobby.members,
		max = Config.Lobby.MaxPlayers,
		difficulty = lobby.settings.difficulty,
		rounds = lobby.settings.rounds,
		timer = lobby.settings.timer,
		customSeconds = lobby.settings.customSeconds,
		state = lobby.state,
	}
end

function LobbyDirectory.init(getLobbies)
	if RunService:IsStudio() or game.JobId == "" then
		return
	end
	local ok, result = pcall(MemoryStoreService.GetSortedMap, MemoryStoreService, "WikiRaceLobbies_v1")
	if not ok then
		warn("[WikiRace] Lobby directory unavailable: " .. tostring(result))
		return
	end
	map = result
	enabled = true
	task.spawn(function()
		while true do
			for _, lobby in getLobbies() do
				if not lobby.solo and #lobby.members > 0 then
					pcall(map.SetAsync, map, lobby.code, entryFor(lobby), Config.Lobby.DirectoryTTL)
				end
				task.wait(0.2)
			end
			task.wait(Config.Lobby.DirectoryRefresh)
		end
	end)
end

function LobbyDirectory.publish(lobby)
	if enabled and not lobby.solo then
		task.spawn(pcall, map.SetAsync, map, lobby.code, entryFor(lobby), Config.Lobby.DirectoryTTL)
	end
end

function LobbyDirectory.remove(code: string)
	if enabled then
		task.spawn(pcall, map.RemoveAsync, map, code)
	end
end

-- Public lobbies on OTHER servers (cached for a few seconds).
function LobbyDirectory.listRemote()
	if not enabled then
		return {}
	end
	if os.clock() - remoteCache.at < 8 then
		return remoteCache.list
	end
	remoteCache.at = os.clock()
	local ok, items = pcall(map.GetRangeAsync, map, Enum.SortDirection.Ascending, 100)
	if not ok then
		return remoteCache.list
	end
	local list = {}
	for _, item in items do
		local value = item.value
		if
			type(value) == "table"
			and value.isPublic
			and value.jobId ~= game.JobId
			and value.count < value.max
			and value.count > 0
		then
			value.remote = true
			table.insert(list, value)
		end
	end
	remoteCache.list = list
	return list
end

function LobbyDirectory.lookup(code: string)
	if not enabled then
		return nil
	end
	local ok, value = pcall(map.GetAsync, map, code)
	if ok and type(value) == "table" and value.jobId ~= game.JobId then
		return value
	end
	return nil
end

function LobbyDirectory.teleport(player: Player, entry): (boolean, string?)
	local options = Instance.new("TeleportOptions")
	options.ServerInstanceId = entry.jobId
	options:SetTeleportData({ lobbyCode = entry.code })
	local ok, err = pcall(TeleportService.TeleportAsync, TeleportService, entry.placeId, { player }, options)
	if not ok then
		return false, tostring(err)
	end
	return true
end

return LobbyDirectory
