-- Component kit. Small, themed building blocks shared by every screen.

local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Catalog = require(Shared.Catalog)
local Theme = require(script.Parent.Theme)
local Anim = require(script.Parent.Anim)
local Sound = require(script.Parent.Parent.Core.Sound)

local Kit = {}

local TEXT_SIZES = {
	display = 54,
	title = 34,
	h1 = 28,
	h2 = 21,
	h3 = 18,
	body = 16,
	small = 14,
	tiny = 12,
}

function Kit.make(className: string, props, children)
	local instance = Instance.new(className)
	local parent = nil
	for key, value in props or {} do
		if key == "Parent" then
			parent = value
		elseif key == "Theme" then
			Theme.bind(instance, value)
		else
			(instance :: any)[key] = value
		end
	end
	for _, child in children or {} do
		child.Parent = instance
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

function Kit.corner(radius: number?)
	local corner = Instance.new("UICorner")
	if radius then
		corner.CornerRadius = UDim.new(0, radius)
	else
		Theme.bind(corner, {
			CornerRadius = function(t)
				return UDim.new(0, t.corner)
			end,
		})
	end
	return corner
end

function Kit.round()
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(1, 0)
	return corner
end

function Kit.stroke(token: any, thickness: number?, transparency: number?)
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Transparency = transparency or 0
	stroke.Thickness = thickness or 1
	if typeof(token) == "Color3" then
		stroke.Color = token
	else
		Theme.bind(stroke, { Color = token or "border" })
	end
	return stroke
end

function Kit.padding(top: number, right: number?, bottom: number?, left: number?)
	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0, top)
	padding.PaddingRight = UDim.new(0, right or top)
	padding.PaddingBottom = UDim.new(0, bottom or top)
	padding.PaddingLeft = UDim.new(0, left or right or top)
	return padding
end

function Kit.list(direction: string?, padding: number?, hAlign: string?, vAlign: string?)
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = direction == "x" and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical
	layout.Padding = UDim.new(0, padding or 8)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.HorizontalAlignment = Enum.HorizontalAlignment[hAlign or "Left"]
	layout.VerticalAlignment = Enum.VerticalAlignment[vAlign or "Top"]
	return layout
end

function Kit.grid(cell: UDim2, padding: number?)
	local layout = Instance.new("UIGridLayout")
	layout.CellSize = cell
	layout.CellPadding = UDim2.fromOffset(padding or 10, padding or 10)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	return layout
end

function Kit.frame(props, children)
	props = props or {}
	if props.BackgroundTransparency == nil then
		props.BackgroundTransparency = 1
	end
	if props.BorderSizePixel == nil then
		props.BorderSizePixel = 0
	end
	return Kit.make("Frame", props, children)
end

-- A themed surface panel with rounded corners and a hairline border.
function Kit.panel(props, children, surfaceToken: string?)
	props = props or {}
	props.BorderSizePixel = 0
	local themeMap = props.Theme or {}
	themeMap.BackgroundColor3 = themeMap.BackgroundColor3 or surfaceToken or "surface"
	if themeMap.BackgroundTransparency == nil and props.BackgroundTransparency == nil then
		themeMap.BackgroundTransparency = "surfaceTransparency"
	end
	props.Theme = themeMap
	local panel = Kit.make("Frame", props, children)
	Kit.corner().Parent = panel
	local stroke = Kit.stroke("border", nil, 0.35)
	Theme.bind(stroke, {
		Thickness = "strokeThickness",
	})
	stroke.Parent = panel
	return panel
end

-- Text label. style: display/title/h1/h2/h3/body/small/tiny. tone: text/textDim/textFaint/accent…
function Kit.text(props)
	local style = props.style or "body"
	local tone = props.tone or "text"
	local fontToken = props.font
		or (style == "display" and "fontDisplay")
		or ((style == "title" or style == "h1") and "fontHeavy")
		or ((style == "h2" or style == "h3") and "fontBold")
		or "font"
	local label = Kit.make("TextLabel", {
		Name = props.Name or "Text",
		BackgroundTransparency = 1,
		Text = props.text or "",
		TextSize = props.size or TEXT_SIZES[style] or 16,
		TextXAlignment = props.align or Enum.TextXAlignment.Left,
		TextYAlignment = props.valign or Enum.TextYAlignment.Center,
		TextWrapped = props.wrap ~= false,
		TextTruncate = props.truncate and Enum.TextTruncate.AtEnd or Enum.TextTruncate.None,
		RichText = props.rich == true,
		Size = props.Size or UDim2.new(1, 0, 0, (props.size or TEXT_SIZES[style] or 16) + 6),
		AutomaticSize = props.auto or Enum.AutomaticSize.None,
		Position = props.Position,
		AnchorPoint = props.AnchorPoint,
		LayoutOrder = props.order or 0,
		ZIndex = props.ZIndex or 1,
		Parent = props.Parent,
		Theme = { TextColor3 = tone, Font = fontToken },
	})
	if typeof(props.color) == "Color3" then
		Theme.unbind(label, "TextColor3")
		label.TextColor3 = props.color
	end
	return label
