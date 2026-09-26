-- Chaos presentation: the server-wide SERVER RIGGED slam and targeted gag effects.
-- Every overlay here is non-blocking (never sinks input) and short; players can keep playing.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Temperature = require(Shared.Temperature)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local Sound = require(UI.Parent.Core.Sound)
local Store = require(UI.Parent.Core.Store)

local Chaos = {}

local function layer(App, z: number)
	local frame = Kit.make("Frame", {
		Name = "Chaos",
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Active = false,
		ZIndex = z,
		Parent = App.overlay,
	})
	return frame
end

function Chaos.serverRigged(App, data)
	local frame = layer(App, 95)
	Sound.play("siren")
	Sound.play("boom")
	-- Hazard stripes backdrop
	local backdrop = Kit.make("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(20, 0, 0),
		BackgroundTransparency = 1,
		Active = false,
		Parent = frame,
	})
	Anim.tween(backdrop, 0.15, { BackgroundTransparency = 0.25 })
	local stripes = Kit.frame({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1.4, 0, 0, 170),
		Rotation = -6,
		Parent = frame,
	})
	stripes.BackgroundTransparency = 0
	stripes.BackgroundColor3 = Color3.fromRGB(250, 204, 21)
	local gradient = Instance.new("UIGradient")
	local keys = {}
	for i = 0, 20 do
		local alpha = i / 20
		table.insert(
			keys,
			ColorSequenceKeypoint.new(
				alpha,
				(i % 2 == 0) and Color3.fromRGB(250, 204, 21) or Color3.fromRGB(20, 20, 20)
			)
		)
	end
	gradient.Color = ColorSequence.new(keys)
	gradient.Parent = stripes
	Anim.slideIn(stripes, UDim2.fromScale(-1.5, 0), 0.35)
	local title = Kit.text({
		text = "SERVER RIGGED",
		style = "display",
		size = 96,
		align = Enum.TextXAlignment.Center,
		color = Color3.fromRGB(255, 50, 50),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.46),
		Size = UDim2.new(1, 0, 0, 110),
		Parent = frame,
	})
	title.TextStrokeTransparency = 0
	title.TextStrokeColor3 = Color3.new(0, 0, 0)
	Anim.punchIn(title, 4)
	local sub = Kit.text({
		text = ("🎰 %s just rigged the server. GIVE UP MODE ACTIVATED."):format(data.by or "Someone"),
		style = "h1",
		size = 26,
		align = Enum.TextXAlignment.Center,
		color = Color3.new(1, 1, 1),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.6),
		Size = UDim2.new(1, 0, 0, 40),
		Parent = frame,
	})
	sub.TextStrokeTransparency = 0.3
	task.delay(0.1, function()
		Anim.shake(App.root, 18, 0.9)
		Fx.flash(frame, Color3.fromRGB(255, 0, 0), 0.5, 0.7)
		Fx.burst(
			frame,
			{ count = 50, glyphs = { "🎰", "💥", "🤡", "⚠️" }, minSize = 22, maxSize = 36, maxDistance = 500 }
		)
	end)
	Anim.pulse(title, "TextTransparency", 0, 0.35, 0.3)
	task.delay(3.4, function()
		Anim.tween(stripes, 0.4, { Position = UDim2.fromScale(2, 0.5) })
		for _, child in frame:GetDescendants() do
			if child:IsA("TextLabel") then
				Anim.tween(child, 0.4, { TextTransparency = 1, TextStrokeTransparency = 1 })
			end
		end
		Anim.tween(backdrop, 0.4, { BackgroundTransparency = 1 })
		task.delay(0.5, function()
			frame:Destroy()
		end)
	end)
end

local EFFECTS = {}

EFFECTS.clown = function(App, frame)
	Sound.play("boing")
	Fx.rain(frame, { glyphs = { "🤡", "🎈", "🤡" }, duration = 3.5, rate = 30, minSize = 26, maxSize = 44 })
end

EFFECTS.wobble = function(App)
	Sound.play("boing", { pitch = 0.8 })
	local root = App.root
	task.spawn(function()
		for i = 1, 8 do
			Anim.tween(root, 0.18, { Rotation = (i % 2 == 0) and 2 or -2 }, Enum.EasingStyle.Sine)
			task.wait(0.18)
		end
		Anim.tween(root, 0.2, { Rotation = 0 })
	end)
end

