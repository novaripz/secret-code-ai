-- Browser-style navigation stack.
--   push(x) truncates any forward history, like following a new link after going back.
--   A → B → C → D, back → C, back → B, forward → C, forward → D.

local BrowserHistory = {}
BrowserHistory.__index = BrowserHistory

local MAX_STACK = 250
local MAX_RECENT = 25

function BrowserHistory.new(startId: string)
	local self = setmetatable({
		stack = { startId },
		index = 1,
		recent = { startId }, -- most recent first, unique
	}, BrowserHistory)
	return self
end

function BrowserHistory:current(): string
	return self.stack[self.index]
end

function BrowserHistory:_touchRecent(id: string)
	local existing = table.find(self.recent, id)
	if existing then
		table.remove(self.recent, existing)
	end
	table.insert(self.recent, 1, id)
	while #self.recent > MAX_RECENT do
		table.remove(self.recent)
	end
end

function BrowserHistory:push(id: string)
	-- Choosing a new page after going back clears the forward history.
	for i = #self.stack, self.index + 1, -1 do
		table.remove(self.stack, i)
	end
	table.insert(self.stack, id)
	self.index = #self.stack
	if #self.stack > MAX_STACK then
		table.remove(self.stack, 1)
		self.index -= 1
	end
	self:_touchRecent(id)
end

function BrowserHistory:canBack(): boolean
	return self.index > 1
end

function BrowserHistory:canForward(): boolean
	return self.index < #self.stack
end

function BrowserHistory:peekBack(): string?
	return self.stack[self.index - 1]
end

function BrowserHistory:peekForward(): string?
	return self.stack[self.index + 1]
end

function BrowserHistory:back(): string?
	if not self:canBack() then
		return nil
	end
	self.index -= 1
	self:_touchRecent(self.stack[self.index])
	return self.stack[self.index]
end

function BrowserHistory:forward(): string?
	if not self:canForward() then
		return nil
	end
	self.index += 1
	self:_touchRecent(self.stack[self.index])
	return self.stack[self.index]
end

function BrowserHistory:hasVisited(id: string): boolean
	return table.find(self.recent, id) ~= nil or table.find(self.stack, id) ~= nil
end

function BrowserHistory:recentList(limit: number?)
	local out = {}
	for i = 1, math.min(limit or MAX_RECENT, #self.recent) do
		out[i] = self.recent[i]
	end
	return out
end

return BrowserHistory
