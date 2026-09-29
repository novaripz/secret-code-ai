-- Wiki Race client bootstrap: builds the UI, wires server pushes to screens, then boots.

local StarterGui = game:GetService("StarterGui")

local Core = script.Parent.Core
local UI = script.Parent.UI
local Net = require(Core.Net)
local Store = require(Core.Store)
local App = require(UI.App)
local Reveal = require(UI.Overlays.Reveal)
local RoundResults = require(UI.Overlays.RoundResults)
local FinalResults = require(UI.Overlays.FinalResults)
local Chaos = require(UI.Overlays.Chaos)
local Announcer = require(UI.Overlays.Announcer)

local E = Net.Events

-- A UI game: hide the default character HUD, keep chat for socializing.
task.spawn(function()
	for _ = 1, 20 do
		local ok = pcall(function()
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.EmotesMenu, false)
			StarterGui:SetCore("ResetButtonCallback", false)
		end)
		if ok then
			break
		end
		task.wait(0.5)
	end
end)

Net.init()
App.init()

local screens = {}
for _, name in { "Menu", "Lobbies", "LobbyRoom", "Race", "FreeRoam", "Profile", "Shop", "Leaderboards", "Settings" } do
	local module = require(UI.Screens[name])
	screens[name] = module.new(App)
	App.register(name, screens[name])
end

-- Server pushes ---------------------------------------------------------------------------

Net.on(E.Profile, function(profile)
	Store.set("profile", profile)
	App.applyProfile(profile)
end)

Net.on(E.Toast, function(data)
	App.toast(data.text, data.kind)
end)

Net.on(E.LobbyList, function(list)
	Store.set("lobbies", list)
end)

Net.on(E.LobbyState, function(snapshot)
	local previous = Store.lobby
	Store.set("lobby", snapshot)
	if snapshot.solo then
		return -- solo races go straight to the race screen
	end
	local current = App.current
	if current == "Race" or current == "FreeRoam" and snapshot.state == "InMatch" then
		return
	end
	if not previous or previous.id ~= snapshot.id or current == "Menu" or current == "Lobbies" then
		App.show("LobbyRoom")
	end
end)

Net.on(E.LobbyLeft, function(data)
	Store.set("lobby", nil)
	Reveal.cancel()
	RoundResults.hide()
	if data.reason == "kicked" then
		App.toast("You were removed from the lobby by the host.", "error")
	end
	if App.current == "LobbyRoom" or App.current == "Race" then
		App.show("Menu")
	end
end)

Net.on(E.RoundGenerating, function(data)
	RoundResults.hide()
	FinalResults.hide()
	screens.Race:onGenerating(data)
end)

Net.on(E.RoundStart, function(data)
	RoundResults.hide()
	FinalResults.hide()
	screens.Race:onRoundStart(data)
	local profile = Store.profile
	if profile and profile.settings and profile.settings.hints and (profile.stats.races or 0) < 3 then
		task.delay(math.max(0, data.raceStartAt - workspace:GetServerTimeNow()) + 0.5, function()
			App.toast(
				"💡 Click the blue links to hop between articles. Watch the meter heat up as you get closer!",
				"info"
			)
		end)
	end
end)

Net.on(E.Opponents, function(data)
	screens.Race:onOpponents(data)
end)

Net.on(E.RoundClosing, function(data)
	screens.Race:onClosing(data)
end)

Net.on(E.RoundRigged, function(data)
	screens.Race:onRigged(data)
end)

Net.on(E.RoundResults, function(data)
	Reveal.cancel()
	RoundResults.show(App, data)
end)

Net.on(E.MatchResults, function(data)
	RoundResults.hide()
	FinalResults.show(App, data, function(action)
		if action == "again" then
			App.request(Net.Actions.StartMatch, {})
			App.show("LobbyRoom")
		elseif action == "freeroam" then
			task.spawn(Net.request, Net.Actions.LeaveLobby, {})
			Store.set("lobby", nil)
			App.show("FreeRoam")
		else
			App.home()
		end
	end)
end)

Net.on(E.MatchAborted, function(data)
	Reveal.cancel()
	RoundResults.hide()
	App.toast(data.reason or "The match ended.", "error")
	App.home()
end)

Net.on(E.ServerRigged, function(data)
	Chaos.serverRigged(App, data)
end)

Net.on(E.ChaosEffect, function(data)
	Chaos.effect(App, data)
end)

Net.on(E.Achievement, function(data)
	Announcer.achievement(App, data.id)
end)

Net.on(E.RecordBroken, function(data)
	local records = table.clone(Store.records or {})
	records[data.board] = data.record
	Store.set("records", records)
	Announcer.record(App, data)
end)

Net.on(E.Teleporting, function(data)
	App.loading(("Teleporting to “%s”…"):format(data.name or "lobby"))
end)

-- Boot ------------------------------------------------------------------------------------

local function boot()
	local hide = App.splash("Opening the encyclopedia… 11,000 pages")
	local ok, data = Net.request(Net.Actions.Bootstrap, {})
	-- The server needs a few seconds to load the wiki: keep waiting quietly.
	for _ = 1, 60 do
		if ok or tostring(data):find("starting", 1, true) == nil then
			break
		end
		task.wait(1)
		ok, data = Net.request(Net.Actions.Bootstrap, {})
	end
	hide()
	if not ok then
		App.loading("Couldn't reach the server: " .. tostring(data), { retry = boot })
		return
	end
	Store.set("boot", data)
	Store.set("records", data.records or {})
	Store.set("lobbies", data.lobbies or {})
	if data.profile then
		Store.set("profile", data.profile)
		App.applyProfile(data.profile)
	end
	if data.lobby and not data.lobby.solo then
		Store.set("lobby", data.lobby)
		App.show("LobbyRoom")
	else
		App.show("Menu")
	end
	if data.profile and not data.profile.persistent and not data.studio then
		App.toast("Stats couldn't be loaded this session; progress may not save.", "error")
	end
end

boot()
