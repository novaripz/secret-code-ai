-- Player settings (saved to the profile on the server).

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)
local Sound = require(UI.Parent.Core.Sound)

local Settings = {}
Settings.__index = Settings

function Settings.new(App)
	local self = setmetatable({ App = App, controls = {} }, Settings)
	local frame = Kit.frame({ Name = "Settings", Size = UDim2.fromScale(1, 1), Parent = App.root })
	self.frame = frame
	local header = Kit.frame(
		{ Size = UDim2.new(1, -48, 0, 50), Position = UDim2.fromOffset(24, 14), Parent = frame },
		{ Kit.list("x", 10, "Left", "Center") }
	)
	Kit.button({
		text = "Back",
		emoji = "←",
		Size = UDim2.fromOffset(110, 44),
		Parent = header,
		order = 1,
		onClick = function()
			App.back("Menu")
		end,
	})
	Kit.text({ text = "⚙️ Settings", style = "title", Size = UDim2.fromOffset(300, 44), Parent = header, order = 2 })

	local panel = Kit.panel({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 80),
		Size = UDim2.new(0, 640, 1, -100),
		Parent = frame,
	}, { Kit.padding(20) })
	local scroll = Kit.scroll({ Size = UDim2.fromScale(1, 1), Parent = panel }, { Kit.list("y", 14) })

	Kit.text({ text = "Sound effects volume", style = "h3", Parent = scroll, order = 1 })
	self.controls.sfx = Kit.segmented(
		{
			{ value = 0, label = "🔇 Off" },
			{ value = 0.25, label = "25%" },
			{ value = 0.5, label = "50%" },
			{ value = 0.8, label = "80%" },
			{ value = 1, label = "100%" },
		},
		0.8,
		function(value)
			Sound.setVolume(value)
			Sound.play("tempUp")
			self:save({ sfx = value })
		end,
		{ Parent = scroll, order = 2 }
	)

	local function toggleRow(order: number, key: string, title: string, hint: string)
		local row = Kit.frame({ Size = UDim2.new(1, 0, 0, 50), LayoutOrder = order, Parent = scroll })
		Kit.text({ text = title, style = "h3", Size = UDim2.new(1, -80, 0, 24), Parent = row })
		Kit.text({
			text = hint,
			style = "small",
			tone = "textDim",
			Size = UDim2.new(1, -80, 0, 20),
			Position = UDim2.fromOffset(0, 26),
			Parent = row,
		})
		local toggle = Kit.toggle(true, function(value)
			self:save({ [key] = value })
		end, { Parent = row })
		toggle.frame.AnchorPoint = Vector2.new(1, 0.5)
		toggle.frame.Position = UDim2.new(1, 0, 0.5, 0)
		self.controls[key] = toggle
	end
	toggleRow(
		3,
		"jumpscares",
		"Allow incoming jumpscares",
		"When off, jumpscares sent to you become a harmless warning."
	)
	toggleRow(4, "chaos", "Allow targeted chaos", "When off, nobody can rig you with gag effects.")
	toggleRow(5, "reducedMotion", "Reduced motion", "Shorter animations, fewer particles, no screen shake.")
	toggleRow(6, "hints", "Show hints", "Tips during your first races.")

	Kit.divider(7).Parent = scroll
	Kit.text({ text = "How to play", style = "h3", Parent = scroll, order = 8 })
	Kit.text({
		text = "• You get a start page and a target page.\n• Click links inside articles to travel. Search is disabled during races.\n• The meter shows how many links away you are: Freezing (5+), Cold (4), Warm (3), Hot (2), Burning (the target is linked on this page!).\n• Back, jumping through History, and Restart each use a redo.\n• Score blends placement, speed, route efficiency, redos and difficulty.",
		style = "small",
		tone = "textDim",
		Size = UDim2.new(1, 0, 0, 0),
		auto = Enum.AutomaticSize.Y,
		Parent = scroll,
		order = 9,
	})
	return self
end

function Settings:show()
	local settings = Store.profile and Store.profile.settings or {}
	self.controls.sfx.set(settings.sfx or 0.8)
	for _, key in { "jumpscares", "chaos", "reducedMotion", "hints" } do
		if settings[key] ~= nil then
			self.controls[key].set(settings[key])
		end
	end
end

function Settings:save(patch)
	task.spawn(function()
		local ok, err = Net.request(Net.Actions.UpdateSettings, patch)
		if not ok then
			self.App.toast(err, "error")
		end
	end)
end

return Settings
