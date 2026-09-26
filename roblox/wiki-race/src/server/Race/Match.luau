-- One multiplayer match: a sequence of rounds for the players in a lobby.
--
-- The match is fully server-authoritative: it generates and validates each challenge, owns the
-- clock (workspace:GetServerTimeNow), validates every navigation through RaceSession, decides
-- completion, placement and score, and persists stats/records. Clients only render.
--
-- Round lifecycle: Generating → Reveal (start roll, target roll, 3-2-1) → Racing → Results.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Difficulty = require(Shared.Difficulty)
local Net = require(Shared.Net)

local Services = script.Parent.Parent.Services
local Router = require(Services.Router)
local WikiService = require(Services.WikiService)
local DataService = require(Services.DataService)
local AchievementService = require(Services.AchievementService)
local RecordService = require(Services.RecordService)
local LeaderboardService = require(Services.LeaderboardService)
local CosmeticService = require(Services.CosmeticService)
local ChaosState = require(Services.ChaosState)

local RaceSession = require(script.Parent.RaceSession)
local Scoring = require(script.Parent.Scoring)

local Match = {}
Match.__index = Match

local ERRORS = {
	NotALink = "That link isn't on this page.",
	NoRedos = "You're out of redos!",
	NoBack = "Nothing to go back to.",
	NoForward = "Nothing to go forward to.",
	NotInHistory = "You haven't visited that page this round.",
	AlreadyAtStart = "You're already on the starting page.",
	Finished = "You've already finished this round.",
	NotStarted = "The race hasn't started yet!",
	TooManyClicks = "Click limit reached for this round.",
	BadOp = "Unknown action.",
}

local function now(): number
	return workspace:GetServerTimeNow()
end

local function timerSeconds(settings): number?
	if settings.timer == "unlimited" then
		return nil
	elseif settings.timer == "custom" then
		return math.clamp(
			math.floor(settings.customSeconds or Config.Race.DefaultCustomSeconds),
			Config.Race.CustomTimerMin,
			Config.Race.CustomTimerMax
		)
	end
	return tonumber(settings.timer) or 300
end

-- lobby: the owning lobby table. hooks: { onEnded = fn(match), onChanged = fn() }
function Match.new(lobby, hooks, options)
	options = options or {}
	local self = setmetatable({
		lobby = lobby,
		hooks = hooks,
		settings = table.clone(lobby.settings), -- snapshot: the rig never mutates lobby settings
		solo = options.solo == true,
		fixedStart = options.fixedStart,
		roundIndex = 0,
		totalRounds = lobby.settings.rounds,
		participants = {}, -- [userId] = totals
		rounds = {},
		phase = "Idle",
		ended = false,
		endRequested = false,
		rng = Random.new(),
		recentTargets = {},
		recentStarts = {},
		recentOrder = {},
		round = nil,
		lastRigId = 0,
	}, Match)
	return self
end

function Match:_players(): { Player }
	local list = {}
	for _, userId in self.lobby.members do
		local player = Players:GetPlayerByUserId(userId)
		if player then
			table.insert(list, player)
		end
	end
	return list
end

function Match:_roundPlayers(): { Player }
	local list = {}
	if not self.round then
		return list
	end
	for _, userId in self.round.order do
		local player = Players:GetPlayerByUserId(userId)
		if player then
			table.insert(list, player)
		end
	end
	return list
end

function Match:_card(player: Player)
	return {
		userId = player.UserId,
		name = player.Name,
		displayName = player.DisplayName,
		look = CosmeticService.look(player),
	}
end

function Match:_participant(player: Player)
	local entry = self.participants[player.UserId]
	if not entry then
		entry = {
			userId = player.UserId,
			name = player.Name,
			displayName = player.DisplayName,
			score = 0,
			completedRounds = 0,
			totalTime = 0,
			totalClicks = 0,
			totalRedos = 0,
			roundsPlayed = 0,
			left = false,
		}
		self.participants[player.UserId] = entry
	end
	entry.left = false
	return entry
end

