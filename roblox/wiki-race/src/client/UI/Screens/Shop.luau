-- Cosmetic shop: categories, item grid, live preview, price, ownership and equipped state,
-- plus a Robux tab for game passes, coin packs and chaos products.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Catalog = require(Shared.Catalog)
local Config = require(Shared.Config)
local Achievements = require(Shared.Achievements)
local Format = require(Shared.Format)
local Temperature = require(Shared.Temperature)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Themes = require(UI.Themes)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)
local Sound = require(UI.Parent.Core.Sound)
local ChaosMenu = require(UI.Overlays.ChaosMenu)

local Shop = {}
Shop.__index = Shop

local TAB_EMOJI = {
	UI = "🎨",
	Profile = "🖼️",
	Victory = "🏆",
	Lobby = "🌌",
	Effects = "✨",
	Sounds = "🔊",
	Badges = "🏅",
	Titles = "🏷️",
	Robux = "💎",
}

function Shop.new(App)
	local self = setmetatable({ App = App, category = "UI", selected = nil }, Shop)
	local frame = Kit.frame({ Name = "Shop", Size = UDim2.fromScale(1, 1), Parent = App.root })
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
	Kit.text({ text = "🛍️ Shop", style = "title", Size = UDim2.fromOffset(200, 44), Parent = header, order = 2 })
	self.coins = Kit.chip("🪙 0", nil, { Parent = header, order = 3, height = 36, textSize = 17 })
	Kit.text({
		text = "Everything here is cosmetic. Stats can't be bought.",
		style = "small",
		tone = "textFaint",
		Size = UDim2.fromOffset(340, 20),
		Parent = header,
		order = 4,
	})

	local tabs = Kit.scroll(
		{ axis = "x", Position = UDim2.fromOffset(24, 72), Size = UDim2.new(1, -48, 0, 46), Parent = frame, bar = 0 },
		{ Kit.list("x", 6, "Left", "Center") }
	)
	self.tabButtons = {}
	local tabNames = table.clone(Catalog.ShopCategories)
	table.insert(tabNames, "Robux")
	for index, name in tabNames do
		local button = Kit.button({
			text = name,
			emoji = TAB_EMOJI[name],
			Size = UDim2.fromOffset(118, 40),
			textSize = 14,
			order = index,
			Parent = tabs,
			onClick = function()
				self.category = name
				self.selected = nil
				self:render()
			end,
		})
		self.tabButtons[name] = button
	end

	local body = Kit.frame({ Position = UDim2.fromOffset(24, 126), Size = UDim2.new(1, -48, 1, -136), Parent = frame })
	self.grid = Kit.scroll(
		{ Size = UDim2.new(0.62, -8, 1, 0), Parent = body },
		{ Kit.grid(UDim2.fromOffset(170, 150), 10), Kit.padding(4) }
	)
	self.preview = Kit.panel({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0.38, -8, 1, 0),
		Parent = body,
	}, { Kit.padding(16) })

	Store.changed:Connect(function(key)
		if key == "profile" and frame.Visible then
			self:render()
		end
	end)
	return self
end

function Shop:show()
	self:render()
end

local function itemStatus(App, item)
	local profile = Store.profile
	local equipped = profile and profile.equipped and profile.equipped[item.slot] == item.id
	if equipped then
		return "equipped"
	elseif App.owns(item.id) then
		return "owned"
	elseif item.requires then
		return "pass"
	elseif item.achievement then
		return "achievement"
	end
	return "buy"
end

