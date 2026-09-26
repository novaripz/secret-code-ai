-- App shell: ScreenGuis, responsive scaling, themed/animated background, screen router,
-- toasts, modals, loading states, purchases and cosmetic application.

local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local GuiService = game:GetService("GuiService")
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Catalog = require(Shared.Catalog)
local Signal = require(Shared.Signal)

local Kit = require(script.Parent.Kit)
local Theme = require(script.Parent.Theme)
local Anim = require(script.Parent.Anim)
local Fx = require(script.Parent.Fx)
local Net = require(script.Parent.Parent.Core.Net)
local Store = require(script.Parent.Parent.Core.Store)
local Sound = require(script.Parent.Parent.Core.Sound)

local App = {}
App.screens = {}
App.current = nil
App.history = {}
App.compact = false
App.layoutChanged = Signal.new()

local player = Players.LocalPlayer

local function makeGui(name: string, order: number)
	local gui = Instance.new("ScreenGui")
	gui.Name = name
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = order
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = player:WaitForChild("PlayerGui")
	local root = Kit.frame({ Name = "Root", Size = UDim2.fromScale(1, 1) })
	root.Parent = gui
	local scale = Instance.new("UIScale")
	scale.Name = "Scale"
	scale.Parent = root
	return gui, root, scale
end

local scales = {}

local function updateScale()
	local camera = workspace.CurrentCamera
	local viewport = camera and camera.ViewportSize or Vector2.new(1280, 720)
	local scale = math.clamp(viewport.Y / 760, 0.72, 1.35)
	scale = math.min(scale, math.max(0.6, viewport.X / 960))
	for _, uiScale in scales do
		uiScale.Scale = scale
	end
	local designWidth = viewport.X / scale
	local compact = designWidth < 1120
		or (UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled and designWidth < 1250)
	App.scale = scale
	App.designSize = Vector2.new(designWidth, viewport.Y / scale)
	if compact ~= App.compact then
		App.compact = compact
		App.layoutChanged:Fire(compact)
	end
end

function App.init()
	local _, background, bgScale = makeGui("WikiRaceBackground", 1)
	local mainGui, root, rootScale = makeGui("WikiRace", 10)
	local _, overlay, overlayScale = makeGui("WikiRaceOverlay", 20)
	local _, fxRoot = makeGui("WikiRaceFx", 30)
	scales = { rootScale, overlayScale, bgScale }
	App.gui = mainGui
	App.root = root
	App.overlay = overlay
	App.fx = fxRoot
	App.background = background

	App:_buildBackground(background)

	App.toasts = Kit.frame({
		Name = "Toasts",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 12),
		Size = UDim2.fromOffset(460, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		ZIndex = 100,
		Parent = overlay,
	}, { Kit.list("y", 8, "Center", "Top") })

	local camera = workspace.CurrentCamera
	if camera then
		camera:GetPropertyChangedSignal("ViewportSize"):Connect(updateScale)
	end
	workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(function()
		updateScale()
		if workspace.CurrentCamera then
			workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(updateScale)
		end
	end)
	updateScale()
	GuiService.AutoSelectGuiEnabled = true
end

-- Background: theme gradient + pattern + lobby cosmetic layer.
function App:_buildBackground(parent)
	local base = Kit.make("Frame", {
		Name = "Base",
		Size = UDim2.fromScale(1, 1),
		BorderSizePixel = 0,
		Parent = parent,
		Theme = { BackgroundColor3 = "bg" },
	})
	local gradient = Instance.new("UIGradient")
	gradient.Rotation = 90
	gradient.Parent = base
	local function paint()
		gradient.Color = ColorSequence.new(Theme.current.bg, Theme.current.bg2)
	end
	paint()
	Theme.changed:Connect(paint)
	App.bgGradient = gradient
	App.pattern =
		Kit.frame({ Name = "Pattern", Size = UDim2.fromScale(1, 1), ClipsDescendants = true, Parent = parent })
	App.lobbyLayer =
		Kit.frame({ Name = "LobbyLayer", Size = UDim2.fromScale(1, 1), ClipsDescendants = true, Parent = parent })
	self:_applyPattern()
	Theme.changed:Connect(function()
		self:_applyPattern()
	end)
end

