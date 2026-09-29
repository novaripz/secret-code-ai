-- Theme controller. UI code binds instance properties to theme tokens once; changing theme
-- walks the bindings and re-applies values (tweened for colors) instead of rebuilding UI.

local TweenService = game:GetService("TweenService")

local Themes = require(script.Parent.Themes)
local Signal = require(game:GetService("ReplicatedStorage"):WaitForChild("WikiRaceShared").Signal)

local Theme = {}
Theme.current = Themes.classic
Theme.id = "dark"
Theme.changed = Signal.new()

local bindings = setmetatable({}, { __mode = "k" }) -- instance → { [property] = token | fn }

local function resolve(token)
	if type(token) == "function" then
		return token(Theme.current)
	end
	return Theme.current[token]
end

local function apply(instance: Instance, property: string, token, animate: boolean?)
	local value = resolve(token)
	if value == nil then
		return
	end
	if animate and typeof(value) == "Color3" then
		TweenService:Create(instance, TweenInfo.new(0.35, Enum.EasingStyle.Quad), { [property] = value }):Play()
	else
		(instance :: any)[property] = value
	end
end

-- Theme.bind(label, { TextColor3 = "text", Font = "fontBold" })
-- A token may also be a function(theme) → value for derived styles.
function Theme.bind(instance: Instance, map)
	local entry = bindings[instance]
	if not entry then
		entry = {}
		bindings[instance] = entry
	end
	for property, token in map do
		entry[property] = token
		apply(instance, property, token, false)
	end
	return instance
end

function Theme.unbind(instance: Instance, property: string?)
	if property then
		local entry = bindings[instance]
		if entry then
			entry[property] = nil
		end
	else
		bindings[instance] = nil
	end
end

function Theme.get(token: string)
	return Theme.current[token]
end

function Theme.set(themeId: string)
	local nextTheme = Themes[themeId]
	if not nextTheme or themeId == Theme.id then
		return
	end
	Theme.current = nextTheme
	Theme.id = themeId
	for instance, entry in bindings do
		if instance.Parent then
			for property, token in entry do
				apply(instance, property, token, true)
			end
		end
	end
	Theme.changed:Fire(nextTheme)
end

return Theme
