-- Final ceremony: dynamic podium (never empty slots), runner-ups, then special award cards.
-- Victory and podium cosmetics of the players on the podium play here.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Format = require(Shared.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local Store = require(UI.Parent.Core.Store)
local Sound = require(UI.Parent.Core.Sound)

local FinalResults = {}

local PODIUM = {
	{ medal = "🥇", color = Color3.fromRGB(250, 204, 21), height = 230, label = "1st" },
	{ medal = "🥈", color = Color3.fromRGB(203, 213, 225), height = 175, label = "2nd" },
	{ medal = "🥉", color = Color3.fromRGB(217, 119, 6), height = 135, label = "3rd" },
}

local current = nil

function FinalResults.hide()
	if current then
		current:Destroy()
		current = nil
	end
	Fx.blur(0, 0.3)
end

local function victoryEffect(parent: GuiObject, itemId: string?)
	if itemId == "victory_emoji" then
		Fx.rain(
			parent,
			{ glyphs = { "🏆", "🎉", "⭐", "🥳" }, duration = 4, rate = 24, minSize = 20, maxSize = 32 }
		)
	elseif itemId == "victory_fireworks" then
		task.spawn(function()
			for _ = 1, 8 do
				Fx.burst(parent, {
					origin = UDim2.fromScale(0.15 + math.random() * 0.7, 0.1 + math.random() * 0.35),
					count = 34,
					glyphs = { "✦", "✺" },
					gravity = 30,
				})
				Sound.play("boom", { volume = 0.4, pitch = 1 + math.random() * 0.4 })
				task.wait(0.45)
			end
		end)
	elseif itemId == "victory_lightning" then
		task.spawn(function()
			for _ = 1, 4 do
				Fx.flash(parent, Color3.fromRGB(200, 220, 255), 0.25, 0.8)
				Fx.burst(parent, {
					origin = UDim2.fromScale(math.random(), 0.2),
					count = 12,
					glyphs = { "⚡" },
					colors = { Color3.fromRGB(255, 240, 120) },
					minSize = 24,
					maxSize = 40,
				})
				Sound.play("boom", { pitch = 1.6, volume = 0.5 })
				task.wait(0.6)
			end
		end)
	elseif itemId == "victory_vip" then
		local crown = Kit.text({
			text = "👑",
			size = 160,
			align = Enum.TextXAlignment.Center,
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, -0.3),
			Size = UDim2.fromOffset(220, 200),
			Parent = parent,
		})
		crown.ZIndex = 70
		Anim.tween(crown, 1.4, { Position = UDim2.fromScale(0.5, 0.22) }, Enum.EasingStyle.Bounce)
		task.delay(3.5, function()
			Anim.tween(crown, 0.6, { TextTransparency = 1 })
		end)
		Fx.rain(parent, { glyphs = { "★" }, colors = { Color3.fromRGB(255, 215, 0) }, duration = 3.5, rate = 20 })
	else
		Fx.rain(parent, { duration = 3.5, rate = 40 })
	end
end

-- Effects are parented to the podium area (not the clipped column) so they can rise above it.
local function podiumEffect(area: GuiObject, centerX: number, height: number, itemId: string?)
	local column = Kit.frame({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0, centerX, 1, 0),
		Size = UDim2.fromOffset(180, height + 200),
		Parent = area,
	})
	if itemId == "podium_sparkles" then
		Fx.emitter(column, {
			glyph = "✦",
			colors = { Color3.new(1, 1, 1), Color3.fromRGB(255, 240, 180) },
			rate = 8,
			lifetime = 1.4,
			minSize = 8,
			maxSize = 14,
		})
	elseif itemId == "podium_goldrain" then
		Fx.rain(column, { glyphs = { "🪙" }, duration = 5, rate = 10, minSize = 14, maxSize = 20 })
	elseif itemId == "podium_vip" then
		local carpet = Kit.make("Frame", {
			AnchorPoint = Vector2.new(0.5, 1),
			Position = UDim2.new(0.5, 0, 1, 16),
			Size = UDim2.new(1.3, 0, 0, 16),
			BackgroundColor3 = Color3.fromRGB(185, 28, 28),
			BorderSizePixel = 0,
			Parent = column,
		}, { Kit.corner(4) })
		local _ = carpet
	else
		local spot = Kit.make("Frame", {
			AnchorPoint = Vector2.new(0.5, 1),
			Position = UDim2.new(0.5, 0, 1, -height),
			Size = UDim2.new(1.4, 0, 0, 260),
			BackgroundColor3 = Color3.fromRGB(255, 250, 220),
			BackgroundTransparency = 0.6,
			BorderSizePixel = 0,
			ZIndex = 0,
			Parent = column,
		})
		local g = Instance.new("UIGradient")
		g.Rotation = 90
		g.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0.55) })
		g.Parent = spot
	end
