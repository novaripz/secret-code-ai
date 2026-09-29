-- Headless end-to-end smoke test: runs the real server and the real client together on the fake
-- engine, then plays a whole session through the UI. Any runtime error in any coroutine fails it.
-- Usage: luaurun tests/smoke.luau <projectRoot>
local ROOT = arg[1] or "."
local H = loadchunk(readfile(ROOT .. "/tests/harness.luau"), "harness", _G)()
local runtime = H.installRuntime()
local Fake = loadchunk(readfile(ROOT .. "/tests/fake_roblox.luau"), "fake", _G)()(H, runtime)

local step = 0
local function log(message)
	step += 1
	print(("[%02d] %s"):format(step, message))
end
local function check(condition, message)
	if not condition then
		error("CHECK FAILED: " .. message, 2)
	end
end
local function advance(seconds)
	-- Interleave frames so RenderStepped/Heartbeat-driven UI code runs too.
	local remaining = seconds
	while remaining > 0 do
		local dt = math.min(0.25, remaining)
		runtime.advance(dt)
		Fake.tickFrames(1)
		remaining -= dt
	end
end

-- Server ----------------------------------------------------------------------------------
-- Pretend every photo atlas was uploaded so the photo branch of the infobox renders too.
local ImageService = H.server("Services/ImageService")
for index = 1, 300 do
	ImageService.resolved[index] = "rbxassetid://" .. (1000 + index)
end
H.runScript(H.services.ServerScriptService.WikiRaceServer.Main)
advance(0.5)
local me = Fake.addPlayer(501, "Tester")
Fake.localPlayer = me
rawget(H.services.Players, "__props").LocalPlayer = me
local friend = Fake.addPlayer(502, "Friend")
advance(60) -- the wiki loads in yielding chunks
log("server booted, two players joined")

local remote = H.services.ReplicatedStorage:FindFirstChild("WikiRaceNet").Request
local function asFriend(action, payload)
	local response = remote.OnServerInvoke(friend, action, Fake.serialize(payload or {}, "friend"))
	return response
end

-- Client ----------------------------------------------------------------------------------
local client = H.node("src/client", "WikiRaceClient")
H.runScript(client.Main)
advance(10)
local App = H.require(client.UI.App)
local Store = H.require(client.Core.Store)
local Theme = H.require(client.UI.Theme)
check(App.current == "Menu", "menu shown after boot, got " .. tostring(App.current))
check(Store.profile and Store.profile.coins ~= nil, "profile loaded")
log("client booted to the main menu")

-- Quick Play -------------------------------------------------------------------------------
Fake.click(Fake.findButton(App.root, "QUICK PLAY"))
advance(0.5)
check(App.current == "LobbyRoom", "quick play opened the lobby")
check(Store.lobby and Store.lobby.hostId == 501, "I'm the host")
log("quick play → lobby " .. Store.lobby.name .. " (" .. Store.lobby.code .. ")")

