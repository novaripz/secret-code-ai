-- Loads every wiki data module, strips banned subjects, builds the graph and serves
-- render-ready page payloads, previews, search results and category listings.
--
-- To expand the wiki, drop more ModuleScripts (each returning a list of pages) anywhere under
-- ServerStorage.WikiData — nothing else in the game needs to change.

local TextUtil = require(script.Parent.TextUtil)
local BannedFilter = require(script.Parent.BannedFilter)
local WikiGraph = require(script.Parent.WikiGraph)

local WikiRepository = {}
WikiRepository.__index = WikiRepository

local PAYLOAD_CACHE_SIZE = 400

local EDITORS = {
	"LinkLibrarian",
	"WikiGnome42",
	"CitationNeeded",
	"TheCartographer",
	"EditBot",
	"FootnoteFan",
	"InfoboxWizard",
	"CopyeditCat",
	"RabbitHoleRanger",
	"PageTurner",
}
local EDIT_NOTES = {
	"Copyedit for clarity",
	"Added internal links",
	"Expanded the history section",
	"Updated infobox",
	"Reverted vandalism",
	"Fixed a typo",
	"Added see-also entries",
	"Merged duplicate paragraph",
	"Improved lead section",
	"Tidied categories",
}

-- Collects pages from every ModuleScript below `folder`, in a stable order.
function WikiRepository.collectPages(folder: Instance)
	local modules = {}
	for _, descendant in folder:GetDescendants() do
		if descendant:IsA("ModuleScript") then
			table.insert(modules, descendant)
		end
	end
	table.sort(modules, function(a, b)
		return a:GetFullName() < b:GetFullName()
	end)
	local pages = {}
	for _, module in modules do
		local ok, result = pcall(require, module)
		if ok and type(result) == "table" then
			for _, page in result do
				table.insert(pages, page)
			end
		else
			warn(("[WikiRace] Failed to load wiki module %s: %s"):format(module:GetFullName(), tostring(result)))
		end
	end
	return pages
end

-- Splits `{ patch = "Title", related = {...} }` records out of the page list and merges their
-- "See also" entries into the page they name (by title or redirect). Module tables are never
-- mutated: patched pages are shallow copies. Patches naming a missing page are ignored.
function WikiRepository.applyPatches(rawPages)
	local pages, patches = {}, {}
	for _, page in rawPages do
		if type(page) == "table" and type(page.patch) == "string" then
			table.insert(patches, page)
		else
			table.insert(pages, page)
		end
	end
	if #patches == 0 then
		return pages, 0
	end
	local byName = {}
	for index, page in pages do
		if type(page) == "table" and type(page.title) == "string" then
			byName[TextUtil.normalize(page.title)] = byName[TextUtil.normalize(page.title)] or index
		end
	end
	for index, page in pages do
		if type(page) == "table" then
			for _, alias in page.aliases or {} do
				byName[TextUtil.normalize(alias)] = byName[TextUtil.normalize(alias)] or index
			end
		end
	end
	local applied = 0
	local copied = {}
	for _, patch in patches do
		local index = byName[TextUtil.normalize(patch.patch)]
		if index then
			if not copied[index] then
				copied[index] = true
				pages[index] = table.clone(pages[index])
				pages[index].related = table.clone(pages[index].related or {})
			end
			for _, title in patch.related or {} do
				if not table.find(pages[index].related, title) then
					table.insert(pages[index].related, title)
				end
			end
			applied += 1
		end
	end
	return pages, applied
end

function WikiRepository.new(rawPages, options)
	options = options or {}
	local self = setmetatable({}, WikiRepository)

	local patchedPages, patchCount = WikiRepository.applyPatches(rawPages)
	local cleaned, report = BannedFilter.cleanPages(patchedPages)
	report.patches = patchCount
	local graph = WikiGraph.build(cleaned, options)

	-- Defensive audit: anything that still mentions a banned subject is dropped and the graph
	-- is rebuilt without it, so no route can ever touch it.
	for _ = 1, 3 do
		local violations = BannedFilter.auditGraph(graph)
		if #violations == 0 then
			break
		end
		report.audit = (report.audit or 0) + #violations
		local drop = {}
		for _, id in violations do
			drop[id] = true
		end
		local remaining = {}
		for _, page in cleaned do
			if not drop[page.id or TextUtil.slug(page.title)] then
				table.insert(remaining, page)
			end
		end
		cleaned = remaining
		graph = WikiGraph.build(cleaned, options)
	end

	self.graph = graph
	self.filterReport = report
	-- Optional: function(node) → photo payload ({ image, offset, size, credit }) or nil.
	self.photoResolver = options.photoResolver
	self._payloads = {}
	self._payloadOrder = {}
	self:_buildSearchIndex()
	return self