end

local VARIANTS = {
	primary = { bg = "accent", text = "accentText", strokeT = 1 },
	secondary = { bg = "surface2", text = "text", strokeT = 0.2 },
	ghost = { bg = "surface", text = "textDim", strokeT = 0.6, bgT = 1 },
	danger = {
		bg = "danger",
		text = function()
			return Color3.new(1, 1, 1)
		end,
		strokeT = 1,
	},
	success = {
		bg = "success",
		text = function()
			return Color3.new(1, 1, 1)
		end,
		strokeT = 1,
	},
	gold = {
		bg = "gold",
		text = function()
			return Color3.fromRGB(40, 28, 0)
		end,
		strokeT = 1,
	},
}

-- Button with hover/press feedback and click sound.
-- props: text, emoji, variant, Size, textSize, onClick, sound, order, Position, AnchorPoint
function Kit.button(props)
	local variant = VARIANTS[props.variant or "secondary"]
	local text = props.text or ""
	if props.emoji then
		text = props.emoji .. (text ~= "" and "  " .. text or "")
	end
	local button = Kit.make("TextButton", {
		Name = props.Name or "Button",
		AutoButtonColor = false,
		Text = text,
		TextSize = props.textSize or 16,
		Size = props.Size or UDim2.fromOffset(160, 44),
		Position = props.Position,
		AnchorPoint = props.AnchorPoint,
		LayoutOrder = props.order or 0,
		BorderSizePixel = 0,
		ZIndex = props.ZIndex or 1,
		TextWrapped = true,
		Parent = props.Parent,
		Theme = {
			BackgroundColor3 = variant.bg,
			TextColor3 = variant.text,
			Font = props.font or "fontBold",
		},
	})
	if variant.bgT then
		button.BackgroundTransparency = variant.bgT
	end
	button:SetAttribute("BaseTransparency", variant.bgT or 0)
	Kit.corner().Parent = button
	local stroke = Kit.stroke("border", 1, variant.strokeT)
	stroke.Parent = button
	local scale = Anim.scaleOf(button)
	local hovering = false
	button.MouseEnter:Connect(function()
		if button:GetAttribute("Disabled") then
			return
		end
		hovering = true
		Anim.tween(scale, 0.18, { Scale = 1.035 })
		Anim.tween(stroke, 0.18, { Transparency = math.max(0, variant.strokeT - 0.5) })
	end)
	button.MouseLeave:Connect(function()
		hovering = false
		Anim.tween(scale, 0.2, { Scale = 1 })
		Anim.tween(stroke, 0.2, { Transparency = variant.strokeT })
	end)
	button.MouseButton1Down:Connect(function()
		if not button:GetAttribute("Disabled") then
			Anim.tween(scale, 0.08, { Scale = 0.95 })
		end
	end)
	button.MouseButton1Up:Connect(function()
		Anim.tween(scale, 0.25, { Scale = hovering and 1.035 or 1 }, Enum.EasingStyle.Back)
	end)
	button.Activated:Connect(function()
		if button:GetAttribute("Disabled") or button:GetAttribute("Busy") then
			Sound.play("error", { volume = 0.5 })
			return
		end
		if props.sound ~= false then
			Sound.play(props.sound or "click")
		end
		if props.onClick then
			props.onClick(button)
		end
	end)
	return button
end

function Kit.setDisabled(button: GuiButton, disabled: boolean)
	button:SetAttribute("Disabled", disabled)
	TweenService:Create(button, TweenInfo.new(0.2), {
		BackgroundTransparency = disabled and 0.55 or (button:GetAttribute("BaseTransparency") or 0),
		TextTransparency = disabled and 0.45 or 0,
	}):Play()
end

-- Shows a busy state on a button while an async action runs.
function Kit.busy(button: TextButton, busy: boolean, busyText: string?)
	if busy then
		button:SetAttribute("Busy", true)
		button:SetAttribute("IdleText", button.Text)
		button.Text = busyText or "…"
	else
		button:SetAttribute("Busy", false)
		local idle = button:GetAttribute("IdleText")
		if idle then
			button.Text = idle
		end
	end
end

