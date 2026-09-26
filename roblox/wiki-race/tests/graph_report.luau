-- Prints wiki graph health: size, connectivity, unresolved links, distance histogram and
-- challenge generation success per difficulty. Usage: luaurun tests/graph_report.luau <root>
local ROOT = arg[1] or "."
local H = loadchunk(readfile(ROOT .. "/tests/harness.luau"), "harness", _G)()

local WikiRepository = H.server("Wiki/WikiRepository")
local ChallengeGenerator = H.server("Wiki/ChallengeGenerator")
local TextUtil = H.server("Wiki/TextUtil")
local Difficulty = H.shared("Difficulty")

local pages = H.loadAllPages()
local repo = WikiRepository.new(pages)
local graph = repo.graph
local stats = graph:stats()
print(
	("pages=%d edges=%d avgOut=%.2f maxIn=%d maxOut=%d deadEnds=%d mainSCC=%d components=%d redirects=%d"):format(
		stats.pages,
		stats.edges,
		stats.averageOut,
		stats.maxIn,
		stats.maxOut,
		stats.deadEnds,
		stats.mainComponent,
		stats.components,
		stats.redirects
	)
)
for _, w in graph.warnings do
	print("WARN", w)
end

-- Unresolved link targets (degrade to plain text; listed so authors can add pages).
local unresolved = {}
for _, page in pages do
	local chunks = { page.summary or "" }
	for _, s in page.sections or {} do
		table.insert(chunks, s[2] or "")
	end
	for _, r in page.infobox or {} do
		table.insert(chunks, r[2] or "")
	end
	for _, chunk in chunks do
		for _, target in TextUtil.linkTargets(chunk) do
			if not graph:resolve(target) then
				unresolved[target] = (unresolved[target] or 0) + 1
			end
		end
	end
	for _, rel in page.related or {} do
		if not graph:resolve(rel) then
			unresolved["related:" .. rel] = (unresolved["related:" .. rel] or 0) + 1
		end
	end
end
local list = {}
for k, v in unresolved do
	table.insert(list, k .. "×" .. v)
end
table.sort(list)
print("unresolved (" .. #list .. "): " .. table.concat(list, ", "))

-- Pages outside the main component.
local outside = {}
for _, id in graph.ids do
	if not graph:inMain(id) then
		table.insert(outside, id .. "(in=" .. #graph.nodes[id].inList .. ",out=" .. #graph.nodes[id].out .. ")")
	end
end
print("outside main SCC (" .. #outside .. "): " .. table.concat(outside, ", "))

-- Distance histogram over all main-component pairs.
local histogram = {}
local maxD = 0
for _, target in graph.mainIds do
	local d = graph:distancesTo(target)
	for _, source in graph.mainIds do
		local v = d[source]
		if v and v > 0 then
			histogram[v] = (histogram[v] or 0) + 1
			maxD = math.max(maxD, v)
		end
	end
end
local total = 0
for _, c in histogram do
	total += c
end
for d = 1, maxD do
	print(("dist %d: %6d (%.1f%%)"):format(d, histogram[d] or 0, 100 * (histogram[d] or 0) / total))
end

-- Fame distribution and in-degree extremes.
local fameCount = { 0, 0, 0 }
for _, id in graph.ids do
	fameCount[graph.nodes[id].fame] += 1
end
print(("fame 1=%d 2=%d 3=%d"):format(fameCount[1], fameCount[2], fameCount[3]))

-- Challenge generation per difficulty.
local generator = ChallengeGenerator.new(graph)
local rng = Random.new(42)
for _, key in Difficulty.Order do
	local ok, fail, relax, distances, pairs = 0, 0, 0, {}, {}
	local uniqueTargets = {}
	for i = 1, 150 do
		local c = generator:generate(key, { rng = rng })
		if c then
			ok += 1
			relax += c.relaxation > 0 and 1 or 0
			distances[c.distance] = (distances[c.distance] or 0) + 1
			uniqueTargets[c.target] = true
			if i <= 3 then
				table.insert(
					pairs,
					graph.nodes[c.start].title .. " → " .. graph.nodes[c.target].title .. " (" .. c.distance .. ")"
				)
			end
		else
			fail += 1
		end
	end
	local dl = {}
	for d, c in distances do
		table.insert(dl, d .. ":" .. c)
	end
	table.sort(dl)
	local nTargets = 0
	for _ in uniqueTargets do
		nTargets += 1
	end
	print(
		("%-9s ok=%3d fail=%d relaxed=%3d targets=%3d dist={%s}  e.g. %s"):format(
			key,
			ok,
			fail,
			relax,
			nTargets,
			table.concat(dl, " "),
			table.concat(pairs, " | ")
		)
	)
end