end

-- data: { standings, awards, roundsPlayed, solo }. onClose(action) where action = "lobby"|"again"
function FinalResults.show(App, data, onClose)
	FinalResults.hide()
	local me = Players.LocalPlayer.UserId
	local standings = data.standings
	local shade = Kit.make("Frame", {
		Name = "FinalResults",
		Active = true,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(4, 6, 14),
		BackgroundTransparency = 1,
		ZIndex = 55,
		Parent = App.overlay,
	})
	current = shade
	Anim.tween(shade, 0.5, { BackgroundTransparency = 0.08 })
	Fx.blur(14, 0.6)
	local stage = Kit.frame({ Size = UDim2.fromScale(1, 1), Parent = shade })

	local title = Kit.text({
		text = data.solo and "🏁 SOLO RACE COMPLETE" or "🏆 FINAL RESULTS",
		style = "display",
		size = 52,
		align = Enum.TextXAlignment.Center,
		color = Color3.fromRGB(255, 226, 120),
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 22),
		Size = UDim2.new(1, 0, 0, 64),
		Parent = stage,
	})
	Anim.punchIn(title, 1.6)
	Sound.play("fanfare")
	Kit.text({
		text = ("%d round%s played"):format(data.roundsPlayed, data.roundsPlayed == 1 and "" or "s"),
		style = "small",
		align = Enum.TextXAlignment.Center,
		color = Color3.fromRGB(180, 190, 210),
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 84),
		Size = UDim2.new(1, 0, 0, 18),
		Parent = stage,
	})

	-- Podium: exactly min(3, #players) columns, ordered 2nd · 1st · 3rd visually.
	local podiumCount = math.min(3, #standings)
	local hasRunnersUp = #standings > 3
	local podiumArea = Kit.frame({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(hasRunnersUp and 0.36 or 0.5, 0, 1, -150),
		Size = UDim2.fromOffset(podiumCount * 200, 420),
		Parent = stage,
	})
	local visualOrder = podiumCount == 1 and { 1 } or (podiumCount == 2 and { 2, 1 } or { 2, 1, 3 })
	for slot, place in visualOrder do
		local entry = standings[place]
		local spec = PODIUM[place]
		local column = Kit.make("Frame", {
			Name = "Place" .. place,
			AnchorPoint = Vector2.new(0, 1),
			Position = UDim2.new(0, (slot - 1) * 200 + 10, 1, 0),
			Size = UDim2.fromOffset(180, 0),
			BackgroundColor3 = spec.color,
			BorderSizePixel = 0,
			ClipsDescendants = true,
			Parent = podiumArea,
		}, { Kit.corner(10) })
		local centerX = (slot - 1) * 200 + 10 + 90
		local gradient = Instance.new("UIGradient")
		gradient.Rotation = 90
		gradient.Color = ColorSequence.new(spec.color, spec.color:Lerp(Color3.new(0, 0, 0), 0.4))
		gradient.Parent = column
		Kit.text({
			text = spec.medal .. " " .. spec.label,
			style = "h1",
			size = 26,
			align = Enum.TextXAlignment.Center,
			color = Color3.fromRGB(30, 20, 0),
			Size = UDim2.new(1, 0, 0, 36),
			Position = UDim2.fromOffset(0, 10),
			Parent = column,
		})
		local stats = Kit.text({
			text = ("⏱ %s\n🖱 %d clicks · ♻ %d redos"):format(
				Format.time(entry.totalTime),
				entry.totalClicks,
				entry.totalRedos
			),
			style = "tiny",
			align = Enum.TextXAlignment.Center,
			color = Color3.fromRGB(40, 30, 10),
			Size = UDim2.new(1, -10, 0, 34),
			Position = UDim2.fromOffset(5, 48),
			Parent = column,
		})
		local _ = stats
		local riseDelay = ({ 2.0, 1.2, 0.5 })[place]
		task.delay(riseDelay, function()
			Sound.play(place == 1 and "podium" or "drumroll", { pitch = place == 1 and 1 or 1.2 })
			Anim.tween(column, 0.9, { Size = UDim2.fromOffset(180, spec.height) }, Enum.EasingStyle.Back)
			-- Player card drops onto the column.
			local cardHolder = Kit.frame({
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0, centerX, 1, -(spec.height + 600)),
				Size = UDim2.fromOffset(180, 170),
				ZIndex = 5,
				Parent = podiumArea,
			}, { Kit.list("y", 4, "Center", "Bottom") })
			Kit.avatar(entry.userId, place == 1 and 92 or 76, entry.look, { Parent = cardHolder, order = 1 })
			Kit.nameBlock(entry.displayName .. (entry.userId == me and " (you)" or ""), entry.look, {
				Parent = cardHolder,
				order = 2,
				hAlign = "Center",
				align = Enum.TextXAlignment.Center,
				Size = UDim2.new(1, 0, 0, 36),
				nameSize = 17,
			})
			local score = Kit.text({
				text = "0",
				style = "h2",
				size = 22,
				font = "fontMono",
				align = Enum.TextXAlignment.Center,
				color = spec.color,
				Size = UDim2.new(1, 0, 0, 26),
				Parent = cardHolder,
				order = 3,
			})
			Anim.tween(
				cardHolder,
				0.8,
				{ Position = UDim2.new(0, centerX, 1, -(spec.height + 8)) },
				Enum.EasingStyle.Bounce,
				Enum.EasingDirection.Out,
				0.35
			)
			task.delay(0.8, function()
				Anim.countTo(score, 0, entry.score, 1.2, function(n)
					return Format.number(n) .. " pts"
				end)
				podiumEffect(podiumArea, centerX, spec.height, entry.look and entry.look.podium)
				if place == 1 then
					Fx.flash(stage, spec.color, 0.5, 0.45)
					victoryEffect(stage, entry.look and entry.look.victory)
					if entry.userId == me and not data.solo then
						Sound.play("achievement")
					end
				end
			end)
		end)
	end

	-- Runner-ups (4th and below), scrollable.
	if hasRunnersUp then
		local panel = Kit.panel({
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -30, 1, -150),
			Size = UDim2.new(0.3, 0, 0, 380),
			Parent = stage,
		}, { Kit.padding(12) }, "surface")
		panel.BackgroundTransparency = 0.05
		Kit.text({ text = "Runner-ups", style = "h2", Size = UDim2.new(1, 0, 0, 28), Parent = panel })
		local list = Kit.scroll(
			{ Position = UDim2.fromOffset(0, 34), Size = UDim2.new(1, 0, 1, -34), Parent = panel },
			{ Kit.list("y", 6) }
		)
		for index = 4, #standings do
			local entry = standings[index]
			local row = Kit.panel(
				{ Size = UDim2.new(1, -8, 0, 58), LayoutOrder = index, Parent = list },
				nil,
				entry.userId == me and "surface2" or "surface"
			)
			Kit.text({
				text = "#" .. index,
				style = "h3",
				Size = UDim2.fromOffset(40, 58),
				Position = UDim2.fromOffset(8, 0),
				Parent = row,
			})
			Kit.avatar(entry.userId, 38, entry.look, { Parent = row, Position = UDim2.fromOffset(46, 10) })
			Kit.nameBlock(
				entry.displayName,
				entry.look,
				{ Parent = row, Size = UDim2.new(1, -200, 0, 30), nameSize = 14 }
			).Position =
				UDim2.fromOffset(92, 4)
			Kit.text({
				text = ("⏱ %s · 🖱 %d · ♻ %d"):format(
					Format.time(entry.totalTime),
					entry.totalClicks,
					entry.totalRedos
				),
				style = "tiny",
				tone = "textDim",
				Size = UDim2.new(1, -200, 0, 16),
				Position = UDim2.fromOffset(92, 36),
				Parent = row,
			})
			Kit.text({
				text = Format.number(entry.score),
				style = "h3",
				font = "fontMono",
				align = Enum.TextXAlignment.Right,
				AnchorPoint = Vector2.new(1, 0),
				Position = UDim2.new(1, -10, 0, 0),
				Size = UDim2.fromOffset(90, 58),
				Parent = row,
			})
			Anim.slideIn(row, UDim2.fromOffset(60, 0), 0.4, 2.6 + (index - 4) * 0.1)
		end
	end

	-- Special awards (after the podium settles).
	local awards = Kit.frame({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -72),
		Size = UDim2.fromOffset(780, 70),
		Parent = stage,
	}, { Kit.list("x", 14, "Center", "Center") })
	local AWARDS = {
		{
			key = "fastestTime",
			emoji = "⚡",
			title = "Fastest Time",
			value = function(a)
				return Format.time(a.time)
			end,
		},
		{
			key = "fewestClicks",
			emoji = "🎯",
			title = "Fewest Clicks",
			value = function(a)
				return a.clicks .. " clicks"
			end,
		},
		{
			key = "fewestRedos",
			emoji = "♻️",
			title = "Fewest Redos",
			value = function(a)
				return a.redos .. " redos"
			end,
		},
	}
	local shown = 0
	for _, spec in AWARDS do
		local award = data.awards and data.awards[spec.key]
		if award and not data.solo then
			shown += 1
			local cardDelay = 3.4 + shown * 0.45
			local card = Kit.panel(
				{ Size = UDim2.fromOffset(240, 66), LayoutOrder = shown, Parent = awards },
				{ Kit.padding(8) },
				"surface2"
			)
			card.BackgroundTransparency = 0
			card.Visible = false
			Kit.stroke("gold", 2, 0.2).Parent = card
			Kit.text({ text = spec.emoji, size = 30, Size = UDim2.fromOffset(40, 50), Parent = card })
			Kit.text({
				text = spec.title,
				style = "tiny",
				tone = "gold",
				font = "fontHeavy",
				Size = UDim2.new(1, -48, 0, 14),
				Position = UDim2.fromOffset(46, 2),
				Parent = card,
			})
			Kit.text({
				text = award.displayName,
				style = "h3",
				size = 16,
				truncate = true,
				wrap = false,
				Size = UDim2.new(1, -48, 0, 22),
				Position = UDim2.fromOffset(46, 16),
				Parent = card,
			})
			Kit.text({
				text = spec.value(award),
				style = "tiny",
				tone = "textDim",
				Size = UDim2.new(1, -48, 0, 14),
				Position = UDim2.fromOffset(46, 38),
				Parent = card,
			})
			task.delay(cardDelay, function()
				card.Visible = true
				card.Rotation = 90
				local scale = Anim.scaleOf(card)
				scale.Scale = 0.4
				Anim.tween(card, 0.6, { Rotation = 0 }, Enum.EasingStyle.Back)
				Anim.tween(scale, 0.6, { Scale = 1 }, Enum.EasingStyle.Back)
				Sound.play("award", { pitch = 1 + shown * 0.08 })
				if award.userId == me then
					Fx.burst(
						card,
						{ count = 16, glyphs = { "✦" }, colors = { Color3.fromRGB(255, 215, 0) }, maxDistance = 120 }
					)
				end
			end)
		end
	end

	-- Buttons
	local buttons = Kit.frame({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -16),
		Size = UDim2.fromOffset(600, 48),
		Parent = stage,
	}, { Kit.list("x", 12, "Center", "Center") })
	Kit.button({
		text = data.solo and "Back to Free Roam" or "Back to lobby",
		emoji = "←",
		Size = UDim2.fromOffset(220, 46),
		Parent = buttons,
		order = 1,
		onClick = function()
			FinalResults.hide()
			onClose(data.solo and "freeroam" or "lobby")
		end,
	})
	if not data.solo and Store.isHost() then
		Kit.button({
			text = "Play again",
			emoji = "🔁",
			variant = "primary",
			Size = UDim2.fromOffset(200, 46),
			Parent = buttons,
			order = 2,
			onClick = function()
				FinalResults.hide()
				onClose("again")
			end,
		})
	end
end

return FinalResults