function App:_applyPattern()
	for _, child in App.pattern:GetChildren() do
		child:Destroy()
	end
	if App.stopPattern then
		App.stopPattern()
		App.stopPattern = nil
	end
	local t = Theme.current
	if t.pattern == "grid" then
		for i = 0, 24 do
			Kit.make("Frame", {
				Size = UDim2.new(0, 1, 1, 0),
				Position = UDim2.fromScale(i / 24, 0),
				BackgroundColor3 = t.accent,
				BackgroundTransparency = 0.85,
				BorderSizePixel = 0,
				Parent = App.pattern,
			})
			Kit.make("Frame", {
				Size = UDim2.new(1, 0, 0, 1),
				Position = UDim2.fromScale(0, i / 24),
				BackgroundColor3 = t.accent2,
				BackgroundTransparency = 0.88,
				BorderSizePixel = 0,
				Parent = App.pattern,
			})
		end
	elseif t.pattern == "scanlines" then
		for i = 0, 80 do
			Kit.make("Frame", {
				Size = UDim2.new(1, 0, 0, 1),
				Position = UDim2.fromScale(0, i / 80),
				BackgroundColor3 = t.accent,
				BackgroundTransparency = 0.9,
				BorderSizePixel = 0,
				Parent = App.pattern,
			})
		end
	elseif t.pattern == "stars" then
		for _ = 1, 90 do
			local star = Kit.make("Frame", {
				Size = UDim2.fromOffset(math.random(1, 3), math.random(1, 3)),
				Position = UDim2.fromScale(math.random(), math.random()),
				BackgroundColor3 = Color3.new(1, 1, 1),
				BackgroundTransparency = math.random() * 0.6,
				BorderSizePixel = 0,
				Parent = App.pattern,
			}, { Kit.round() })
			if t.animated and math.random() < 0.3 then
				Anim.pulse(star, "BackgroundTransparency", 0.1, 0.9, 1 + math.random() * 3)
			end
		end
	end
	if t.animated then
		App.stopPattern = Anim.spin(App.bgGradient, 6)
	else
		App.bgGradient.Rotation = 90
	end
end

-- Lobby background cosmetic (shown on menu + lobby screens).
function App.setLobbyBackground(itemId: string?, visible: boolean)
	local layer = App.lobbyLayer
	if App.lobbyBgId ~= itemId then
		App.lobbyBgId = itemId
		for _, child in layer:GetChildren() do
			child:Destroy()
		end
		if App.stopLobbyBg then
			App.stopLobbyBg()
			App.stopLobbyBg = nil
		end
		if itemId == "lobby_aurora" then
			for i = 1, 3 do
				local band = Kit.make("Frame", {
					Size = UDim2.fromScale(1.6, 0.35),
					AnchorPoint = Vector2.new(0.5, 0.5),
					Position = UDim2.fromScale(0.5, 0.2 + i * 0.12),
					BackgroundColor3 = ({
						Color3.fromRGB(34, 211, 153),
						Color3.fromRGB(56, 189, 248),
						Color3.fromRGB(168, 85, 247),
					})[i],
					BackgroundTransparency = 0.75,
					BorderSizePixel = 0,
					Rotation = -8 + i * 5,
					Parent = layer,
				}, { Kit.round() })
				local g = Instance.new("UIGradient")
				g.Transparency = NumberSequence.new({
					NumberSequenceKeypoint.new(0, 1),
					NumberSequenceKeypoint.new(0.5, 0.2),
					NumberSequenceKeypoint.new(1, 1),
				})
				g.Parent = band
				Anim.pulse(band, "Rotation", band.Rotation - 4, band.Rotation + 4, 8 + i * 2)
			end
		elseif itemId == "lobby_grid" then
			for i = 0, 16 do
				local line = Kit.make("Frame", {
					Size = UDim2.new(1, 0, 0, 2),
					Position = UDim2.fromScale(0, i / 16),
					BackgroundColor3 = Color3.fromRGB(236, 72, 153),
					BackgroundTransparency = 0.7,
					BorderSizePixel = 0,
					Parent = layer,
				})
				Anim.pulse(line, "BackgroundTransparency", 0.55, 0.92, 2 + (i % 4))
			end
		elseif itemId == "lobby_starfield" then
			App.stopLobbyBg = Fx.emitter(layer, {
				colors = { Color3.new(1, 1, 1), Color3.fromRGB(199, 210, 254) },
				direction = "down",
				rate = 12,
				lifetime = 6,
				minSize = 2,
				maxSize = 4,
			})
		elseif itemId == "lobby_vip" then
			App.stopLobbyBg = Fx.emitter(layer, {
				glyph = "★",
				colors = { Color3.fromRGB(255, 215, 0), Color3.fromRGB(255, 240, 180) },
				rate = 6,
				lifetime = 5,
				minSize = 8,
				maxSize = 14,
			})
		end
	end
	layer.Visible = visible
