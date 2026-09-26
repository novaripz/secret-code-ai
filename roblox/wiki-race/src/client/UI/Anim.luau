-- Animation helpers. All durations shrink when the player enables Reduced Motion.

local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local Anim = {}
Anim.reduced = false

local function scaled(seconds: number): number
	return Anim.reduced and seconds * 0.35 or seconds
end

function Anim.tween(
	instance: Instance,
	seconds: number,
	goals,
	style: Enum.EasingStyle?,
	direction: Enum.EasingDirection?,
	delayTime: number?
)
	local tween = TweenService:Create(
		instance,
		TweenInfo.new(
			scaled(seconds),
			style or Enum.EasingStyle.Quint,
			direction or Enum.EasingDirection.Out,
			0,
			false,
			delayTime or 0
		),
		goals
	)
	tween:Play()
	return tween
end

-- Ensures a GuiObject has a UIScale child and returns it.
function Anim.scaleOf(guiObject: GuiObject): UIScale
	local existing = guiObject:FindFirstChild("AnimScale")
	if existing then
		return existing :: UIScale
	end
	local scale = Instance.new("UIScale")
	scale.Name = "AnimScale"
	scale.Parent = guiObject
	return scale
end

function Anim.pop(guiObject: GuiObject, amount: number?)
	local scale = Anim.scaleOf(guiObject)
	scale.Scale = amount or 1.12
	Anim.tween(scale, 0.35, { Scale = 1 }, Enum.EasingStyle.Back)
end

function Anim.punchIn(guiObject: GuiObject, from: number?)
	local scale = Anim.scaleOf(guiObject)
	scale.Scale = from or 0.6
	return Anim.tween(scale, 0.45, { Scale = 1 }, Enum.EasingStyle.Back)
end

function Anim.fadeText(label: TextLabel, visible: boolean, seconds: number?)
	return Anim.tween(label, seconds or 0.25, { TextTransparency = visible and 0 or 1 })
end

-- Slides a GuiObject in from an offset relative to its current position.
function Anim.slideIn(guiObject: GuiObject, fromOffset: UDim2, seconds: number?, delayTime: number?)
	local target = guiObject.Position
	guiObject.Position = target + fromOffset
	return Anim.tween(
		guiObject,
		seconds or 0.45,
		{ Position = target },
		Enum.EasingStyle.Quint,
		Enum.EasingDirection.Out,
		delayTime
	)
end

-- Animated number counter on a TextLabel.
function Anim.countTo(label: TextLabel, from: number, to: number, seconds: number, format)
	format = format or function(n)
		return tostring(math.floor(n + 0.5))
	end
	local duration = scaled(seconds)
	local started = os.clock()
	local token = {}
	label:SetAttribute("CountToken", tostring(token))
	local connection
	connection = RunService.RenderStepped:Connect(function()
		if label:GetAttribute("CountToken") ~= tostring(token) or not label.Parent then
			connection:Disconnect()
			return
		end
		local alpha = math.clamp((os.clock() - started) / duration, 0, 1)
		local eased = 1 - (1 - alpha) ^ 3
		label.Text = format(from + (to - from) * eased)
		if alpha >= 1 then
			connection:Disconnect()
		end
	end)
end

-- Shakes a GuiObject around its current position.
function Anim.shake(guiObject: GuiObject, intensity: number, seconds: number)
	if Anim.reduced then
		return
	end
	local origin = guiObject.Position
	local started = os.clock()
	local connection
	connection = RunService.RenderStepped:Connect(function()
		local elapsed = os.clock() - started
		if elapsed >= seconds or not guiObject.Parent then
			guiObject.Position = origin
			connection:Disconnect()
			return
		end
		local falloff = 1 - elapsed / seconds
		guiObject.Position = origin
			+ UDim2.fromOffset(
				(math.random() - 0.5) * 2 * intensity * falloff,
				(math.random() - 0.5) * 2 * intensity * falloff
			)
	end)
end

-- Repeating pulse; returns a stop function.
function Anim.pulse(instance: Instance, property: string, low, high, period: number)
	local info = TweenInfo.new(period / 2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true);
	(instance :: any)[property] = low
	local tween = TweenService:Create(instance, info, { [property] = high })
	tween:Play()
	return function()
		tween:Cancel()
	end
end

-- Continuous rotation for UIGradients (animated frames/themes). Returns a stop function.
function Anim.spin(instance: Instance, degreesPerSecond: number)
	local connection = RunService.RenderStepped:Connect(function(dt)
		if not instance.Parent then
			return
		end
		(instance :: any).Rotation = ((instance :: any).Rotation + degreesPerSecond * dt) % 360
	end)
	instance.Destroying:Connect(function()
		connection:Disconnect()
	end)
	return function()
		connection:Disconnect()
	end
end

return Anim
