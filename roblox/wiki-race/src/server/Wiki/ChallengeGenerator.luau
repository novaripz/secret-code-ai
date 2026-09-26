-- Generates start → target challenges from the real wiki graph.
--
-- Rules enforced here (and re-checked by `validate` before any round starts):
--   * start ≠ target, both exist, both in the graph's main strongly-connected component
--   * the true shortest-path distance is ≥ 4 (never starts Warm/Hot/Burning)
--   * Medium / Hard / Extreme / Give Up start Freezing (≥ 5)
--   * difficulty bands for distance, page fame and target in-degree
--   * start and target usually come from different subject groups ("interesting pairs")
--   * recently used targets/starts are avoided
-- Candidates that fail are discarded and regenerated; constraints relax step by step, but the
-- distance floor is never relaxed.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Difficulty = require(Shared.Difficulty)
local Categories = require(Shared.Categories)
local BannedFilter = require(script.Parent.BannedFilter)

local ChallengeGenerator = {}
ChallengeGenerator.__index = ChallengeGenerator

local MAX_TARGET_ATTEMPTS = 40

function ChallengeGenerator.new(graph)
	local self = setmetatable({ graph = graph }, ChallengeGenerator)
	self._categoryMembers = {}
	for _, id in graph.mainIds do
		local node = graph.nodes[id]
		self._categoryMembers[node.category] = self._categoryMembers[node.category] or {}
		table.insert(self._categoryMembers[node.category], id)
	end
	local total = 0
	for _, template in Categories.PairTemplates do
		total += template.weight
	end
	self._templateWeight = total
	return self
end

function ChallengeGenerator:floor(difficultyKey: string): number
	return Difficulty.floor(difficultyKey, Config.Race.MinStartDistance, Config.Race.FreezingDistance)
end

local function inRange(value, range)
	return range == nil or (value >= range[1] and value <= range[2])
end

local function shuffle(list, rng)
	for i = #list, 2, -1 do
		local j = rng:NextInteger(1, i)
		list[i], list[j] = list[j], list[i]
	end
	return list
end

-- Relaxation levels: 0 strict, 1 drop templates, 2 drop fame/in-degree, 3 widen distance band.
function ChallengeGenerator:_targetOk(id, def, level, params)
	local graph = self.graph
	local node = graph.nodes[id]
	if not node or not graph:inMain(id) then
		return false
	end
	if params.excludeTargets and params.excludeTargets[id] then
		return false
	end
	if level < 2 then
		if not inRange(node.fame, def.targetFame) then
			return false
		end
		local inDegree = #node.inList
		if def.minTargetInDegree and inDegree < def.minTargetInDegree then
			return false
		end
		if def.maxTargetInDegree and inDegree > def.maxTargetInDegree then
			return false
		end
	end
	return true
end

function ChallengeGenerator:_startOk(id, targetId, def, level, params)
	local node = self.graph.nodes[id]
	if id == targetId or not node or not self.graph:inMain(id) then
		return false
	end
	if params.excludeStarts and params.excludeStarts[id] then
		return false
	end
	if level < 2 and not inRange(node.fame, def.startFame) then
		return false
	end
	if def.crossGroup == "require" and level < 3 then
		if node.group == self.graph.nodes[targetId].group then
			return false
		end
	end
	return true
end

function ChallengeGenerator:_pickTemplate(rng)
	local roll = rng:NextNumber() * self._templateWeight
	for _, template in Categories.PairTemplates do
		roll -= template.weight
		if roll <= 0 then
			return template
		end
	end
	return Categories.PairTemplates[1]
end

local function membersOf(self, categoryList)
	local ids = {}
	for _, category in categoryList do
		for _, id in self._categoryMembers[category] or {} do
			table.insert(ids, id)
		end
	end
	return ids
end

