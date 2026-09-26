-- Client networking: one RemoteFunction for requests, one RemoteEvent for server pushes.
-- Requests never throw; they return ok, data | errorMessage, errorCode.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local SharedNet = require(Shared.Net)
local Signal = require(Shared.Signal)

local Net = {}
Net.Actions = SharedNet.Actions
Net.Events = SharedNet.Events

local requestRemote, pushRemote
local signals = {}
local buffered = {} -- events received before anyone listened

function Net.init()
	requestRemote, pushRemote = SharedNet.waitForRemotes(ReplicatedStorage)
	pushRemote.OnClientEvent:Connect(function(event, data)
		local signal = signals[event]
		if signal and #signal._handlers > 0 then
			signal:Fire(data)
		else
			buffered[event] = buffered[event] or {}
			table.insert(buffered[event], data)
			if #buffered[event] > 20 then
				table.remove(buffered[event], 1)
			end
		end
	end)
end

function Net.on(event: string, handler)
	assert(SharedNet.Events[event], "unknown event " .. tostring(event))
	local signal = signals[event]
	if not signal then
		signal = Signal.new()
		signals[event] = signal
	end
	local connection = signal:Connect(handler)
	local pending = buffered[event]
	if pending then
		buffered[event] = nil
		for _, data in pending do
			task.spawn(handler, data)
		end
	end
	return connection
end

function Net.request(action: string, payload): (boolean, any, string?)
	assert(SharedNet.Actions[action], "unknown action " .. tostring(action))
	local ok, response = pcall(requestRemote.InvokeServer, requestRemote, action, payload)
	if not ok then
		return false, "Connection problem — please try again.", "Network"
	end
	if type(response) ~= "table" then
		return false, "Unexpected server response.", "Protocol"
	end
	if response.ok then
		return true, response.data
	end
	return false, response.error or "Request failed.", response.code
end

return Net