local function previewVisual(parent, item)
	local box = Kit.make("Frame", {
		Size = UDim2.new(1, 0, 0, 150),
		BorderSizePixel = 0,
		ClipsDescendants = true,
		LayoutOrder = 1,
		Parent = parent,
		Theme = { BackgroundColor3 = "surface2" },
	}, { Kit.corner() })
	local slot = item.slot
	if slot == "theme" then
		local t = Themes[item.theme]
		box.BackgroundColor3 = t.bg
		local mock = Kit.make("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.new(0.86, 0, 0.78, 0),
			BackgroundColor3 = t.article,
			BorderSizePixel = 0,
			Parent = box,
		}, { Kit.corner(t.corner) })
		Kit.make(
			"Frame",
			{ Size = UDim2.new(1, 0, 0, 22), BackgroundColor3 = t.surface2, BorderSizePixel = 0, Parent = mock },
			{ Kit.corner(t.corner) }
		)
		Kit.make("TextLabel", {
			Text = "Pizza",
			Font = t.fontHeading,
			TextSize = 20,
			TextColor3 = t.heading,
			BackgroundTransparency = 1,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.fromOffset(10, 26),
			Size = UDim2.new(1, -20, 0, 24),
			Parent = mock,
		})
		Kit.make("TextLabel", {
			RichText = true,
			Text = ('A flat bread from <font color="#%s"><u>Naples</u></font>, <font color="#%s"><u>Italy</u></font>.'):format(
				t.link:ToHex(),
				t.link:ToHex()
			),
			Font = t.fontBody,
			TextSize = 14,
			TextColor3 = t.articleText,
			BackgroundTransparency = 1,
			TextXAlignment = Enum.TextXAlignment.Left,
			Position = UDim2.fromOffset(10, 52),
			Size = UDim2.new(1, -20, 0, 20),
			Parent = mock,
		})
		Kit.make("Frame", {
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -10, 1, -8),
			Size = UDim2.fromOffset(70, 20),
			BackgroundColor3 = t.accent,
			BorderSizePixel = 0,
			Parent = mock,
		}, { Kit.corner(t.corner) })
	elseif slot == "frame" or slot == "title" or slot == "badge" then
		local me = Players.LocalPlayer
		local look = {
			frame = slot == "frame" and item.id or nil,
			title = slot == "title" and item.text or nil,
			badge = slot == "badge" and item.glyph or nil,
		}
		Kit.avatar(
			me.UserId,
			84,
			look,
			{ Parent = box, AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 10) }
		)
		local nameBlock = Kit.nameBlock(
			me.DisplayName,
			look,
			{ Parent = box, hAlign = "Center", align = Enum.TextXAlignment.Center, Size = UDim2.new(1, -20, 0, 40) }
		)
		nameBlock.Position = UDim2.new(0, 10, 0, 100)
	elseif slot == "meter" then
		local info = Temperature.Info.Burning
		Kit.text({
			text = "☄️ BURNING",
			style = "h2",
			color = info.color,
			align = Enum.TextXAlignment.Center,
			Size = UDim2.new(1, 0, 0, 40),
			Position = UDim2.fromOffset(0, 50),
			Parent = box,
		})
		Fx.emitter(box, { glyph = item.particle, colors = { info.color, info.glow }, rate = 20, lifetime = 1 })
	elseif slot == "cursor" or slot == "victory" or slot == "podium" or slot == "lobbyBg" or slot == "transition" then
		Kit.text({
			text = TAB_EMOJI[item.category] or "✨",
			size = 56,
			align = Enum.TextXAlignment.Center,
			Size = UDim2.fromScale(1, 1),
			Parent = box,
		})
	elseif slot == "sound" then
		Kit.text({
			text = "🔊",
			size = 56,
			align = Enum.TextXAlignment.Center,
			Size = UDim2.fromScale(1, 1),
			Parent = box,
		})
	end
	return box
end

local function demo(box, item)
	if item.slot == "victory" then
		if item.emojis then
			Fx.rain(box, { glyphs = item.emojis, duration = 1.5, rate = 30, minSize = 16, maxSize = 24 })
		else
			Fx.burst(box, { count = 40, maxDistance = 140 })
		end
	elseif item.slot == "podium" then
		Fx.rain(box, { glyphs = item.id == "podium_goldrain" and { "🪙" } or { "✦" }, duration = 1.5, rate = 20 })
	elseif item.slot == "cursor" then
		Fx.burst(box, { count = 20, glyphs = { item.glyph or "✦" }, maxDistance = 100 })
	elseif item.slot == "sound" then
		local previous = Store.profile and Store.profile.equipped and Store.profile.equipped.sound
		Sound.setPack(item.id)
		Sound.play("tempUp")
		task.delay(0.25, function()
			Sound.play("burning")
			task.delay(0.6, function()
				Sound.setPack(previous)
			end)
		end)
	elseif item.slot == "transition" then
		local scale = Anim.scaleOf(box)
		scale.Scale = 0.85
		Anim.tween(scale, 0.35, { Scale = 1 }, Enum.EasingStyle.Back)
	elseif item.slot == "lobbyBg" then
		Fx.emitter(box, { colors = { Color3.new(1, 1, 1) }, direction = "down", rate = 10, lifetime = 2 })
	end
end

