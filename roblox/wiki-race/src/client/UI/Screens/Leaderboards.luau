-- World records and global leaderboards.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Difficulty = require(Shared.Difficulty)
local Format = require(Shared.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)

local Leaderboards = {}
Leaderboards.__index = Leaderboards

local TABS = {
	{ key = "records", label = "🌍 World Records" },
	{ key = "wins", label = "🥇 Wins" },
	{ key = "completions", label = "🎯 Completions" },
	{ key = "xp", label = "🎓 Rank XP" },
}

function Leaderboards.new(App)
	local self = setmetatable({ App = App, tab = "records", data = nil }, Leaderboards)
	local frame = Kit.frame({ Name = "Leaderboards", Size = UDim2.fromScale(1, 1), Parent = App.root })
	self.frame = frame
	local header = Kit.frame(
		{ Size = UDim2.new(1, -48, 0, 50), Position = UDim2.fromOffset(24, 14), Parent = frame },
		{ Kit.list("x", 10, "Left", "Center") }
	)
	Kit.button({
		text = "Back",
		emoji = "←",
		Size = UDim2.fromOffset(110, 44),
		Parent = header,
		order = 1,
		onClick = function()
			App.back("Menu")
		end,
	})
	Kit.text({
		text = "🏆 Leaderboards",
		style = "title",
		Size = UDim2.fromOffset(330, 44),
		Parent = header,
		order = 2,
	})
	Kit.iconButton("⟳", function()
		self:load()
	end, { Parent = header, order = 3 })
	local tabs = Kit.frame(
		{ Position = UDim2.fromOffset(24, 72), Size = UDim2.new(1, -48, 0, 44), Parent = frame },
		{ Kit.list("x", 8, "Left", "Center") }
	)
	self.tabButtons = {}
	for index, tab in TABS do
		self.tabButtons[tab.key] = Kit.button({
			text = tab.label,
			Size = UDim2.fromOffset(190, 40),
			textSize = 15,
			order = index,
			Parent = tabs,
			onClick = function()
				self.tab = tab.key
				self:render()
			end,
		})
	end
	self.list = Kit.scroll(
		{ Position = UDim2.fromOffset(24, 126), Size = UDim2.new(1, -48, 1, -136), Parent = frame },
		{ Kit.list("y", 8), Kit.padding(2, 8, 12, 2) }
	)
	return self
end

function Leaderboards:show()
	self:load()
end

function Leaderboards:load()
	for _, child in self.list:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	Kit.text({ text = "Loading…", style = "h3", tone = "textDim", Parent = self.list })
	task.spawn(function()
		local ok, data = Net.request(Net.Actions.GetLeaderboards, {})
		if ok then
			self.data = data
			Store.set("records", data.records)
			self:render()
		else
			for _, child in self.list:GetChildren() do
				if child:IsA("GuiObject") then
					child:Destroy()
				end
			end
			Kit.text({ text = "⚠️ " .. tostring(data), style = "h3", tone = "danger", Parent = self.list })
			Kit.button({
				text = "Retry",
				emoji = "⟳",
				Parent = self.list,
				onClick = function()
					self:load()
				end,
			})
		end
	end)
end

local function recordRow(parent, order: number, title: string, record, isClicks: boolean)
	local row = Kit.panel(
		{ Size = UDim2.new(1, -8, 0, 64), LayoutOrder = order, Parent = parent },
		{ Kit.padding(10, 14, 10, 14) }
	)
	Kit.text({ text = title, style = "h3", Size = UDim2.new(0.3, 0, 0, 22), Parent = row })
	if not record then
		Kit.text({
			text = "No record yet — set the first one!",
			style = "small",
			tone = "textFaint",
			Position = UDim2.fromOffset(0, 24),
			Size = UDim2.new(0.6, 0, 0, 18),
			Parent = row,
		})
		return row
	end
	local value = isClicks and (record.clicks .. " clicks · " .. Format.time(record.ms / 1000))
		or Format.time(record.ms / 1000)
	Kit.text({
		text = value,
		style = "h2",
		font = "fontMono",
		tone = "gold",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 0),
		Size = UDim2.fromOffset(240, 44),
		align = Enum.TextXAlignment.Right,
		Parent = row,
	})
	Kit.text({
		text = ("by %s · %s → %s · %s"):format(
			record.name or "?",
			record.start or "?",
			record.target or "?",
			Difficulty.get(record.difficulty).name
		),
		style = "small",
		tone = "textDim",
		truncate = true,
		wrap = false,
		Position = UDim2.fromOffset(0, 24),
		Size = UDim2.new(1, -250, 0, 18),
		Parent = row,
	})
	return row
end

function Leaderboards:render()
	for key, button in self.tabButtons do
		button.BackgroundTransparency = key == self.tab and 0 or 0.5
		button:SetAttribute("BaseTransparency", key == self.tab and 0 or 0.5)
	end
	for _, child in self.list:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	local data = self.data
	if not data then
		return
	end
	if self.tab == "records" then
		local records = data.records or {}
		local order = 0
		local function add(title, key, isClicks)
			order += 1
			local row = recordRow(self.list, order, title, records[key], isClicks)
			Anim.slideIn(row, UDim2.fromOffset(40, 0), 0.35, order * 0.04)
		end
		add("⚡ Fastest overall", "fastest_overall")
		for _, key in Difficulty.RecordBoards do
			local def = Difficulty.get(key)
			add(def.emoji .. " Fastest " .. def.name, "fastest_" .. key)
		end
		add("🎯 Fewest clicks", "fewest_clicks", true)
		return
	end
	local rows = data.boards and data.boards[self.tab] or {}
	if #rows == 0 then
		Kit.text({ text = "No entries yet. Go race!", style = "h3", tone = "textDim", Parent = self.list })
	end
	local me = game:GetService("Players").LocalPlayer.UserId
	for index, entry in rows do
		local row = Kit.panel(
			{ Size = UDim2.new(1, -8, 0, 54), LayoutOrder = index, Parent = self.list },
			{ Kit.padding(8, 14, 8, 14) },
			entry.userId == me and "surface2" or "surface"
		)
		local medal = ({ "🥇", "🥈", "🥉" })[entry.rank] or ("#" .. entry.rank)
		Kit.text({ text = medal, style = "h3", Size = UDim2.fromOffset(50, 38), Parent = row })
		Kit.avatar(entry.userId, 38, nil, { Parent = row, Position = UDim2.fromOffset(52, 0) })
		local name = Kit.text({
			text = entry.name,
			style = "h3",
			Position = UDim2.fromOffset(100, 0),
			Size = UDim2.new(1, -260, 0, 38),
			Parent = row,
		})
		Kit.hoverable(name, function()
			self.App.show("Profile", { userId = entry.userId })
		end)
		Kit.text({
			text = Format.number(entry.value),
			style = "h2",
			font = "fontMono",
			align = Enum.TextXAlignment.Right,
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, 0, 0, 0),
			Size = UDim2.fromOffset(140, 38),
			Parent = row,
		})
		Anim.slideIn(row, UDim2.fromOffset(40, 0), 0.3, math.min(index, 20) * 0.03)
	end
end

return Leaderboards
