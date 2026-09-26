-- Deterministic scoring. Integer math only, fixed tie-breakers (ending in userId), so the same
-- inputs always produce the same placements and scores on every server.
--
-- Round score (completed) = (600 base + placement 100..500 + time 0..400 + efficiency 0..400
--                            − 50 per redo, max 250) × difficulty multiplier
-- Round score (not completed) = progress toward the target 0..250 (halved when giving up,
--                               except in Give Up Mode) × difficulty multiplier
-- No single statistic decides a match: placement, speed, efficiency and redos all contribute.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("WikiRaceShared")
local Difficulty = require(Shared.Difficulty)

local Scoring = {}

Scoring.Base = 600
Scoring.PlacementMax = 500
Scoring.PlacementMin = 100
Scoring.TimeMax = 400
Scoring.EfficiencyMax = 400
Scoring.RedoPenalty = 50
Scoring.RedoPenaltyCap = 250
Scoring.ProgressMax = 250

local function clamp01(x: number): number
	if x ~= x then
		return 0
	end
	return math.clamp(x, 0, 1)
end

local function compareCompleted(a, b)
	if a.time ~= b.time then
		return a.time < b.time
	end
	if a.clicks ~= b.clicks then
		return a.clicks < b.clicks
	end
	if a.redos ~= b.redos then
		return a.redos < b.redos
	end
	return a.userId < b.userId
end

local function compareUnfinished(a, b)
	if (a.gaveUp or false) ~= (b.gaveUp or false) then
		return not a.gaveUp
	end
	local aBest, bBest = a.bestDistance or math.huge, b.bestDistance or math.huge
	if aBest ~= bBest then
		return aBest < bBest
	end
	local aFinal, bFinal = a.finalDistance or math.huge, b.finalDistance or math.huge
	if aFinal ~= bFinal then
		return aFinal < bFinal
	end
	if a.clicks ~= b.clicks then
		return a.clicks < b.clicks
	end
	return a.userId < b.userId
end

-- Sorts results in place and assigns `placement` (1-based).
function Scoring.rankRound(results)
	table.sort(results, function(a, b)
		if a.completed ~= b.completed then
			return a.completed
		end
		if a.completed then
			return compareCompleted(a, b)
		end
		return compareUnfinished(a, b)
	end)
	for index, result in results do
		result.placement = index
	end
	return results
end

-- ctx: { difficulty, playerCount, timeLimit (seconds, or nil for unlimited), referenceSeconds }
function Scoring.roundScore(result, ctx)
	local def = Difficulty.get(ctx.difficulty)
	local multiplier = def.multiplier
	local breakdown = {}

	if result.completed then
		local count = math.max(1, ctx.playerCount or 1)
		local placementPoints = Scoring.PlacementMax
		if count > 1 then
			local step = (Scoring.PlacementMax - Scoring.PlacementMin) / (count - 1)
			placementPoints = Scoring.PlacementMax - (result.placement - 1) * step
		end
		local reference = ctx.timeLimit or ctx.referenceSeconds or 300
		local timePoints = Scoring.TimeMax * clamp01(1 - result.time / reference)
		local optimal = math.max(1, result.optimal or result.startDistance or 1)
		-- After a Server Rig the route is measured from the rig point (effectiveClicks).
		local clicks = result.effectiveClicks or result.clicks
		local efficiencyPoints = Scoring.EfficiencyMax * clamp01(optimal / math.max(clicks, optimal))
		local redoPenalty = math.min(Scoring.RedoPenaltyCap, (result.redos or 0) * Scoring.RedoPenalty)
		breakdown.base = Scoring.Base
		breakdown.placement = math.floor(placementPoints)
		breakdown.time = math.floor(timePoints)
		breakdown.efficiency = math.floor(efficiencyPoints)
		breakdown.redos = -redoPenalty
		local raw = breakdown.base + breakdown.placement + breakdown.time + breakdown.efficiency + breakdown.redos
		breakdown.multiplier = multiplier
		return math.max(0, math.floor(raw * multiplier + 0.5)), breakdown
	end

	local startDistance = result.startDistance or 0
	local best = result.bestDistance or startDistance
	local progress = 0
	if startDistance > 1 and startDistance ~= math.huge and best ~= math.huge then
		progress = clamp01((startDistance - best) / (startDistance - 1))
	end
	local points = Scoring.ProgressMax * progress
	if result.gaveUp and not def.giveUpMode then
		points *= 0.5
	end
	breakdown.progress = math.floor(points)
	breakdown.multiplier = multiplier
	return math.max(0, math.floor(points * multiplier + 0.5)), breakdown
end

-- Ranks and scores a whole round in place.
function Scoring.scoreRound(results, ctx)
	Scoring.rankRound(results)
	ctx = table.clone(ctx)
	ctx.playerCount = #results
	for _, result in results do
		result.score, result.breakdown = Scoring.roundScore(result, ctx)
	end
	return results
end

-- totals: { { userId, score, completedRounds, totalTime, totalClicks, totalRedos, ... } }
function Scoring.standings(totals)
	table.sort(totals, function(a, b)
		if a.score ~= b.score then
			return a.score > b.score
		end
		if a.completedRounds ~= b.completedRounds then
			return a.completedRounds > b.completedRounds
		end
		if a.totalTime ~= b.totalTime then
			return a.totalTime < b.totalTime
		end
		if a.totalClicks ~= b.totalClicks then
			return a.totalClicks < b.totalClicks
		end
		if a.totalRedos ~= b.totalRedos then
			return a.totalRedos < b.totalRedos
		end
		return a.userId < b.userId
	end)
	for index, entry in totals do
		entry.placement = index
	end
	return totals
end

-- Special awards across a match. rounds: list of per-round result lists. totals: standings.
function Scoring.awards(rounds, totals)
	local fastest, fewestClicks = nil, nil
	for roundIndex, results in rounds do
		for _, result in results do
			if result.completed then
				local entry = {
					userId = result.userId,
					time = result.time,
					clicks = result.clicks,
					round = roundIndex,
				}
				if
					not fastest
					or entry.time < fastest.time
					or (
						entry.time == fastest.time
						and (
							entry.clicks < fastest.clicks
							or (entry.clicks == fastest.clicks and entry.userId < fastest.userId)
						)
					)
				then
					fastest = entry
				end
				if
					not fewestClicks
					or entry.clicks < fewestClicks.clicks
					or (
						entry.clicks == fewestClicks.clicks
						and (
							entry.time < fewestClicks.time
							or (entry.time == fewestClicks.time and entry.userId < fewestClicks.userId)
						)
					)
				then
					fewestClicks = entry
				end
			end
		end
	end

	local fewestRedos = nil
	for _, entry in totals do
		if entry.completedRounds > 0 then
			if
				not fewestRedos
				or entry.totalRedos < fewestRedos.redos
				or (
					entry.totalRedos == fewestRedos.redos
					and (
						entry.completedRounds > fewestRedos.completed
						or (entry.completedRounds == fewestRedos.completed and entry.userId < fewestRedos.userId)
					)
				)
			then
				fewestRedos = { userId = entry.userId, redos = entry.totalRedos, completed = entry.completedRounds }
			end
		end
	end

	return { fastestTime = fastest, fewestClicks = fewestClicks, fewestRedos = fewestRedos }
end

return Scoring
