-- Client-side state container. Holds the latest server snapshots; screens listen to `changed`.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Signal = require(ReplicatedStorage:WaitForChild("WikiRaceShared").Signal)

local Store = {
	profile = nil,
	lobby = nil,
	lobbies = {},
	records = {},
	boot = nil,
	race = nil,
	titles = {}, -- page id → title (for history dropdowns)
	changed = Signal.new(),
}

function Store.set(key: string, value)
	Store[key] = value
	Store.changed:Fire(key, value)
end

function Store.rememberTitle(id: string?, title: string?)
	if id and title then
		Store.titles[id] = title
	end
end

function Store.titleOf(id: string): string
	return Store.titles[id] or (id:gsub("_", " "):gsub("^%l", string.upper))
end

function Store.myUserId(): number
	return game:GetService("Players").LocalPlayer.UserId
end

function Store.isHost(): boolean
	return Store.lobby ~= nil and Store.lobby.hostId == Store.myUserId()
end

function Store.setting(key: string, default)
	local profile = Store.profile
	if profile and profile.settings and profile.settings[key] ~= nil then
		return profile.settings[key]
	end
	return default
end

return Store