function Shop:_renderPreview(item)
	local App = self.App
	local panel = self.preview
	for _, child in panel:GetChildren() do
		if child:IsA("GuiObject") or child:IsA("UIListLayout") then
			child:Destroy()
		end
	end
	Kit.list("y", 10).Parent = panel
	if not item then
		Kit.text({ text = "Select an item to preview it.", style = "h3", tone = "textDim", Parent = panel })
		return
	end
	local box = previewVisual(panel, item)
	Kit.text({ text = item.name, style = "h1", size = 24, Parent = panel, order = 2 })
	Kit.chip(Catalog.Slots[item.slot].name, nil, { Parent = panel, order = 3 })
	Kit.text({
		text = item.description,
		style = "body",
		tone = "textDim",
		Size = UDim2.new(1, 0, 0, 44),
		Parent = panel,
		order = 4,
	})
	if item.slot ~= "theme" and item.slot ~= "frame" and item.slot ~= "title" and item.slot ~= "badge" then
		Kit.button({
			text = "Preview",
			emoji = "▶",
			Size = UDim2.new(1, 0, 0, 40),
			Parent = panel,
			order = 5,
			onClick = function()
				demo(box, item)
			end,
		})
	end
	local status = itemStatus(App, item)
	local actionText, variant, handler
	if status == "equipped" then
		actionText, variant = "✓ Equipped", "success"
	elseif status == "owned" then
		actionText, variant = "Equip", "primary"
		handler = function(button)
			Kit.busy(button, true, "Equipping…")
			local ok, err = Net.request(Net.Actions.EquipItem, { itemId = item.id })
			Kit.busy(button, false)
			if ok then
				Sound.play("coin")
			else
				App.toast(err, "error")
			end
		end
	elseif status == "pass" then
		local pass = Config.GamePasses[item.requires]
		actionText, variant = ("Get %s · R$ %d"):format(pass.name, pass.price), "gold"
		handler = function()
			App.promptPass(item.requires)
		end
	elseif status == "achievement" then
		local def = Achievements.ById[item.achievement]
		actionText, variant = ("🔒 Unlock: %s"):format(def and def.name or "achievement"), "secondary"
	else
		actionText, variant = ("Buy · 🪙 %s"):format(Format.number(item.price)), "primary"
		handler = function(button)
			local coins = Store.profile and Store.profile.coins or 0
			if coins < item.price then
				App.toast(
					("You need %s more Wiki Coins. Earn them by racing!"):format(Format.number(item.price - coins)),
					"error"
				)
				return
			end
			Kit.busy(button, true, "Buying…")
			local ok, err = Net.request(Net.Actions.BuyItem, { itemId = item.id })
			Kit.busy(button, false)
			if ok then
				Sound.play("purchase")
				Fx.burst(box, { count = 30, glyphs = { "🪙", "✦" }, maxDistance = 140 })
				App.toast(item.name .. " unlocked & equipped!", "success")
			else
				App.toast(err, "error")
			end
		end
	end
	local action = Kit.button({
		text = actionText,
		variant = variant,
		textSize = 17,
		Size = UDim2.new(1, 0, 0, 50),
		Parent = panel,
		order = 6,
		onClick = function(button)
			if handler then
				handler(button)
			end
		end,
	})
	if status == "equipped" or status == "achievement" then
		Kit.setDisabled(action, true)
	end
end

function Shop:_itemCard(item, index: number)
	local status = itemStatus(self.App, item)
	local card = Kit.panel(
		{ LayoutOrder = index, Parent = self.grid },
		{ Kit.padding(10) },
		self.selected == item.id and "surface2" or "surface"
	)
	if self.selected == item.id then
		Kit.stroke("accent", 2, 0).Parent = card
	end
	local swatch = Kit.make(
		"Frame",
		{ Size = UDim2.new(1, 0, 0, 62), BorderSizePixel = 0, Parent = card, Theme = { BackgroundColor3 = "surface3" } },
		{ Kit.corner() }
	)
	if item.slot == "theme" then
		local t = Themes[item.theme]
		swatch.BackgroundColor3 = t.bg
		local g = Instance.new("UIGradient")
		g.Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, t.bg),
			ColorSequenceKeypoint.new(0.5, t.accent),
			ColorSequenceKeypoint.new(1, t.accent2),
		})
		g.Parent = swatch
	elseif item.slot == "frame" then
		Kit.avatar(
			Players.LocalPlayer.UserId,
			50,
			{ frame = item.id },
			{ Parent = swatch, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5) }
		)
	else
		local glyph = item.glyph
			or item.particle
			or (item.emojis and item.emojis[1])
			or (item.text and "🏷️")
			or TAB_EMOJI[item.category]
			or "✨"
		Kit.text({
			text = glyph,
			size = 32,
			align = Enum.TextXAlignment.Center,
			Size = UDim2.fromScale(1, 1),
			Parent = swatch,
		})
	end
	Kit.text({
		text = item.name,
		style = "h3",
		size = 15,
		truncate = true,
		wrap = false,
		Position = UDim2.fromOffset(0, 68),
		Size = UDim2.new(1, 0, 0, 20),
		Parent = card,
	})
	local statusText = ({
		equipped = "✓ Equipped",
		owned = "Owned",
		pass = "⭐ " .. (item.requires and Config.GamePasses[item.requires].name or ""),
		achievement = "🔒 Achievement",
		buy = "🪙 " .. Format.number(item.price),
	})[status]
	Kit.text({
		text = statusText,
		style = "small",
		tone = status == "equipped" and "success" or (status == "buy" and "gold" or "textDim"),
		font = "fontBold",
		Position = UDim2.fromOffset(0, 92),
		Size = UDim2.new(1, 0, 0, 18),
		Parent = card,
	})
	Kit.hoverable(card, function()
		self.selected = item.id
		self:render()
	end)
