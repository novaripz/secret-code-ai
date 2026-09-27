-- A goofy, deterministic "meme card" picture for any page: layered emoji on a category-colored
-- burst, wobbly googly eyes and a classic white-with-black-outline meme caption. Used where a
-- page has no uploaded photo (and as the "funny" side of the photo toggle). 100% kid-safe:
-- it only ever draws emoji, shapes and text from a fixed list.

local TweenService = game:GetService("TweenService")
local Shared = game:GetService("ReplicatedStorage"):WaitForChild("WikiRaceShared")
local Categories = require(Shared.Categories)

local FunnyCard = {}

local CAPTIONS = {
	"10/10 WOULD CLICK AGAIN",
	"CERTIFIED CLASSIC",
	"+1000 AURA",
	"NO THOUGHTS JUST WIKI",
	"ABSOLUTE UNIT",
	"BIG BRAIN TIME",
	"IT'S GIVING ENCYCLOPEDIA",
	"LOW-KEY ICONIC",
	"SPEEDRUN THIS",
	"MAIN CHARACTER",
	"BUSSIN FR",
	"NO CAP",
	"STONKS",
	"HOLD UP",
	"VIBE CHECK: PASSED",
	"CHEF'S KISS",
	"THIS IS FINE",
	"TOUCH GRASS? NO, READ",
	"THE LORE GOES DEEP",
	"CERTIFIED BRAINROT-FREE",
	"SUCH WOW",
	"BUILT DIFFERENT",
	"W PAGE",
	"UNSPOKEN RIZZ",
}
local HATS = { "🎩", "👑", "🧢", "🎓", "🥳", "🤠", "⛑️", "🎀" }
local BITS = { "✨", "⭐", "💫", "🔥", "💥", "🌈", "🎉", "💯" }

local function hash(text: string): number
	local h = 2166136261
	for i = 1, #text do
		h = bit32.bxor(h, string.byte(text, i))
		h = (h * 16777619) % 4294967296
	end
	return h
end

local function label(props)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.TextScaled = true
	l.Font = props.Font or Enum.Font.GothamBold
	l.TextColor3 = props.TextColor3 or Color3.new(1, 1, 1)
	l.Text = props.Text
	l.Size = props.Size
	l.Position = props.Position
	l.AnchorPoint = props.AnchorPoint or Vector2.new(0.5, 0.5)
	l.Rotation = props.Rotation or 0
	l.ZIndex = props.ZIndex or 2
	l.Parent = props.Parent
	return l
end

local function eye(parent, x, y, size, pupilOffset)
	local white = Instance.new("Frame")
	white.AnchorPoint = Vector2.new(0.5, 0.5)
	white.Position = UDim2.fromScale(x, y)
	white.Size = UDim2.fromScale(size, size)
	white.SizeConstraint = Enum.SizeConstraint.RelativeYY
	white.BackgroundColor3 = Color3.new(1, 1, 1)
	white.ZIndex = 4
	white.Parent = parent
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = white
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Parent = white
	local pupil = Instance.new("Frame")
	pupil.AnchorPoint = Vector2.new(0.5, 0.5)
	pupil.Size = UDim2.fromScale(0.45, 0.45)
	pupil.Position = UDim2.fromScale(0.5 + pupilOffset.X, 0.5 + pupilOffset.Y)
	pupil.BackgroundColor3 = Color3.new(0, 0, 0)
	pupil.ZIndex = 5
	pupil.Parent = white
	local round = Instance.new("UICorner")
	round.CornerRadius = UDim.new(0.5, 0)
	round.Parent = pupil
	return pupil
end

-- Fills `frame` (any size) with the card for `page` ({ id, title, emoji, category, funny? }).
function FunnyCard.render(frame: GuiObject, page)
	local info = Categories.get(page.category)
	local seed = hash(page.id or page.title or "?")
	local funny = page.funny or {}
	local layers = funny.layers or { page.emoji or info.emoji }
	local caption = funny.caption or CAPTIONS[seed % #CAPTIONS + 1]

	frame.ClipsDescendants = true
	frame.BackgroundColor3 = info.color
	local gradient = Instance.new("UIGradient")
	local hue = (seed % 360) / 360
	gradient.Color = ColorSequence.new(info.color, Color3.fromHSV(hue, 0.55, 0.55))
	gradient.Rotation = seed % 180
	gradient.Parent = frame

	-- Sunburst rays behind everything.
	for i = 0, 5 do
		local ray = Instance.new("Frame")
		ray.AnchorPoint = Vector2.new(0.5, 0.5)
		ray.Position = UDim2.fromScale(0.5, 0.45)
		ray.Size = UDim2.fromScale(2, 0.12)
		ray.Rotation = i * 30 + seed % 30
		ray.BackgroundColor3 = Color3.new(1, 1, 1)
		ray.BackgroundTransparency = 0.86
		ray.BorderSizePixel = 0
		ray.ZIndex = 1
		ray.Parent = frame
	end

	-- Sparkle confetti.
	for i = 1, 4 do
		local s = (seed // (i * 7)) % 1000
		label({
			Text = BITS[(s + i) % #BITS + 1],
			Size = UDim2.fromScale(0.13, 0.13),
			Position = UDim2.fromScale(0.08 + (s % 84) / 100, 0.08 + ((s // 7) % 40) / 100),
			Rotation = s % 40 - 20,
			Parent = frame,
		})
	end

	-- Main subject (first layer) plus sidekick layers.
	local main = label({
		Text = layers[1],
		Size = UDim2.fromScale(0.62, 0.62),
		Position = UDim2.fromScale(0.5, 0.46),
		Rotation = (seed % 17) - 8,
		ZIndex = 3,
		Parent = frame,
	})
	for i = 2, math.min(#layers, 3) do
		label({
			Text = layers[i],
			Size = UDim2.fromScale(0.3, 0.3),
			Position = UDim2.fromScale(i == 2 and 0.8 or 0.2, 0.62),
			Rotation = i == 2 and 12 or -12,
			ZIndex = 4,
			Parent = frame,
		})
	end
	-- A silly hat on pages without custom layers.
	if not funny.layers then
		label({
			Text = HATS[seed % #HATS + 1],
			Size = UDim2.fromScale(0.3, 0.3),
			Position = UDim2.fromScale(0.5 + ((seed % 9) - 4) / 100, 0.16),
			Rotation = (seed % 30) - 15,
			ZIndex = 5,
			Parent = frame,
		})
	end

	-- Googly eyes that wobble.
	local pupils = {
		eye(frame, 0.43, 0.42, 0.14, Vector2.new(0.12, 0.1)),
		eye(frame, 0.57, 0.4, 0.16, Vector2.new(-0.1, 0.14)),
	}
	for index, pupil in pupils do
		local base = pupil.Position
		local wobble = TweenService:Create(
			pupil,
			TweenInfo.new(0.5 + index * 0.17, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
			{ Position = base + UDim2.fromScale(index == 1 and -0.2 or 0.2, -0.12) }
		)
		wobble:Play()
		pupil.Destroying:Connect(function()
			wobble:Cancel()
		end)
	end

	-- Meme caption.
	local text = label({
		Text = caption,
		Font = Enum.Font.LuckiestGuy,
		Size = UDim2.fromScale(0.94, 0.2),
		Position = UDim2.fromScale(0.5, 0.88),
		ZIndex = 6,
		Parent = frame,
	})
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Color = Color3.new(0, 0, 0)
	stroke.Parent = text
	return main
end

return FunnyCard
