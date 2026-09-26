-- Live race sidebar: avatar, name, placement, time, clicks, redos, temperature and current
-- page (when the host allows it). Rows are created once per player and updated in place;
-- re-ordering animates rows to their new slots.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Format = require(ReplicatedStorage:WaitForChild("WikiRaceShared").Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Anim = require(UI.Anim)
local TemperatureMeter = require(script.Parent.TemperatureMeter)
local Store = require(UI.Parent.Core.Store)

local PlayerList = {}
PlayerList.__index = PlayerList

local ROW_HEIGHT = 74
local MEDALS = { "🥇", "🥈", "🥉" }

function PlayerList.new(parent: GuiObject, props)
	props = props or {}
	local self = setmetatable({ rows = {}, cards = {}, onInspect = props.onInspect }, PlayerList)
	self.frame = Kit.scroll({
		Name = "PlayerList",
		Size = props.Size or UDim2.fromScale(1, 1),
		Position = props.Position,
		Parent = parent,
		bar = 4,
	})
	self.frame.AutomaticCanvasSize = Enum.AutomaticSize.None
	return self
end

function PlayerList:setPlayers(cards)
	for _, row in self.rows do
		row.frame:Destroy()
	end
	self.rows = {}
	self.cards = {}
	for index, card in cards do
		self.cards[card.userId] = card
		self:_row(card, index)
	end
	self.frame.CanvasSize = UDim2.fromOffset(0, #cards * (ROW_HEIGHT + 6))
end

function PlayerList:_row(card, index: number)
	local isMe = card.userId == Store.myUserId()
	local frame = Kit.panel({
		Name = tostring(card.userId),
		Size = UDim2.new(1, -8, 0, ROW_HEIGHT),
		Position = UDim2.fromOffset(0, (index - 1) * (ROW_HEIGHT + 6)),
		Parent = self.frame,
	}, nil, isMe and "surface2" or "surface")
	if isMe then
		Kit.stroke("accent", 1.5, 0.2).Parent = frame
	end
	local place = Kit.text({
		text = "",
		style = "h3",
		size = 18,
		align = Enum.TextXAlignment.Center,
		Size = UDim2.fromOffset(28, 28),
		Position = UDim2.fromOffset(4, 8),
		Parent = frame,
	})
	local avatar = Kit.avatar(card.userId, 40, card.look, { Parent = frame, Position = UDim2.fromOffset(32, 8) })
	Kit.nameBlock(card.displayName .. (isMe and " (you)" or ""), card.look, {
		Parent = frame,
		Size = UDim2.new(1, -150, 0, 40),
		style = "h3",
		nameSize = 15,
	}).Position =
		UDim2.fromOffset(80, 6)
	local status = Kit.text({
		text = "Racing…",
		style = "tiny",
		tone = "textDim",
		truncate = true,
		wrap = false,
		Size = UDim2.new(1, -90, 0, 16),
		Position = UDim2.fromOffset(80, 50),
		Parent = frame,
	})
	local stats = Kit.text({
		text = "",
		style = "tiny",
		tone = "textDim",
		align = Enum.TextXAlignment.Right,
		Size = UDim2.fromOffset(70, 40),
		Position = UDim2.new(1, -78, 0, 6),
		Parent = frame,
	})
	stats.TextYAlignment = Enum.TextYAlignment.Top
	local chipHolder = Kit.frame({
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -8, 1, -6),
		Size = UDim2.fromOffset(110, 20),
		Parent = frame,
	}, { Kit.list("x", 0, "Right", "Center") })
	if self.onInspect then
		Kit.hoverable(avatar, function()
			self.onInspect(card.userId)
		end)
	end
	self.rows[card.userId] =
		{ frame = frame, place = place, status = status, stats = stats, chipHolder = chipHolder, lastTemp = false }
end

-- rows: live standings from the server (already visibility-filtered).
function PlayerList:update(rows)
	for index, row in rows do
		local entry = self.rows[row.userId]
		if entry then
			Anim.tween(entry.frame, 0.35, { Position = UDim2.fromOffset(0, (index - 1) * (ROW_HEIGHT + 6)) })
			entry.place.Text = row.placement and (MEDALS[row.placement] or ("#" .. row.placement)) or ""
			entry.stats.Text = ("🖱 %d\n♻ %d%s"):format(
				row.clicks,
				row.redos,
				row.time and ("\n⏱ " .. Format.time(row.time)) or ""
			)
			local statusText
			if row.left then
				statusText = "🔌 Disconnected"
			elseif row.completed then
				statusText = "🏁 Finished in " .. Format.time(row.time)
			elseif row.gaveUp then
				statusText = "🏳️ Gave up"
			elseif row.page then
				statusText = "📄 " .. row.page
			else
				statusText = "🔎 Racing…"
			end
			entry.status.Text = statusText
			Theme.bind(
				entry.status,
				{ TextColor3 = row.completed and "success" or (row.gaveUp and "textFaint" or "textDim") }
			)
			local temp = row.temperature or false
			if temp ~= entry.lastTemp then
				entry.lastTemp = temp
				for _, child in entry.chipHolder:GetChildren() do
					if child:IsA("GuiObject") then
						child:Destroy()
					end
				end
				local chip = TemperatureMeter.chip(row.temperature or nil, entry.chipHolder, 1)
				if row.temperature then
					Anim.pop(chip, 1.2)
				end
			end
		end
	end
end

return PlayerList