EFFECTS.fakeburn = function(App, frame)
	local info = Temperature.Info.Burning
	Sound.play("burning")
	local label = Kit.text({
		text = "☄️ BURNING!!! ☄️",
		style = "display",
		size = 72,
		align = Enum.TextXAlignment.Center,
		color = info.color,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1, 0, 0, 90),
		Parent = frame,
	})
	label.TextStrokeTransparency = 0
	Anim.punchIn(label, 3)
	Anim.shake(label, 10, 1.6)
	Fx.emitter(frame, { colors = { info.color, info.glow }, rate = 40, lifetime = 1 })
	task.delay(1.8, function()
		label.Text = "…jk 🤡"
		label.TextColor3 = Color3.new(1, 1, 1)
		Sound.play("boing")
		Anim.punchIn(label, 0.5)
	end)
end

EFFECTS.airhorn = function(App, frame)
	Sound.play("airhorn")
	Anim.shake(App.root, 14, 1.2)
	Fx.burst(frame, { count = 30, glyphs = { "📯", "💨" }, minSize = 22, maxSize = 34, maxDistance = 420 })
end

EFFECTS.warning = function(App, frame, from)
	Sound.play("error")
	local box = Kit.panel({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.42),
		Size = UDim2.fromOffset(520, 150),
		Parent = frame,
	}, { Kit.padding(16), Kit.list("y", 6, "Center", "Center") }, "surface")
	box.BackgroundTransparency = 0
	Kit.stroke("warning", 3, 0).Parent = box
	Kit.text({
		text = "⚠️ OFFICIAL WARNING ⚠️",
		style = "h1",
		tone = "warning",
		align = Enum.TextXAlignment.Center,
		Parent = box,
		order = 1,
	})
	Kit.text({
		text = ("%s has filed a report: you are TOO good at clicking links. Your wiki license is under review."):format(
			from
		),
		style = "body",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 50),
		Parent = box,
		order = 2,
	})
	Anim.punchIn(box, 0.6)
end

EFFECTS.scream = function(App, frame)
	local dark = Kit.make("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0,
		Active = false,
		Parent = frame,
	})
	local face = Kit.text({
		text = "😱",
		size = 400,
		align = Enum.TextXAlignment.Center,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(600, 500),
		Parent = dark,
	})
	Sound.play("jumpscare")
	Anim.punchIn(face, 0.2)
	Anim.shake(face, 30, 0.8)
	task.delay(0.9, function()
		Anim.tween(dark, 0.3, { BackgroundTransparency = 1 })
		Anim.tween(face, 0.3, { TextTransparency = 1 })
	end)
end

EFFECTS.crash = function(App, frame, from)
	local blue = Kit.make(
		"Frame",
		{ Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(0, 90, 200), Active = false, Parent = frame }
	)
	Sound.play("jumpscare", { pitch = 0.7 })
	local text = Kit.text({
		text = ":(\n\nYour wiki ran into a problem and needs to restart.\nWe're just collecting some links for you.\n\n0% complete",
		style = "h2",
		size = 26,
		color = Color3.new(1, 1, 1),
		font = "fontMono",
		Position = UDim2.fromScale(0.12, 0.2),
		Size = UDim2.new(0.76, 0, 0.6, 0),
		Parent = blue,
	})
	text.TextYAlignment = Enum.TextYAlignment.Top
	task.delay(1.8, function()
		text.Text = ("…just kidding! 🤡\n\nRigged by %s."):format(from)
		Sound.play("boing")
	end)
	task.delay(3.1, function()
		Anim.tween(blue, 0.3, { BackgroundTransparency = 1 })
		Anim.tween(text, 0.3, { TextTransparency = 1 })
	end)
end

function Chaos.effect(App, data)
	local handler = EFFECTS[data.effect]
	if not handler then
		return
	end
	-- Respect local settings too (the server already swaps jumpscares for opted-out players).
	if (data.effect == "scream" or data.effect == "crash") and Store.setting("jumpscares", true) == false then
		handler = EFFECTS.warning
	end
	local frame = layer(App, 96)
	handler(App, frame, data.from or "Someone")
	local banner = Kit.chip(("🤡 Rigged by %s"):format(data.from or "someone"), Color3.fromRGB(220, 38, 38), {
		Parent = frame,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 70),
		height = 34,
		textSize = 16,
	})
	Anim.punchIn(banner, 0.6)
	task.delay((data.duration or 4) + 0.2, function()
		for _, child in frame:GetDescendants() do
			if child:IsA("TextLabel") then
				Anim.tween(child, 0.3, { TextTransparency = 1, BackgroundTransparency = 1 })
			elseif child:IsA("Frame") then
				Anim.tween(child, 0.3, { BackgroundTransparency = 1 })
			end
		end
		task.delay(0.35, function()
			frame:Destroy()
		end)
	end)
end

return Chaos