end

function App.register(name: string, screen)
	App.screens[name] = screen
	screen.frame.Visible = false
end

function App.show(name: string, args)
	local nextScreen = App.screens[name]
	if not nextScreen then
		return
	end
	local previous = App.current and App.screens[App.current]
	if App.current == name then
		if nextScreen.show then
			nextScreen:show(args)
		end
		return
	end
	if App.current then
		table.insert(App.history, App.current)
		if #App.history > 10 then
			table.remove(App.history, 1)
		end
	end
	if previous then
		if previous.hide then
			previous:hide()
		end
		previous.frame.Visible = false
	end
	App.current = name
	nextScreen.frame.Visible = true
	local lobbyScreens = {
		Menu = true,
		Lobbies = true,
		LobbyRoom = true,
		Profile = true,
		Shop = true,
		Leaderboards = true,
		Settings = true,
	}
	App.setLobbyBackground(
		Store.profile and Store.profile.equipped and Store.profile.equipped.lobbyBg or "lobby_default",
		lobbyScreens[name] == true
	)
	nextScreen.frame.Position = UDim2.fromOffset(0, 16)
	Anim.tween(nextScreen.frame, 0.35, { Position = UDim2.fromOffset(0, 0) })
	if nextScreen.show then
		nextScreen:show(args)
	end
end

function App.back(fallback: string?)
	local previous = table.remove(App.history)
	while previous and (previous == "Race" or previous == App.current) do
		previous = table.remove(App.history)
	end
	App.show(previous or fallback or "Menu")
	-- Don't let "back" itself push onto history.
	table.remove(App.history)
end

-- Where a player belongs when no modal flow is active.
function App.home()
	if Store.lobby then
		App.show("LobbyRoom")
	else
		App.show("Menu")
	end
end

-- Toasts ------------------------------------------------------------------------------------

local TOAST_TOKENS = { success = "success", error = "danger", finish = "gold", info = "accent", muted = "textFaint" }