function Match:start()
	self.phase = "Starting"
	task.spawn(function()
		local ok, err = pcall(self._run, self)
		if not ok then
			warn("[WikiRace] Match crashed: " .. tostring(err))
			Router.pushMany(
				self:_players(),
				Net.Events.MatchAborted,
				{ reason = "The server hit an error. Returning to the lobby." }
			)
			self.ended = true
			self.phase = "Ended"
			self.hooks.onEnded(self)
		end
	end)
end

function Match:_run()
	while not self.ended do
		self.roundIndex += 1
		self:_runRound()
		if self.ended then
			break
		end
		if self.endRequested then
			break
		end
		if self.totalRounds > 0 and self.roundIndex >= self.totalRounds then
			break
		end
		if #self:_players() == 0 then
			self.ended = true
			break
		end
	end
	self:_finish()
end

function Match:_waitUntil(deadline: number, breakOn)
	while now() < deadline do
		if self.ended or (breakOn and breakOn()) then
			return false
		end
		task.wait(0.1)
	end
	return true
end

function Match:_remember(challenge)
	self.recentTargets[challenge.target] = true
	self.recentStarts[challenge.start] = true
	table.insert(self.recentOrder, challenge)
	if #self.recentOrder > 25 then
		local oldest = table.remove(self.recentOrder, 1)
		self.recentTargets[oldest.target] = nil
		self.recentStarts[oldest.start] = nil
	end
end

function Match:_generate(difficulty: string)
	local generator = WikiService.generator
	for _ = 1, 6 do
		local challenge = generator:generate(difficulty, {
			rng = self.rng,
			excludeTargets = self.recentTargets,
			excludeStarts = self.recentStarts,
			fixedStart = (self.roundIndex == 1 and self.fixedStart) or nil,
		})
		-- Discard anything that fails validation and regenerate.
		if challenge and generator:validate(challenge, difficulty) then
			return challenge
		end
	end
	-- Last resort: forget recent history (tiny wikis) but never relax the distance rules.
	local challenge = generator:generate(difficulty, { rng = self.rng })
	if challenge and generator:validate(challenge, difficulty) then
		return challenge
	end
	return nil
end

