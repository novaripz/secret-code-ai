-- Round results: placements animate in one by one with counting scores, plus the start/target,
-- the true shortest route, your own route, and a countdown to the next round.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Difficulty = require(Shared.Difficulty)
local Format = require(Shared.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)
local Sound = require(UI.Parent.Core.Sound)

local RoundResults = {}

local MEDALS = { "🥇", "🥈", "🥉" }
local current = nil

function RoundResults.hide()
	if current then
		local frame = current
		current = nil
		Anim.tween(frame, 0.25, { BackgroundTransparency = 1 })
		task.delay(0.25, function()
			frame:Destroy()
		end)
	end
end

function RoundResults.show(App, data)
	RoundResults.hide()
	local me = Players.LocalPlayer.UserId
	local shade = Kit.make("Frame", {
		Name = "RoundResults",
		Active = true,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 1,
		ZIndex = 50,
		Parent = App.overlay,
	})
	current = shade
	Anim.tween(shade, 0.3, { BackgroundTransparency = 0.4 })
	local card = Kit.panel({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.86, 0, 0.88, 0),
		Parent = shade,
	}, { Kit.padding(18) }, "surface")
	card.BackgroundTransparency = 0
	local constraint = Instance.new("UISizeConstraint")
	constraint.MaxSize = Vector2.new(1100, 820)
	constraint.Parent = card
	Anim.punchIn(card, 0.9)
	Sound.play("roundEnd")

	local def = Difficulty.get(data.difficulty)
	local title = data.totalRounds == 0 and ("Round %d results"):format(data.round)
		or ("Round %d of %d — results"):format(data.round, data.totalRounds)
	Kit.text({ text = title, style = "title", size = 30, Size = UDim2.new(1, -220, 0, 38), Parent = card })
	Kit.chip(def.emoji .. " " .. def.name, def.color, {
		Parent = card,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 4),
		height = 30,
		textColor = Color3.fromRGB(20, 20, 20),
	})
	local y = 44
	if data.rigged then
		Kit.chip(
			"🎰 This round was rigged by " .. tostring(data.rigBy),
			Color3.fromRGB(220, 38, 38),
			{ Parent = card, Position = UDim2.fromOffset(0, y), height = 26 }
		)
		y += 32
	end
	Kit.text({
		text = ("📄 %s   →   🎯 %s"):format(data.start.title, data.target.title),
		style = "h3",
		tone = "textDim",
		Position = UDim2.fromOffset(0, y),
		Size = UDim2.new(1, 0, 0, 24),
		Parent = card,
	})
	y += 28
	if data.optimalPath and #data.optimalPath > 0 then
		local route = Kit.text({
			text = ("Shortest route (%d links): %s"):format(
				#data.optimalPath - 1,
				table.concat(data.optimalPath, " → ")
			),
			style = "small",
			tone = "accent",
			Position = UDim2.fromOffset(0, y),
			Size = UDim2.new(1, 0, 0, 36),
			Parent = card,
		})
		route.TextYAlignment = Enum.TextYAlignment.Top
		y += 40
	end

	-- Column headers
	local columns = {
		{ "#", 0.06 },
		{ "Player", 0.34 },
		{ "Time", 0.14 },
		{ "Clicks", 0.1 },
		{ "Redos", 0.1 },
		{ "Score", 0.14 },
		{ "", 0.12 },
	}
	local headerRow = Kit.frame({ Position = UDim2.fromOffset(0, y), Size = UDim2.new(1, 0, 0, 22), Parent = card })
	local x = 0
	for _, column in columns do
		Kit.text({
			text = column[1],
			style = "tiny",
			tone = "textFaint",
			font = "fontBold",
			Position = UDim2.fromScale(x, 0),
			Size = UDim2.new(column[2], 0, 1, 0),
			Parent = headerRow,
		})
		x += column[2]
	end
	y += 26

	local list = Kit.scroll(
		{ Position = UDim2.fromOffset(0, y), Size = UDim2.new(1, 0, 1, -(y + 64)), Parent = card },
		{ Kit.list("y", 6) }
	)
	for index, row in data.rows do
		local isMe = row.userId == me
		local rowHeight = isMe and #row.route > 0 and 78 or 54
		local frame = Kit.panel(
			{ Size = UDim2.new(1, -8, 0, rowHeight), LayoutOrder = index, Parent = list },
			nil,
			isMe and "surface2" or "surface"
		)
		if isMe then
			Kit.stroke("accent", 2, 0.1).Parent = frame
		end
		local cx = 0
		local function cell(text: string, width: number, props)
			props = props or {}
			local label = Kit.text({
				text = text,
				style = props.style or "body",
				font = props.font,
				tone = props.tone,
				truncate = true,
				wrap = false,
				Position = UDim2.new(cx, 8, 0, 0),
				Size = UDim2.new(width, -8, 0, 54),
				Parent = frame,
			})
			cx += width
			return label
		end
		cell(
			row.completed and (MEDALS[row.placement] or ("#" .. row.placement)) or ("#" .. row.placement),
			0.06,
			{ style = "h3" }
		)
		local playerCell =
			Kit.frame({ Position = UDim2.new(cx, 4, 0, 7), Size = UDim2.new(0.34, -8, 0, 40), Parent = frame })
		Kit.avatar(row.userId, 40, row.look, { Parent = playerCell })
		local nameBlock = Kit.nameBlock(
			row.displayName .. (isMe and " (you)" or ""),
			row.look,
			{ Parent = playerCell, Size = UDim2.new(1, -50, 1, 0), nameSize = 15 }
		)
		nameBlock.Position = UDim2.fromOffset(50, 0)
		cx += 0.34
		local status = row.completed and Format.time(row.time)
			or (row.left and "🔌 left" or (row.gaveUp and "🏳️ gave up" or "⌛ DNF"))
		cell(status, 0.14, { tone = row.completed and "text" or "textFaint", font = "fontMono" })
		cell(tostring(row.clicks), 0.1, { font = "fontMono" })
		cell(tostring(row.redos), 0.1, { font = "fontMono" })
		local scoreLabel = cell("0", 0.14, { style = "h3", font = "fontMono" })
		local breakdown = row.breakdown or {}
		local detail = row.completed
				and ("+%d place · +%d time · +%d route · %d redos · ×%.1f"):format(
					breakdown.placement or 0,
					breakdown.time or 0,
					breakdown.efficiency or 0,
					breakdown.redos or 0,
					breakdown.multiplier or 1
				)
			or ("+%d progress · ×%.1f"):format(breakdown.progress or 0, breakdown.multiplier or 1)
		cell(detail, 0.12, { style = "tiny", tone = "textFaint" }).TextWrapped = true
		if isMe and #row.route > 0 then
			local routeText = Kit.text({
				text = "Your route: "
					.. table.concat(row.route, " → ")
					.. (row.routeLength > #row.route and " (…)" or ""),
				style = "tiny",
				tone = "textDim",
				truncate = true,
				wrap = false,
				Position = UDim2.fromOffset(12, 54),
				Size = UDim2.new(1, -24, 0, 18),
				Parent = frame,
			})
			local _ = routeText
		end
		Anim.slideIn(frame, UDim2.fromOffset(-60, 0), 0.4, 0.15 + index * 0.12)
		task.delay(0.15 + index * 0.12, function()
			Sound.play("tick", { pitch = 1 + index * 0.05 })
			Anim.countTo(scoreLabel, 0, row.score, 0.9, function(n)
				return Format.number(n)
			end)
			if isMe and row.placement == 1 and row.completed and #data.rows > 1 then
				Fx.burst(frame, { count = 24, maxDistance = 160 })
			end
		end)
	end

	-- Footer: countdown + host controls
	local footer = Kit.frame({
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.fromScale(0, 1),
		Size = UDim2.new(1, 0, 0, 52),
		Parent = card,
	})
	local countdown = Kit.text({
		text = "",
		style = "body",
		font = "fontBold",
		tone = "textDim",
		Size = UDim2.new(0.6, 0, 0, 22),
		Parent = footer,
	})
	local bar = Kit.progress({ Position = UDim2.fromOffset(0, 30), Size = UDim2.new(0.6, 0, 0, 8), Parent = footer })
	local total = math.max(1, data.nextAt - workspace:GetServerTimeNow())
	local connection
	connection = RunService.Heartbeat:Connect(function()
		if not shade.Parent then
			connection:Disconnect()
			return
		end
		local remaining = math.max(0, data.nextAt - workspace:GetServerTimeNow())
		bar.set(1 - remaining / total, false)
		countdown.Text = (data.isFinal and "🏆 Final results in %ds" or "Next round in %ds"):format(
			math.ceil(remaining)
		)
	end)
	if Store.isHost() and not (Store.lobby and Store.lobby.solo) then
		Kit.button({
			text = data.isFinal and "Show final results" or "Next round now",
			emoji = "▶",
			variant = "primary",
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, 0, 0.5, 0),
			Size = UDim2.fromOffset(220, 46),
			Parent = footer,
			onClick = function()
				App.request(Net.Actions.NextRound, {})
			end,
		})
	end
end

return RoundResults