end

function WikiRepository:_buildSearchIndex()
	local entries = {}
	for _, id in self.graph.ids do
		local node = self.graph.nodes[id]
		table.insert(entries, { norm = TextUtil.normalize(node.title), id = id })
		for _, alias in node.aliases do
			table.insert(entries, { norm = TextUtil.normalize(alias), id = id, alias = alias })
		end
	end
	self._searchEntries = entries

	local categories = {}
	for name, ids in self.graph.categoryIndex do
		table.insert(categories, { name = name, count = #ids })
	end
	table.sort(categories, function(a, b)
		if a.count ~= b.count then
			return a.count > b.count
		end
		return a.name < b.name
	end)
	self._categoryList = categories
end

local function plainText(runs): string
	local parts = {}
	for _, run in runs do
		table.insert(parts, run.t)
	end
	return table.concat(parts)
end

local function firstSentence(text: string, maxLength: number): string
	local sentence = string.match(text, "^(.-[%.!?])%s") or text
	if #sentence > maxLength then
		sentence = string.sub(sentence, 1, maxLength - 1) .. "…"
	end
	return sentence
end

-- The first `count` words of a page — the race hint for the target.
local function firstWords(text: string, count: number): string
	local words = {}
	for word in string.gmatch(text, "%S+") do
		table.insert(words, word)
		if #words >= count then
			return table.concat(words, " ") .. "…"
		end
	end
	return table.concat(words, " ")
end

local function countWords(runs, total)
	for _, run in runs do
		for _ in string.gmatch(run.t, "%S+") do
			total += 1
		end
	end
	return total
end

function WikiRepository:exists(id: any): boolean
	return type(id) == "string" and self.graph.nodes[id] ~= nil
end

function WikiRepository:title(id: string): string
	local node = self.graph.nodes[id]
	return node and node.title or "?"
end

function WikiRepository:preview(id: string)
	local node = self.graph.nodes[id]
	if not node then
		return nil
	end
	return {
		id = id,
		title = node.title,
		emoji = node.emoji,
		category = node.category,
		image = node.image,
		photo = self:photo(node),
		funny = node.funny,
		blurb = firstSentence(plainText(node.summary), 180),
		hint = firstWords(plainText(node.summary), 25),
	}
end

-- The page's uploaded photo (atlas tile), or nil while not uploaded/resolved yet.
function WikiRepository:photo(node)
	if not node.photo or not self.photoResolver then
		return nil
	end
	local ok, result = pcall(self.photoResolver, node)
	return ok and result or nil
end

function WikiRepository:_history(id: string, node)
	local seed = TextUtil.hash(id)
	local revisions = 12 + seed % 480
	local history = {}
	local daysAgo = seed % 9
	for i = 1, 5 do
		local editor = EDITORS[(seed + i * 7) % #EDITORS + 1]
		local note = EDIT_NOTES[(seed // (i + 1) + i * 3) % #EDIT_NOTES + 1]
		table.insert(history, {
			revision = revisions - (i - 1),
			editor = editor,
			note = note,
			when = daysAgo == 0 and "today" or (daysAgo == 1 and "yesterday" or (daysAgo .. " days ago")),
		})
		daysAgo += 1 + (seed // (i * 13)) % 11
	end
	return revisions, history
end

-- Full render payload for a page. Cached; payloads are immutable once built.
function WikiRepository:payload(id: string)
	local cached = self._payloads[id]
	if cached then
		-- Photos resolve asynchronously after boot, so they are attached on every request.
		cached.photo = self:photo(self.graph.nodes[id])
		return cached
	end
	local graph = self.graph
	local node = graph.nodes[id]
	if not node then
		return nil
	end

	local related = {}
	for _, relatedId in node.related do
		local relatedNode = graph.nodes[relatedId]
		table.insert(related, { id = relatedId, title = relatedNode.title, emoji = relatedNode.emoji })
	end

	local words = countWords(node.summary, 0)
	for _, section in node.sections do
		for _, paragraph in section.paragraphs do
			words = countWords(paragraph, words)
		end
	end

	local revisions, history = self:_history(id, node)
	local categories = { node.category }
	for _, tag in node.tags do
		if not table.find(categories, tag) then
			table.insert(categories, tag)
		end
	end

	local payload = {
		id = id,
		title = node.title,
		category = node.category,
		categories = categories,
		emoji = node.emoji,
		image = node.image,
		photo = self:photo(node),
		funny = node.funny,
		description = node.description,
		source = node.source,
		aliases = node.aliases,
		summary = node.summary,
		sections = node.sections,
		infobox = node.infobox,
		related = related,
		meta = {
			revisions = revisions,
			words = words,
			linksOut = #node.out,
			linksIn = #node.inList,
			updated = history[1].when,
		},
		history = history,
	}

	self._payloads[id] = payload
	table.insert(self._payloadOrder, id)
	if #self._payloadOrder > PAYLOAD_CACHE_SIZE then
		local evicted = table.remove(self._payloadOrder, 1)
		self._payloads[evicted] = nil
	end
	return payload
end

function WikiRepository:search(query: string, limit: number?)
	limit = limit or 12
	local normalized = TextUtil.normalize(query or "")
	if normalized == "" or #normalized > 60 or BannedFilter.isBanned(normalized) then
		return {}
	end
	local best = {}
	for _, entry in self._searchEntries do
		local score = 0
		if entry.norm == normalized then
			score = 100
		elseif string.sub(entry.norm, 1, #normalized) == normalized then
			score = 80
		elseif TextUtil.containsPhrase(entry.norm, normalized) then
			score = 55
		elseif string.find(" " .. entry.norm, " " .. normalized, 1, true) then
			score = 45
		elseif string.find(entry.norm, normalized, 1, true) then
			score = 25
		end
		if score > 0 then
			if entry.alias then
				score -= 5
			end
			local existing = best[entry.id]
			if not existing or existing.score < score then
				best[entry.id] = { score = score, alias = entry.alias }
			end
		end
	end
	local results = {}
	for id, match in best do
		local node = self.graph.nodes[id]
		table.insert(results, {
			id = id,
			title = node.title,
			emoji = node.emoji,
			category = node.category,
			redirectFrom = match.alias,
			blurb = firstSentence(plainText(node.summary), 110),
			score = match.score,
		})
	end
	table.sort(results, function(a, b)
		if a.score ~= b.score then
			return a.score > b.score
		end
		return a.title < b.title
	end)
	while #results > limit do
		table.remove(results)
	end
	return results
end

function WikiRepository:categoryList()
	return self._categoryList
end

function WikiRepository:category(name: string)
	local ids = self.graph.categoryIndex[name]
	if not ids then
		return nil
	end
	local pages = {}
	for _, id in ids do
		local node = self.graph.nodes[id]
		table.insert(pages, { id = id, title = node.title, emoji = node.emoji, category = node.category })
	end
	table.sort(pages, function(a, b)
		return a.title < b.title
	end)
	return { name = name, pages = pages }
end

function WikiRepository:randomId(rng): string
	local ids = self.graph.mainIds
	return ids[rng:NextInteger(1, #ids)]
end

-- A shuffled sample of titles for the reveal slot-machine animation.
function WikiRepository:sampleTitles(count: number, rng, exclude)
	local ids = self.graph.mainIds
	local titles = {}
	local used = {}
	local attempts = 0
	while #titles < math.min(count, #ids) and attempts < count * 6 do
		attempts += 1
		local id = ids[rng:NextInteger(1, #ids)]
		if not used[id] and not (exclude and exclude[id]) then
			used[id] = true
			table.insert(titles, self.graph.nodes[id].title)
		end
	end
	return titles
end

return WikiRepository