function Kit.iconButton(emoji: string, onClick, props)
	props = props or {}
	props.text = emoji
	props.textSize = props.textSize or 20
	props.Size = props.Size or UDim2.fromOffset(42, 42)
	props.onClick = onClick
	props.variant = props.variant or "secondary"
	props.font = "font"
	return Kit.button(props)
end

function Kit.chip(text: string, color: Color3?, props)
	props = props or {}
	local chip = Kit.make("TextLabel", {
		Name = "Chip",
		Text = text,
		TextSize = props.textSize or 13,
		Size = UDim2.fromOffset(0, props.height or 24),
		AutomaticSize = Enum.AutomaticSize.X,
		LayoutOrder = props.order or 0,
		BorderSizePixel = 0,
		BackgroundColor3 = color or Color3.fromRGB(100, 116, 139),
		BackgroundTransparency = props.transparency or 0.15,
		TextColor3 = props.textColor or Color3.new(1, 1, 1),
		Position = props.Position,
		AnchorPoint = props.AnchorPoint,
		Parent = props.Parent,
		Theme = { Font = "fontBold" },
	})
	if not color then
		Theme.bind(chip, { BackgroundColor3 = "surface3", TextColor3 = "text" })
	end
	Kit.round().Parent = chip
	Kit.padding(0, 10, 0, 10).Parent = chip
	return chip
end

-- Circular avatar headshot with an optional cosmetic frame ring.
function Kit.avatar(userId: number, size: number, look, props)
	props = props or {}
	local holder = Kit.frame({
		Name = "Avatar",
		Size = UDim2.fromOffset(size, size),
		LayoutOrder = props.order or 0,
		Position = props.Position,
		AnchorPoint = props.AnchorPoint,
		Parent = props.Parent,
	})
	local image = Kit.make("ImageLabel", {
		Name = "Image",
		Size = UDim2.fromScale(1, 1),
		BorderSizePixel = 0,
		Image = ("rbxthumb://type=AvatarHeadShot&id=%d&w=150&h=150"):format(math.max(1, userId)),
		ScaleType = Enum.ScaleType.Crop,
		Parent = holder,
		Theme = { BackgroundColor3 = "surface3" },
	}, { Kit.round() })
	Kit.applyFrame(image, look and look.frame or "frame_none", math.max(2, size / 22))
	return holder
end

-- Applies a profile-frame cosmetic (UIStroke + gradient) to a round image.
function Kit.applyFrame(image: GuiObject, frameId: string, thickness: number)
	local old = image:FindFirstChild("FrameStroke")
	if old then
		old:Destroy()
	end
	local item = Catalog.ById[frameId]
	if not item or frameId == "frame_none" then
		return
	end
	local stroke = Instance.new("UIStroke")
	stroke.Name = "FrameStroke"
	stroke.Thickness = thickness
	stroke.Color = Color3.new(1, 1, 1)
	stroke.Parent = image
	local gradient = Instance.new("UIGradient")
	if item.rainbow then
		gradient.Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 0, 0)),
			ColorSequenceKeypoint.new(0.2, Color3.fromRGB(255, 200, 0)),
			ColorSequenceKeypoint.new(0.4, Color3.fromRGB(0, 255, 100)),
			ColorSequenceKeypoint.new(0.6, Color3.fromRGB(0, 180, 255)),
			ColorSequenceKeypoint.new(0.8, Color3.fromRGB(170, 0, 255)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 0, 0)),
		})
	elseif item.colors then
		gradient.Color = ColorSequence.new(item.colors[1], item.colors[2])
	end
	gradient.Parent = stroke
	if item.animated then
		Anim.spin(gradient, 90)
	end
end

-- Displays a name with badge glyph + optional title underneath.
function Kit.nameBlock(displayName: string, look, props)
	props = props or {}
	local holder = Kit.frame({
		Name = "NameBlock",
		Size = props.Size or UDim2.new(1, 0, 0, 40),
		LayoutOrder = props.order or 0,
		Parent = props.Parent,
	}, { Kit.list("y", 0, props.hAlign, "Center") })
	local badge = look and look.badge and (" " .. look.badge) or ""
	local nameLabel = Kit.text({
		text = displayName .. badge,
		style = props.style or "h3",
		size = props.nameSize,
		truncate = true,
		wrap = false,
		align = props.align,
		Parent = holder,
		order = 1,
	})
	if look and look.vip then
		Theme.bind(nameLabel, { TextColor3 = "gold" })
	end
	if look and look.title then
		Kit.text({
			text = look.title,
			style = "tiny",
			tone = "accent",
			truncate = true,
			wrap = false,
			align = props.align,
			Parent = holder,
			order = 2,
			Size = UDim2.new(1, 0, 0, 14),
		})
	end
	return holder
