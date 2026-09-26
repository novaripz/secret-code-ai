-- One player's authoritative browsing state for one round (or a free-roam session).
--
-- Every navigation is validated against the real graph: a "link" move is only legal if the
-- current page actually links to the destination. Clicks, redos, completion and timing are
-- all computed here from server time — the client can only ask to move.
--
-- Redo rules (race mode): going Back, jumping to a page from History, or restarting the route
-- from the starting page each spend one redo. Forward re-follows a link and counts as a click.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("WikiRaceShared")
local Temperature = require(Shared.Temperature)
local BrowserHistory = require(script.Parent.BrowserHistory)

local RaceSession = {}
RaceSession.__index = RaceSession

RaceSession.Ops = { link = true, back = true, forward = true, refresh = true, history = true, restart = true }

-- options: { graph, start, target?, redos? (nil/-1 = unlimited), mode = "race"|"free", startTime, maxClicks? }
function RaceSession.new(options)
	local graph = options.graph
	assert(graph.nodes[options.start], "unknown start page")
	local self = setmetatable({
		graph = graph,
		mode = options.mode or "race",
		start = options.start,
		target = options.target,
		history = BrowserHistory.new(options.start),
		clicks = 0,
		redosUsed = 0,
		redosAvailable = (options.redos == nil or options.redos < 0) and math.huge or options.redos,
		maxClicks = options.maxClicks or math.huge,
		startTime = options.startTime or 0,
		finished = false,
		completed = false,
		gaveUp = false,
		finishTime = nil,
		reachedBurning = false,
		route = { options.start },
		visitedCount = 1,
		visitedSet = { [options.start] = true },
	}, RaceSession)
	if self.target then
		self.startDistance = graph:distance(self.start, self.target)
		self.bestDistance = self.startDistance
		self.lastDistance = self.startDistance
	end
	return self
end

function RaceSession:current(): string
	return self.history:current()
end

function RaceSession:distance(): number?
	if not self.target then
		return nil
	end
	return self.graph:distance(self:current(), self.target)
end

function RaceSession:temperature(): string?
	if not self.target then
		return nil
	end
	if self.completed then
		return "Completed"
	end
	return Temperature.fromDistance(self.lastDistance)
end

function RaceSession:redosLeft(): number
	return math.max(0, self.redosAvailable - self.redosUsed)
end

function RaceSession:_costsRedo(): boolean
	return self.mode == "race"
end

function RaceSession:canBack(): boolean
	if not self.history:canBack() then
		return false
	end
	return not self:_costsRedo() or self:redosLeft() > 0
end

function RaceSession:canForward(): boolean
	return self.history:canForward()
end

function RaceSession:_spendRedo(): (boolean, string?)
	if not self:_costsRedo() then
		return true
	end
	if self:redosLeft() <= 0 then
		return false, "NoRedos"
	end
	self.redosUsed += 1
	return true
end

function RaceSession:_arrive(now: number)
	local current = self:current()
	table.insert(self.route, current)
	if #self.route > 400 then
		table.remove(self.route, 1)
	end
	if not self.visitedSet[current] then
		self.visitedSet[current] = true
		self.visitedCount += 1
	end
	if not self.target then
		return
	end
	local distance = self.graph:distance(current, self.target)
	self.lastDistance = distance
	if distance < (self.bestDistance or math.huge) then
		self.bestDistance = distance
	end
	if distance == 1 then
		self.reachedBurning = true
	end
	if distance == 0 then
		self.completed = true
		self.finished = true
		self.finishTime = math.max(0, now - self.startTime)
	end
end

-- Applies one navigation op. Returns ok, errorCode.
function RaceSession:apply(op: string, argument: any, now: number): (boolean, string?)
	if not RaceSession.Ops[op] then
		return false, "BadOp"
	end
	if self.finished then
		return false, "Finished"
	end
	if self.mode == "race" and now < self.startTime then
		return false, "NotStarted"
	end
	local current = self:current()

	if op == "refresh" then
		return true
	elseif op == "link" then
		if type(argument) ~= "string" or not self.graph:hasEdge(current, argument) then
			return false, "NotALink"
		end
		if self.clicks >= self.maxClicks then
			return false, "TooManyClicks"
		end
		self.clicks += 1
		self.history:push(argument)
	elseif op == "back" then
		if not self.history:canBack() then
			return false, "NoBack"
		end
		local ok, err = self:_spendRedo()
		if not ok then
			return false, err
		end
		self.history:back()
	elseif op == "forward" then
		if not self.history:canForward() then
			return false, "NoForward"
		end
		self.clicks += 1
		self.history:forward()
	elseif op == "history" then
		if type(argument) ~= "string" or argument == current or not self.history:hasVisited(argument) then
			return false, "NotInHistory"
		end
		local ok, err = self:_spendRedo()
		if not ok then
			return false, err
		end
		self.history:push(argument)
	elseif op == "restart" then
		if current == self.start then
			return false, "AlreadyAtStart"
		end
		local ok, err = self:_spendRedo()
		if not ok then
			return false, err
		end
		self.history:push(self.start)
	end

	self:_arrive(now)
	return true
end

function RaceSession:giveUp(now: number): boolean
	if self.finished then
		return false
	end
	self.finished = true
	self.gaveUp = true
	self.giveUpTime = math.max(0, now - self.startTime)
	return true
end

-- Called when the round ends for anyone still racing.
function RaceSession:timeOut()
	if not self.finished then
		self.finished = true
		self.timedOut = true
	end
end

-- Server Rig: swap the target mid-round. Progress is re-measured from the current page.
function RaceSession:retarget(newTarget: string, redos: number?)
	self.target = newTarget
	local distance = self.graph:distance(self:current(), newTarget)
	self.startDistance = distance
	self.bestDistance = distance
	self.lastDistance = distance
	self.reachedBurning = false
	if redos ~= nil then
		self.redosAvailable = self.redosUsed + math.max(0, redos)
	end
end

-- State the owning player sees. Never includes the numeric distance.
function RaceSession:snapshot()
	return {
		pageId = self:current(),
		clicks = self.clicks,
		redosUsed = self.redosUsed,
		redosLeft = self.redosAvailable == math.huge and -1 or self:redosLeft(),
		temperature = self:temperature(),
		canBack = self:canBack(),
		canForward = self:canForward(),
		history = self.history:recentList(15),
		finished = self.finished,
		completed = self.completed,
		gaveUp = self.gaveUp,
		finishTime = self.finishTime,
		atStart = self:current() == self.start,
	}
end

return RaceSession
