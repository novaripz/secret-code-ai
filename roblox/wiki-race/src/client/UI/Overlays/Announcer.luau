-- Achievement unlock cards and world-record banners.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Achievements = require(Shared.Achievements)
local Difficulty = require(Shared.Difficulty)
local Format = require(Shared.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local Sound = require(UI.Parent.Core.Sound)

local Announcer = {}

local queue = {}
local running = false

local function runQueue(App)
	if running then
		return
	end
	running = true
	task.spawn(function()
		while #queue > 0 do
			local job = table.remove(queue, 1)
			job(App)
			task.wait(1.2)
		end
		running = false
	end)
end

function Announcer.achievement(App, id: string)
	local def = Achievements.ById[id]
	if not def then
		return
	end
	table.insert(queue, function()
		local card = Kit.panel({
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -20, 1, -20),
			Size = UDim2.fromOffset(360, 86),
			ZIndex = 97,
			Parent = App.overlay,
		}, { Kit.padding(12) }, "surface2")
		card.BackgroundTransparency = 0
		Kit.stroke("gold", 2, 0).Parent = card
		Kit.text({
			text = def.emoji,
			size = 42,
			align = Enum.TextXAlignment.Center,
			Size = UDim2.fromOffset(56, 62),
			Parent = card,
		})
		Kit.text({
			text = "ACHIEVEMENT UNLOCKED",
			style = "tiny",
			tone = "gold",
			font = "fontHeavy",
			Size = UDim2.new(1, -66, 0, 14),
			Position = UDim2.fromOffset(64, 2),
			Parent = card,
		})
		Kit.text({
			text = def.name,
			style = "h3",
			size = 18,
			Size = UDim2.new(1, -66, 0, 22),
			Position = UDim2.fromOffset(64, 18),
			Parent = card,
		})
		Kit.text({
			text = def.description .. (def.coins and def.coins > 0 and ("  +" .. def.coins .. " 🪙") or ""),
			style = "tiny",
			tone = "textDim",
			Size = UDim2.new(1, -66, 0, 28),
			Position = UDim2.fromOffset(64, 40),
			Parent = card,
		})
		Anim.slideIn(card, UDim2.fromOffset(420, 0), 0.5)
		Sound.play("achievement")
		task.delay(0.3, function()
			Fx.burst(card, {
				count = 18,
				glyphs = { "✦", "★" },
				colors = { Color3.fromRGB(255, 215, 0), Color3.new(1, 1, 1) },
				maxDistance = 140,
			})
		end)
		task.delay(4, function()
			Anim.tween(card, 0.4, { Position = UDim2.new(1, 420, 1, -20) })
			task.delay(0.45, function()
				card:Destroy()
			end)
		end)
	end)
	runQueue(App)
end

local BOARD_NAMES = {
	fastest_overall = "Fastest race ever",
	fewest_clicks = "Fewest clicks ever",
}

function Announcer.record(App, data)
	local record = data.record
	local boardName = BOARD_NAMES[data.board]
	if not boardName then
		local key = string.gsub(data.board, "^fastest_", "")
		boardName = "Fastest " .. Difficulty.get(key).name
	end
	local value = data.board == "fewest_clicks" and (record.clicks .. " clicks") or Format.time(record.ms / 1000)
	table.insert(queue, function()
		local banner = Kit.panel({
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 70),
			Size = UDim2.fromOffset(620, 64),
			ZIndex = 97,
			Parent = App.overlay,
		}, { Kit.padding(10) }, "surface2")
		banner.BackgroundTransparency = 0
		Kit.stroke("accent", 2, 0).Parent = banner
		Kit.text({
			text = ("🌍 NEW WORLD RECORD · %s: %s"):format(boardName, value),
			style = "h3",
			align = Enum.TextXAlignment.Center,
			Size = UDim2.new(1, 0, 0, 24),
			Parent = banner,
		})
		Kit.text({
			text = ("by %s · %s → %s"):format(record.name or "?", record.start or "?", record.target or "?"),
			style = "small",
			tone = "textDim",
			align = Enum.TextXAlignment.Center,
			Size = UDim2.new(1, 0, 0, 18),
			Position = UDim2.fromOffset(0, 26),
			Parent = banner,
		})
		Anim.slideIn(banner, UDim2.fromOffset(0, -120), 0.5)
		Sound.play("fanfare", { volume = 0.6 })
		task.delay(4.5, function()
			Anim.tween(banner, 0.4, { Position = UDim2.new(0.5, 0, 0, -120) })
			task.delay(0.45, function()
				banner:Destroy()
			end)
		end)
	end)
	runQueue(App)
end

return Announcer