end

function Kit.input(props)
	local box = Kit.make("TextBox", {
		Name = props.Name or "Input",
		Text = props.text or "",
		PlaceholderText = props.placeholder or "",
		ClearTextOnFocus = false,
		TextSize = props.textSize or 16,
		TextXAlignment = props.align or Enum.TextXAlignment.Left,
		Size = props.Size or UDim2.new(1, 0, 0, 42),
		Position = props.Position,
		LayoutOrder = props.order or 0,
		BorderSizePixel = 0,
		Parent = props.Parent,
		Theme = {
			BackgroundColor3 = "surface2",
			TextColor3 = "text",
			PlaceholderColor3 = "textFaint",
			Font = props.font or "font",
		},
	})
	Kit.corner().Parent = box
	local stroke = Kit.stroke("border", 1, 0.3)
	stroke.Parent = box
	Kit.padding(0, 12, 0, 12).Parent = box
	box.Focused:Connect(function()
		Theme.bind(stroke, { Color = "accent" })
		stroke.Transparency = 0
	end)
	box.FocusLost:Connect(function(enter)
		Theme.bind(stroke, { Color = "border" })
		stroke.Transparency = 0.3
		if props.onSubmit and enter then
			props.onSubmit(box.Text)
		end
	end)
	if props.onChange then
		box:GetPropertyChangedSignal("Text"):Connect(function()
			props.onChange(box.Text)
		end)
	end
	return box
end

function Kit.scroll(props, children)
	props = props or {}
	local scroll = Kit.make("ScrollingFrame", {
		Name = props.Name or "Scroll",
		Size = props.Size or UDim2.fromScale(1, 1),
		Position = props.Position,
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = props.bar or 6,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = props.axis == "x" and Enum.AutomaticSize.X or Enum.AutomaticSize.Y,
		ScrollingDirection = props.axis == "x" and Enum.ScrollingDirection.X or Enum.ScrollingDirection.Y,
		LayoutOrder = props.order or 0,
		Parent = props.Parent,
		Theme = { ScrollBarImageColor3 = "textFaint" },
	}, children)
	return scroll
end

function Kit.divider(order: number?)
	return Kit.make("Frame", {
		Name = "Divider",
		Size = UDim2.new(1, 0, 0, 1),
		BorderSizePixel = 0,
		BackgroundTransparency = 0.3,
		LayoutOrder = order or 0,
		Theme = { BackgroundColor3 = "border" },
	})
end

function Kit.spinner(size: number, parent: Instance?)
	local ring = Kit.make("Frame", {
		Name = "Spinner",
		Size = UDim2.fromOffset(size, size),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	local stroke = Kit.stroke("accent", math.max(2, size / 10), 0)
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Parent = ring
	Kit.round().Parent = ring
	local gradient = Instance.new("UIGradient")
	gradient.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0),
		NumberSequenceKeypoint.new(0.7, 0.9),
		NumberSequenceKeypoint.new(1, 1),
	})
	gradient.Parent = stroke
	Anim.spin(gradient, 360)
	return ring
end

-- Toggle switch. Returns { frame, set(value), get(), setEnabled(bool) }.
function Kit.toggle(initial: boolean, onChange, props)
	props = props or {}
	local value = initial
	local enabled = true
	local track = Kit.make("TextButton", {
		Name = "Toggle",
		Text = "",
		AutoButtonColor = false,
		Size = UDim2.fromOffset(52, 28),
		BorderSizePixel = 0,
		LayoutOrder = props.order or 0,
		Parent = props.Parent,
	}, { Kit.round() })
	local knob = Kit.make("Frame", {
		Size = UDim2.fromOffset(22, 22),
		AnchorPoint = Vector2.new(0, 0.5),
		BackgroundColor3 = Color3.new(1, 1, 1),
		BorderSizePixel = 0,
		Parent = track,
	}, { Kit.round() })
	local function render(animate)
		local goal = { Position = value and UDim2.new(1, -25, 0.5, 0) or UDim2.new(0, 3, 0.5, 0) }
		Theme.bind(track, { BackgroundColor3 = value and "success" or "surface3" })
		if animate then
			Anim.tween(knob, 0.2, goal, Enum.EasingStyle.Back)
		else
			knob.Position = goal.Position
		end
		track.BackgroundTransparency = enabled and 0 or 0.5
	end
	render(false)
	track.Activated:Connect(function()
		if not enabled then
			Sound.play("error", { volume = 0.4 })
			return
		end
		value = not value
		Sound.play("click", { pitch = value and 1.2 or 0.9 })
		render(true)
		if onChange then
			onChange(value)
		end
	end)
	return {
		frame = track,
		set = function(v)
			value = v
			render(true)
		end,
		get = function()
			return value
		end,
		setEnabled = function(v)
			enabled = v
			render(false)
		end,
	}
