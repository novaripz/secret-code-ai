-- The wiki as a directed graph: every page is a node, every clickable link is an edge.
--
-- Built once at server start from (already banned-filtered) page data. Markup is parsed into
-- render-ready text runs; links that point at missing pages degrade to plain text, so the
-- only clickable links are real edges. Shortest-path queries use BFS over reverse edges and
-- are cached per target, which makes the hot/cold meter O(1) per click.

local TextUtil = require(script.Parent.TextUtil)
local Shared = game:GetService("ReplicatedStorage"):WaitForChild("WikiRaceShared")
local Categories = require(Shared.Categories)

local WikiGraph = {}
WikiGraph.__index = WikiGraph

local DISTANCE_CACHE_SIZE = 256
local INFINITY = math.huge

function WikiGraph.build(pages, options)
	options = options or {}
	local self = setmetatable({
		nodes = {},
		ids = {},
		index = {}, -- normalized title/alias → id
		redirects = {}, -- normalized alias → id
		categoryIndex = {}, -- category or tag → { ids }
		edgeCount = 0,
		warnings = {},
		_distCache = {},
		_distOrder = {},
	}, WikiGraph)

	-- Pass 1: nodes and the title/redirect index.
	for _, page in pages do
		local id = page.id or TextUtil.slug(page.title)
		if id == "" or self.nodes[id] then
			table.insert(self.warnings, "duplicate or empty page id: " .. tostring(id))
			continue
		end
		local category = Categories.Defs[page.category] and page.category or "Concept"
		local node = {
			id = id,
			title = page.title,
			category = category,
			group = Categories.group(category),
			fame = math.clamp(tonumber(page.fame) or 2, 1, 3),
			emoji = page.emoji or Categories.get(category).emoji,
			image = page.image or (options.images and options.images[id]) or nil,
			photo = page.photo or (options.photos and options.photos[page.title]) or nil,
			funny = page.funny,
			source = page.source,
			description = page.description,
			tags = page.tags or {},
			aliases = page.aliases or {},
			out = {},
			outSet = {},
			inList = {},
			_raw = page,
		}
		self.nodes[id] = node
		table.insert(self.ids, id)
		local normalizedTitle = TextUtil.normalize(page.title)
		if self.index[normalizedTitle] and self.index[normalizedTitle] ~= id then
			table.insert(self.warnings, "title collision: " .. page.title)
		end
		self.index[normalizedTitle] = id
		self.index[TextUtil.normalize(id)] = self.index[TextUtil.normalize(id)] or id
	end
	for _, id in self.ids do
		for _, alias in self.nodes[id].aliases do
			local normalized = TextUtil.normalize(alias)
			if not self.index[normalized] then
				self.index[normalized] = id
				self.redirects[normalized] = id
			end
		end
	end
	table.sort(self.ids)

	-- Pass 2: parse markup into runs and collect edges.
	for _, id in self.ids do
		local node = self.nodes[id]
		local raw = node._raw
		local function addEdge(targetId)
			if targetId ~= id and not node.outSet[targetId] then
				node.outSet[targetId] = true
				table.insert(node.out, targetId)
			end
		end
		node.summary = self:_parse(raw.summary or "", id, addEdge)
		node.sections = {}
		for _, section in raw.sections or {} do
			local heading, body = section[1] or section.heading, section[2] or section.body
			local paragraphs = {}
			for _, chunk in string.split(body or "", "\n\n") do
				if chunk:match("%S") then
					table.insert(paragraphs, self:_parse(chunk, id, addEdge))
				end
			end
			if #paragraphs > 0 then
				table.insert(node.sections, { heading = heading, paragraphs = paragraphs })
			end
		end
		node.infobox = {}
		for _, row in raw.infobox or {} do
			table.insert(node.infobox, { label = row[1], runs = self:_parse(row[2] or "", id, addEdge) })
		end
		node.related = {}
		for _, title in raw.related or {} do
			local targetId = self:resolve(title)
			if targetId and targetId ~= id and not table.find(node.related, targetId) then
				table.insert(node.related, targetId)
				addEdge(targetId)
			end
		end
		node._raw = nil
	end

	-- Pass 3: reverse edges, category index.
	for _, id in self.ids do
		local node = self.nodes[id]
		self.edgeCount += #node.out
		for _, targetId in node.out do
			table.insert(self.nodes[targetId].inList, id)
		end
		local seen = {}
		for _, name in { node.category, table.unpack(node.tags) } do
			if not seen[name] then
				seen[name] = true
				self.categoryIndex[name] = self.categoryIndex[name] or {}
				table.insert(self.categoryIndex[name], id)
			end
		end
	end

	self:_computeComponents()
	return self
