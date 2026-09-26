-- Round intro choreography, synced to server timestamps:
--   1. STARTING PAGE  — titles roll like a slot machine, slow down, then the start page lands.
--   2. YOUR TARGET    — a longer, louder roll with shake, then a zoom slam + flash + glow ring.
--   3. 3 · 2 · 1 · GO — the race clock starts exactly at raceStartAt.
-- Players joining after the race started skip straight to the page.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Categories = require(Shared.Categories)
local Difficulty = require(Shared.Difficulty)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local Sound = require(UI.Parent.Core.Sound)

local Reveal = {}

local active = nil

local function serverNow(): number
	return workspace:GetServerTimeNow()
end

local function waitUntil(t: number)
	local remaining = t - serverNow()
	if remaining > 0 then
		task.wait(remaining)
	end
end

-- Rolls titles on a label, slowing down (ease-out), finishing just before `deadline`.
local function roll(label: TextLabel, titles, deadline: number, pitchBase: number, shakeTarget: GuiObject?)
	local startTime = serverNow()
	local total = math.max(0.3, deadline - startTime)
	local index = math.random(1, math.max(1, #titles))
	while serverNow() < deadline - 0.06 do
		local progress = math.clamp((serverNow() - startTime) / total, 0, 1)
		index = index % math.max(1, #titles) + 1
		label.Text = titles[index] or "…"
		Sound.play("tick", { pitch = pitchBase + progress * 0.6, volume = 0.6 })
		if shakeTarget and progress > 0.55 then
			Anim.shake(shakeTarget, 3 + progress * 6, 0.08)
		end
		local interval = 0.04 + (progress ^ 2.2) * 0.34
		task.wait(math.min(interval, math.max(0.02, deadline - serverNow() - 0.05)))
	end
end

function Reveal.play(App, data, onDone)
	if active then
		active:Destroy()
		active = nil
	end
	if serverNow() >= data.raceStartAt - 0.2 then
		onDone()
		return
	end

	local overlay = Kit.make("Frame", {
		Name = "Reveal",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 1,
		ZIndex = 60,
		Parent = App.overlay,
	})
	active = overlay
	local gradient = Instance.new("UIGradient")
	gradient.Rotation = 90
	gradient.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.1),
		NumberSequenceKeypoint.new(0.5, 0.35),
		NumberSequenceKeypoint.new(1, 0.1),
	})
	gradient.Parent = overlay
	Anim.tween(overlay, 0.4, { BackgroundTransparency = 0 })
	Fx.blur(20, 0.5)

	local center = Kit.frame({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(900, 460),
		Parent = overlay,
	})

	local def = Difficulty.get(data.difficulty)
	local header = Kit.chip(
		("Round %s  ·  %s %s"):format(
			data.totalRounds == 0 and (data.round .. " · ∞") or (data.round .. "/" .. data.totalRounds),
			def.emoji,
			def.name
		),
		def.color,
		{
			Parent = center,
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.fromScale(0.5, 0),
			height = 34,
			textSize = 16,
			textColor = Color3.fromRGB(20, 20, 20),
		}
	)
	Anim.punchIn(header)
	if data.rigged then
		local rig = Kit.chip(
			"🎰 SERVER RIGGED BY " .. string.upper(data.rigBy or "?") .. " — GIVE UP MODE",
			Color3.fromRGB(220, 38, 38),
			{
				Parent = center,
				AnchorPoint = Vector2.new(0.5, 0),
				Position = UDim2.new(0.5, 0, 0, 42),
				height = 30,
			}
		)
		Anim.pulse(rig, "BackgroundTransparency", 0, 0.4, 0.5)
	end

	local caption = Kit.text({
		text = "STARTING PAGE",
		style = "h2",
		size = 20,
		align = Enum.TextXAlignment.Center,
		color = Color3.fromRGB(200, 210, 230),
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 96),
		Size = UDim2.new(1, 0, 0, 26),
		Parent = center,
	})
	local big = Kit.text({
		text = "",
		style = "display",
		size = 58,
		align = Enum.TextXAlignment.Center,
		color = Color3.new(1, 1, 1),
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 130),
		Size = UDim2.new(1, 0, 0, 80),
		Parent = center,
	})
	big.TextWrapped = true
	local sub = Kit.text({
		text = "",
		style = "body",
		align = Enum.TextXAlignment.Center,
		color = Color3.fromRGB(190, 200, 220),
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 216),
		Size = UDim2.new(0.8, 0, 0, 44),
		Parent = center,
	})
	local startCard = Kit.chip("", Color3.fromRGB(51, 102, 204), {
		Parent = center,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 290),
		height = 40,
		textSize = 18,
	})
	startCard.Visible = false
	local countdown = Kit.text({
		text = "",
		style = "display",
		size = 120,
		align = Enum.TextXAlignment.Center,
		color = Color3.new(1, 1, 1),
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 330),
		Size = UDim2.new(1, 0, 0, 130),
		Parent = center,
	})

	local titles = data.rollTitles or {}
	local finished = false
	local function finish()
		if finished then
			return
		end
		finished = true
		Fx.blur(0, 0.35)
		Anim.tween(overlay, 0.35, { BackgroundTransparency = 1 })
		for _, child in overlay:GetDescendants() do
			if child:IsA("TextLabel") then
				Anim.tween(child, 0.3, { TextTransparency = 1, BackgroundTransparency = 1 })
			end
		end
		task.delay(0.4, function()
			overlay:Destroy()
			if active == overlay then
				active = nil
			end
		end)
		onDone()
	end

	task.spawn(function()
		-- Phase 1: start page.
		waitUntil(data.revealStartAt)
		Sound.play("whoosh")
		roll(big, titles, data.targetRevealAt - 0.9, 0.9, nil)
		big.Text = data.start.title
		local startInfo = Categories.get(data.start.category)
		sub.Text = (data.start.emoji or startInfo.emoji) .. "  " .. data.start.category
		Sound.play("revealStart")
		Anim.punchIn(big, 1.45)
		Fx.burst(center, {
			count = 18,
			origin = UDim2.new(0.5, 0, 0, 170),
			colors = { Color3.fromRGB(96, 165, 250), Color3.new(1, 1, 1) },
			maxDistance = 200,
		})
		waitUntil(data.targetRevealAt)
		if not overlay.Parent then
			return
		end

		-- Phase 2: target (bigger, louder, shakier).
		startCard.Text = "📄 START: " .. data.start.title
		startCard.Visible = true
		Anim.punchIn(startCard, 0.6)
		caption.Text = "🎯 YOUR TARGET"
		caption.TextColor3 = Color3.fromRGB(255, 90, 90)
		caption.TextSize = 24
		Anim.pop(caption, 1.3)
		sub.Text = ""
		big.TextColor3 = Color3.fromRGB(255, 214, 102)
		Sound.play("drumroll")
		roll(big, titles, data.countdownAt - 1.1, 1.1, center)
		big.Text = data.target.title
		local targetInfo = Categories.get(data.target.category)
		sub.Text = (data.target.emoji or targetInfo.emoji) .. "  " .. (data.target.blurb or data.target.category)
		Sound.play("revealTarget")
		Sound.play("boom", { volume = 0.8 })
		Anim.punchIn(big, 2.4)
		Fx.flash(overlay, Color3.fromRGB(255, 200, 80), 0.6, 0.55)
		Anim.shake(center, 14, 0.5)
		local ring = Kit.make("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(0.5, 0, 0, 170),
			Size = UDim2.fromOffset(60, 60),
			BackgroundTransparency = 1,
			Parent = center,
		}, { Kit.round() })
		local ringStroke = Kit.stroke(Color3.fromRGB(255, 200, 80), 6, 0)
		ringStroke.Parent = ring
		Anim.tween(ring, 0.8, { Size = UDim2.fromOffset(820, 820) })
		Anim.tween(ringStroke, 0.8, { Transparency = 1, Thickness = 1 })
		Fx.burst(center, {
			count = 40,
			origin = UDim2.new(0.5, 0, 0, 170),
			glyphs = { "🎯", "✦", "★" },
			colors = { Color3.fromRGB(255, 214, 102), Color3.fromRGB(255, 90, 90) },
			maxDistance = 360,
		})
		waitUntil(data.countdownAt)
		if not overlay.Parent then
			return
		end

		-- Phase 3: countdown synced to the server.
		for n = 3, 1, -1 do
			waitUntil(data.raceStartAt - n)
			countdown.Text = tostring(n)
			countdown.TextTransparency = 0
			Sound.play("countdown", { pitch = 1 + (3 - n) * 0.12 })
			Anim.punchIn(countdown, 1.8)
			Anim.tween(countdown, 0.9, { TextTransparency = 0.6 })
		end
		waitUntil(data.raceStartAt)
		countdown.Text = "GO!"
		countdown.TextTransparency = 0
		countdown.TextColor3 = Color3.fromRGB(74, 222, 128)
		Sound.play("go")
		Anim.punchIn(countdown, 2)
		task.wait(0.35)
		finish()
	end)

	-- Safety net: never leave the overlay up past the race start.
	task.delay(math.max(0, data.raceStartAt - serverNow()) + 1.2, finish)
end

function Reveal.cancel()
	if active then
		active:Destroy()
		active = nil
		Fx.blur(0, 0.2)
	end
end

return Reveal
