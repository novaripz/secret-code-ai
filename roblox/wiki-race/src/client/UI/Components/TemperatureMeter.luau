-- Hot/cold meter: Freezing → Cold → Warm → Hot → Burning → Completed.
-- Every transition animates color, glow, pulse speed, particles and sound. Burning escalates:
-- fast heartbeat pulse, embers, shake and a hook for the race screen's edge glow.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Temperature = require(Shared.Temperature)
local Catalog = require(Shared.Catalog)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local Sound = require(UI.Parent.Core.Sound)

local TemperatureMeter = {}
TemperatureMeter.__index = TemperatureMeter

local LEVELS = { "Freezing", "Cold", "Warm", "Hot", "Burning" }

-- onState(state, info) is called after every transition (used for screen-edge glow).
function TemperatureMeter.new(parent: GuiObject, props)
	props = props or {}
	local self =
		setmetatable({ state = nil, onState = props.onState, effect = "meter_classic", stops = {} }, TemperatureMeter)

	local root = Kit.panel({
		Name = "TemperatureMeter",
		Size = props.Size or UDim2.fromOffset(330, 60),
		Position = props.Position,
		AnchorPoint = props.AnchorPoint,
		LayoutOrder = props.order or 0,
		ClipsDescendants = false,
		Parent = parent,
	})
	self.frame = root
	self.scale = Anim.scaleOf(root)
	self.glow = Kit.stroke(Color3.new(1, 1, 1), 2, 0.4)
	self.glow.Name = "Glow"
	self.glow.Parent = root

	self.particles = Kit.frame({
		Name = "Particles",
		Size = UDim2.fromScale(1, 1),
		ClipsDescendants = true,
		ZIndex = 3,
		Parent = root,
	})

	self.label = Kit.text({
		text = "🧊 FREEZING",
		style = "h2",
		font = "fontHeavy",
		size = 19,
		Size = UDim2.new(0.5, -8, 0, 24),
		Position = UDim2.fromOffset(12, 7),
		Parent = root,
		ZIndex = 4,
	})
	self.blurb = Kit.text({
		text = "",
		style = "tiny",
		tone = "textDim",
		truncate = true,
		wrap = false,
		Size = UDim2.new(1, -24, 0, 14),
		Position = UDim2.fromOffset(12, 38),
		Parent = root,
		ZIndex = 4,
	})

	local track = Kit.frame({
		Name = "Track",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 12),
		Size = UDim2.new(0.5, -8, 0, 16),
		Parent = root,
		ZIndex = 4,
	}, { Kit.list("x", 4, "Left", "Center") })
	self.segments = {}
	for index, key in LEVELS do
		local info = Temperature.Info[key]
		local segment = Kit.make("Frame", {
			Name = key,
			Size = UDim2.new(0.2, -4, 1, 0),
			BackgroundColor3 = info.color,
			BackgroundTransparency = 0.8,
			BorderSizePixel = 0,
			LayoutOrder = index,
			ZIndex = 4,
			Parent = track,
		}, { Kit.round() })
		self.segments[key] = segment
	end

	self:set("Freezing", false)
	return self
end

function TemperatureMeter:setEffect(itemId: string?)
	self.effect = itemId or "meter_classic"
	if self.state then
		local state = self.state
		self.state = nil
		self:set(state, false)
	end
end

function TemperatureMeter:_stopLoops()
	for _, stop in self.stops do
		stop()
	end
	table.clear(self.stops)
	self.scale.Scale = 1
end

function TemperatureMeter:set(state: string, animate: boolean?)
	if not Temperature.isValid(state) or state == self.state then
		return
	end
	local previous = self.state
	self.state = state
	local info = Temperature.Info[state]
	local level = info.level
	local previousLevel = previous and Temperature.level(previous) or level
	local cosmetic = Catalog.ById[self.effect]
	animate = animate ~= false

	self.label.Text = info.emoji .. " " .. string.upper(info.label)
	self.blurb.Text = info.blurb
	Anim.tween(self.label, animate and 0.4 or 0, { TextColor3 = info.color })
	Anim.tween(self.glow, animate and 0.4 or 0, { Color = info.color, Thickness = 1.5 + info.intensity * 3 })
	for key, segment in self.segments do
		local on = Temperature.level(key) <= math.min(level, 5)
		Anim.tween(
			segment,
			animate and 0.35 or 0,
			{ BackgroundTransparency = on and 0 or 0.8, Size = UDim2.new(0.2, -4, on and 1 or 0.7, 0) }
		)
	end

	self:_stopLoops()
	table.insert(self.stops, Anim.pulse(self.glow, "Transparency", 0.1, 0.1 + (1 - info.intensity) * 0.7, info.pulse))
	if state == "Burning" then
		table.insert(self.stops, Anim.pulse(self.scale, "Scale", 1, 1.045, info.pulse))
		table.insert(self.stops, Sound.loop("heartbeat", { volume = 0.8 }))
	end

	-- Particles per state, flavored by the equipped meter cosmetic.
	local glyph = cosmetic and cosmetic.particle or nil
	if state == "Freezing" or state == "Cold" then
		table.insert(
			self.stops,
			Fx.emitter(self.particles, {
				glyph = glyph or "❄",
				colors = { info.glow, Color3.new(1, 1, 1) },
				direction = "down",
				rate = state == "Freezing" and 3 or 5,
				lifetime = 2.4,
				minSize = 8,
				maxSize = 12,
			})
		)
	elseif state == "Hot" then
		table.insert(
			self.stops,
			Fx.emitter(self.particles, {
				glyph = glyph,
				colors = { info.color, info.glow },
				rate = 10,
				lifetime = 1.2,
			})
		)
	elseif state == "Burning" then
		table.insert(
			self.stops,
			Fx.emitter(self.particles, {
				glyph = glyph,
				colors = { info.color, info.glow, Color3.fromRGB(255, 240, 150) },
				rate = 26,
				lifetime = 0.9,
				minSize = 5,
				maxSize = 11,
			})
		)
	end

	if animate and previous then
		if level > previousLevel then
			Sound.play(
				state == "Burning" and "burning" or (state == "Completed" and "complete" or "tempUp"),
				{ pitch = 0.9 + level * 0.08 }
			)
			Anim.pop(self.frame, state == "Burning" and 1.22 or 1.1)
			Fx.flash(self.frame, info.glow, 0.45, state == "Burning" and 0.9 or 0.5)
			if state == "Burning" then
				Anim.shake(self.frame, 6, 0.6)
				Fx.burst(self.frame, {
					count = 22,
					colors = { info.color, info.glow },
					glyphs = { "🔥", "✦" },
					minDistance = 30,
					maxDistance = 120,
					gravity = -20,
				})
			elseif state == "Completed" then
				Fx.burst(self.frame, { count = 30, minDistance = 40, maxDistance = 180 })
			end
		elseif level < previousLevel then
			Sound.play(level <= 2 and "freeze" or "tempDown", { pitch = 0.8 + level * 0.05 })
			Anim.pop(self.frame, 0.94)
		end
	end
	if self.onState then
		self.onState(state, info)
	end
end

function TemperatureMeter:destroy()
	self:_stopLoops()
	self.frame:Destroy()
end

-- Small chip used in player lists.
function TemperatureMeter.chip(state: string?, parent: Instance?, order: number?)
	local info = state and Temperature.Info[state]
	local chip = Kit.chip(
		info and (info.emoji .. " " .. info.label) or "❔ Hidden",
		info and info.color or nil,
		{ Parent = parent, order = order, height = 20, textSize = 11 }
	)
	return chip
end

return TemperatureMeter