end

-- Parses "[[Target]]", "[[Target|label]]" and "**bold**" into { t = text, l = linkId?, b = bold? } runs.
function WikiGraph:_parse(markup: string, selfId: string, addEdge)
	local runs = {}
	local bold = false
	local position = 1
	local length = #markup

	local function pushText(text)
		if text == "" then
			return
		end
		local last = runs[#runs]
		if last and not last.l and (last.b == true) == bold then
			last.t ..= text
		else
			table.insert(runs, { t = text, b = bold or nil })
		end
	end

	while position <= length do
		local linkStart = string.find(markup, "[[", position, true)
		local boldStart = string.find(markup, "**", position, true)
		local nextPosition = math.min(linkStart or INFINITY, boldStart or INFINITY)
		if nextPosition == INFINITY then
			pushText(string.sub(markup, position))
			break
		end
		pushText(string.sub(markup, position, nextPosition - 1))
		if nextPosition == boldStart then
			bold = not bold
			position = boldStart + 2
		else
			local close = string.find(markup, "]]", linkStart + 2, true)
			if not close then
				pushText(string.sub(markup, linkStart))
				break
			end
			local inner = string.sub(markup, linkStart + 2, close - 1)
			local target, label = string.match(inner, "^(.-)|(.*)$")
			if not target then
				target, label = inner, inner
			end
			local targetId = self:resolve(target)
			if targetId and targetId ~= selfId then
				table.insert(runs, { t = label, l = targetId, b = bold or nil })
				addEdge(targetId)
			else
				pushText(label)
			end
			position = close + 2
		end
	end
	return runs
end

function WikiGraph:resolve(text: string?): string?
	if type(text) ~= "string" then
		return nil
	end
	if self.nodes[text] then
		return text
	end
	return self.index[TextUtil.normalize(text)]
end

function WikiGraph:isRedirect(text: string): boolean
	return self.redirects[TextUtil.normalize(text)] ~= nil
end

function WikiGraph:node(id: string)
	return self.nodes[id]
end

function WikiGraph:hasEdge(fromId: string, toId: string): boolean
	local node = self.nodes[fromId]
	return node ~= nil and node.outSet[toId] == true
end

function WikiGraph:outDegree(id: string): number
	local node = self.nodes[id]
	return node and #node.out or 0
end

function WikiGraph:inDegree(id: string): number
	local node = self.nodes[id]
	return node and #node.inList or 0
end

-- Distance from every node TO `targetId` (BFS on reverse edges). Cached (LRU).
function WikiGraph:distancesTo(targetId: string)
	local cached = self._distCache[targetId]
	if cached then
		local position = table.find(self._distOrder, targetId)
		if position then
			table.remove(self._distOrder, position)
		end
		table.insert(self._distOrder, targetId)
		return cached
	end
	local distances = {}
	if self.nodes[targetId] then
		distances[targetId] = 0
		local queue, head = { targetId }, 1
		while head <= #queue do
			local current = queue[head]
			head += 1
			local nextDistance = distances[current] + 1
			for _, previous in self.nodes[current].inList do
				if distances[previous] == nil then
					distances[previous] = nextDistance
					table.insert(queue, previous)
				end
			end
		end
	end
	self._distCache[targetId] = distances
	table.insert(self._distOrder, targetId)
	if #self._distOrder > DISTANCE_CACHE_SIZE then
		local evicted = table.remove(self._distOrder, 1)
		self._distCache[evicted] = nil
	end
	return distances
end

-- Distance from `sourceId` to every node (forward BFS). Not cached.
function WikiGraph:distancesFrom(sourceId: string)
	local distances = {}
	if not self.nodes[sourceId] then
		return distances
	end
	distances[sourceId] = 0
	local queue, head = { sourceId }, 1
	while head <= #queue do
		local current = queue[head]
		head += 1
		local nextDistance = distances[current] + 1
		for _, nextId in self.nodes[current].out do
			if distances[nextId] == nil then
				distances[nextId] = nextDistance
				table.insert(queue, nextId)
			end
		end
	end
	return distances
end

function WikiGraph:distance(fromId: string, toId: string): number
	return self:distancesTo(toId)[fromId] or INFINITY
end

-- One shortest path (list of ids, inclusive) or nil if unreachable. Deterministic.
function WikiGraph:shortestPath(fromId: string, toId: string)
	local distances = self:distancesTo(toId)
	local remaining = distances[fromId]
	if remaining == nil then
		return nil
	end
	local path = { fromId }
	local current = fromId
	while current ~= toId do
		local best = nil
		for _, nextId in self.nodes[current].out do
			if distances[nextId] == remaining - 1 then
				best = nextId
				break
			end
		end
		if not best then
			return nil
		end
		current = best
		remaining -= 1
		table.insert(path, current)
	end
	return path
end

-- Strongly connected components (iterative Kosaraju). Challenges only use the largest one,
-- which guarantees every start can reach its target and nobody spawns on a dead end.
function WikiGraph:_computeComponents()
	local visited, order = {}, {}
	for _, root in self.ids do
		if not visited[root] then
			visited[root] = true
			local stack = { { root, 1 } }
			while #stack > 0 do
				local frame = stack[#stack]
				local node = self.nodes[frame[1]]
				local nextId = node.out[frame[2]]
				if nextId then
					frame[2] += 1
					if not visited[nextId] then
						visited[nextId] = true
						table.insert(stack, { nextId, 1 })
					end
				else
					table.insert(order, frame[1])
					table.remove(stack)
				end
			end
		end
	end

	local component = {}
	local sizes = {}
	local count = 0
	for i = #order, 1, -1 do
		local root = order[i]
		if component[root] == nil then
			count += 1
			component[root] = count
			sizes[count] = 1
			local stack = { root }
			while #stack > 0 do
				local current = table.remove(stack)
				for _, previous in self.nodes[current].inList do
					if component[previous] == nil then
						component[previous] = count
						sizes[count] += 1
						table.insert(stack, previous)
					end
				end
			end
		end
	end

	local largest, largestSize = nil, 0
	for index, size in sizes do
		if size > largestSize then
			largest, largestSize = index, size
		end
	end
	self.main = {}
	self.mainIds = {}
	for _, id in self.ids do
		if component[id] == largest then
			self.main[id] = true
			table.insert(self.mainIds, id)
		end
	end
	self.componentCount = count
end

function WikiGraph:inMain(id: string): boolean
	return self.main[id] == true
end

function WikiGraph:stats()
	local maxIn, maxOut, deadEnds = 0, 0, 0
	for _, id in self.ids do
		local node = self.nodes[id]
		maxIn = math.max(maxIn, #node.inList)
		maxOut = math.max(maxOut, #node.out)
		if #node.out == 0 then
			deadEnds += 1
		end
	end
	return {
		pages = #self.ids,
		edges = self.edgeCount,
		averageOut = #self.ids > 0 and self.edgeCount / #self.ids or 0,
		maxIn = maxIn,
		maxOut = maxOut,
		deadEnds = deadEnds,
		mainComponent = #self.mainIds,
		components = self.componentCount,
		redirects = (function()
			local n = 0
			for _ in self.redirects do
				n += 1
			end
			return n
		end)(),
	}
end

return WikiGraph