end

-- Segmented control. options: { { value = x, label = "…" } }.
-- Returns { frame, set(value), setEnabled(bool), get() }.
function Kit.segmented(options, initial, onChange, props)
	props = props or {}
	local value = initial
	local enabled = true
	local frame = Kit.make("Frame", {
		Name = "Segmented",
		Size = props.Size or UDim2.new(1, 0, 0, 38),
		LayoutOrder = props.order or 0,
		BorderSizePixel = 0,
		Parent = props.Parent,
		Theme = { BackgroundColor3 = "surface2" },
	}, { Kit.corner(), Kit.padding(3), Kit.list("x", 3, "Left", "Center") })
	local buttons = {}
	local function render()
		for _, entry in buttons do
			local selected = entry.value == value
			Theme.bind(entry.button, {
				BackgroundColor3 = selected and "accent" or "surface2",
				TextColor3 = selected and "accentText" or "textDim",
			})
			entry.button.BackgroundTransparency = selected and 0 or 1
			entry.button.TextTransparency = enabled and 0 or 0.4
		end
	end
	for index, option in options do
		local button = Kit.make("TextButton", {
			Name = tostring(option.value),
			Text = option.label,
			AutoButtonColor = false,
			TextSize = props.textSize or 14,
			Size = UDim2.new(1 / #options, -3, 1, 0),
			BorderSizePixel = 0,
			LayoutOrder = index,
			TextWrapped = true,
			Parent = frame,
			Theme = { Font = "fontBold" },
		}, { Kit.corner() })
		table.insert(buttons, { value = option.value, button = button })
		button.Activated:Connect(function()
			if not enabled then
				Sound.play("error", { volume = 0.4 })
				return
			end
			if value == option.value then
				return
			end
			value = option.value
			Sound.play("click")
			render()
			if onChange then
				onChange(value)
			end
		end)
	end
	render()
	return {
		frame = frame,
		set = function(v)
			value = v
			render()
		end,
		get = function()
			return value
		end,
		setEnabled = function(v)
			enabled = v
			render()
		end,
	}
end

-- Horizontal progress bar. Returns { frame, set(alpha, animate), fill }.
function Kit.progress(props)
	props = props or {}
	local frame = Kit.make("Frame", {
		Name = "Progress",
		Size = props.Size or UDim2.new(1, 0, 0, 10),
		BorderSizePixel = 0,
		LayoutOrder = props.order or 0,
		Position = props.Position,
		Parent = props.Parent,
		Theme = { BackgroundColor3 = "surface3" },
	}, { Kit.round() })
	local fill = Kit.make("Frame", {
		Name = "Fill",
		Size = UDim2.fromScale(0, 1),
		BorderSizePixel = 0,
		Parent = frame,
		Theme = { BackgroundColor3 = props.token or "accent" },
	}, { Kit.round() })
	return {
		frame = frame,
		fill = fill,
		set = function(alpha, animate)
			local goal = { Size = UDim2.fromScale(math.clamp(alpha, 0, 1), 1) }
			if animate then
				Anim.tween(fill, 0.6, goal)
			else
				fill.Size = goal.Size
			end
		end,
	}
end

-- Makes any GuiObject clickable with hover lift, without adding children (so it is safe inside
-- UIListLayout / UIGridLayout containers). Inner buttons still take priority.
function Kit.hoverable(guiObject: GuiObject, onClick)
	local scale = Anim.scaleOf(guiObject)
	local pressed = false
	guiObject.Active = true
	guiObject.MouseEnter:Connect(function()
		Anim.tween(scale, 0.18, { Scale = 1.02 })
	end)
	guiObject.MouseLeave:Connect(function()
		pressed = false
		Anim.tween(scale, 0.2, { Scale = 1 })
	end)
	guiObject.InputBegan:Connect(function(input)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			pressed = true
			Anim.tween(scale, 0.08, { Scale = 0.97 })
		end
	end)
	guiObject.InputEnded:Connect(function(input)
		if
			pressed
			and (
				input.UserInputType == Enum.UserInputType.MouseButton1
				or input.UserInputType == Enum.UserInputType.Touch
			)
		then
			pressed = false
			Anim.tween(scale, 0.2, { Scale = 1 }, Enum.EasingStyle.Back)
			Sound.play("click")
			onClick()
		end
	end)
	return guiObject
end

return Kit