function Match:_runRound()
	local players = self:_players()
	if #players == 0 then
		self.ended = true
		return
	end
	local repo = WikiService.repo

	-- Server Rig window: rounds that start while the server is rigged run in Give Up Mode.
	-- Each rig applies to a lobby at most once; later rounds use the host's settings again.
	local difficulty = self.settings.difficulty
	local rigged, rigBy = false, nil
	local t0 = now()
	if ChaosState.isRigActive(t0) and ChaosState.rigId ~= self.lastRigId then
		difficulty = "GiveUp"
		rigged = true
		rigBy = ChaosState.riggedBy
		self.lastRigId = ChaosState.rigId
	end

	self.phase = "Generating"
	Router.pushMany(players, Net.Events.RoundGenerating, { round = self.roundIndex, totalRounds = self.totalRounds })
	local challenge = self:_generate(difficulty)
	if not challenge then
		error("could not generate a valid challenge")
	end
	self:_remember(challenge)

	local def = Difficulty.get(difficulty)
	local revealStartAt = now() + 0.75
	local targetRevealAt = revealStartAt + Config.Race.RevealStartSeconds
	local countdownAt = targetRevealAt + Config.Race.RevealTargetSeconds
	local raceStartAt = countdownAt + Config.Race.CountdownSeconds
	local limit = timerSeconds(self.settings)

	local round = {
		index = self.roundIndex,
		difficulty = difficulty,
		challenge = challenge,
		target = challenge.target,
		rigged = rigged,
		rigBy = rigBy,
		raceStartAt = raceStartAt,
		limit = limit,
		endsAt = limit and (raceStartAt + limit) or nil,
		sessions = {},
		order = {},
		left = {},
		finishedCount = 0,
		closingAt = nil,
		skip = false,
		lastOpponentPush = 0,
	}
	self.round = round

	local cards = {}
	for _, player in players do
		self:_participant(player)
		round.sessions[player.UserId] = RaceSession.new({
			graph = WikiService.graph,
			start = challenge.start,
			target = challenge.target,
			redos = def.redos,
			mode = "race",
			startTime = raceStartAt,
			maxClicks = Config.Race.MaxClicksPerRound,
		})
		table.insert(round.order, player.UserId)
		table.insert(cards, self:_card(player))
	end

	local startPayload = repo:payload(challenge.start)
	local common = {
		round = self.roundIndex,
		totalRounds = self.totalRounds,
		difficulty = difficulty,
		rigged = rigged,
		rigBy = rigBy,
		start = repo:preview(challenge.start),
		target = repo:preview(challenge.target),
		rollTitles = repo:sampleTitles(
			Config.Race.RollTitleCount,
			self.rng,
			{ [challenge.start] = true, [challenge.target] = true }
		),
		revealStartAt = revealStartAt,
		targetRevealAt = targetRevealAt,
		countdownAt = countdownAt,
		raceStartAt = raceStartAt,
		endsAt = round.endsAt,
		redos = def.redos,
		showMeters = self.settings.showMeters,
		showPages = self.settings.showPages,
		players = cards,
		solo = self.solo,
	}
	for _, player in players do
		local payload = table.clone(common)
		payload.page = startPayload
		payload.state = round.sessions[player.UserId]:snapshot()
		Router.push(player, Net.Events.RoundStart, payload)
	end
	self.phase = "Reveal"
	self.hooks.onChanged()

	self:_waitUntil(raceStartAt)
	if self.ended then
		return
	end
	self.phase = "Racing"
	self.hooks.onChanged()
	self:_pushOpponents(true)

	-- Race loop: cheap 4 Hz tick. Navigation itself is event-driven through :navigate().
	local tickInterval = 1 / Config.Race.OpponentUpdateHz
	while not self.ended do
		task.wait(tickInterval)
		local t = now()
		if self.pendingRig then
			self:_applyRig()
		end
		local active = 0
		for userId, session in round.sessions do
			if not session.finished and not round.left[userId] then
				active += 1
			end
		end
		if active == 0 or round.skip or self.endRequested then
			break
		end
		if round.endsAt and t >= round.endsAt then
			break
		end
		if not round.endsAt and #round.order > 1 then
			local needed = math.ceil(#round.order / 2)
			if not round.closingAt and round.finishedCount >= needed then
				round.closingAt = t + Config.Race.UnlimitedClosingSeconds
				Router.pushMany(self:_roundPlayers(), Net.Events.RoundClosing, { closesAt = round.closingAt })
			end
			if round.closingAt and t >= round.closingAt then
				break
			end
		end
		self:_pushOpponents(false)
	end

	self:_endRound()
end

-- Live standings for the sidebar. Temperature/page visibility honors the host's toggles; a
-- player always sees their own details.
function Match:_opponentsFor(viewerId: number, rows)
	local visible = {}
	for _, row in rows do
		local entry = table.clone(row)
		local isSelf = row.userId == viewerId
		if not (self.settings.showMeters or isSelf) then
			entry.temperature = nil
		end
		if not (self.settings.showPages or isSelf) then
			entry.page = nil
		end
		table.insert(visible, entry)
	end
	return visible
end

function Match:_liveRows()
	local round = self.round
	local rows = {}
	for _, userId in round.order do
		local session = round.sessions[userId]
		local participant = self.participants[userId]
		table.insert(rows, {
			userId = userId,
			displayName = participant and participant.displayName or "?",
			clicks = session.clicks,
			redos = session.redosUsed,
			temperature = session:temperature(),
			page = WikiService.repo:title(session:current()),
			finished = session.finished,
			completed = session.completed,
			gaveUp = session.gaveUp,
			left = round.left[userId] == true,
			time = session.finishTime,
			finishOrder = session.finishOrder,
		})
	end
	table.sort(rows, function(a, b)
		if a.completed ~= b.completed then
			return a.completed
		end
		if a.completed then
			return (a.finishOrder or 0) < (b.finishOrder or 0)
		end
		if a.gaveUp ~= b.gaveUp then
			return not a.gaveUp
		end
		return a.userId < b.userId
	end)
	for index, row in rows do
		row.placement = row.completed and index or nil
	end
	return rows
end

function Match:_pushOpponents(force: boolean)
	local round = self.round
	if not round then
		return
	end
	local t = os.clock()
	if not force and (not self.opponentsDirty or t - round.lastOpponentPush < 1 / Config.Race.OpponentUpdateHz) then
		return
	end
	self.opponentsDirty = false
	round.lastOpponentPush = t
	local rows = self:_liveRows()
	for _, player in self:_roundPlayers() do
		Router.push(
			player,
			Net.Events.Opponents,
			{ rows = self:_opponentsFor(player.UserId, rows), endsAt = round.endsAt, closingAt = round.closingAt }
		)
	end
end

-- Called by LobbyService for Navigate requests. Returns the new page + state or an error.
function Match:navigate(player: Player, op: string, argument: any)
	local round = self.round
	if not round or (self.phase ~= "Racing" and self.phase ~= "Reveal") then
		return nil, "There's no race running right now."
	end
	local session = round.sessions[player.UserId]
	if not session then
		return nil, "You'll join at the next round."
	end
	local t = now()
	if round.endsAt and t >= round.endsAt then
		return nil, "Time's up!"
	end
	local ok, err = session:apply(op, argument, t)
	if not ok then
		return nil, ERRORS[err] or "That move isn't allowed."
	end
	self.opponentsDirty = true
	if session.reachedBurning and not session.burningAwarded then
		session.burningAwarded = true
		AchievementService.unlock(player, "burning")
	end
	if session.completed and not session.finishOrder then
		round.finishedCount += 1
		session.finishOrder = round.finishedCount
		self:_announceFinish(player, session)
	end
	return {
		page = WikiService.repo:payload(session:current()),
		state = session:snapshot(),
	}
end

function Match:giveUp(player: Player)
	local round = self.round
	if not round or self.phase ~= "Racing" then
		return nil, "There's no race running right now."
	end
	local session = round.sessions[player.UserId]
	if not session or not session:giveUp(now()) then
		return nil, "You can't give up right now."
	end
	round.finishedCount += 1
	self.opponentsDirty = true
	for _, other in self:_roundPlayers() do
		if other ~= player then
			Router.toast(other, ("🏳️ %s gave up!"):format(player.DisplayName), "info")
		end
	end
	return { state = session:snapshot() }
end

function Match:_announceFinish(player: Player, session)
	local place = session.finishOrder
	for _, other in self:_roundPlayers() do
		if other ~= player then
			Router.toast(
				other,
				("🏁 %s reached the target in %.1fs (%s place)"):format(
					player.DisplayName,
					session.finishTime,
					place == 1 and "1st" or (place == 2 and "2nd" or (place == 3 and "3rd" or place .. "th"))
				),
				"finish"
			)
		end
	end
end

function Match:onPlayerLeft(userId: number)
	local participant = self.participants[userId]
	if participant then
		participant.left = true
	end
	if self.round and self.round.sessions[userId] then
		self.round.left[userId] = true
		self.opponentsDirty = true
	end
	if #self:_players() == 0 then
		self.ended = true
	end
end

-- Server Rig ------------------------------------------------------------------------------

function Match:requestRig(byName: string, rigId: number)
	if rigId == self.lastRigId then
		return
	end
	if self.phase == "Racing" or self.phase == "Reveal" or self.phase == "Generating" then
		self.lastRigId = rigId
		self.pendingRig = byName
	end
	-- Idle / Results / Starting: the ChaosState window rigs this lobby's next round instead.
end

function Match:_applyRig()
	local by = self.pendingRig
	self.pendingRig = nil
	local round = self.round
	if not round or round.rigged then
		return
	end
	local currentPages, targets = {}, {}
	for userId, session in round.sessions do
		if not session.finished and not round.left[userId] then
			table.insert(currentPages, session:current())
		end
	end
	if #currentPages == 0 then
		return
	end
	for _, challenge in self.recentOrder do
		targets[challenge.target] = true
	end
	local newTarget =
		WikiService.generator:generateRigTarget(currentPages, { rng = self.rng, excludeTargets = targets })
	if not newTarget then
		return
	end
	round.rigged = true
	round.rigBy = by
	round.difficulty = "GiveUp"
	round.target = newTarget
	for userId, session in round.sessions do
		if not session.finished and not round.left[userId] then
			session:retarget(newTarget, Difficulty.get("GiveUp").redos)
			session.clicksBase = session.clicks
		end
	end
	local t = now()
	if round.endsAt and round.endsAt - t < Config.Chaos.ServerRigMinRemainingSeconds then
		round.endsAt = t + Config.Chaos.ServerRigMinRemainingSeconds
	end
	local preview = WikiService.repo:preview(newTarget)
	for _, player in self:_roundPlayers() do
		local session = round.sessions[player.UserId]
		Router.push(player, Net.Events.RoundRigged, {
			by = by,
			difficulty = "GiveUp",
			target = preview,
			endsAt = round.endsAt,
			state = session and session:snapshot() or nil,
		})
	end
	self.opponentsDirty = true
end

-- Round end ------------------------------------------------------------------------------

function Match:_endRound()
	local round = self.round
	local repo = WikiService.repo
	local endedAt = now()
	self.phase = "Results"

	local results = {}
	for _, userId in round.order do
		local session = round.sessions[userId]
		session:timeOut()
		local left = round.left[userId] == true
		local finalDistance = WikiService.graph:distance(session:current(), round.target)
		local spent = session.finishTime
			or session.giveUpTime
			or math.max(0, math.min(endedAt, round.endsAt or endedAt) - round.raceStartAt)
		table.insert(results, {
			userId = userId,
			completed = session.completed and not left,
			gaveUp = session.gaveUp or left,
			left = left,
			time = session.completed and session.finishTime or nil,
			spent = spent,
			clicks = session.clicks,
			effectiveClicks = session.clicks - (session.clicksBase or 0),
			redos = session.redosUsed,
			startDistance = session.startDistance,
			optimal = session.startDistance,
			bestDistance = session.bestDistance,
			finalDistance = finalDistance,
			reachedBurning = session.reachedBurning,
			route = session.route,
		})
	end
	Scoring.scoreRound(results, {
		difficulty = round.difficulty,
		timeLimit = round.limit,
		referenceSeconds = Config.Race.UnlimitedReferenceSeconds,
	})

	local playerCount = #results
	local startTitle, targetTitle = repo:title(round.challenge.start), repo:title(round.target)
	local rows = {}
	for _, result in results do
		local participant = self.participants[result.userId]
		local player = Players:GetPlayerByUserId(result.userId)
		if participant then
			participant.score += result.score
			participant.roundsPlayed += 1
			participant.totalClicks += result.clicks
			participant.totalRedos += result.redos
			participant.totalTime += result.spent
			if result.completed then
				participant.completedRounds += 1
			end
		end
		if player and not result.left then
			self:_persistRound(player, result, round, playerCount, startTitle, targetTitle)
		end
		local routeTitles = {}
		local route = result.route
		for i = math.max(1, #route - 11), #route do
			table.insert(routeTitles, repo:title(route[i]))
		end
		table.insert(rows, {
			userId = result.userId,
			displayName = participant and participant.displayName or "?",
			name = participant and participant.name or "?",
			look = player and CosmeticService.look(player) or nil,
			placement = result.placement,
			completed = result.completed,
			gaveUp = result.gaveUp,
			left = result.left,
			time = result.time,
			clicks = result.clicks,
			redos = result.redos,
			score = result.score,
			breakdown = result.breakdown,
			route = routeTitles,
			routeLength = #route,
			totalScore = participant and participant.score or result.score,
		})
	end

	table.insert(self.rounds, results)

	local optimalTitles = {}
	for _, id in round.challenge.path or {} do
		table.insert(optimalTitles, repo:title(id))
	end
	if round.target ~= round.challenge.target then
		optimalTitles = {} -- the rig changed the target; the original optimal route is moot
	end

	local isFinal = self.endRequested or (self.totalRounds > 0 and self.roundIndex >= self.totalRounds) or self.ended
	local nextAt = now() + Config.Race.RoundResultsSeconds
	local payload = {
		round = self.roundIndex,
		totalRounds = self.totalRounds,
		isFinal = isFinal,
		difficulty = round.difficulty,
		rigged = round.rigged,
		rigBy = round.rigBy,
		start = repo:preview(round.challenge.start),
		target = repo:preview(round.target),
		optimalPath = optimalTitles,
		shortestDistance = round.target == round.challenge.target and round.challenge.distance or nil,
		rows = rows,
		nextAt = nextAt,
	}
	Router.pushMany(self:_players(), Net.Events.RoundResults, payload)
	self.hooks.onChanged()

	self.skipResults = false
	self:_waitUntil(nextAt, function()
		return self.skipResults
	end)
	self.round = nil
end

function Match:_persistRound(
	player: Player,
	result,
	round,
	playerCount: number,
	startTitle: string,
	targetTitle: string
)
	local difficulty = round.difficulty
	DataService.update(player, function(data)
		local stats = data.stats
		stats.races += 1
		stats.totalClicks += result.clicks
		stats.totalRedos += result.redos
		stats.totalScore += result.score
		stats.bestRoundScore = math.max(stats.bestRoundScore, result.score)
		if result.reachedBurning then
			stats.burningReached += 1
		end
		if round.rigged then
			stats.rigsSurvived += 1
		end
		if result.gaveUp then
			stats.giveUps += 1
		end
		if result.completed then
			stats.completions += 1
			stats.difficultyCompletions[difficulty] = (stats.difficultyCompletions[difficulty] or 0) + 1
			if not stats.fastestTime or result.time < stats.fastestTime then
				stats.fastestTime = result.time
			end
			if not stats.fewestClicks or result.clicks < stats.fewestClicks then
				stats.fewestClicks = result.clicks
			end
			data.coins += Config.Coins.RoundComplete
			if result.placement == 1 and playerCount >= 2 then
				stats.roundWins += 1
				data.coins += Config.Coins.RoundFirstPlace
			end
		end
	end)
	AchievementService.onRoundResult(player, result, {
		difficulty = difficulty,
		optimal = result.optimal,
		rigged = round.rigged,
	})
	RecordService.submit(player, result, {
		difficulty = difficulty,
		rigged = round.rigged,
		startTitle = startTitle,
		targetTitle = targetTitle,
		pairKey = round.challenge.start .. ">" .. round.target,
	})
end

-- Final results ----------------------------------------------------------------------------

function Match:_finish()
	if self.phase == "Ended" then
		return
	end
	self.phase = "Ended"
	local players = self:_players()
	local totals = {}
	for userId, participant in self.participants do
		if not participant.left and Players:GetPlayerByUserId(userId) then
			table.insert(totals, table.clone(participant))
		end
	end
	if #totals > 0 and #self.rounds > 0 then
		Scoring.standings(totals)
		local awards = Scoring.awards(self.rounds, totals)
		local byId = {}
		for _, entry in totals do
			local player = Players:GetPlayerByUserId(entry.userId)
			entry.look = player and CosmeticService.look(player) or nil
			byId[entry.userId] = entry
			if player then
				local won = entry.placement == 1 and #totals >= 2
				DataService.update(player, function(data)
					data.stats.matches += 1
					data.coins += Config.Coins.MatchPlayed
					if won then
						data.stats.wins += 1
						data.coins += Config.Coins.MatchWin
					end
				end)
				if won then
					AchievementService.onMatchWon(player)
				end
				AchievementService.onStatsChanged(player)
				LeaderboardService.submit(player)
				task.spawn(DataService.saveNow, player)
			end
		end
		local function named(award)
			if not award then
				return nil
			end
			local entry = byId[award.userId]
			local copy = table.clone(award)
			copy.displayName = entry and entry.displayName or "?"
			copy.look = entry and entry.look or nil
			return copy
		end
		Router.pushMany(players, Net.Events.MatchResults, {
			standings = totals,
			awards = {
				fastestTime = named(awards.fastestTime),
				fewestClicks = named(awards.fewestClicks),
				fewestRedos = named(awards.fewestRedos),
			},
			roundsPlayed = #self.rounds,
			solo = self.solo,
		})
	end
	self.round = nil
	self.hooks.onEnded(self)
end

function Match:requestEnd()
	self.endRequested = true
	self.skipResults = true
	if self.round then
		self.round.skip = true
	end
end

function Match:skipToNext()
	self.skipResults = true
end

function Match:abort()
	self.ended = true
	if self.round then
		self.round.skip = true
	end
end

-- Summary for lobby lists and late joiners.
function Match:summary()
	return {
		phase = self.phase,
		round = self.roundIndex,
		totalRounds = self.totalRounds,
		difficulty = self.round and self.round.difficulty or self.settings.difficulty,
	}
end

return Match
