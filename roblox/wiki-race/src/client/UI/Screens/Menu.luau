-- Main menu: the first minute has to explain the game — start page, target page, click links,
-- get there first — then offer every way in (Quick Play, lobbies, codes, Free Roam).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Format = require(Shared.Format)
local Temperature = require(Shared.Temperature)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Anim = require(UI.Anim)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)

local Menu = {}
Menu.__index = Menu

function Menu.new(App)
	local self = setmetatable({ App = App }, Menu)
	local frame = Kit.frame({ Name = "Menu", Size = UDim2.fromScale(1, 1), Parent = App.root })
	self.frame = frame

	-- Top bar ------------------------------------------------------------------------------
	local top = Kit.frame(
		{ Name = "TopBar", Size = UDim2.new(1, -32, 0, 56), Position = UDim2.fromOffset(16, 12), Parent = frame },
		{ Kit.list("x", 8, "Right", "Center") }
	)
	self.coins = Kit.chip("🪙 0", nil, { Parent = top, order = 1, height = 36, textSize = 16 })
	self.rank = Kit.chip("🌱 Rookie", nil, { Parent = top, order = 2, height = 36, textSize = 15 })
	Kit.iconButton("🛍️", function()
		App.show("Shop")
	end, { Parent = top, order = 3 })
	Kit.iconButton("🏆", function()
		App.show("Leaderboards")
	end, { Parent = top, order = 4 })
	Kit.iconButton("⚙️", function()
		App.show("Settings")
	end, { Parent = top, order = 5 })
	local me = Players.LocalPlayer
	self.avatar = Kit.avatar(me.UserId, 44, nil, { Parent = top, order = 6 })
	Kit.hoverable(self.avatar, function()
		App.show("Profile", { userId = me.UserId })
	end)

	-- Body -------------------------------------------------------------------------------------
	local body = Kit.scroll({
		Name = "Body",
		Size = UDim2.new(1, 0, 1, -80),
		Position = UDim2.fromOffset(0, 76),
		Parent = frame,
	})
	self.body = body
	local columns = Kit.frame({
		Name = "Columns",
		Size = UDim2.new(1, -64, 0, 0),
		Position = UDim2.fromOffset(32, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Parent = body,
	})
	self.columns = columns
	self.layout = Kit.list("x", 28, "Center", "Top")
	self.layout.Parent = columns

	-- Hero column
	local hero = Kit.frame({
		Name = "Hero",
		Size = UDim2.new(0.58, -14, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 1,
		Parent = columns,
	}, { Kit.list("y", 14) })
	self.hero = hero
	local logo = Kit.text({
		text = "WIKI RACE",
		style = "display",
		size = 76,
		Size = UDim2.new(1, 0, 0, 84),
		Parent = hero,
		order = 1,
	})
	local logoGradient = Instance.new("UIGradient")
	logoGradient.Parent = logo
	local function paintLogo()
		local t = Theme.current
		logoGradient.Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, t.accent),
			ColorSequenceKeypoint.new(0.5, t.accent2),
			ColorSequenceKeypoint.new(1, t.accent),
		})
	end
	paintLogo()
	Theme.changed:Connect(paintLogo)
	Theme.bind(logo, {
		TextColor3 = function()
			return Color3.new(1, 1, 1)
		end,
	})
	task.spawn(function()
		while logo.Parent do
			logoGradient.Offset = Vector2.new(-1, 0)
			Anim.tween(logoGradient, 3.2, { Offset = Vector2.new(1, 0) }, Enum.EasingStyle.Linear)
			task.wait(4.5)
		end
	end)
	Kit.text({
		text = "Start on one page. Reach another. Only by clicking links.",
		style = "h2",
		size = 22,
		tone = "textDim",
		Size = UDim2.new(1, 0, 0, 30),
		Parent = hero,
		order = 2,
	})

	local steps = Kit.frame({ Name = "Steps", Size = UDim2.new(1, 0, 0, 150), Parent = hero }, { Kit.list("x", 12) })
	steps.LayoutOrder = 3
	local STEPS = {
		{ "📄", "Your start page", "Everyone begins on the same random article." },
		{ "🎯", "Your target", "A page from a totally different corner of the wiki." },
		{ "🔗", "Click links only", "No search. Hop article to article. Fastest wins." },
	}
	for index, step in STEPS do
		local card = Kit.panel(
			{ Size = UDim2.new(1 / 3, -8, 1, 0), LayoutOrder = index, Parent = steps },
			{ Kit.padding(14), Kit.list("y", 4) }
		)
		Kit.text({ text = step[1], size = 34, Size = UDim2.new(1, 0, 0, 40), Parent = card, order = 1 })
		Kit.text({ text = ("%d. %s"):format(index, step[2]), style = "h3", Parent = card, order = 2 })
		Kit.text({
			text = step[3],
			style = "small",
			tone = "textDim",
			Size = UDim2.new(1, 0, 0, 44),
			Parent = card,
			order = 3,
		})
		Anim.slideIn(card, UDim2.fromOffset(0, 30), 0.6, 0.1 * index)
	end

	-- Temperature legend: teaches the hot/cold meter up front.
	local legend = Kit.panel(
		{ Name = "Legend", Size = UDim2.new(1, 0, 0, 64), Parent = hero },
		{ Kit.padding(10, 14, 10, 14), Kit.list("x", 6, "Left", "Center") }
	)
	legend.LayoutOrder = 4
	Kit.text({
		text = "The meter tells you how close you are:",
		style = "small",
		font = "fontBold",
		Size = UDim2.fromOffset(150, 40),
		Parent = legend,
		order = 0,
	})
	for index, key in { "Freezing", "Cold", "Warm", "Hot", "Burning" } do
		local info = Temperature.Info[key]
		Kit.chip(
			info.emoji .. " " .. info.label,
			info.color,
			{ Parent = legend, order = index, height = 28, textSize = 12 }
		)
	end

	self.recordTeaser = Kit.text({
		text = "",
		style = "small",
		tone = "textFaint",
		Size = UDim2.new(1, 0, 0, 20),
		Parent = hero,
		order = 5,
	})

	-- Actions column
	local actions = Kit.panel({
		Name = "Actions",
		Size = UDim2.new(0.42, -14, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 2,
		Parent = columns,
	}, { Kit.padding(18), Kit.list("y", 10) })
	self.actions = actions
	Kit.text({ text = "Play", style = "h1", Parent = actions, order = 0 })
	local quick = Kit.button({
		text = "QUICK PLAY",
		emoji = "⚡",
		variant = "primary",
		textSize = 22,
		Size = UDim2.new(1, 0, 0, 64),
		Parent = actions,
		order = 1,
		onClick = function(button)
			Kit.busy(button, true, "Finding a race…")
			local ok, data = Net.request(Net.Actions.QuickPlay, {})
			Kit.busy(button, false)
			if ok then
				Store.set("lobby", data)
				App.show("LobbyRoom")
			else
				App.toast(data, "error")
			end
		end,
	})
	Anim.pulse(Anim.scaleOf(quick), "Scale", 1, 1.03, 1.6)
	Kit.button({
		text = "Browse Lobbies",
		emoji = "🌐",
		Size = UDim2.new(1, 0, 0, 50),
		Parent = actions,
		order = 2,
		onClick = function()
			App.show("Lobbies")
		end,
	})
	Kit.button({
		text = "Create Lobby",
		emoji = "➕",
		Size = UDim2.new(1, 0, 0, 50),
		Parent = actions,
		order = 3,
		onClick = function()
			App.screens.Lobbies:openCreate()
		end,
	})
	Kit.button({
		text = "Join with Code",
		emoji = "🔑",
		Size = UDim2.new(1, 0, 0, 50),
		Parent = actions,
		order = 4,
		onClick = function()
			App.screens.Lobbies:openJoinCode()
		end,
	})
	Kit.divider(5).Parent = actions
	Kit.button({
		text = "Free Roam Practice",
		emoji = "🧭",
		Size = UDim2.new(1, 0, 0, 50),
		Parent = actions,
		order = 6,
		onClick = function()
			App.show("FreeRoam")
		end,
	})
	self.footer = Kit.text({
		text = "",
		style = "tiny",
		tone = "textFaint",
		align = Enum.TextXAlignment.Center,
		Parent = actions,
		order = 7,
	})

	App.layoutChanged:Connect(function(compact)
		self:_layout(compact)
	end)
	self:_layout(App.compact)
	Store.changed:Connect(function(key)
		if key == "profile" or key == "records" or key == "boot" then
			self:refresh()
		end
	end)
	return self
end

function Menu:_layout(compact: boolean)
	if compact then
		self.layout.FillDirection = Enum.FillDirection.Vertical
		self.hero.Size = UDim2.new(1, 0, 0, 0)
		self.actions.Size = UDim2.new(1, 0, 0, 0)
	else
		self.layout.FillDirection = Enum.FillDirection.Horizontal
		self.hero.Size = UDim2.new(0.58, -14, 0, 0)
		self.actions.Size = UDim2.new(0.42, -14, 0, 0)
	end
end

function Menu:refresh()
	local profile = Store.profile
	if profile then
		self.coins.Text = "🪙 " .. Format.number(profile.coins)
		self.rank.Text = profile.rank.emoji .. " " .. profile.rank.name
		local look = { frame = profile.equipped and profile.equipped.frame }
		local image = self.avatar:FindFirstChild("Image")
		if image then
			Kit.applyFrame(image, look.frame or "frame_none", 2)
		end
	end
	local record = Store.records and Store.records.fastest_overall
	if record then
		self.recordTeaser.Text = ("🌍 World record: %s by %s (%s → %s)"):format(
			Format.time(record.ms / 1000),
			record.name,
			record.start or "?",
			record.target or "?"
		)
	else
		self.recordTeaser.Text = "🌍 No world record yet — it could be yours."
	end
	if Store.boot then
		self.footer.Text = ("%s pages in the wiki · 10 players per lobby"):format(
			Format.number(Store.boot.pageCount or 0)
		)
	end
end

function Menu:show()
	self:refresh()
end

return Menu
