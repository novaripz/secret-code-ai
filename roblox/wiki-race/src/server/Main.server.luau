-- Wiki Race server bootstrap. Initializes every system in dependency order.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)

local Services = script.Parent.Services
local Router = require(Services.Router)
local WikiService = require(Services.WikiService)
local DataService = require(Services.DataService)
local MonetizationService = require(Services.MonetizationService)
local CosmeticService = require(Services.CosmeticService)
local RecordService = require(Services.RecordService)
local LeaderboardService = require(Services.LeaderboardService)
local LobbyService = require(Services.LobbyService)
local ChaosService = require(Services.ChaosService)
local FreeRoamService = require(Services.FreeRoamService)

Router.init()
WikiService.init()
DataService.init()
MonetizationService.init()
CosmeticService.init()
RecordService.init()
LeaderboardService.init()
LobbyService.init()
ChaosService.init()
FreeRoamService.init()

Router.on(Net.Actions.Bootstrap, function(player)
	DataService.waitFor(player, 20)
	local repo = WikiService.repo
	return {
		profile = DataService.snapshot(player),
		lobbies = LobbyService.listPublic(),
		lobby = LobbyService.lobbyOf(player) and LobbyService.snapshot(LobbyService.lobbyOf(player)) or nil,
		records = RecordService.all(),
		categories = repo:categoryList(),
		pageCount = #repo.graph.ids,
		sampleTitles = repo:sampleTitles(40, Random.new(), nil),
		studio = RunService:IsStudio(),
		debugPurchases = RunService:IsStudio() and Config.Studio.AllowDebugPurchases,
		persistent = DataService.isPersistent(),
	}
end, { rate = 0.5, burst = 3 })

Players.CharacterAutoLoads = false
print(("[WikiRace] Server ready (v%s)."):format(Config.Version))
