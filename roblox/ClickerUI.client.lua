--[[
	Cloud Clicker — a UI-only Roblox game built entirely in code.

	Setup:
	  1. In Roblox Studio, create a LocalScript in StarterPlayer > StarterPlayerScripts.
	  2. Paste this file into it and press Play.

	Images ("on the cloud"):
	  Roblox only displays images hosted on Roblox's own cloud. Upload each picture
	  via Studio's Asset Manager (or create.roblox.com > Creations > Decals/Images),
	  copy its asset ID, and put it in IMAGES below as "rbxassetid://<id>".
	  The IDs below are placeholders — replace them with your own uploads.
]]

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local ContentProvider = game:GetService("ContentProvider")

local player = Players.LocalPlayer

-- Swap these for your uploaded image asset IDs.
local IMAGES = {
	coin = "rbxassetid://0",
	background = "rbxassetid://0",
	upgrades = {
		cursor = "rbxassetid://0",
		robot = "rbxassetid://0",
		factory = "rbxassetid://0",
	},
}

local UPGRADES = {
	{ id = "cursor", name = "Auto Cursor", cost = 15, perSecond = 1 },
	{ id = "robot", name = "Robot Helper", cost = 100, perSecond = 8 },
	{ id = "factory", name = "Coin Factory", cost = 1000, perSecond = 50 },
}

local state = { coins = 0, perClick = 1, perSecond = 0, owned = {} }

-- Preload cloud images so they don't pop in.
task.spawn(function()
	local ids = { IMAGES.coin, IMAGES.background }
	for _, id in IMAGES.upgrades do
		table.insert(ids, id)
	end
	pcall(ContentProvider.PreloadAsync, ContentProvider, ids)
end)

local function make(className, props, children)
	local inst = Instance.new(className)
	for k, v in props do
		inst[k] = v
	end
	for _, child in children or {} do
		child.Parent = inst
	end
	return inst
end

local function corner(r)
	return make("UICorner", { CornerRadius = UDim.new(0, r or 12) })
end

local gui = make("ScreenGui", {
	Name = "CloudClicker",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
})

make("ImageLabel", {
	Name = "Background",
	Size = UDim2.fromScale(1, 1),
	Image = IMAGES.background,
	ScaleType = Enum.ScaleType.Crop,
	BackgroundColor3 = Color3.fromRGB(24, 26, 40),
	Parent = gui,
})

local coinLabel = make("TextLabel", {
	Size = UDim2.new(1, 0, 0, 60),
	Position = UDim2.fromOffset(0, 40),
	BackgroundTransparency = 1,
	Font = Enum.Font.FredokaOne,
	TextSize = 44,
	TextColor3 = Color3.fromRGB(255, 220, 90),
	Text = "0 coins",
	Parent = gui,
})

local rateLabel = make("TextLabel", {
	Size = UDim2.new(1, 0, 0, 24),
	Position = UDim2.fromOffset(0, 100),
	BackgroundTransparency = 1,
	Font = Enum.Font.Gotham,
	TextSize = 18,
	TextColor3 = Color3.fromRGB(200, 200, 220),
	Text = "0 per second",
	Parent = gui,
})

local coinButton = make("ImageButton", {
	Name = "Coin",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.35, 0.55),
	Size = UDim2.fromOffset(220, 220),
	Image = IMAGES.coin,
	BackgroundColor3 = Color3.fromRGB(255, 196, 40),
	AutoButtonColor = false,
	Parent = gui,
}, { make("UICorner", { CornerRadius = UDim.new(1, 0) }) })

local shop = make("ScrollingFrame", {
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -24, 0.55, 0),
	Size = UDim2.fromOffset(320, 360),
	BackgroundColor3 = Color3.fromRGB(36, 38, 58),
	BackgroundTransparency = 0.1,
	ScrollBarThickness = 6,
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	CanvasSize = UDim2.new(),
	Parent = gui,
}, {
	corner(16),
	make("UIPadding", {
		PaddingTop = UDim.new(0, 10),
		PaddingLeft = UDim.new(0, 10),
		PaddingRight = UDim.new(0, 10),
	}),
	make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
})

