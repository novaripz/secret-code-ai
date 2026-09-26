-- Paid social chaos.
--
-- SERVER RIG (developer product, 199 R$): a loud, server-wide, fully announced effect. Every
-- active race on THIS server is forced into Give Up Mode (new absurd target, zero redos) and
-- rounds starting during a short window are rigged too. Lobby settings are never modified, so
-- every later round returns to the host's configuration. It grants the buyer no stats and
-- removes nobody's progress.
--
-- RIG A PLAYER (developer product, 49 R$ → one "rig credit"): a short, harmless visual/sound
-- gag on one lobby-mate or friend. Jumpscare effects need the Jumpscare Pack game pass (which
-- also allows free jumpscares on a cooldown). Targets can opt out in Settings; hosts can
-- disable targeted chaos per lobby; senders and targets both have cooldowns.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Catalog = require(Shared.Catalog)
local Net = require(Shared.Net)

local Router = require(script.Parent.Router)
local Validate = require(script.Parent.Validate)
local DataService = require(script.Parent.DataService)
local MonetizationService = require(script.Parent.MonetizationService)
local LobbyService = require(script.Parent.LobbyService)
local ChaosState = require(script.Parent.ChaosState)

local ChaosService = {}

local rigQueue = {}
local rigCooldownUntil = 0
local queueRunning = false
local senderCooldown = {}
local jumpscareCooldown = {}
local targetProtectedUntil = {}
local pendingIntent = {} -- [userId] = { target, effect, at }
local friendCache = {}

local function now()
	return workspace:GetServerTimeNow()
end

local function applyServerRig(entry)
	local t = now()
	ChaosState.rigId += 1
	ChaosState.riggedUntil = t + Config.Chaos.ServerRigWindowSeconds
	ChaosState.riggedBy = entry.name
	rigCooldownUntil = t + Config.Chaos.ServerRigCooldownSeconds

	Router.pushAll(Net.Events.ServerRigged, {
		by = entry.name,
		userId = entry.userId,
		at = t,
		windowEndsAt = ChaosState.riggedUntil,
	})
	for _, lobby in LobbyService.allLobbies() do
		if lobby.match then
			lobby.match:requestRig(entry.name, ChaosState.rigId)
		end
	end
end

local function runQueue()
	if queueRunning then
		return
	end
	queueRunning = true
	task.spawn(function()
		while #rigQueue > 0 do
			local wait = rigCooldownUntil - now()
			if wait > 0 then
				task.wait(wait)
			end
			local entry = table.remove(rigQueue, 1)
			applyServerRig(entry)
		end
		queueRunning = false
	end)
end

function ChaosService.queueServerRig(player: Player)
	table.insert(rigQueue, { userId = player.UserId, name = player.DisplayName })
	local wait = rigCooldownUntil - now()
	if wait > 0 or #rigQueue > 1 then
		Router.toast(
			player,
			("Server Rig queued — it fires in %d seconds!"):format(math.ceil(math.max(wait, 1))),
			"info"
		)
	end
	runQueue()
end

local function isFriend(a: Player, b: Player): boolean
	local key = math.min(a.UserId, b.UserId) .. ":" .. math.max(a.UserId, b.UserId)
	local cached = friendCache[key]
	if cached ~= nil then
		return cached
	end
	local ok, result = pcall(a.IsFriendsWith, a, b.UserId)
	friendCache[key] = ok and result == true
	return friendCache[key]
end

-- Returns the effect that will actually play, or nil + reason.
local function validateRig(sender: Player, target: Player?, effectId: string?)
	if not target or target == sender then
		return nil, "Pick someone else to rig."
	end
	local effect = effectId and Catalog.ChaosById[effectId]
	if not effect then
		return nil, "Unknown effect."
	end
	local senderLobby = LobbyService.lobbyOf(sender)
	local sameLobby = senderLobby ~= nil and senderLobby == LobbyService.lobbyOf(target)
	if not sameLobby and not isFriend(sender, target) then
		return nil, "You can only rig lobby-mates or friends in this server."
	end
	if sameLobby and senderLobby.settings.allowChaos == false then
		return nil, "The host turned off targeted chaos in this lobby."
	end
	local targetData = DataService.get(target)
	if not targetData or targetData.settings.chaos == false then
		return nil, ("%s has incoming chaos turned off."):format(target.DisplayName)
	end
	if effect.requires and not MonetizationService.ownsPass(sender, effect.requires) then
		return nil, "That effect needs the " .. Config.GamePasses[effect.requires].name .. "."
	end
	local t = now()
	if (senderCooldown[sender.UserId] or 0) > t then
		return nil, ("Cooldown: wait %ds."):format(math.ceil(senderCooldown[sender.UserId] - t))
	end
	if (targetProtectedUntil[target.UserId] or 0) > t then
		return nil,
			("%s was just rigged. Give them %ds!"):format(
				target.DisplayName,
				math.ceil(targetProtectedUntil[target.UserId] - t)
			)
	end
	local played = effect
	if effect.jumpscare and targetData.settings.jumpscares == false then
		-- Respect the target's setting: swap in the harmless dramatic warning.
		played = Catalog.ChaosById.warning
	end
	return played, nil, effect