-- Picks a start for a fixed target given the distance map, honoring the difficulty band.
function ChallengeGenerator:_pickStart(targetId, distances, def, level, params, preferredStarts, rng)
	local floor = params.floor
	local maxDistance = level >= 3 and 99 or def.maxDistance
	local minDistance = math.max(floor, level >= 3 and floor or def.minDistance)
	local candidates = {}
	local farthest = 0
	local pool = preferredStarts or self.graph.mainIds
	for _, id in pool do
		local distance = distances[id]
		if distance and distance >= minDistance and distance <= maxDistance then
			if self:_startOk(id, targetId, def, level, params) then
				table.insert(candidates, { id = id, distance = distance })
				farthest = math.max(farthest, distance)
			end
		end
	end
	if #candidates == 0 then
		return nil
	end
	local preferred = candidates
	if def.preferFarthest then
		preferred = {}
		for _, candidate in candidates do
			if candidate.distance == farthest then
				table.insert(preferred, candidate)
			end
		end
	elseif def.preferDistance then
		local exact = {}
		for _, candidate in candidates do
			if candidate.distance == def.preferDistance then
				table.insert(exact, candidate)
			end
		end
		if #exact > 0 and rng:NextNumber() < 0.75 then
			preferred = exact
		end
	end
	-- Crossing subject groups makes routes more interesting; prefer it where the rules allow.
	if def.crossGroup == "prefer" and level < 1 then
		local crossing = {}
		local targetGroup = self.graph.nodes[targetId].group
		for _, candidate in preferred do
			if self.graph.nodes[candidate.id].group ~= targetGroup then
				table.insert(crossing, candidate)
			end
		end
		if #crossing > 0 then
			preferred = crossing
		end
	end
	return preferred[rng:NextInteger(1, #preferred)]
end

function ChallengeGenerator:_build(startId, targetId, difficultyKey, pairLabel)
	local graph = self.graph
	local path = graph:shortestPath(startId, targetId)
	return {
		start = startId,
		target = targetId,
		distance = path and (#path - 1) or math.huge,
		path = path,
		difficulty = difficultyKey,
		pair = pairLabel or (graph.nodes[startId].category .. " → " .. graph.nodes[targetId].category),
	}
end

-- params: { rng = Random, excludeTargets = set?, excludeStarts = set?, fixedStart = id? }
function ChallengeGenerator:generate(difficultyKey: string, params)
	assert(Difficulty.isValid(difficultyKey), "unknown difficulty")
	params = table.clone(params or {})
	local rng = params.rng or Random.new()
	local def = Difficulty.get(difficultyKey)
	params.floor = self:floor(difficultyKey)

	if params.fixedStart then
		return self:_generateFromStart(difficultyKey, params, rng)
	end

	for level = 0, 3 do
		for _ = 1, MAX_TARGET_ATTEMPTS do
			local template = level == 0 and self:_pickTemplate(rng) or nil
			local targetPool = template and membersOf(self, template.to) or self.graph.mainIds
			if #targetPool == 0 then
				continue
			end
			local targetId = targetPool[rng:NextInteger(1, #targetPool)]
			if not self:_targetOk(targetId, def, level, params) then
				continue
			end
			local distances = self.graph:distancesTo(targetId)
			local startPool = template and membersOf(self, template.from) or nil
			local pick = self:_pickStart(targetId, distances, def, level, params, startPool, rng)
			if pick then
				local challenge = self:_build(pick.id, targetId, difficultyKey)
				local ok = self:validate(challenge, difficultyKey)
				if ok then
					challenge.relaxation = level
					return challenge
				end
			end
		end
	end
	return nil, "no valid challenge found"
end

-- Solo race "from this page": the start is fixed; find a target at the right distance.
function ChallengeGenerator:_generateFromStart(difficultyKey, params, rng)
	local startId = params.fixedStart
	if not self.graph:inMain(startId) then
		return nil, "that page can't be used as a starting page"
	end
	local def = Difficulty.get(difficultyKey)
	local forward = self.graph:distancesFrom(startId)
	for level = 0, 3 do
		local maxDistance = level >= 3 and 99 or def.maxDistance
		local minDistance = math.max(params.floor, level >= 3 and params.floor or def.minDistance)
		local candidates, farthest = {}, 0
		for _, id in self.graph.mainIds do
			local distance = forward[id]
			if
				distance
				and distance >= minDistance
				and distance <= maxDistance
				and self:_targetOk(id, def, level, params)
			then
				if
					def.crossGroup ~= "require"
					or level >= 3
					or self.graph.nodes[id].group ~= self.graph.nodes[startId].group
				then
					table.insert(candidates, { id = id, distance = distance })
					farthest = math.max(farthest, distance)
				end
			end
		end
		if def.preferFarthest then
			local filtered = {}
			for _, candidate in candidates do
				if candidate.distance == farthest then
					table.insert(filtered, candidate)
				end
			end
			candidates = filtered
		end
		shuffle(candidates, rng)
		for _, candidate in candidates do
			local challenge = self:_build(startId, candidate.id, difficultyKey)
			if self:validate(challenge, difficultyKey) then
				challenge.relaxation = level
				return challenge
			end
		end
	end
	return nil, "no target is far enough from that page"
end

-- Server Rig: pick ONE new target that is Freezing (or as far as possible, never closer than the
-- difficulty floor) from every player's current page.
function ChallengeGenerator:generateRigTarget(currentPages: { string }, params)
	params = params or {}
	local rng = params.rng or Random.new()
	local floor = self:floor("GiveUp")
	local maps = {}
	for _, pageId in currentPages do
		maps[pageId] = maps[pageId] or self.graph:distancesFrom(pageId)
	end
	local best, bestScore = {}, -1
	for _, id in self.graph.mainIds do
		if params.excludeTargets and params.excludeTargets[id] then
			continue
		end
		local minimum = math.huge
		for _, distances in maps do
			local distance = distances[id]
			if distance == nil then
				minimum = -1
				break
			end
			minimum = math.min(minimum, distance)
		end
		if minimum >= floor then
			-- Obscure targets with few ways in are funnier.
			local score = minimum * 10 + (self.graph.nodes[id].fame * 2) - math.min(#self.graph.nodes[id].inList, 8)
			if score > bestScore then
				best, bestScore = { id }, score
			elseif score == bestScore then
				table.insert(best, id)
			end
		end
	end
	if #best == 0 then
		return nil
	end
	return best[rng:NextInteger(1, #best)]
end

-- Authoritative validation. Called for every generated challenge and again by the match
-- right before a round starts.
function ChallengeGenerator:validate(challenge, difficultyKey: string?)
	local graph = self.graph
	if type(challenge) ~= "table" then
		return false, "missing challenge"
	end
	local startId, targetId = challenge.start, challenge.target
	if type(startId) ~= "string" or type(targetId) ~= "string" then
		return false, "missing pages"
	end
	if startId == targetId then
		return false, "start equals target"
	end
	local startNode, targetNode = graph.nodes[startId], graph.nodes[targetId]
	if not startNode or not targetNode then
		return false, "unknown page"
	end
	if not graph:inMain(startId) or not graph:inMain(targetId) then
		return false, "page outside main component"
	end
	if BannedFilter.isBanned(startNode.title) or BannedFilter.isBanned(targetNode.title) then
		return false, "banned page"
	end
	local distance = graph:distance(startId, targetId)
	if distance == math.huge then
		return false, "target unreachable"
	end
	local floor = self:floor(difficultyKey or challenge.difficulty or "Easy")
	if distance < floor then
		return false, ("start too close (%d < %d)"):format(distance, floor)
	end
	challenge.distance = distance
	return true
end

return ChallengeGenerator
