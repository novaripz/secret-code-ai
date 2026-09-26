-- Hot/cold meter states. The server derives the state from the true shortest-path distance
-- between the player's current page and the target; clients only ever receive the state key.

local Temperature = {}

Temperature.Order = { "Freezing", "Cold", "Warm", "Hot", "Burning", "Completed" }

Temperature.Info = {
	Freezing = {
		key = "Freezing",
		level = 1,
		label = "Freezing",
		emoji = "🧊",
		color = Color3.fromRGB(125, 176, 255),
		glow = Color3.fromRGB(205, 225, 255),
		intensity = 0.12,
		pulse = 2.4,
		blurb = "5+ links away",
	},
	Cold = {
		key = "Cold",
		level = 2,
		label = "Cold",
		emoji = "❄️",
		color = Color3.fromRGB(56, 200, 248),
		glow = Color3.fromRGB(165, 243, 252),
		intensity = 0.3,
		pulse = 1.9,
		blurb = "4 links away",
	},
	Warm = {
		key = "Warm",
		level = 3,
		label = "Warm",
		emoji = "🌤️",
		color = Color3.fromRGB(250, 204, 21),
		glow = Color3.fromRGB(254, 240, 138),
		intensity = 0.5,
		pulse = 1.4,
		blurb = "3 links away",
	},
	Hot = {
		key = "Hot",
		level = 4,
		label = "Hot",
		emoji = "🔥",
		color = Color3.fromRGB(249, 115, 22),
		glow = Color3.fromRGB(253, 186, 116),
		intensity = 0.78,
		pulse = 0.9,
		blurb = "2 links away",
	},
	Burning = {
		key = "Burning",
		level = 5,
		label = "BURNING",
		emoji = "☄️",
		color = Color3.fromRGB(255, 56, 56),
		glow = Color3.fromRGB(255, 200, 80),
		intensity = 1,
		pulse = 0.42,
		blurb = "The target is linked on this page!",
	},
	Completed = {
		key = "Completed",
		level = 6,
		label = "Completed",
		emoji = "🏁",
		color = Color3.fromRGB(52, 211, 153),
		glow = Color3.fromRGB(167, 243, 208),
		intensity = 1,
		pulse = 1.2,
		blurb = "Target reached",
	},
}

function Temperature.fromDistance(distance: number?): string
	if distance == nil or distance ~= distance or distance == math.huge then
		return "Freezing"
	elseif distance <= 0 then
		return "Completed"
	elseif distance == 1 then
		return "Burning"
	elseif distance == 2 then
		return "Hot"
	elseif distance == 3 then
		return "Warm"
	elseif distance == 4 then
		return "Cold"
	end
	return "Freezing"
end

function Temperature.level(state: string): number
	local info = Temperature.Info[state]
	return info and info.level or 1
end

function Temperature.isValid(state: any): boolean
	return type(state) == "string" and Temperature.Info[state] ~= nil
end

return Temperature
