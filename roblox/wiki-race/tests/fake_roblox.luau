-- A permissive fake of the Roblox engine API, good enough to run the real server AND client
-- code headlessly in one Luau VM. Instances store properties, track parent/children, expose
-- signals, and tweens apply their goals instantly. Remotes bridge client ↔ server with a deep
-- copy that mimics network serialization (and flags things Roblox can't send).
--
-- Usage: local Fake = loadchunk(readfile(root .. "/tests/fake_roblox.luau"), "fake", _G)()(H, runtime)

return function(H, runtime)
	local Fake = { errors = {}, warnings = {} }

	------------------------------------------------------------------------------------------
	-- Datatypes
	------------------------------------------------------------------------------------------
	local function typed(t, name, mt)
		mt = mt or {}
		mt.__type = name
		return setmetatable(t, mt)
	end

	local UDimMT = {}
	UDim = {
		new = function(scale, offset)
			return typed({ Scale = scale or 0, Offset = offset or 0 }, "UDim", UDimMT)
		end,
	}
	UDimMT.__add = function(a, b)
		return UDim.new(a.Scale + b.Scale, a.Offset + b.Offset)
	end

	local UDim2MT = {}
	UDim2 = {}
	function UDim2.new(xs, xo, ys, yo)
		local x, y = UDim.new(xs, xo), UDim.new(ys, yo)
		return typed({ X = x, Y = y, Width = x, Height = y }, "UDim2", UDim2MT)
	end
	function UDim2.fromScale(x, y)
		return UDim2.new(x, 0, y, 0)
	end
	function UDim2.fromOffset(x, y)
		return UDim2.new(0, x, 0, y)
	end
	UDim2MT.__add = function(a, b)
		return UDim2.new(a.X.Scale + b.X.Scale, a.X.Offset + b.X.Offset, a.Y.Scale + b.Y.Scale, a.Y.Offset + b.Y.Offset)
	end
	UDim2MT.__sub = function(a, b)
		return UDim2.new(a.X.Scale - b.X.Scale, a.X.Offset - b.X.Offset, a.Y.Scale - b.Y.Scale, a.Y.Offset - b.Y.Offset)
	end
	UDim2MT.__eq = function(a, b)
		return a.X.Scale == b.X.Scale
			and a.X.Offset == b.X.Offset
			and a.Y.Scale == b.Y.Scale
			and a.Y.Offset == b.Y.Offset
	end

	local Vector2MT = {}
	Vector2 = {}
	function Vector2.new(x, y)
		x, y = x or 0, y or 0
		return typed({ X = x, Y = y, Magnitude = math.sqrt(x * x + y * y) }, "Vector2", Vector2MT)
	end
	Vector2.zero = Vector2.new(0, 0)
	Vector2.one = Vector2.new(1, 1)
	Vector2MT.__add = function(a, b)
		return Vector2.new(a.X + b.X, a.Y + b.Y)
	end
	Vector2MT.__sub = function(a, b)
		return Vector2.new(a.X - b.X, a.Y - b.Y)
	end
	Vector2MT.__mul = function(a, b)
		if type(a) == "number" then
			return Vector2.new(a * b.X, a * b.Y)
		elseif type(b) == "number" then
			return Vector2.new(a.X * b, a.Y * b)
		end
		return Vector2.new(a.X * b.X, a.Y * b.Y)
	end
	Vector2MT.__div = function(a, b)
		return Vector2.new(a.X / b, a.Y / b)
	end

	local Color3MT = {}
	Color3MT.__index = {
		Lerp = function(a, b, t)
			return Color3.new(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t)
		end,
		ToHex = function(c)
			return string.format("%02X%02X%02X", math.floor(c.R * 255), math.floor(c.G * 255), math.floor(c.B * 255))
		end,
	}
	Color3 = {}
	function Color3.new(r, g, b)
		return typed({ R = r or 0, G = g or 0, B = b or 0 }, "Color3", setmetatable({}, { __index = Color3MT }))
	end
	-- Color3 values need the methods; rebuild metatable per value for simplicity.
	function Color3.new(r, g, b)
		local value = { R = r or 0, G = g or 0, B = b or 0 }
		return setmetatable(value, { __type = "Color3", __index = Color3MT.__index })
	end
	function Color3.fromRGB(r, g, b)
		return Color3.new(r / 255, g / 255, b / 255)
	end
	function Color3.fromHSV(h, s, v)
		return Color3.new(v, v, v)
	end

	local function simple(name)
		return function(...)
			return typed({ ... }, name)
		end
	end
	ColorSequence = { new = simple("ColorSequence") }
	ColorSequenceKeypoint = { new = simple("ColorSequenceKeypoint") }
	NumberSequence = { new = simple("NumberSequence") }
	NumberSequenceKeypoint = { new = simple("NumberSequenceKeypoint") }
	TweenInfo = { new = simple("TweenInfo") }

	local enumCache = {}
	Enum = setmetatable({}, {
		__index = function(_, typeName)
			local enumType = enumCache[typeName]
			if not enumType then
				enumType = setmetatable({}, {
					__index = function(t, itemName)
						local item = typed({ Name = itemName, EnumType = typeName, Value = 0 }, "EnumItem")
						rawset(t, itemName, item)
						return item
					end,
				})
				enumCache[typeName] = enumType
			end
			return enumType
		end,
	})

	local builtinTypeof = typeof
	typeof = function(value)
		if type(value) == "table" then
			local mt = getmetatable(value)
			if type(mt) == "table" and rawget(mt, "__type") then
				return rawget(mt, "__type")
			end
			if rawget(value, "__isInstance") then
				return "Instance"
			end
		end
		return builtinTypeof(value)
	end

	------------------------------------------------------------------------------------------
	-- Signals
	------------------------------------------------------------------------------------------
	local SignalMT = {}
	SignalMT.__index = SignalMT
	local function newSignal(name)
		return setmetatable({ name = name, handlers = {} }, SignalMT)
	end
	function SignalMT:Connect(fn)
		local entry = { fn = fn, connected = true }
		table.insert(self.handlers, entry)
		return {
			Connected = true,
			Disconnect = function()
				entry.connected = false
			end,
		}
	end
	function SignalMT:Once(fn)
		local connection
		connection = self:Connect(function(...)
			connection.Disconnect()
			fn(...)
		end)
		return connection
	end
	function SignalMT:Wait()
		local co = coroutine.running()
		self:Once(function(...)
			task.spawn(co, ...)
		end)
		return coroutine.yield()
	end
	function SignalMT:Fire(...)
		for _, entry in table.clone(self.handlers) do
			if entry.connected then
				entry.fn(...)
			end
		end
	end
	Fake.newSignal = newSignal

	------------------------------------------------------------------------------------------
	-- Instances
	------------------------------------------------------------------------------------------
	local GUI_OBJECTS = {
		Frame = true,
		TextLabel = true,
		TextButton = true,
		TextBox = true,
		ImageLabel = true,
		ImageButton = true,
		ScrollingFrame = true,
		CanvasGroup = true,
	}
	local GUI_BUTTONS = { TextButton = true, ImageButton = true }
	local EVENTS = {
		MouseEnter = true,
		MouseLeave = true,
		MouseButton1Down = true,
		MouseButton1Up = true,
		MouseButton1Click = true,
		Activated = true,
		InputBegan = true,
		InputEnded = true,
		Focused = true,
		FocusLost = true,
		Destroying = true,
		Changed = true,
		ChildAdded = true,
		ChildRemoved = true,
		OnClientEvent = true,
		OnServerEvent = true,
		Ended = true,
		Completed = true,
		AncestryChanged = true,
	}
	local Methods = {}
	local InstanceMT = {}

	local function newInstance(className)
		local instance = {
			__isInstance = true,
			__class = className,
			__props = {},
			__children = {},
			__signals = {},
			__attrs = {},
			__propSignals = {},
		}
		return setmetatable(instance, InstanceMT)
	end
	Fake.newInstance = newInstance

	local function sizeOf(instance)
		local size = rawget(instance, "__props").Size
		local parentSize = Vector2.new(1280, 720)
		local parent = rawget(instance, "__parent")
		if
			parent
			and rawget(parent, "__isInstance")
			and parent.__class ~= "ScreenGui"
			and parent.__class ~= "PlayerGui"
		then
			parentSize = parent.AbsoluteSize
		end
		if not size then
			return parentSize
		end
		return Vector2.new(size.X.Scale * parentSize.X + size.X.Offset, size.Y.Scale * parentSize.Y + size.Y.Offset)
	end

	local DEFAULTS = {
		Text = "",
		Visible = true,
		Rotation = 0,
		ZIndex = 1,
		LayoutOrder = 0,
		TextTransparency = 0,
		BackgroundTransparency = 0,
		TextStrokeTransparency = 1,
		Transparency = 0,
		Scale = 1,
		Thickness = 1,
		Active = false,
		TextSize = 14,
		Size = UDim2.new(0, 0, 0, 0),
		Position = UDim2.new(0, 0, 0, 0),
		CanvasPosition = Vector2.zero,
		AbsolutePosition = Vector2.zero,
		PlaybackSpeed = 1,
		Volume = 0.5,
		Enabled = true,
		Offset = Vector2.zero,
	}

	InstanceMT.__index = function(self, key)
		local method = Methods[key]
		if method then
			return method
		end
		local props = rawget(self, "__props")
		local value = props[key]
		if value ~= nil then
			return value
		end
		if key == "ClassName" then
			return rawget(self, "__class")
		elseif key == "Name" then
			return rawget(self, "__class")
		elseif key == "Parent" then
			return rawget(self, "__parent")
		elseif key == "AbsoluteSize" then
			return sizeOf(self)
		end
		if EVENTS[key] then
			local signals = rawget(self, "__signals")
			signals[key] = signals[key] or newSignal(key)
			return signals[key]
		end
		for _, child in rawget(self, "__children") do
			if child.Name == key then
				return child
			end
		end
		local default = DEFAULTS[key]
		if default ~= nil then
			return default
		end
		if string.find(key, "Color3$") then
			return Color3.new(0, 0, 0)
		end
		return nil
	end

	InstanceMT.__newindex = function(self, key, value)
		if key == "Parent" then
			local old = rawget(self, "__parent")
			if old and rawget(old, "__isInstance") then
				local list = rawget(old, "__children")
				local index = table.find(list, self)
				if index then
					table.remove(list, index)
				end
			end
			rawset(self, "__parent", value)
			if value then
				if rawget(value, "__isInstance") then
					table.insert(rawget(value, "__children"), self)
				elseif rawget(value, "__attachInstance") then
					rawget(value, "__attachInstance")(value, self)
				else
					error("cannot parent an Instance to " .. tostring(value))
				end
			end
			return
		end
		if type(key) ~= "string" then
			error("bad property key " .. tostring(key))
		end
		if EVENTS[key] then
			error(("cannot assign to event %s.%s"):format(rawget(self, "__class"), key), 2)
		end
		rawget(self, "__props")[key] = value
		local propSignal = rawget(self, "__propSignals")[key]
		if propSignal then
			propSignal:Fire()
		end
	end

	function Methods:IsA(className)
		local class = rawget(self, "__class")
		if class == className or className == "Instance" then
			return true
		end
		if className == "GuiObject" then
			return GUI_OBJECTS[class] == true
		elseif className == "GuiButton" then
			return GUI_BUTTONS[class] == true
		elseif className == "GuiBase2d" then
			return GUI_OBJECTS[class] == true or class == "ScreenGui"
		elseif className == "UIGridStyleLayout" then
			return class == "UIListLayout" or class == "UIGridLayout"
		elseif className == "BasePart" then
			return class == "Part"
		end
		return false
	end
	function Methods:GetChildren()
		return table.clone(rawget(self, "__children"))
	end
	function Methods:GetDescendants()
		local list = {}
		local function walk(node)
			for _, child in rawget(node, "__children") do
				table.insert(list, child)
				walk(child)
			end
		end
		walk(self)
		return list
	end
	function Methods:FindFirstChild(name)
		for _, child in rawget(self, "__children") do
			if child.Name == name then
				return child
			end
		end
		return nil
	end
	function Methods:FindFirstChildOfClass(className)
		for _, child in rawget(self, "__children") do
			if rawget(child, "__class") == className then
				return child
			end
		end
		return nil
	end
	function Methods:WaitForChild(name)
		local child = self:FindFirstChild(name)
		if not child then
			error("WaitForChild would hang forever: " .. tostring(name) .. " under " .. tostring(self.Name), 2)
		end
		return child
	end
	function Methods:ClearAllChildren()
		for _, child in table.clone(rawget(self, "__children")) do
			child:Destroy()
		end
	end
	function Methods:Destroy()
		for _, child in table.clone(rawget(self, "__children")) do
			child:Destroy()
		end
		local signals = rawget(self, "__signals")
		if signals.Destroying then
			signals.Destroying:Fire()
		end
		self.Parent = nil
		rawset(self, "__destroyed", true)
	end
	function Methods:Clone()
		local copy = newInstance(rawget(self, "__class"))
		for key, value in rawget(self, "__props") do
			rawget(copy, "__props")[key] = value
		end
		for key, value in rawget(self, "__attrs") do
			rawget(copy, "__attrs")[key] = value
		end
		for _, child in rawget(self, "__children") do
			child:Clone().Parent = copy
		end
		return copy
	end
	function Methods:SetAttribute(name, value)
		rawget(self, "__attrs")[name] = value
	end
	function Methods:GetAttribute(name)
		return rawget(self, "__attrs")[name]
	end
	function Methods:GetPropertyChangedSignal(property)
		local signals = rawget(self, "__propSignals")
		signals[property] = signals[property] or newSignal("Changed:" .. property)
		return signals[property]
	end
	function Methods:GetFullName()
		local parts = {}
		local node = self
		while node and rawget(node, "__isInstance") do
			table.insert(parts, 1, node.Name)
			node = rawget(node, "__parent")
		end
		return table.concat(parts, ".")
	end
	function Methods:IsDescendantOf(ancestor)
		local node = rawget(self, "__parent")
		while node do
			if node == ancestor then
				return true
			end
			node = rawget(node, "__parent")
		end
		return false
	end
	-- Sounds
	function Methods:Play() end
	function Methods:Stop() end
	-- Teleport options
	function Methods:SetTeleportData(data)
		rawset(self, "__teleportData", data)
	end

	-- Remote serialization emulation.
	local function serialize(value, path, seen)
		local kind = type(value)
		if kind == "function" or kind == "thread" or kind == "userdata" then
			error("cannot send " .. kind .. " over the network at " .. path)
		end
		if kind == "number" and (value ~= value) then
			table.insert(Fake.warnings, "NaN sent at " .. path)
		end
		if kind ~= "table" then
			return value
		end
		if rawget(value, "__isInstance") or getmetatable(value) and rawget(getmetatable(value), "__type") then
			return value
		end
		seen = seen or {}
		if seen[value] then
			error("cyclic table sent at " .. path)
		end
		seen[value] = true
		local copy = {}
		local count = #value
		local hasString, hasNumber = false, false
		for k, v in value do
			if type(k) == "number" then
				hasNumber = true
				if k < 1 or k > count or k % 1 ~= 0 then
					table.insert(Fake.warnings, "sparse/non-array numeric key " .. tostring(k) .. " at " .. path)
				end
			elseif type(k) == "string" then
				hasString = true
			else
				error("unsupported key type at " .. path)
			end
			copy[k] = serialize(v, path .. "." .. tostring(k), seen)
		end
		if hasString and hasNumber then
			table.insert(Fake.warnings, "mixed table keys at " .. path)
		end
		seen[value] = nil
		return copy
	end
	Fake.serialize = serialize

	function Methods:InvokeServer(...)
		local handler = self.OnServerInvoke
		assert(handler, "no OnServerInvoke")
		local args = table.pack(...)
		for i = 1, args.n do
			args[i] = serialize(args[i], "InvokeServer.arg" .. i)
		end
		local result = table.pack(handler(Fake.localPlayer, table.unpack(args, 1, args.n)))
		for i = 1, result.n do
			result[i] = serialize(result[i], "InvokeServer.result")
		end
		return table.unpack(result, 1, result.n)
	end
	function Methods:FireClient(player, ...)
		if player ~= Fake.localPlayer then
			return
		end
		local args = table.pack(...)
		for i = 1, args.n do
			args[i] = serialize(args[i], "FireClient(" .. tostring(args[1]) .. ").arg" .. i)
		end
		local signal = self.OnClientEvent
		task.defer(function()
			signal:Fire(table.unpack(args, 1, args.n))
		end)
	end
	function Methods:FireAllClients(...)
		self:FireClient(Fake.localPlayer, ...)
	end

	Instance = {
		new = function(className, parent)
			local instance = newInstance(className)
			if parent then
				instance.Parent = parent
			end
			return instance
		end,
	}

	------------------------------------------------------------------------------------------
	-- Services
	------------------------------------------------------------------------------------------
	local services = H.services
	local function service(name)
		local s = newInstance(name)
		rawget(s, "__props").Name = name
		services[name] = s
		return s
	end

	local function failing(...)
		error("unavailable in tests")
	end

	local RunService = service("RunService")
	RunService.RenderStepped = newSignal("RenderStepped")
	RunService.Heartbeat = newSignal("Heartbeat")
	RunService.Stepped = newSignal("Stepped")
	rawset(RunService, "IsStudio", function()
		return true
	end)
	rawset(RunService, "IsServer", function()
		return true
	end)
	rawset(RunService, "IsClient", function()
		return true
	end)

	local TweenService = service("TweenService")
	rawset(TweenService, "Create", function(_, instance, info, goals)
		local tween = { Completed = newSignal("Completed"), PlaybackState = Enum.PlaybackState.Begin }
		function tween:Play()
			for property, value in goals do
				instance[property] = value
			end
			self.Completed:Fire(Enum.PlaybackState.Completed)
		end
		function tween:Cancel() end
		function tween:Pause() end
		return tween
	end)

	local TextService = service("TextService")
	rawset(TextService, "GetTextSize", function(_, text, size)
		return Vector2.new(utf8.len(text) and utf8.len(text) * size * 0.5 or #text * size * 0.5, size * 1.2)
	end)
	rawset(TextService, "FilterStringAsync", function(_, text)
		return {
			GetNonChatStringForBroadcastAsync = function()
				return text
			end,
		}
	end)

	local DataStoreService = service("DataStoreService")
	rawset(DataStoreService, "GetDataStore", failing)
	rawset(DataStoreService, "GetOrderedDataStore", failing)
	local MessagingService = service("MessagingService")
	rawset(MessagingService, "SubscribeAsync", failing)
	rawset(MessagingService, "PublishAsync", failing)
	local MemoryStoreService = service("MemoryStoreService")
	rawset(MemoryStoreService, "GetSortedMap", failing)
	local BadgeService = service("BadgeService")
	rawset(BadgeService, "AwardBadge", failing)
	local HttpService = service("HttpService")
	local guid = 0
	rawset(HttpService, "GenerateGUID", function()
		guid += 1
		return "guid-" .. guid
	end)
	local MarketplaceService = service("MarketplaceService")
	MarketplaceService.PromptGamePassPurchaseFinished = newSignal("PromptGamePassPurchaseFinished")
	rawset(MarketplaceService, "PromptProductPurchase", function()
		table.insert(Fake.warnings, "PromptProductPurchase called")
	end)
	rawset(MarketplaceService, "PromptGamePassPurchase", function() end)
	rawset(MarketplaceService, "UserOwnsGamePassAsync", function()
		return false
	end)
	local SocialService = service("SocialService")
	rawset(SocialService, "CanSendGameInviteAsync", function()
		return false
	end)
	rawset(SocialService, "PromptGameInvite", function() end)
	local StarterGui = service("StarterGui")
	rawset(StarterGui, "SetCoreGuiEnabled", function() end)
	rawset(StarterGui, "SetCore", function() end)
	service("SoundService")
	service("Lighting")
	service("GuiService")
	service("TeleportService")
	local UserInputService = service("UserInputService")
	rawget(UserInputService, "__props").TouchEnabled = false
	rawget(UserInputService, "__props").MouseEnabled = true
	rawget(UserInputService, "__props").KeyboardEnabled = true
	rawset(UserInputService, "GetMouseLocation", function()
		return Vector2.new(400, 300)
	end)

	-- Players: the fake runtime players from the harness, upgraded to Instances.
	local Players = service("Players")
	Players.PlayerAdded = newSignal("PlayerAdded")
	Players.PlayerRemoving = newSignal("PlayerRemoving")
	local playerList = {}
	rawset(Players, "GetPlayers", function()
		return table.clone(playerList)
	end)
	rawset(Players, "GetPlayerByUserId", function(_, userId)
		for _, player in playerList do
			if player.UserId == userId then
				return player
			end
		end
		return nil
	end)
	rawset(Players, "GetNameFromUserIdAsync", function(_, userId)
		return "User" .. userId
	end)
	function Fake.addPlayer(userId, name)
		local player = newInstance("Player")
		local props = rawget(player, "__props")
		props.UserId = userId
		props.Name = name
		props.DisplayName = name
		player.Parent = Players
		local gui = newInstance("PlayerGui")
		rawget(gui, "__props").Name = "PlayerGui"
		gui.Parent = player
		rawset(player, "GetJoinData", function()
			return {}
		end)
		rawset(player, "IsFriendsWith", function()
			return true
		end)
		rawset(player, "Kick", function() end)
		table.insert(playerList, player)
		Players.PlayerAdded:Fire(player)
		return player
	end
	function Fake.removePlayer(player)
		Players.PlayerRemoving:Fire(player)
		local index = table.find(playerList, player)
		if index then
			table.remove(playerList, index)
		end
		player.Parent = nil
	end

	-- Workspace + camera
	local camera = newInstance("Camera")
	rawget(camera, "__props").ViewportSize = Vector2.new(1280, 720)
	workspace = newInstance("Workspace")
	rawget(workspace, "__props").CurrentCamera = camera
	rawset(workspace, "GetServerTimeNow", function()
		return runtime.clock
	end)
	Fake.camera = camera

	-- Harness file-tree nodes (ReplicatedStorage etc.) accept real Instances as children.
	for _, name in { "ReplicatedStorage", "ServerScriptService", "ServerStorage" } do
		local node = services[name]
		rawset(node, "__attachInstance", function(self, instance)
			local extra = rawget(self, "__extra") or {}
			rawset(self, "__extra", extra)
			extra[instance.Name] = instance
		end)
	end

	-- Helpers for driving UI in tests.
	function Fake.findAll(root, predicate)
		local found = {}
		for _, node in root:GetDescendants() do
			if predicate(node) then
				table.insert(found, node)
			end
		end
		return found
	end
	function Fake.findText(root, pattern)
		for _, node in root:GetDescendants() do
			local text = rawget(node, "__props").Text
			if type(text) == "string" and string.find(text, pattern, 1, true) and node.Visible ~= false then
				return node
			end
		end
		return nil
	end
	function Fake.findButton(root, pattern)
		for _, node in root:GetDescendants() do
			local text = rawget(node, "__props").Text
			if
				node:IsA("GuiButton")
				and type(text) == "string"
				and string.find(text, pattern, 1, true)
				and node.Visible ~= false
			then
				return node
			end
		end
		return nil
	end
	function Fake.click(button)
		assert(button, "click: no button")
		local signals = rawget(button, "__signals")
		if signals.Activated then
			signals.Activated:Fire()
		elseif signals.InputEnded then
			local input = { UserInputType = Enum.UserInputType.MouseButton1 }
			if signals.InputBegan then
				signals.InputBegan:Fire(input)
			end
			signals.InputEnded:Fire(input)
		else
			error("element is not clickable: " .. button:GetFullName())
		end
	end
	function Fake.tickFrames(n)
		for _ = 1, n do
			RunService.Heartbeat:Fire(1 / 30)
			RunService.RenderStepped:Fire(1 / 30)
		end
	end

	return Fake
end