local joined = asFriend("JoinLobby", { lobbyId = Store.lobby.id })
check(joined.ok, "friend joined: " .. tostring(joined.error))
advance(0.5)
check(#Store.lobby.members == 2, "two members")

-- Host settings through the UI: rounds 3 → 1, meters on, pages on.
local lobbyScreen = App.screens.LobbyRoom
Fake.click(lobbyScreen.roundMinus)
advance(0.3)
Fake.click(lobbyScreen.roundMinus)
advance(0.3)
check(Store.lobby.settings.rounds == 1, "rounds stepped down to 1, got " .. tostring(Store.lobby.settings.rounds))
Fake.click(lobbyScreen.controls.showPages.frame)
advance(0.3)
check(Store.lobby.settings.showPages == true, "show pages toggled")
local denied = asFriend("UpdateLobby", { settings = { difficulty = "Extreme" } })
check(not denied.ok, "non-host cannot change settings")
local badCustom = remote.OnServerInvoke(me, "UpdateLobby", { settings = { customSeconds = 5 } })
check(not badCustom.ok, "custom time validated server-side")
log("host settings applied; non-host + invalid custom time rejected")

-- Race ---------------------------------------------------------------------------------------
Fake.click(lobbyScreen.startButton)
advance(1)
check(App.current == "Race", "race screen shown, got " .. tostring(App.current))
local race = App.screens.Race
check(race.round and race.round.target, "round data present")
local WikiService = H.server("Services/WikiService")
local graph = WikiService.graph
local startId, targetId = race.round.start.id, race.round.target.id
check(graph:distance(startId, targetId) >= 4, "start is never Warm/Hot/Burning")
log(
	("round 1: %s → %s (%d links)"):format(
		race.round.start.title,
		race.round.target.title,
		graph:distance(startId, targetId)
	)
)

advance(race.round.raceStartAt - runtime.clock + 0.6)
check(race.browser.interactive, "browser interactive after GO")

local function linkButton(pageId)
	for _, node in race.browser.content:GetDescendants() do
		if node:GetAttribute("PageId") == pageId then
			return node
		end
	end
	return nil
end

-- Try one bad move (a redo with nothing to go back to), then follow the optimal route by
-- clicking real rendered link buttons.
race:navigate("back")
advance(0.3)
local path = graph:shortestPath(race.browser.page.id, targetId)
for i = 2, #path do
	local button = linkButton(path[i])
	if button then
		Fake.click(button)
	else
		race:navigate("link", path[i]) -- link lives in "See also"
	end
	advance(0.4)
	check(race.browser.page.id == path[i], "navigated to " .. path[i])
end
check(race.state.completed, "target reached")
log(("reached the target in %d clicks, meter=%s"):format(race.state.clicks, race.state.temperature))

local gaveUp = asFriend("GiveUp")
check(gaveUp.ok, "friend gave up")
advance(1.5)
local RoundResults = H.require(client.UI.Overlays.RoundResults)
check(Fake.findText(App.overlay, "results"), "round results overlay shown")
log("round results shown")

advance(20)
check(Fake.findText(App.overlay, "FINAL RESULTS"), "final ceremony shown")
advance(7)
check(Fake.findText(App.overlay, "Fastest Time"), "special awards shown")
log("final podium + awards shown")
Fake.click(Fake.findButton(App.overlay, "Back to lobby"))
advance(0.5)
check(App.current == "LobbyRoom", "back in lobby")
check(Store.profile.stats.completions >= 1 and Store.profile.stats.wins >= 1, "stats persisted to profile")
check(Store.profile.achievements.first_race, "first race achievement")
log(
	("stats: races=%d wins=%d coins=%d"):format(
		Store.profile.stats.races,
		Store.profile.stats.wins,
		Store.profile.coins
	)
)

-- Server rig mid-race -------------------------------------------------------------------------
Fake.click(lobbyScreen.startButton)
advance(1)
advance(race.round.raceStartAt - runtime.clock + 0.6)
local ChaosMenu = H.require(client.UI.Overlays.ChaosMenu)
ChaosMenu.serverRig(App)
advance(0.3)
Fake.click(Fake.findButton(App.overlay, "Rig it"))
advance(0.3)
Fake.click(Fake.findButton(App.overlay, "Simulate"))
advance(1)
check(Fake.findText(App.overlay, "SERVER RIGGED"), "SERVER RIGGED overlay")
check(race.round.difficulty == "GiveUp", "round forced into Give Up Mode")
check(Store.lobby.settings.difficulty ~= "GiveUp", "lobby settings untouched")
check(race.state.redosLeft == 0, "no redos in Give Up Mode")
log("server rig → Give Up Mode, new target " .. race.round.target.title)
advance(4)

-- Rig a player + jumpscare
ChaosMenu.rigPlayer(App)
advance(0.3)
Fake.click(Fake.findButton(App.overlay, "Rig!"))
advance(0.3)
Fake.click(Fake.findButton(App.overlay, "Simulate"))
advance(0.5)
local DataService = H.server("Services/DataService")
DataService.update(friend, function(data)
	data.rigCredits += 1
end)
advance(25)
local rigMe = asFriend("RigPlayer", { userId = 501, effect = "clown" })
check(rigMe.ok and rigMe.data.delivered, "friend rigged me: " .. tostring(rigMe.error))
advance(0.5)
check(Fake.findText(App.overlay, "Rigged by Friend"), "chaos effect shown to me")
log("rig-a-player purchase flow + incoming clown effect")
advance(6)

race:giveUp()
advance(0.3)
Fake.click(Fake.findButton(App.overlay, "Give up"))
advance(0.5)
check(race.state.gaveUp, "I gave up")
asFriend("GiveUp")
advance(40)
Fake.click(Fake.findButton(App.overlay, "Back to lobby"))
advance(0.5)
log("give-up flow + second match finished")

-- Shop / Profile / Leaderboards / Settings -------------------------------------------------------
App.show("Shop")
advance(0.5)
local shop = App.screens.Shop
shop.selected = "theme_dark"
shop:render()
advance(0.2)
Fake.click(Fake.findButton(shop.preview, "Equip"))
advance(0.5)
check(Theme.id == "dark", "dark theme equipped and applied, got " .. Theme.id)
shop.category = "Robux"
shop:render()
advance(0.2)
log("shop equip + robux tab")

App.show("Profile", { userId = 502 })
advance(0.5)
check(Fake.findText(App.screens.Profile.frame, "Friend's profile"), "inspect another player")
App.show("Leaderboards")
advance(0.5)
App.screens.Leaderboards.tab = "wins"
App.screens.Leaderboards:render()
App.show("Settings")
advance(0.3)
Fake.click(App.screens.Settings.controls.reducedMotion.frame)
advance(0.5)
check(Store.profile.settings.reducedMotion == true, "settings saved")
log("profile inspect, leaderboards, settings")

-- Free Roam ----------------------------------------------------------------------------------------
Fake.click(Fake.findButton(App.screens.LobbyRoom.frame, "Leave"))
advance(0.5)
App.show("FreeRoam")
advance(0.5)
local free = App.screens.FreeRoam
check(free.browser.page, "free roam page loaded")
local firstLink = nil
for _, node in free.browser.content:GetDescendants() do
	if node:GetAttribute("PageId") then
		firstLink = node
		break
	end
end
Fake.click(firstLink)
advance(0.4)
free.browser.searchBox.Text = "pizza"
advance(0.6)
local result = Fake.findText(free.browser.dropdown, "Pizza")
check(result, "search results dropdown")
Fake.click(result)
advance(0.4)
check(free.browser.page.id == "pizza", "opened search result")
free:navigate("random")
advance(0.4)
free:openCategory("Food")
advance(0.4)
Fake.click(Fake.findButton(App.overlay, "Close"))
advance(0.3)
log("free roam: link, search, random, category")

-- Pictures in the top-right infobox: a reviewed photo tile, the meme-card toggle, brainrot cards.
local function pageById(title)
	local payload = WikiService.repo:payload(WikiService.graph:resolve(title))
	return { ok = payload ~= nil, data = Fake.serialize(payload, "page") }
end
local function imageIn(frame)
	for _, child in frame:GetChildren() do
		if child.ClassName == "ImageLabel" then
			return child
		end
	end
	return nil
end
local function findNamed(root, name)
	return Fake.findAll(root, function(node)
		return node.Name == name
	end)[1]
end
local photoPage = pageById("Kangaroo")
check(photoPage and photoPage.ok and photoPage.data.photo, "Kangaroo has a photo tile")
free.browser:setPage(photoPage.data)
advance(0.5)
local picture = findNamed(free.browser.frame, "Picture")
check(picture, "infobox picture frame")
local tile = imageIn(picture)
check(
	tile and tile.ImageRectSize.X == 256 and tile.ImageRectSize.Y == 256 and tile.Image:find("rbxassetid", 1, true),
	"photo drawn from its atlas tile"
)
local toggle = picture:FindFirstChild("PictureToggle")
check(toggle, "photo/meme toggle button")
Fake.click(toggle)
advance(0.3)
picture = findNamed(free.browser.frame, "Picture")
check(picture and not imageIn(picture), "meme card replaces the photo")
Fake.click(picture:FindFirstChild("PictureToggle"))
advance(0.3)
local brainrot = pageById("Tralalero Tralala")
free.browser:setPage(brainrot.data)
advance(0.5)
picture = findNamed(free.browser.frame, "Picture")
local captions = {}
for _, d in picture:GetDescendants() do
	if d:IsA("TextLabel") then
		captions[d.Text] = true
	end
end
check(captions["TRA LA LA"] and captions["🦈"], "brainrot meme card with its own caption")
log("infobox pictures: photo tile, meme toggle, brainrot card")

-- Solo race from the current page (after the Server Rig window has expired)
advance(90)
free.difficulty = "Medium"
local soloButton = Fake.findText(free.frame, "Race from this page")
Fake.click(soloButton)
advance(1)
check(App.current == "Race", "solo race started")
advance(race.round.raceStartAt - runtime.clock + 0.6)
local soloPath = graph:shortestPath(race.browser.page.id, race.round.target.id)
for i = 2, #soloPath do
	race:navigate("link", soloPath[i])
	advance(0.3)
end
check(race.round.difficulty == "Medium", "rig window over; host/solo settings apply again")
check(
	race.state.completed,
	("solo target reached (page=%s target=%s path=%s)"):format(
		race.browser.page.id,
		race.round.target.id,
		table.concat(soloPath, ">")
	)
)
advance(20)
check(Fake.findText(App.overlay, "SOLO RACE COMPLETE"), "solo ceremony")
Fake.click(Fake.findButton(App.overlay, "Back to Free Roam"))
advance(0.5)
check(App.current == "FreeRoam", "back to free roam")
log("solo race from free roam completed")

-- Mobile layout -------------------------------------------------------------------------------------
local UIS = H.services.UserInputService
rawget(UIS, "__props").TouchEnabled = true
rawget(UIS, "__props").KeyboardEnabled = false
rawget(UIS, "__props").MouseEnabled = false
Fake.camera.ViewportSize = Vector2.new(844, 390)
advance(0.3)
check(App.compact, "compact layout on phone-sized viewport")
App.show("Menu")
advance(0.3)
App.show("LobbyRoom")
App.show("Shop")
App.show("Race")
advance(0.3)
App.show("Menu")
log("compact/mobile layout switch")

-- Banned subjects never reach the client
for _, query in { "chalamet", "kennedy", "jfk", "armin", "elordi" } do
	local response = remote.OnServerInvoke(me, "Search", { query = query })
	check(response.ok and #response.data == 0, "banned search leaked: " .. query)
end
log("banned subjects unsearchable")

if #Fake.warnings > 0 then
	print("warnings:")
	for _, w in Fake.warnings do
		print("  - " .. w)
	end
end
print("\nSMOKE TEST PASSED")
