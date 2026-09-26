-- Lightweight 2D visual effects built from GuiObjects: bursts, confetti, rain, embers, screen
-- flashes, vignettes and camera blur. Particle counts are capped and halved on Reduced Motion.

local Lighting = game:GetService("Lighting")
local RunService = game:GetService("RunService")

local Anim = require(script.Parent.Anim)

local Fx = {}

local CONFETTI_COLORS = {
	Color3.fromRGB(239, 68, 68),
	Color3.fromRGB(250, 204, 21),
	Color3.fromRGB(34, 197, 94),
	Color3.fromRGB(59, 130, 246),
	Color3.fromRGB(168, 85, 247),
	Color3.fromRGB(236, 72, 153),
}

local function count(n: number): number
	return Anim.reduced and math.ceil(n * 0.35) or n
end

local function particle(parent: Instance, glyph: string?, color: Color3, size: number)
	local p
	if glyph then
		p = Instance.new("TextLabel")
		p.Text = glyph
		p.TextColor3 = color
		p.TextScaled = true
		p.Font = Enum.Font.GothamBold
		p.BackgroundTransparency = 1
	else
		p = Instance.new("Frame")
		p.BackgroundColor3 = color
		p.BorderSizePixel = 0
	end
	p.AnchorPoint = Vector2.new(0.5, 0.5)
	p.Size = UDim2.fromOffset(size, glyph and size or size * 0.6)
	p.ZIndex = 50
	p.Parent = parent
	return p
end

