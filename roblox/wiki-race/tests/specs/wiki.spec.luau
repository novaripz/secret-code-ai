return function(t, H)
	local WikiRepository = H.server("Wiki/WikiRepository")
	local ChallengeGenerator = H.server("Wiki/ChallengeGenerator")
	local BannedFilter = H.server("Wiki/BannedFilter")
	local TextUtil = H.server("Wiki/TextUtil")
	local Difficulty = H.shared("Difficulty")
	local Config = H.shared("Config")

	local pages = H.loadAllPages()
	local repo = WikiRepository.new(pages)
	local graph = repo.graph

	t.test("dataset is large and fully connected", function()
		t.ok(#graph.ids >= 500, "expected 500+ pages, got " .. #graph.ids)
		t.eq(#graph.mainIds, #graph.ids, "every page in the main strongly connected component")
		t.eq(graph:stats().deadEnds, 0, "no dead-end pages")
	end)

	t.test("every broad category is represented", function()
		local seen = {}
		for _, id in graph.ids do
			seen[graph.nodes[id].category] = true
		end
		for category in H.shared("Categories").Defs do
			t.ok(seen[category], "missing category " .. category)
		end
	end)

	t.test("normalization folds accents and punctuation", function()
		t.eq(TextUtil.normalize("Timothée  Chalamet!"), "timothee chalamet")
		t.eq(TextUtil.normalize("J.F.K."), "j f k")
		t.eq(TextUtil.normalize("Pokémon"), "pokemon")
	end)

	-- Inject banned pages, redirects, links, mentions and categories and prove they vanish.
	t.test("banned subjects are removed from the graph, not hidden", function()
		local poisoned = table.clone(pages)
		table.insert(poisoned, {
			title = "Timothée Chalamet",
			category = "Actor",
			summary = "An actor who starred in [[Film|films]].",
		})
		table.insert(
			poisoned,
			{ title = "John F. Kennedy", category = "Person", aliases = { "JFK" }, summary = "A president." }
		)
		table.insert(poisoned, { title = "Jacob Elordi", category = "Actor", summary = "Actor." })
		table.insert(
			poisoned,
			{
				title = "Armin Arlert",
				category = "Fictional Character",
				summary = "A character in [[Attack on Titan]].",
			}
		)
		table.insert(poisoned, {
			title = "The 35th President",
			category = "Person",
			aliases = { "Jack Kennedy" },
			summary = "Redirect target.",
		})
		table.insert(poisoned, {
			title = "Test Hub",
			category = "Concept",
			tags = { "Chalamet films", "Concepts" },
			summary = "Links to [[Pizza]]. Also see [[John F. Kennedy|the president]]. Armin is brave. Plain sentence stays.",
			sections = { { "Kennedy era", "Hidden section." }, { "Fine", "Linked [[JFK]] here. Visit [[Italy]]." } },
			infobox = { { "Friend", "[[Jacob Elordi]]" }, { "Food", "[[Pizza]]" } },
			related = { "Armin Arlert", "Pizza" },
		})
		local dirtyRepo = WikiRepository.new(poisoned)
		local g = dirtyRepo.graph
		for _, banned in
			{
				"Timothée Chalamet",
				"John F. Kennedy",
				"JFK",
				"Jacob Elordi",
				"Armin Arlert",
				"Jack Kennedy",
				"The 35th President",
			}
		do
			t.eq(g:resolve(banned), nil, "resolves: " .. banned)
		end
		local hub = g.nodes[g:resolve("Test Hub")]
		t.ok(hub, "clean page kept")
		t.eq(#hub.tags, 1, "banned tag removed")
		local text = {}
		for _, run in hub.summary do
			table.insert(text, run.t)
		end
		local joined = table.concat(text)
		t.ok(joined:find("Plain sentence stays", 1, true) ~= nil, "clean sentence kept")
		t.ok(joined:find("president", 1, true) == nil, "sentence linking a banned page removed")
		t.ok(joined:find("Armin", 1, true) == nil, "sentence naming a banned subject removed")
		t.eq(#hub.sections, 1, "banned heading section dropped")
		t.eq(#hub.infobox, 1, "banned infobox row dropped")
		t.eq(#hub.related, 1, "banned related entry dropped")
		for _, targetId in hub.out do
			t.ok(not BannedFilter.isBanned(g.nodes[targetId].title), "edge to banned page")
		end
		t.eq(#BannedFilter.auditGraph(g), 0, "audit clean")
		for _, results in
			{
				dirtyRepo:search("chalamet"),
				dirtyRepo:search("kennedy"),
				dirtyRepo:search("jfk"),
				dirtyRepo:search("armin"),
				dirtyRepo:search("elordi"),
			}
		do
			t.eq(#results, 0, "search leaks a banned page")
		end
	end)

	t.test("shipping dataset passes the banned audit", function()
		t.eq(#BannedFilter.auditGraph(graph), 0)
		t.eq(repo.filterReport.pages, 0, "no banned pages in shipped data")
		for _, id in graph.ids do
			local node = graph.nodes[id]
			t.ok(not BannedFilter.isBanned(node.title), id)
			for _, alias in node.aliases do
				t.ok(not BannedFilter.isBanned(alias), alias)
			end
		end
	end)

	t.test("redirects resolve to canonical pages", function()
		t.eq(graph:resolve("USA"), "united_states")
		t.eq(graph:resolve("soccer"), "association_football")
		t.ok(graph:isRedirect("NYC"))
	end)

	t.test("challenge generation obeys every difficulty rule", function()
		local generator = ChallengeGenerator.new(graph)
		local rng = Random.new(7)
		for _, key in Difficulty.Order do
			local def = Difficulty.get(key)
			local floor = generator:floor(key)
			t.ok(floor >= Config.Race.MinStartDistance, "floor >= 4")
			if def.mustFreeze then
				t.ok(floor >= Config.Race.FreezingDistance, key .. " must start freezing")
			end
			for _ = 1, 120 do
				local challenge = generator:generate(key, { rng = rng })
				t.ok(challenge, key .. " generated")
				local d = graph:distance(challenge.start, challenge.target)
				t.eq(d, challenge.distance, "reported distance")
				t.ok(d >= floor, ("%s start too close: %d"):format(key, d))
				t.ok(d ~= math.huge, "reachable")
				t.ok(challenge.start ~= challenge.target, "distinct pages")
				t.eq(#challenge.path - 1, d, "optimal path length")
				for i = 1, #challenge.path - 1 do
					t.ok(graph:hasEdge(challenge.path[i], challenge.path[i + 1]), "path uses real links")
				end
			end
		end
	end)

	t.test("validation rejects starts that are Warm/Hot/Burning", function()
		local generator = ChallengeGenerator.new(graph)
		local target = "pizza"
		local distances = graph:distancesTo(target)
		for id, d in distances do
			if d >= 1 and d <= 3 then
				local ok = generator:validate({ start = id, target = target }, "SuperEasy")
				t.ok(not ok, "accepted a start " .. d .. " links away")
			elseif d == 4 then
				t.ok(generator:validate({ start = id, target = target }, "Easy"), "distance 4 is fine for Easy")
				t.ok(not generator:validate({ start = id, target = target }, "Medium"), "distance 4 is not Freezing")
			end
		end
	end)

	t.test("rig target is freezing from every player page", function()
		local generator = ChallengeGenerator.new(graph)
		local current = { "pizza", "minecraft", "nasa", "lionel_messi" }
		local target = generator:generateRigTarget(current, { rng = Random.new(3) })
		t.ok(target, "rig target found")
		for _, pageId in current do
			t.ok(graph:distance(pageId, target) >= 5, "rig target too close to " .. pageId)
		end
	end)

	t.test("solo race from a fixed start page", function()
		local generator = ChallengeGenerator.new(graph)
		local challenge = generator:generate("Medium", { rng = Random.new(9), fixedStart = "minecraft" })
		t.ok(challenge, "generated from fixed start")
		t.eq(challenge.start, "minecraft")
		t.ok(challenge.distance >= 5)
	end)

	t.test("search, categories and payloads", function()
		local results = repo:search("piz")
		t.eq(results[1].id, "pizza")
		local byAlias = repo:search("soccer")
		t.eq(byAlias[1].id, "association_football")
		t.eq(byAlias[1].redirectFrom, "Soccer")
		local category = repo:category("Food")
		t.ok(category and #category.pages > 10)
		local payload = repo:payload("pizza")
		t.eq(payload.title, "Pizza")
		t.ok(#payload.summary > 0 and #payload.sections > 0 and #payload.history == 5)
		local linkCount = 0
		for _, run in payload.summary do
			if run.l then
				linkCount += 1
				t.ok(graph:hasEdge("pizza", run.l), "rendered link is a real edge")
			end
		end
		t.ok(linkCount > 0)
	end)
end