local function format(n)
	n = math.floor(n)
	if n >= 1e6 then
		return string.format("%.2fM", n / 1e6)
	elseif n >= 1e3 then
		return string.format("%.1fK", n / 1e3)
	end
	return tostring(n)
end

local function costOf(upgrade)
	return math.floor(upgrade.cost * 1.15 ^ (state.owned[upgrade.id] or 0))
end

local shopRows = {}

local function refresh()
	coinLabel.Text = format(state.coins) .. " coins"
	rateLabel.Text = format(state.perSecond) .. " per second"
	for _, row in shopRows do
		local cost = costOf(row.upgrade)
		row.button.Text = "Buy  " .. format(cost)
		row.button.BackgroundColor3 = state.coins >= cost and Color3.fromRGB(70, 190, 110)
			or Color3.fromRGB(90, 90, 110)
		row.owned.Text = "Owned: " .. (state.owned[row.upgrade.id] or 0)
	end
end

local function floatText(text)
	local label = make("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = coinButton.Position + UDim2.fromOffset(math.random(-60, 60), -120),
		Size = UDim2.fromOffset(100, 30),
		BackgroundTransparency = 1,
		Font = Enum.Font.FredokaOne,
		TextSize = 26,
		TextColor3 = Color3.new(1, 1, 1),
		Text = text,
		Parent = gui,
	})
	local tween = TweenService:Create(label, TweenInfo.new(0.8), {
		Position = label.Position - UDim2.fromOffset(0, 60),
		TextTransparency = 1,
	})
	tween.Completed:Connect(function()
		label:Destroy()
	end)
	tween:Play()
end

for i, upgrade in UPGRADES do
	local row = make("Frame", {
		LayoutOrder = i,
		Size = UDim2.new(1, 0, 0, 70),
		BackgroundColor3 = Color3.fromRGB(50, 52, 78),
		Parent = shop,
	}, { corner(10) })

	make("ImageLabel", {
		Position = UDim2.fromOffset(8, 8),
		Size = UDim2.fromOffset(54, 54),
		Image = IMAGES.upgrades[upgrade.id],
		BackgroundColor3 = Color3.fromRGB(70, 72, 100),
		Parent = row,
	}, { corner(8) })

	make("TextLabel", {
		Position = UDim2.fromOffset(72, 8),
		Size = UDim2.new(1, -170, 0, 24),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.new(1, 1, 1),
		Text = upgrade.name,
		Parent = row,
	})

	local owned = make("TextLabel", {
		Position = UDim2.fromOffset(72, 36),
		Size = UDim2.new(1, -170, 0, 20),
		BackgroundTransparency = 1,
		Font = Enum.Font.Gotham,
		TextSize = 13,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(180, 180, 200),
		Parent = row,
	})

	local button = make("TextButton", {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -8, 0.5, 0),
		Size = UDim2.fromOffset(90, 40),
		Font = Enum.Font.GothamBold,
		TextSize = 14,
		TextColor3 = Color3.new(1, 1, 1),
		Parent = row,
	}, { corner(8) })

	button.Activated:Connect(function()
		local cost = costOf(upgrade)
		if state.coins < cost then
			return
		end
		state.coins -= cost
		state.owned[upgrade.id] = (state.owned[upgrade.id] or 0) + 1
		state.perSecond += upgrade.perSecond
		refresh()
	end)

	table.insert(shopRows, { upgrade = upgrade, button = button, owned = owned })
end

coinButton.Activated:Connect(function()
	state.coins += state.perClick
	floatText("+" .. state.perClick)
	coinButton.Size = UDim2.fromOffset(200, 200)
	TweenService:Create(coinButton, TweenInfo.new(0.15, Enum.EasingStyle.Back), {
		Size = UDim2.fromOffset(220, 220),
	}):Play()
	refresh()
end)

gui.Parent = player:WaitForChild("PlayerGui")
refresh()

while true do
	task.wait(0.1)
	state.coins += state.perSecond * 0.1
	refresh()
end