end

function Shop:_renderRobux()
	local App = self.App
	local index = 0
	local function card(emoji: string, title: string, description: string, priceText: string, owned: boolean, onBuy)
		index += 1
		local c = Kit.panel({ LayoutOrder = index, Parent = self.grid }, { Kit.padding(10), Kit.list("y", 4) })
		Kit.text({ text = emoji .. " " .. title, style = "h3", size = 15, Parent = c, order = 1 })
		Kit.text({
			text = description,
			style = "tiny",
			tone = "textDim",
			Size = UDim2.new(1, 0, 0, 44),
			Parent = c,
			order = 2,
		})
		local button = Kit.button({
			text = owned and "✓ Owned" or priceText,
			variant = owned and "success" or "gold",
			textSize = 14,
			Size = UDim2.new(1, 0, 0, 34),
			Parent = c,
			order = 3,
			onClick = function()
				if not owned then
					onBuy()
				end
			end,
		})
		if owned then
			Kit.setDisabled(button, true)
		end
	end
	for key, pass in Config.GamePasses do
		local info = Catalog.GamePassInfo[key]
		card(info.emoji, pass.name, info.tagline, "R$ " .. pass.price, App.hasPass(key), function()
			App.promptPass(key)
		end)
	end
	for _, key in { "Coins500", "Coins1500", "Coins5000" } do
		local product = Config.Products[key]
		card(
			"🪙",
			product.name,
			"Wiki Coins for cosmetics. Coins can't buy stats.",
			"R$ " .. product.price,
			false,
			function()
				App.purchaseProduct(key)
			end
		)
	end
	card(
		"🎰",
		"Server Rig",
		"Force every race on this server into Give Up Mode. Loud. Public. Chaotic.",
		"R$ " .. Config.Products.ServerRig.price,
		false,
		function()
			ChaosMenu.serverRig(App)
		end
	)
	card(
		"🤡",
		"Rig a Player",
		("One rig credit for a harmless gag on a friend. You have %d."):format(
			Store.profile and Store.profile.rigCredits or 0
		),
		"R$ " .. Config.Products.RigPlayer.price,
		false,
		function()
			App.purchaseProduct("RigPlayer")
		end
	)
	self:_renderPreview(nil)
	for _, child in self.preview:GetChildren() do
		if child:IsA("TextLabel") then
			child.Text = "Game passes are one-time purchases with cosmetic perks. VIP never changes race calculations."
		end
	end
	local vipInfo = Catalog.GamePassInfo.VIP
	for i, perk in vipInfo.perks do
		Kit.text({ text = "⭐ " .. perk, style = "small", Parent = self.preview, order = 10 + i })
	end
	for i, perk in Catalog.GamePassInfo.Jumpscares.perks do
		Kit.text({ text = "😱 " .. perk, style = "small", Parent = self.preview, order = 20 + i })
	end
end

function Shop:render()
	local profile = Store.profile
	self.coins.Text = "🪙 " .. Format.number(profile and profile.coins or 0)
	for name, button in self.tabButtons do
		local selected = name == self.category
		button.BackgroundTransparency = selected and 0 or 0.5
		button:SetAttribute("BaseTransparency", selected and 0 or 0.5)
	end
	for _, child in self.grid:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	if self.category == "Robux" then
		self:_renderRobux()
		return
	end
	local selectedItem = nil
	local index = 0
	for _, item in Catalog.Items do
		if item.category == self.category then
			index += 1
			if not self.selected then
				self.selected = item.id
			end
			if self.selected == item.id then
				selectedItem = item
			end
			self:_itemCard(item, index)
		end
	end
	self:_renderPreview(selectedItem)
end

return Shop