end

local function deliver(sender: Player, target: Player, effect)
	local t = now()
	senderCooldown[sender.UserId] = t + Config.Chaos.RigPlayerSenderCooldown
	targetProtectedUntil[target.UserId] = t + Config.Chaos.RigPlayerTargetProtection
	Router.push(target, Net.Events.ChaosEffect, {
		effect = effect.id,
		from = sender.DisplayName,
		duration = Config.Chaos.EffectSeconds,
	})
	Router.toast(sender, ("%s %s rigged!"):format(effect.emoji, target.DisplayName), "success")
	local lobby = LobbyService.lobbyOf(sender)
	if lobby then
		for _, userId in lobby.members do
			local member = Players:GetPlayerByUserId(userId)
			if member and member ~= sender and member ~= target then
				Router.toast(
					member,
					("%s %s rigged %s!"):format(effect.emoji, sender.DisplayName, target.DisplayName),
					"muted"
				)
			end
		end
	end
end

-- Uses a free jumpscare (pass holders) or a rig credit.
local function tryRig(sender: Player, targetUserId: number?, effectId: string?)
	local target = targetUserId and Players:GetPlayerByUserId(targetUserId)
	local effect, err, requested = validateRig(sender, target, effectId)
	if not effect then
		return nil, err
	end
	local t = now()
	if
		requested.jumpscare
		and MonetizationService.ownsPass(sender, "Jumpscares")
		and (jumpscareCooldown[sender.UserId] or 0) <= t
	then
		jumpscareCooldown[sender.UserId] = t + Config.Chaos.JumpscareSenderCooldown
		deliver(sender, target, effect)
		return { delivered = true, free = true, substituted = effect ~= requested }
	end
	local data = DataService.get(sender)
	if not data or data.rigCredits <= 0 then
		return { needsPurchase = true }
	end
	DataService.update(sender, function(profile)
		profile.rigCredits -= 1
	end)
	deliver(sender, target, effect)
	return { delivered = true, substituted = effect ~= requested }
end

function ChaosService.init()
	MonetizationService.registerProduct("ServerRig", function(player)
		ChaosService.queueServerRig(player)
		return true
	end)

	MonetizationService.registerProduct("RigPlayer", function(player)
		DataService.update(player, function(profile)
			profile.rigCredits += 1
		end)
		-- Fire the rig the buyer set up before the purchase prompt, if it's still valid.
		local intent = pendingIntent[player.UserId]
		pendingIntent[player.UserId] = nil
		if intent and os.clock() - intent.at < 180 then
			task.defer(function()
				local result, err = tryRig(player, intent.target, intent.effect)
				if not result then
					Router.toast(player, "Rig credit saved: " .. tostring(err), "info")
				end
			end)
		end
		return true
	end)

	Router.on(Net.Actions.SetRigIntent, function(player, payload)
		local target = Validate.userId(payload.userId)
		local effect = Validate.string(payload.effect, 24)
		if not target or not effect then
			return nil, "Invalid rig"
		end
		pendingIntent[player.UserId] = { target = target, effect = effect, at = os.clock() }
		return true
	end, { rate = 2, burst = 4 })

	Router.on(Net.Actions.RigPlayer, function(player, payload)
		return tryRig(player, Validate.userId(payload.userId), Validate.string(payload.effect, 24))
	end, { rate = 1, burst = 3 })

	Players.PlayerRemoving:Connect(function(player)
		pendingIntent[player.UserId] = nil
		senderCooldown[player.UserId] = nil
		jumpscareCooldown[player.UserId] = nil
		targetProtectedUntil[player.UserId] = nil
	end)
end

return ChaosService
