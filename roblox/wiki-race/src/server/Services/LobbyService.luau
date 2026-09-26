-- Lobbies (up to 10 players), matchmaking, host permissions and match routing.
--
-- * Public lobbies appear in the browser (this server + other servers via LobbyDirectory).
--   "Standing" public lobbies exist on every server and survive being empty; any lobby migrates
--   its host when the host leaves, keeping settings and players, and public lobbies can also
--   auto-start when every member is ready — so they never depend on one permanent host.
-- * Private lobbies are joined with a 6-character code or a friend invite.
-- * Only the host may change settings, kick, transfer host, start/end the match or skip results.
-- * All race requests (Navigate / GiveUp) are routed to the player's current match.

local Players = game:GetService("Players")
local TextService = game:GetService("TextService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Difficulty = require(Shared.Difficulty)
local Ranks = require(Shared.Ranks)
local Net = require(Shared.Net)

local Router = require(script.Parent.Router)
local Validate = require(script.Parent.Validate)
local DataService = require(script.Parent.DataService)
local CosmeticService = require(script.Parent.CosmeticService)
local LobbyDirectory = require(script.Parent.LobbyDirectory)
local BannedFilter = require(script.Parent.Parent.Wiki.BannedFilter)
local Match = require(script.Parent.Parent.Race.Match)
local RaceSession = require(script.Parent.Parent.Race.RaceSession)

local LobbyService = {}

local lobbies = {} -- id → lobby
local byCode = {} -- code → lobby
local membership = {} -- userId → lobby
local dirty = {}
local flushScheduled = false
local listDirty = false
local lastListPush = 0
local nextId = 0
local codeRng = Random.new()

local function defaultSettings(overrides)
	local settings = {
		difficulty = "Easy",
		timer = Config.Race.DefaultTimer,
		customSeconds = Config.Race.DefaultCustomSeconds,
		rounds = Config.Race.DefaultRounds,
		showMeters = true,
		showPages = false,
		allowChaos = true,
	}
	for key, value in overrides or {} do
		settings[key] = value
	end
	return settings
end

local function newCode(): string
	local alphabet = Config.Lobby.CodeAlphabet
	for _ = 1, 50 do
		local chars = table.create(Config.Lobby.CodeLength)
		for i = 1, Config.Lobby.CodeLength do
			local index = codeRng:NextInteger(1, #alphabet)
			chars[i] = string.sub(alphabet, index, index)
		end
		local code = table.concat(chars)
		if not byCode[code] and not BannedFilter.isBanned(code) then
			return code
		end
	end
	error("could not allocate lobby code")
end

local function filterName(player: Player, raw: string?): string
	local fallback = player.DisplayName .. "'s Lobby"
	local name = raw and Validate.string(raw, Config.Lobby.NameMaxLength)
	if not name then
		return fallback
	end
	name = name:gsub("[%c]", ""):gsub("^%s+", ""):gsub("%s+$", "")
	if name == "" or BannedFilter.isBanned(name) then
		return fallback
	end
	local ok, result = pcall(function()
		local filtered = TextService:FilterStringAsync(name, player.UserId)
		return filtered:GetNonChatStringForBroadcastAsync()
	end)
	if not ok or type(result) ~= "string" or result == "" then
		return fallback
	end
	return result
end

local function markDirty(lobby)
	dirty[lobby] = true
	listDirty = true
	if flushScheduled then
		return
	end
	flushScheduled = true
	task.defer(function()
		flushScheduled = false
		local batch = dirty
		dirty = {}
		for changed in batch do
			if lobbies[changed.id] then
				local snap = LobbyService.snapshot(changed)
				for _, userId in changed.members do
					local player = Players:GetPlayerByUserId(userId)
					if player then
						Router.push(player, Net.Events.LobbyState, snap)
					end
				end
			end
		end
	end)
end

local function playerCard(lobby, userId: number)
	local player = Players:GetPlayerByUserId(userId)
	if not player then
		return nil
	end
	local data = DataService.get(player)
	local rank = data and Ranks.fromStats(data.stats) or Ranks.List[1]
	return {
		userId = userId,
		name = player.Name,
		displayName = player.DisplayName,
		isHost = lobby.hostId == userId,
		ready = lobby.ready[userId] == true,
		look = CosmeticService.look(player),
		rank = { name = rank.name, emoji = rank.emoji },
	}
end

function LobbyService.snapshot(lobby)
	local members = {}
	for _, userId in lobby.members do
		local card = playerCard(lobby, userId)
		if card then
			table.insert(members, card)
		end
	end
	return {
		id = lobby.id,
		code = lobby.code,
		name = lobby.name,
		isPublic = lobby.isPublic,
		standing = lobby.standing,
		solo = lobby.solo,
		hostId = lobby.hostId,
		state = lobby.state,
		settings = lobby.settings,
		members = members,
		maxPlayers = Config.Lobby.MaxPlayers,
		match = lobby.match and lobby.match:summary() or nil,
		autoStartAt = lobby.autoStartAt,
	}
end

local function summary(lobby)
	return {
		id = lobby.id,
		code = lobby.isPublic and lobby.code or nil,
		name = lobby.name,
		count = #lobby.members,
		max = Config.Lobby.MaxPlayers,
		difficulty = lobby.settings.difficulty,
		rounds = lobby.settings.rounds,
		timer = lobby.settings.timer,
		customSeconds = lobby.settings.customSeconds,
		state = lobby.state,
		standing = lobby.standing,
		match = lobby.match and lobby.match:summary() or nil,
	}
end

function LobbyService.listPublic()
	local list = {}
	for _, lobby in lobbies do
		if lobby.isPublic and not lobby.solo then
			table.insert(list, summary(lobby))
		end
	end
	table.sort(list, function(a, b)
		if a.count ~= b.count then
			return a.count > b.count
		end
		return a.id < b.id
	end)
	for _, remote in LobbyDirectory.listRemote() do
		table.insert(list, remote)
	end
	return list
end

local function pushListToBrowsers(force: boolean)
	if not listDirty and not force then
		return
	end
	if not force and os.clock() - lastListPush < 1 then
		return
	end
	listDirty = false
	lastListPush = os.clock()
	local list = nil
	for _, player in Players:GetPlayers() do
		if not membership[player.UserId] then
			list = list or LobbyService.listPublic()
			Router.push(player, Net.Events.LobbyList, list)
		end
	end
end

local function createLobby(options)
	nextId += 1
	local lobby = {
		id = "L" .. nextId,
		code = newCode(),
		name = options.name,
		isPublic = options.isPublic == true,
		standing = options.standing == true,
		solo = options.solo == true,
		hostId = nil,
		members = {},
		ready = {},
		kicked = {},
		settings = defaultSettings(options.settings),
		state = "Waiting",
		match = nil,
		createdAt = os.time(),
	}
	lobbies[lobby.id] = lobby
	byCode[lobby.code] = lobby
	LobbyDirectory.publish(lobby)
	listDirty = true
	return lobby
end

local function destroyLobby(lobby)
	if lobby.match then
		lobby.match:abort()
	end
	lobbies[lobby.id] = nil
	byCode[lobby.code] = nil
	LobbyDirectory.remove(lobby.code)
	listDirty = true
end

function LobbyService.lobbyOf(player: Player)
	return membership[player.UserId]
end

function LobbyService.allLobbies()
	local list = {}
	for _, lobby in lobbies do
		table.insert(list, lobby)
	end
	return list
end

local function cancelAutoStart(lobby)
	if lobby.autoStartAt then
		lobby.autoStartAt = nil
		markDirty(lobby)
	end
end

local function leave(player: Player, reason: string?)
	local lobby = membership[player.UserId]
	if not lobby then
		return
	end
	membership[player.UserId] = nil
	local index = table.find(lobby.members, player.UserId)
	if index then
		table.remove(lobby.members, index)
	end
	lobby.ready[player.UserId] = nil
	if lobby.match then
		lobby.match:onPlayerLeft(player.UserId)
	end
	if lobby.hostId == player.UserId then
		-- Host migration: the longest-standing member inherits the lobby and its settings.
		lobby.hostId = lobby.members[1]
		local newHost = lobby.hostId and Players:GetPlayerByUserId(lobby.hostId)
		if newHost then
			for _, userId in lobby.members do
				local member = Players:GetPlayerByUserId(userId)
				if member then
					Router.toast(member, ("👑 %s is now the host."):format(newHost.DisplayName), "info")
				end
			end
		end
	end
	cancelAutoStart(lobby)
	if #lobby.members == 0 then
		if lobby.match then
			lobby.match:abort()
		end
		if lobby.standing then
			lobby.hostId = nil
			lobby.state = lobby.match and lobby.state or "Waiting"
		else
			destroyLobby(lobby)
		end
	else
		for _, userId in lobby.members do
			local member = Players:GetPlayerByUserId(userId)
			if member and reason ~= "silent" then
				Router.toast(member, ("%s left the lobby."):format(player.DisplayName), "muted")
			end
		end
	end
	if player.Parent then
		Router.push(player, Net.Events.LobbyLeft, { reason = reason or "left" })
	end
	markDirty(lobby)
end

local function join(player: Player, lobby)
	if membership[player.UserId] == lobby then
		return LobbyService.snapshot(lobby)
	end
	if #lobby.members >= Config.Lobby.MaxPlayers then
		return nil, "That lobby is full."
	end
	local kickedUntil = lobby.kicked[player.UserId]
	if kickedUntil and os.clock() < kickedUntil then
		return nil, "You were removed from that lobby. Try again later."
	end
	leave(player, "silent")
	table.insert(lobby.members, player.UserId)
	membership[player.UserId] = lobby
	lobby.ready[player.UserId] = false
	if not lobby.hostId then
		lobby.hostId = player.UserId
	end
	cancelAutoStart(lobby)
	for _, userId in lobby.members do
		local member = Players:GetPlayerByUserId(userId)
		if member and member ~= player then
			Router.toast(member, ("%s joined the lobby."):format(player.DisplayName), "muted")
		end
	end
	if lobby.match then
		Router.toast(player, "A match is in progress — you'll join at the next round.", "info")
	end
	markDirty(lobby)
	return LobbyService.snapshot(lobby)
end

local function isHost(player: Player, lobby): boolean
	return lobby ~= nil and lobby.hostId == player.UserId
end

local function startMatch(lobby, options)
	if lobby.match or lobby.state ~= "Waiting" then
		return nil, "A match is already running."
	end
	if #lobby.members == 0 then
		return nil, "Nobody is here!"
	end
	lobby.autoStartAt = nil
	lobby.state = "InMatch"
	local match
	match = Match.new(lobby, {
		onEnded = function()
			if lobby.match == match then
				lobby.match = nil
				lobby.state = "Waiting"
				for userId in lobby.ready do
					lobby.ready[userId] = false
				end
				markDirty(lobby)
			end
		end,
		onChanged = function()
			markDirty(lobby)
		end,
	}, options)
	lobby.match = match
	match:start()
	markDirty(lobby)
	return true
end

local function checkAutoStart(lobby)
	if not lobby.isPublic or lobby.solo or lobby.state ~= "Waiting" or #lobby.members < 2 then
		cancelAutoStart(lobby)
		return
	end
	for _, userId in lobby.members do
		if not lobby.ready[userId] then
			cancelAutoStart(lobby)
			return
		end
	end
	if lobby.autoStartAt then
		return
	end
	local startAt = workspace:GetServerTimeNow() + Config.Lobby.PublicAutoStartSeconds
	lobby.autoStartAt = startAt
	markDirty(lobby)
	task.delay(Config.Lobby.PublicAutoStartSeconds, function()
		if lobby.autoStartAt == startAt and lobbies[lobby.id] then
			startMatch(lobby)
		end
	end)
end

-- Settings patch validation: anything invalid is rejected, never coerced into something odd.
local function validatePatch(lobby, patch)
	local clean = {}
	if patch.difficulty ~= nil then
		if not Difficulty.isValid(patch.difficulty) then
			return nil, "Invalid difficulty"
		end
		clean.difficulty = patch.difficulty
	end
	if patch.timer ~= nil then
		if not Validate.oneOf(patch.timer, Config.Race.TimerOptions) then
			return nil, "Invalid timer"
		end
		clean.timer = patch.timer
	end
	if patch.customSeconds ~= nil then
		local seconds = Validate.integer(patch.customSeconds, Config.Race.CustomTimerMin, Config.Race.CustomTimerMax)
		if not seconds then
			return nil,
				("Custom time must be a whole number of seconds between %d and %d"):format(
					Config.Race.CustomTimerMin,
					Config.Race.CustomTimerMax
				)
		end
		clean.customSeconds = seconds
	end
	if patch.rounds ~= nil then
		if not Validate.oneOf(patch.rounds, Config.Race.RoundOptions) then
			return nil, "Invalid round count"
		end
		clean.rounds = patch.rounds
	end
	for _, key in { "showMeters", "showPages", "allowChaos" } do
		if patch[key] ~= nil then
			if type(patch[key]) ~= "boolean" then
				return nil, "Invalid " .. key
			end
			clean[key] = patch[key]
		end
	end
	return clean
end

local function autoJoinFromInvite(player: Player)
	local ok, joinData = pcall(player.GetJoinData, player)
	if not ok or type(joinData) ~= "table" then
		return
	end
	local code = nil
	if type(joinData.TeleportData) == "table" and type(joinData.TeleportData.lobbyCode) == "string" then
		code = joinData.TeleportData.lobbyCode
	elseif type(joinData.LaunchData) == "string" then
		code = joinData.LaunchData:match("^lobby:(%w+)$")
	end
	if not code then
		return
	end
	DataService.waitFor(player, 20)
	local lobby = byCode[string.upper(code)]
	if lobby and player.Parent then
		local snap, err = join(player, lobby)
		if snap then
			Router.push(player, Net.Events.LobbyState, snap)
		else
			Router.toast(player, err, "error")
		end
	end
end

-- Solo race (from Free Roam): a private one-player lobby that starts immediately.
function LobbyService.startSolo(player: Player, difficulty: string, fixedStart: string?)
	local current = membership[player.UserId]
	if current and current.match and current.match.round and current.match.round.sessions[player.UserId] then
		return nil, "Finish your current race first."
	end
	if fixedStart then
		local generator = require(script.Parent.WikiService).generator
		local probe = generator:generate(difficulty, { fixedStart = fixedStart })
		if not probe then
			return nil, "No target is far enough from this page for that difficulty. Try another page!"
		end
	end
	local lobby = createLobby({
		name = player.DisplayName .. "'s Solo Race",
		isPublic = false,
		solo = true,
		settings = {
			difficulty = difficulty,
			rounds = 1,
			timer = "300",
			showMeters = true,
			showPages = true,
			allowChaos = false,
		},
	})
	local snap, err = join(player, lobby)
	if not snap then
		destroyLobby(lobby)
		return nil, err
	end
	startMatch(lobby, { solo = true, fixedStart = fixedStart })
	return LobbyService.snapshot(lobby)
end

-- Returns true if the player is currently in a round (used to block search mid-race).
function LobbyService.isRacing(player: Player): boolean
	local lobby = membership[player.UserId]
	local match = lobby and lobby.match
	local round = match and match.round
	local session = round and round.sessions[player.UserId]
	return session ~= nil and not session.finished
end

function LobbyService.init()
	for _, standing in Config.Lobby.StandingLobbies do
		createLobby({
			name = standing.name,
			isPublic = true,
			standing = true,
			settings = { difficulty = standing.difficulty, timer = standing.timer, rounds = standing.rounds },
		})
	end

	LobbyDirectory.init(LobbyService.allLobbies)

	Players.PlayerAdded:Connect(function(player)
		task.spawn(autoJoinFromInvite, player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		leave(player, "disconnected")
	end)

	task.spawn(function()
		while true do
			task.wait(1)
			pushListToBrowsers(false)
		end
	end)

	local A = Net.Actions

	Router.on(A.ListLobbies, function()
		return LobbyService.listPublic()
	end, { rate = 1, burst = 4 })

	Router.on(A.QuickPlay, function(player)
		local best = nil
		for _, lobby in lobbies do
			if lobby.isPublic and not lobby.solo and #lobby.members < Config.Lobby.MaxPlayers then
				local score = #lobby.members * 10 + (lobby.state == "Waiting" and 5 or 0) + (lobby.standing and 1 or 0)
				if not best or score > best.score then
					best = { lobby = lobby, score = score }
				end
			end
		end
		local lobby = best and best.lobby
		if not lobby then
			lobby = createLobby({ name = "Quick Race", isPublic = true })
		end
		return join(player, lobby)
	end, { rate = 1, burst = 3 })

	Router.on(A.CreateLobby, function(player, payload)
		local count = 0
		for _ in lobbies do
			count += 1
		end
		if count >= Config.Lobby.MaxLobbiesPerServer + #Config.Lobby.StandingLobbies then
			return nil, "This server has too many lobbies. Try joining one!"
		end
		local isPublic = Validate.boolean(payload.isPublic)
		local lobby = createLobby({
			name = filterName(player, payload.name),
			isPublic = isPublic == true,
		})
		local snap, err = join(player, lobby)
		if not snap then
			destroyLobby(lobby)
			return nil, err
		end
		lobby.hostId = player.UserId
		markDirty(lobby)
		return LobbyService.snapshot(lobby)
	end, { rate = 0.5, burst = 2 })

	Router.on(A.JoinLobby, function(player, payload)
		local lobby = nil
		if payload.lobbyId then
			local id = Validate.string(payload.lobbyId, 16)
			lobby = id and lobbies[id]
			if lobby and not lobby.isPublic then
				return nil, "That lobby is private. Ask for its code!"
			end
		elseif payload.code then
			local code = Validate.string(payload.code, 12)
			code = code and string.upper(code):gsub("[^%w]", "")
			lobby = code and byCode[code]
			if not lobby and code then
				local remote = LobbyDirectory.lookup(code)
				if remote then
					if remote.count >= remote.max then
						return nil, "That lobby is full."
					end
					Router.push(player, Net.Events.Teleporting, { name = remote.name })
					local ok, err = LobbyDirectory.teleport(player, remote)
					if not ok then
						return nil, "Couldn't reach that lobby's server: " .. tostring(err)
					end
					return { teleporting = true }
				end
			end
		end
		if not lobby or lobby.solo then
			return nil, "Couldn't find that lobby. Check the code and try again."
		end
		return join(player, lobby)
	end, { rate = 1, burst = 4 })

	Router.on(A.LeaveLobby, function(player)
		leave(player, "left")
		return true
	end, { rate = 1, burst = 3 })

	Router.on(A.UpdateLobby, function(player, payload)
		local lobby = membership[player.UserId]
		if not isHost(player, lobby) then
			return nil, "Only the host can change settings."
		end
		if type(payload.settings) == "table" then
			local clean, err = validatePatch(lobby, payload.settings)
			if not clean then
				return nil, err
			end
			for key, value in clean do
				lobby.settings[key] = value
			end
		end
		if payload.isPublic ~= nil and not lobby.standing and not lobby.solo then
			local isPublic = Validate.boolean(payload.isPublic)
			if isPublic == nil then
				return nil, "Invalid visibility"
			end
			lobby.isPublic = isPublic
		end
		if payload.name ~= nil and not lobby.standing then
			lobby.name = filterName(player, payload.name)
		end
		cancelAutoStart(lobby)
		LobbyDirectory.publish(lobby)
		markDirty(lobby)
		return LobbyService.snapshot(lobby)
	end, { rate = 3, burst = 8 })

	Router.on(A.SetReady, function(player, payload)
		local lobby = membership[player.UserId]
		local ready = Validate.boolean(payload.ready)
		if not lobby or ready == nil then
			return nil, "Not in a lobby"
		end
		lobby.ready[player.UserId] = ready
		markDirty(lobby)
		checkAutoStart(lobby)
		return true
	end, { rate = 2, burst = 5 })

	Router.on(A.KickPlayer, function(player, payload)
		local lobby = membership[player.UserId]
		local target = Validate.userId(payload.userId)
		if not isHost(player, lobby) then
			return nil, "Only the host can remove players."
		end
		if not target or target == player.UserId or not table.find(lobby.members, target) then
			return nil, "That player isn't in your lobby."
		end
		local targetPlayer = Players:GetPlayerByUserId(target)
		lobby.kicked[target] = os.clock() + 120
		if targetPlayer then
			leave(targetPlayer, "kicked")
		end
		return true
	end, { rate = 1, burst = 3 })

	Router.on(A.TransferHost, function(player, payload)
		local lobby = membership[player.UserId]
		local target = Validate.userId(payload.userId)
		if not isHost(player, lobby) then
			return nil, "Only the host can do that."
		end
		if not target or not table.find(lobby.members, target) then
			return nil, "That player isn't in your lobby."
		end
		lobby.hostId = target
		local newHost = Players:GetPlayerByUserId(target)
		for _, userId in lobby.members do
			local member = Players:GetPlayerByUserId(userId)
			if member and newHost then
				Router.toast(member, ("👑 %s is now the host."):format(newHost.DisplayName), "info")
			end
		end
		markDirty(lobby)
		return true
	end, { rate = 1, burst = 3 })

	Router.on(A.StartMatch, function(player)
		local lobby = membership[player.UserId]
		if not isHost(player, lobby) then
			return nil, "Only the host can start the match."
		end
		return startMatch(lobby)
	end, { rate = 1, burst = 2 })

	Router.on(A.EndMatch, function(player)
		local lobby = membership[player.UserId]
		if not isHost(player, lobby) then
			return nil, "Only the host can end the match."
		end
		if not lobby.match then
			return nil, "No match is running."
		end
		lobby.match:requestEnd()
		return true
	end, { rate = 1, burst = 2 })

	Router.on(A.NextRound, function(player)
		local lobby = membership[player.UserId]
		if not isHost(player, lobby) or not lobby.match then
			return nil, "Only the host can skip ahead."
		end
		lobby.match:skipToNext()
		return true
	end, { rate = 1, burst = 2 })

	Router.on(A.Navigate, function(player, payload)
		local lobby = membership[player.UserId]
		if not lobby or not lobby.match then
			return nil, "You're not in a race."
		end
		local op = Validate.string(payload.op, 12)
		if not op or not RaceSession.Ops[op] then
			return nil, "Unknown action."
		end
		local argument = nil
		if op == "link" or op == "history" then
			argument = Validate.id(payload.pageId)
			if not argument then
				return nil, "Unknown page."
			end
		end
		return lobby.match:navigate(player, op, argument)
	end, { rate = 8, burst = 14 })

	Router.on(A.GiveUp, function(player)
		local lobby = membership[player.UserId]
		if not lobby or not lobby.match then
			return nil, "You're not in a race."
		end
		return lobby.match:giveUp(player)
	end, { rate = 1, burst = 2 })
end

return LobbyService
