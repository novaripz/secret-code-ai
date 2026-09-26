-- Owns the single server-wide wiki repository, graph and challenge generator.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local Config = require(ReplicatedStorage:WaitForChild("WikiRaceShared").Config)
local Wiki = script.Parent.Parent.Wiki
local WikiRepository = require(Wiki.WikiRepository)
local ChallengeGenerator = require(Wiki.ChallengeGenerator)

local WikiService = {}

function WikiService.init()
	local started = os.clock()
	local pages = WikiRepository.collectPages(ServerStorage:WaitForChild("WikiData"))
	local repo = WikiRepository.new(pages, { images = Config.PageImages })
	WikiService.repo = repo
	WikiService.graph = repo.graph
	WikiService.generator = ChallengeGenerator.new(repo.graph)
	local stats = repo.graph:stats()
	print(
		("[WikiRace] Wiki ready: %d pages, %d links, %d redirects, main component %d (%.0f ms). Filter removed %d pages / %d sentences."):format(
			stats.pages,
			stats.edges,
			stats.redirects,
			stats.mainComponent,
			(os.clock() - started) * 1000,
			repo.filterReport.pages,
			repo.filterReport.sentences
		)
	)
	for _, warning in repo.graph.warnings do
		warn("[WikiRace] " .. warning)
	end
end

return WikiService
