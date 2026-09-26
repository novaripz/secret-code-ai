-- Player profile: avatar + cosmetics, rank progress, statistics, difficulty completions and
-- achievements. Works for yourself and for inspecting any other player.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Achievements = require(Shared.Achievements)
local Catalog = require(Shared.Catalog)
local Difficulty = require(Shared.Difficulty)
local Format = require(Shared.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Net = require(UI.Parent.Core.Net)

local Profile = {}
Profile.__index = Profile

function Profile.new(App)
	local self = setmetatable({ App = App }, Profile)
	local frame = Kit.frame({ Name = "Profile", Size = UDim2.fromScale(1, 1), Parent = App.root })
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
	self.title =
		Kit.text({ text = "Profile", style = "title", Size = UDim2.fromOffset(500, 44), Parent = header, order = 2 })
	self.content = Kit.scroll(
		{ Position = UDim2.fromOffset(24, 74), Size = UDim2.new(1, -48, 1, -84), Parent = frame },
		{ Kit.list("y", 14), Kit.padding(0, 10, 20, 0) }
	)
	return self
end

local function statTile(parent, emoji: string, label: string, value: string, order: number)
	local tile = Kit.panel(
		{ Size = UDim2.fromOffset(170, 84), LayoutOrder = order, Parent = parent },
		{ Kit.padding(10), Kit.list("y", 2) }
	)
	Kit.text({
		text = emoji .. " " .. label,
		style = "tiny",
		tone = "textFaint",
		font = "fontBold",
		Parent = tile,
		order = 1,
	})
	Kit.text({ text = value, style = "h1", size = 26, font = "fontMono", Parent = tile, order = 2 })
	return tile
end

function Profile:show(args)
	local userId = args and args.userId or Players.LocalPlayer.UserId
	for _, child in self.content:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	local loading = Kit.text({ text = "Loading profile…", style = "h3", tone = "textDim", Parent = self.content })
	task.spawn(function()
		local ok, profile = Net.request(Net.Actions.GetProfile, { userId = userId })
		loading:Destroy()
		if not ok then
			Kit.text({ text = "⚠️ " .. tostring(profile), style = "h3", tone = "danger", Parent = self.content })
			Kit.button({
				text = "Retry",
				emoji = "⟳",
				Parent = self.content,
				onClick = function()
					self:show(args)
				end,
			})
			return
		end
		self:render(profile)
	end)
end

function Profile:render(profile)
	local isMe = profile.userId == Players.LocalPlayer.UserId
	self.title.Text = isMe and "Your profile" or (profile.displayName .. "'s profile")
	local stats = profile.stats
	local look = profile.look or {}
	local equipped = profile.equipped or {}

	-- Identity card
	local card = Kit.panel(
		{ Size = UDim2.new(1, 0, 0, 170), LayoutOrder = 1, Parent = self.content },
		{ Kit.padding(18) }
	)
	Kit.avatar(profile.userId, 128, { frame = equipped.frame }, { Parent = card })
	local titleItem = Catalog.ById[equipped.title or ""]
	local badgeItem = Catalog.ById[equipped.badge or ""]
	local nameBlock = Kit.nameBlock(profile.displayName, {
		title = titleItem and titleItem.text or look.title,
		badge = badgeItem and badgeItem.glyph or look.badge,
		vip = look.vip,
	}, { Parent = card, Size = UDim2.new(1, -170, 0, 60), style = "title", nameSize = 30 })
	nameBlock.Position = UDim2.fromOffset(150, 0)
	Kit.text({
		text = "@" .. profile.name .. (profile.online and "  · 🟢 online" or ""),
		style = "small",
		tone = "textFaint",
		Position = UDim2.fromOffset(150, 62),
		Size = UDim2.new(1, -170, 0, 18),
		Parent = card,
	})
	local rank = profile.rank
	Kit.chip(
		rank.emoji .. " " .. rank.name .. " · " .. Format.number(rank.xp) .. " XP",
		nil,
		{ Parent = card, Position = UDim2.fromOffset(150, 90), height = 30, textSize = 15 }
	)
	local bar = Kit.progress({ Position = UDim2.fromOffset(150, 132), Size = UDim2.new(1, -170, 0, 10), Parent = card })
	bar.set(rank.progress or 1, true)

	-- Stats grid
	Kit.text({ text = "Statistics", style = "h2", Parent = self.content, order = 2 })
	local grid = Kit.frame({
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 3,
		Parent = self.content,
	})
	local wrap = Kit.list("x", 10, "Left", "Top")
	wrap.Wraps = true
	wrap.Parent = grid
	local tiles = {
		{ "🏁", "Races", Format.number(stats.races) },
		{ "🥇", "Match wins", Format.number(stats.wins) },
		{ "🏆", "Round wins", Format.number(stats.roundWins) },
		{ "🎯", "Completions", Format.number(stats.completions) },
		{ "⚡", "Fastest", stats.fastestTime and Format.time(stats.fastestTime) or "—" },
		{ "🖱", "Fewest clicks", stats.fewestClicks and tostring(stats.fewestClicks) or "—" },
		{ "🖱", "Total clicks", Format.number(stats.totalClicks) },
		{ "♻", "Redos used", Format.number(stats.totalRedos) },
		{ "🏳️", "Give-ups", Format.number(stats.giveUps) },
		{ "🎮", "Matches", Format.number(stats.matches) },
		{ "☄️", "Times Burning", Format.number(stats.burningReached) },
		{ "🌍", "World records", Format.number(stats.recordsSet or 0) },
	}
	for index, tile in tiles do
		local t = statTile(grid, tile[1], tile[2], tile[3], index)
		Anim.slideIn(t, UDim2.fromOffset(0, 20), 0.35, index * 0.03)
	end

	-- Difficulty completions
	Kit.text({ text = "Completions by difficulty", style = "h2", Parent = self.content, order = 4 })
	local diffRow = Kit.frame(
		{ Size = UDim2.new(1, 0, 0, 70), LayoutOrder = 5, Parent = self.content },
		{ Kit.list("x", 8) }
	)
	for index, key in Difficulty.Order do
		local def = Difficulty.get(key)
		local count = (stats.difficultyCompletions or {})[key] or 0
		local tile = Kit.panel(
			{ Size = UDim2.new(1 / #Difficulty.Order, -7, 1, 0), LayoutOrder = index, Parent = diffRow },
			{ Kit.padding(8), Kit.list("y", 0, "Center", "Center") }
		)
		Kit.text({
			text = def.emoji .. " " .. def.name,
			style = "tiny",
			font = "fontBold",
			align = Enum.TextXAlignment.Center,
			Parent = tile,
			order = 1,
		})
		Kit.text({
			text = tostring(count),
			style = "h2",
			font = "fontMono",
			align = Enum.TextXAlignment.Center,
			Parent = tile,
			order = 2,
		})
	end

	-- Achievements
	local unlocked = 0
	for _ in profile.achievements or {} do
		unlocked += 1
	end
	Kit.text({
		text = ("Achievements  %d/%d"):format(unlocked, #Achievements.List),
		style = "h2",
		Parent = self.content,
		order = 6,
	})
	local achGrid = Kit.frame({
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 7,
		Parent = self.content,
	})
	local achWrap = Kit.list("x", 10, "Left", "Top")
	achWrap.Wraps = true
	achWrap.Parent = achGrid
	for index, def in Achievements.List do
		local done = profile.achievements and profile.achievements[def.id] ~= nil
		local tile = Kit.panel(
			{ Size = UDim2.fromOffset(250, 76), LayoutOrder = index, Parent = achGrid },
			{ Kit.padding(10) },
			done and "surface2" or "surface"
		)
		if done then
			Kit.stroke("gold", 1.5, 0.2).Parent = tile
		end
		local icon = Kit.text({
			text = done and def.emoji or "🔒",
			size = 30,
			align = Enum.TextXAlignment.Center,
			Size = UDim2.fromOffset(40, 56),
			Parent = tile,
		})
		icon.TextTransparency = done and 0 or 0.4
		Kit.text({
			text = def.name,
			style = "h3",
			size = 15,
			Size = UDim2.new(1, -48, 0, 20),
			Position = UDim2.fromOffset(46, 0),
			Parent = tile,
			tone = done and "text" or "textDim",
		})
		Kit.text({
			text = def.description,
			style = "tiny",
			tone = "textFaint",
			Size = UDim2.new(1, -48, 0, 28),
			Position = UDim2.fromOffset(46, 20),
			Parent = tile,
		})
		if def.goal and not done then
			local p =
				Kit.progress({ Position = UDim2.new(0, 46, 1, -8), Size = UDim2.new(1, -48, 0, 5), Parent = tile })
			p.set(math.min(1, (stats[def.stat] or 0) / def.goal), false)
		end
	end

	-- Equipped cosmetics
	Kit.text({ text = "Cosmetics", style = "h2", Parent = self.content, order = 8 })
	local cosRow = Kit.frame({
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 9,
		Parent = self.content,
	})
	local cosWrap = Kit.list("x", 8, "Left", "Top")
	cosWrap.Wraps = true
	cosWrap.Parent = cosRow
	for index, slot in Catalog.SlotOrder do
		local item = Catalog.ById[equipped[slot] or ""]
		if item then
			Kit.chip(
				Catalog.Slots[slot].name .. ": " .. item.name,
				nil,
				{ Parent = cosRow, order = index, height = 28 }
			)
		end
	end
	if isMe then
		Kit.button({
			text = "Customize in the Shop",
			emoji = "🛍️",
			variant = "primary",
			Size = UDim2.fromOffset(260, 44),
			Parent = self.content,
			order = 10,
			onClick = function()
				self.App.show("Shop")
			end,
		})
	end
end

return Profile
