-- UI sound playback. Sound IDs come from Config.Sounds; the equipped sound pack changes pitch
-- and volume. Unconfigured sounds fall back to a few sounds bundled with the Roblox client, so
-- the game is never completely silent while you're still uploading the generated SFX.

local SoundService = game:GetService("SoundService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Catalog = require(Shared.Catalog)

local Sound = {}

local FALLBACK = {
	click = { "rbxasset://sounds/clickfast.wav", 1.1 },
	hover = { "rbxasset://sounds/clickfast.wav", 1.6, 0.25 },
	tick = { "rbxasset://sounds/clickfast.wav", 1.8, 0.5 },
	link = { "rbxasset://sounds/electronicpingshort.wav", 1.4, 0.4 },
	back = { "rbxasset://sounds/electronicpingshort.wav", 0.9, 0.4 },
	countdown = { "rbxasset://sounds/electronicpingshort.wav", 1, 0.7 },
	go = { "rbxasset://sounds/electronicpingshort.wav", 1.5, 0.9 },
	tempUp = { "rbxasset://sounds/electronicpingshort.wav", 1.25, 0.5 },
	tempDown = { "rbxasset://sounds/electronicpingshort.wav", 0.75, 0.4 },
	burning = { "rbxasset://sounds/electronicpingshort.wav", 1.9, 0.9 },
	complete = { "rbxasset://sounds/electronicpingshort.wav", 1.6, 1 },
	achievement = { "rbxasset://sounds/electronicpingshort.wav", 1.3, 0.8 },
	coin = { "rbxasset://sounds/electronicpingshort.wav", 2, 0.6 },
	award = { "rbxasset://sounds/electronicpingshort.wav", 1.2, 0.8 },
	error = { "rbxasset://sounds/clickfast.wav", 0.5, 0.6 },
}

local folder = Instance.new("Folder")
folder.Name = "WikiRaceSounds"
folder.Parent = SoundService

local templates = {}
local volume = 0.8
local pitchMultiplier = 1
local volumeMultiplier = 1

local function template(name: string)
	if templates[name] ~= nil then
		return templates[name]
	end
	local id = Config.Sounds[name]
	local fallback = FALLBACK[name]
	local sound = nil
	if id and id ~= "" then
		sound = Instance.new("Sound")
		sound.SoundId = id
		sound:SetAttribute("BasePitch", 1)
		sound:SetAttribute("BaseVolume", 0.7)
	elseif fallback then
		sound = Instance.new("Sound")
		sound.SoundId = fallback[1]
		sound:SetAttribute("BasePitch", fallback[2] or 1)
		sound:SetAttribute("BaseVolume", fallback[3] or 0.7)
	end
	if sound then
		sound.Name = name
		sound.Parent = folder
	end
	templates[name] = sound or false
	return templates[name]
end

function Sound.setVolume(value: number)
	volume = math.clamp(value, 0, 1)
end

function Sound.setPack(itemId: string?)
	local item = itemId and Catalog.ById[itemId]
	pitchMultiplier = item and item.pitch or 1
	volumeMultiplier = item and item.volume or 1
end

-- options: { pitch = multiplier, volume = multiplier }
function Sound.play(name: string, options)
	if volume <= 0 then
		return
	end
	local base = template(name)
	if not base then
		return
	end
	local sound = base:Clone()
	sound.PlaybackSpeed = (base:GetAttribute("BasePitch") or 1) * pitchMultiplier * ((options and options.pitch) or 1)
	sound.Volume = (base:GetAttribute("BaseVolume") or 0.7)
		* volume
		* volumeMultiplier
		* ((options and options.volume) or 1)
	sound.Parent = folder
	sound:Play()
	sound.Ended:Once(function()
		sound:Destroy()
	end)
	task.delay(12, function()
		if sound.Parent then
			sound:Destroy()
		end
	end)
end

-- Looping sound (e.g. heartbeat while Burning). Returns a stop function.
function Sound.loop(name: string, options)
	local base = template(name)
	if not base or volume <= 0 then
		return function() end
	end
	local sound = base:Clone()
	sound.Looped = true
	sound.PlaybackSpeed = (base:GetAttribute("BasePitch") or 1) * pitchMultiplier * ((options and options.pitch) or 1)
	sound.Volume = (base:GetAttribute("BaseVolume") or 0.7)
		* volume
		* volumeMultiplier
		* ((options and options.volume) or 1)
	sound.Parent = folder
	sound:Play()
	return function()
		sound:Stop()
		sound:Destroy()
	end
end

return Sound