-- Radial burst from a point (scale coordinates inside parent).
function Fx.burst(parent: GuiObject, options)
	options = options or {}
	local origin = options.origin or UDim2.fromScale(0.5, 0.5)
	for _ = 1, count(options.count or 24) do
		local color = options.colors and options.colors[math.random(1, #options.colors)]
			or CONFETTI_COLORS[math.random(1, #CONFETTI_COLORS)]
		local glyph = options.glyphs and options.glyphs[math.random(1, #options.glyphs)] or nil
		local p = particle(parent, glyph, color, math.random(options.minSize or 8, options.maxSize or 16))
		p.Position = origin
		p.Rotation = math.random(0, 360)
		local angle = math.random() * math.pi * 2
		local distance = math.random(options.minDistance or 80, options.maxDistance or 260)
		local lifetime = (options.lifetime or 1.1) * (0.7 + math.random() * 0.6)
		local target = origin
			+ UDim2.fromOffset(math.cos(angle) * distance, math.sin(angle) * distance + (options.gravity or 60))
		Anim.tween(
			p,
			lifetime,
			{ Position = target, Rotation = p.Rotation + math.random(-360, 360) },
			Enum.EasingStyle.Quad
		)
		if p:IsA("TextLabel") then
			Anim.tween(p, lifetime, { TextTransparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
		else
			Anim.tween(p, lifetime, { BackgroundTransparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
		end
		task.delay(lifetime + 0.05, function()
			p:Destroy()
		end)
	end
end

-- Things falling from the top edge for `duration` seconds (confetti, emoji rain, coins…).
function Fx.rain(parent: GuiObject, options)
	options = options or {}
	local duration = options.duration or 3
	local rate = count(options.rate or 18)
	local stopped = false
	task.spawn(function()
		local started = os.clock()
		while not stopped and os.clock() - started < duration and parent.Parent do
			for _ = 1, math.max(1, math.floor(rate / 10)) do
				local color = options.colors and options.colors[math.random(1, #options.colors)]
					or CONFETTI_COLORS[math.random(1, #CONFETTI_COLORS)]
				local glyph = options.glyphs and options.glyphs[math.random(1, #options.glyphs)] or nil
				local size = math.random(options.minSize or 10, options.maxSize or 18)
				local p = particle(parent, glyph, color, size)
				local x = math.random()
				p.Position = UDim2.new(x, 0, 0, -30)
				p.Rotation = math.random(0, 360)
				local fall = (options.fallTime or 2.4) * (0.75 + math.random() * 0.5)
				Anim.tween(p, fall, {
					Position = UDim2.new(x + (math.random() - 0.5) * 0.15, 0, 1, 40),
					Rotation = p.Rotation + math.random(-540, 540),
				}, Enum.EasingStyle.Linear)
				task.delay(fall, function()
					p:Destroy()
				end)
			end
			task.wait(0.1)
		end
	end)
	return function()
		stopped = true
	end
end

-- Rising sparks/embers or drifting frost inside a region; returns stop().
function Fx.emitter(parent: GuiObject, options)
	local stopped = false
	task.spawn(function()
		while not stopped and parent.Parent do
			if parent.Visible ~= false then
				local color = options.colors[math.random(1, #options.colors)]
				local p =
					particle(parent, options.glyph, color, math.random(options.minSize or 4, options.maxSize or 9))
				local x = math.random()
				local rising = options.direction ~= "down"
				p.Position = UDim2.new(x, 0, rising and 1 or 0, 0)
				local life = (options.lifetime or 1.2) * (0.7 + math.random() * 0.6)
				local goal = {
					Position = UDim2.new(x + (math.random() - 0.5) * 0.2, 0, rising and -0.2 or 1.2, 0),
					Rotation = math.random(-180, 180),
				}
				if p:IsA("TextLabel") then
					goal.TextTransparency = 1
				else
					goal.BackgroundTransparency = 1
				end
				Anim.tween(p, life, goal, Enum.EasingStyle.Sine)
				task.delay(life, function()
					p:Destroy()
				end)
			end
			task.wait(1 / count(options.rate or 10))
		end
	end)
	return function()
		stopped = true
	end
end

-- Full-area color flash.
function Fx.flash(parent: GuiObject, color: Color3, seconds: number?, peak: number?)
	local flash = Instance.new("Frame")
	flash.Size = UDim2.fromScale(1, 1)
	flash.BackgroundColor3 = color
	flash.BackgroundTransparency = 1 - (peak or 0.6)
	flash.BorderSizePixel = 0
	flash.ZIndex = 60
	flash.Parent = parent
	Anim.tween(flash, seconds or 0.5, { BackgroundTransparency = 1 })
	task.delay((seconds or 0.5) + 0.05, function()
		flash:Destroy()
	end)
end

-- Soft glow around the screen edges. Returns an object with :set(color, intensity) and :destroy().
function Fx.vignette(parent: GuiObject)
	local holder = Instance.new("Frame")
	holder.Name = "Vignette"
	holder.Size = UDim2.fromScale(1, 1)
	holder.BackgroundTransparency = 1
	holder.ZIndex = 40
	holder.Parent = parent
	local edges = {}
	local specs = {
		{ UDim2.new(1, 0, 0.22, 0), UDim2.fromScale(0, 0), 90 },
		{ UDim2.new(1, 0, 0.22, 0), UDim2.fromScale(0, 0.78), -90 },
		{ UDim2.new(0.16, 0, 1, 0), UDim2.fromScale(0, 0), 0 },
		{ UDim2.new(0.16, 0, 1, 0), UDim2.fromScale(0.84, 0), 180 },
	}
	for _, spec in specs do
		local edge = Instance.new("Frame")
		edge.Size = spec[1]
		edge.Position = spec[2]
		edge.BorderSizePixel = 0
		edge.BackgroundColor3 = Color3.new(1, 0, 0)
		edge.BackgroundTransparency = 1
		edge.ZIndex = 40
		edge.Parent = holder
		local gradient = Instance.new("UIGradient")
		gradient.Rotation = spec[3]
		gradient.Transparency = NumberSequence.new(0, 1)
		gradient.Parent = edge
		table.insert(edges, edge)
	end
	return {
		frame = holder,
		set = function(_, color: Color3, intensity: number, seconds: number?)
			for _, edge in edges do
				Anim.tween(
					edge,
					seconds or 0.5,
					{ BackgroundColor3 = color, BackgroundTransparency = 1 - math.clamp(intensity, 0, 1) }
				)
			end
		end,
		destroy = function()
			holder:Destroy()
		end,
	}
end

-- Camera blur (client-only Lighting effect).
local blur = nil
function Fx.blur(size: number, seconds: number?)
	if not blur or not blur.Parent then
		blur = Instance.new("BlurEffect")
		blur.Name = "WikiRaceBlur"
		blur.Size = 0
		blur.Parent = Lighting
	end
	Anim.tween(blur, seconds or 0.4, { Size = size })
end

-- Cursor trail cosmetic: glyphs that follow the mouse over a parent. Returns stop().
function Fx.cursorTrail(parent: GuiObject, glyph: string, color: Color3)
	local UserInputService = game:GetService("UserInputService")
	if UserInputService.TouchEnabled and not UserInputService.MouseEnabled then
		return function() end
	end
	local last = Vector2.zero
	local connection = RunService.RenderStepped:Connect(function()
		local position = UserInputService:GetMouseLocation() - parent.AbsolutePosition
		if (position - last).Magnitude < 14 then
			return
		end
		last = position
		local p = particle(parent, glyph, color, math.random(8, 14))
		p.ZIndex = 200
		p.Position = UDim2.fromOffset(position.X, position.Y)
		Anim.tween(
			p,
			0.6,
			{ TextTransparency = 1, Position = p.Position + UDim2.fromOffset(0, 18), Rotation = math.random(-90, 90) }
		)
		task.delay(0.65, function()
			p:Destroy()
		end)
	end)
	return function()
		connection:Disconnect()
	end
end

Fx.ConfettiColors = CONFETTI_COLORS

return Fx