function App.toast(text: string, kind: string?)
	kind = kind or "info"
	local toast = Kit.panel({
		Name = "Toast",
		Size = UDim2.fromOffset(460, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		ZIndex = 100,
		Parent = App.toasts,
	}, { Kit.padding(10, 16, 10, 16) }, "surface2")
	local bar = Kit.make("Frame", {
		Size = UDim2.new(0, 4, 1, -12),
		Position = UDim2.fromOffset(-8, 6),
		BorderSizePixel = 0,
		ZIndex = 101,
		Parent = toast,
		Theme = { BackgroundColor3 = TOAST_TOKENS[kind] or "accent" },
	}, { Kit.round() })
	local _ = bar
	local label = Kit.text({
		text = text,
		style = "small",
		font = "fontBold",
		Size = UDim2.new(1, 0, 0, 0),
		auto = Enum.AutomaticSize.Y,
		ZIndex = 101,
		Parent = toast,
	})
	label.TextWrapped = true
	Anim.punchIn(toast, 0.8)
	if kind == "error" then
		Sound.play("error")
	elseif kind == "finish" then
		Sound.play("finishOther")
	end
	local children = 0
	for _, child in App.toasts:GetChildren() do
		if child:IsA("GuiObject") then
			children += 1
		end
	end
	if children > 4 then
		for _, child in App.toasts:GetChildren() do
			if child:IsA("GuiObject") and child ~= toast then
				child:Destroy()
				break
			end
		end
	end
	task.delay(kind == "error" and 5 or 3.4, function()
		if toast.Parent then
			Anim.tween(label, 0.25, { TextTransparency = 1 })
			Anim.tween(toast, 0.25, { BackgroundTransparency = 1 })
			task.delay(0.26, function()
				toast:Destroy()
			end)
		end
	end)
end

-- Modal -------------------------------------------------------------------------------------

-- opts: { title, width, build(body, close), buttons = { { text, variant, onClick(close) } }, dismissable }
function App.modal(opts)
	local shade = Kit.make("TextButton", {
		Name = "Modal",
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 1,
		ZIndex = 80,
		Parent = App.overlay,
	})
	Anim.tween(shade, 0.25, { BackgroundTransparency = 0.45 })
	local card = Kit.panel({
		Name = "Card",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(opts.width or 460, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		ZIndex = 81,
		Parent = shade,
	}, { Kit.padding(20), Kit.list("y", 12) }, "surface")
	card.BackgroundTransparency = 0
	local closed = false
	local function close()
		if closed then
			return
		end
		closed = true
		Anim.tween(shade, 0.2, { BackgroundTransparency = 1 })
		Anim.tween(Anim.scaleOf(card), 0.2, { Scale = 0.9 })
		task.delay(0.2, function()
			shade:Destroy()
		end)
		if opts.onClose then
			opts.onClose()
		end
	end
	if opts.title then
		Kit.text({ text = opts.title, style = "h1", size = 24, Parent = card, order = 0, ZIndex = 82 })
	end
	local body = Kit.frame({
		Name = "Body",
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 1,
		ZIndex = 82,
		Parent = card,
	}, { Kit.list("y", 10) })
	if opts.build then
		opts.build(body, close)
	end
	if opts.buttons then
		local row = Kit.frame(
			{ Size = UDim2.new(1, 0, 0, 46), LayoutOrder = 2, Parent = card },
			{ Kit.list("x", 10, "Right", "Center") }
		)
		for index, spec in opts.buttons do
			Kit.button({
				text = spec.text,
				emoji = spec.emoji,
				variant = spec.variant or "secondary",
				Size = UDim2.fromOffset(spec.width or 150, 44),
				order = index,
				ZIndex = 83,
				Parent = row,
				onClick = function(button)
					if spec.onClick then
						spec.onClick(close, button)
					else
						close()
					end
				end,
			})
		end
	end
	shade.Activated:Connect(function()
		if opts.dismissable ~= false then
			close()
		end
	end)
	Anim.punchIn(card, 0.85)
	Sound.play("whoosh", { volume = 0.5 })
	return close, body
end

function App.confirm(title: string, message: string, confirmText: string, onConfirm, variant: string?)
	App.modal({
		title = title,
		build = function(body)
			Kit.text({
				text = message,
				style = "body",
				tone = "textDim",
				Size = UDim2.new(1, 0, 0, 0),
				auto = Enum.AutomaticSize.Y,
				Parent = body,
				ZIndex = 82,
			})
		end,
		buttons = {
			{ text = "Cancel" },
			{
				text = confirmText,
				variant = variant or "primary",
				onClick = function(close)
					close()
					onConfirm()
				end,
			},
		},
	})
end

-- Loading ------------------------------------------------------------------------------------

-- Returns hide(). opts: { retry = fn, cancel = fn, subtle = bool }
function App.loading(text: string, opts)
	opts = opts or {}
	local shade = Kit.make("Frame", {
		Name = "Loading",
		Active = true, -- sink clicks while loading
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = opts.subtle and 0.7 or 0.35,
		ZIndex = 90,
		Parent = App.overlay,
	})
	local card = Kit.panel({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(380, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		ZIndex = 91,
		Parent = shade,
	}, { Kit.padding(22), Kit.list("y", 14, "Center", "Center") }, "surface")
	card.BackgroundTransparency = 0
	local spinner = Kit.spinner(44, card)
	spinner.LayoutOrder = 1
	spinner.ZIndex = 92
	local label = Kit.text({
		text = text,
		style = "h3",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 0),
		auto = Enum.AutomaticSize.Y,
		Parent = card,
		order = 2,
		ZIndex = 92,
	})
	local actions = Kit.frame({
		Size = UDim2.new(1, 0, 0, 44),
		LayoutOrder = 3,
		Visible = opts.retry ~= nil or opts.cancel ~= nil,
		Parent = card,
	}, { Kit.list("x", 10, "Center", "Center") })
	local hidden = false
	local function hide()
		if hidden then
			return
		end
		hidden = true
		Anim.tween(shade, 0.2, { BackgroundTransparency = 1 })
		task.delay(0.2, function()
			shade:Destroy()
		end)
	end
	if opts.cancel then
		Kit.button({
			text = "Cancel",
			Parent = actions,
			order = 1,
			ZIndex = 93,
			Size = UDim2.fromOffset(130, 42),
			onClick = function()
				hide()
				opts.cancel()
			end,
		})
	end
	if opts.retry then
		Kit.button({
			text = "Retry",
			emoji = "⟳",
			variant = "primary",
			Parent = actions,
			order = 2,
			ZIndex = 93,
			Size = UDim2.fromOffset(130, 42),
			onClick = function()
				hide()
				opts.retry()
			end,
		})
	end
	Anim.punchIn(card, 0.9)
	return hide, label
end

-- Runs a request with a loading state and friendly error handling. Returns ok, data.
function App.request(action: string, payload, loadingText: string?)
	local hide = loadingText and App.loading(loadingText, { subtle = true }) or nil
	local ok, data = Net.request(action, payload)
	if hide then
		hide()
	end
	if not ok then
		App.toast(tostring(data), "error")
	end
	return ok, data
end

-- Purchases ---------------------------------------------------------------------------------

function App.purchaseProduct(productKey: string)
	local product = Config.Products[productKey]
	if not product then
		return
	end
	if product.id and product.id ~= 0 then
		MarketplaceService:PromptProductPurchase(player, product.id)
	elseif Store.boot and Store.boot.debugPurchases then
		App.confirm(
			"Studio test purchase",
			("Simulate buying %s (%d R$)? No Robux will be charged."):format(product.name, product.price),
			"Simulate",
			function()
				local ok = App.request(Net.Actions.DebugPurchase, { product = productKey }, "Processing…")
				if ok then
					Sound.play("purchase")
					App.toast(product.name .. " purchased (Studio test).", "success")
				end
			end
		)
	else
		App.toast("This product isn't available yet.", "error")
	end
end

function App.promptPass(passKey: string)
	local pass = Config.GamePasses[passKey]
	if pass and pass.id and pass.id ~= 0 then
		MarketplaceService:PromptGamePassPurchase(player, pass.id)
	elseif Store.boot and Store.boot.studio then
		App.toast("Studio: game passes are auto-granted (see Config.Studio).", "info")
	else
		App.toast("This game pass isn't available yet.", "error")
	end
end

function App.owns(itemId: string): boolean
	local profile = Store.profile
	return profile ~= nil and profile.ownedAll ~= nil and profile.ownedAll[itemId] == true
end

function App.hasPass(passKey: string): boolean
	local profile = Store.profile
	return profile ~= nil and profile.passes ~= nil and profile.passes[passKey] == true
end

-- Applies equipped cosmetics + settings from a profile snapshot.
local cursorStop = nil
local currentCursor = nil
function App.applyProfile(profile)
	local equipped = profile.equipped or Catalog.defaults()
	local themeItem = Catalog.ById[equipped.theme]
	Theme.set(themeItem and themeItem.theme or "classic")
	Sound.setPack(equipped.sound)
	Sound.setVolume(profile.settings and profile.settings.sfx or 0.8)
	Anim.reduced = profile.settings and profile.settings.reducedMotion == true
	if currentCursor ~= equipped.cursor then
		currentCursor = equipped.cursor
		if cursorStop then
			cursorStop()
			cursorStop = nil
		end
		local item = Catalog.ById[equipped.cursor]
		if item and item.glyph then
			local color = equipped.cursor == "cursor_vip" and Color3.fromRGB(255, 215, 0)
				or (equipped.cursor == "cursor_comet" and Color3.fromRGB(255, 140, 60) or Color3.fromRGB(255, 255, 255))
			cursorStop = Fx.cursorTrail(App.fx, item.glyph, color)
		end
	end
	if App.current then
		local lobbyScreens = {
			Menu = true,
			Lobbies = true,
			LobbyRoom = true,
			Profile = true,
			Shop = true,
			Leaderboards = true,
			Settings = true,
		}
		App.setLobbyBackground(equipped.lobbyBg, lobbyScreens[App.current] == true)
	end
end

return App
