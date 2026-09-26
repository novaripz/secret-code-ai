-- Minimal signal implementation (no BindableEvent allocation, handlers run synchronously).

local Signal = {}
Signal.__index = Signal

function Signal.new()
	return setmetatable({ _handlers = {} }, Signal)
end

function Signal:Connect(handler)
	local entry = { fn = handler, connected = true }
	table.insert(self._handlers, entry)
	local handlers = self._handlers
	return {
		Disconnect = function()
			entry.connected = false
			local index = table.find(handlers, entry)
			if index then
				table.remove(handlers, index)
			end
		end,
	}
end

function Signal:Fire(...)
	for _, entry in table.clone(self._handlers) do
		if entry.connected then
			entry.fn(...)
		end
	end
end

function Signal:DisconnectAll()
	table.clear(self._handlers)
end

return Signal
