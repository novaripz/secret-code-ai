-- Single entry point for client requests. Every action is registered with a handler and a
-- per-player rate limit; payloads are type-checked and handler errors never leak to clients.
-- Handlers return `data` on success or `nil, "message"` on failure.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Net = require(Shared.Net)
local RateLimiter = require(script.Parent.RateLimiter)

local Router = {}

local handlers = {}
local requestRemote, pushRemote

local function dispatch(player: Player, action: any, payload: any)
	if type(action) ~= "string" then
		return { ok = false, error = "Bad request" }
	end
	local entry = handlers[action]
	if not entry then
		-- Handlers register after the wiki loads; tell early clients to wait.
		return { ok = false, error = "Server is still starting", code = "Starting" }
	end
	if payload ~= nil and type(payload) ~= "table" then
		return { ok = false, error = "Bad request" }
	end
	if not entry.limiter:allow(player.UserId, os.clock()) then
		return { ok = false, error = "Slow down!", code = "RateLimited" }
	end
	local ok, result, message = pcall(entry.fn, player, payload or {})
	if not ok then
		warn(("[WikiRace] %s failed for %s: %s"):format(action, player.Name, tostring(result)))
		return { ok = false, error = "Something went wrong on the server. Please try again.", code = "ServerError" }
	end
	if result == nil and message ~= nil then
		return { ok = false, error = message }
	end
	return { ok = true, data = result }
end

function Router.init()
	requestRemote, pushRemote = Net.createServerRemotes(ReplicatedStorage)
	requestRemote.OnServerInvoke = dispatch
	Players.PlayerRemoving:Connect(function(player)
		for _, entry in handlers do
			entry.limiter:forget(player.UserId)
		end
	end)
end

-- options: { rate = requests per second, burst = bucket size }
function Router.on(action: string, fn, options)
	assert(Net.Actions[action], "unregistered action name: " .. action)
	options = options or {}
	handlers[action] = { fn = fn, limiter = RateLimiter.new(options.rate or 4, options.burst or 8) }
end

function Router.push(player: Player, event: string, data: any)
	if pushRemote and player.Parent then
		pushRemote:FireClient(player, event, data)
	end
end

function Router.pushMany(players: { Player }, event: string, data: any)
	for _, player in players do
		Router.push(player, event, data)
	end
end

function Router.pushAll(event: string, data: any)
	if pushRemote then
		pushRemote:FireAllClients(event, data)
	end
end

function Router.toast(player: Player, text: string, kind: string?)
	Router.push(player, Net.Events.Toast, { text = text, kind = kind or "info" })
end

return Router
