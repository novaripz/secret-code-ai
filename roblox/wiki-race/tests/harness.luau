-- Minimal Roblox environment for running the game's pure modules outside Studio.
-- Maps the Rojo tree onto the filesystem so `require(script.Parent.X)` and
-- `game:GetService("ReplicatedStorage"):WaitForChild("WikiRaceShared")` work unmodified.
-- Needs a Luau host exposing readfile/listdir/isdir/loadchunk (see tests/README.md).

local ROOT = (arg and arg[1]) or "."

-- Roblox datatype shims ---------------------------------------------------------------
Color3 = {
	fromRGB = function(r, g, b)
		return { R = r / 255, G = g / 255, B = b / 255 }
	end,
	new = function(r, g, b)
		return { R = r, G = g, B = b }
	end,
}

local RandomClass = {}
RandomClass.__index = RandomClass
Random = {
	new = function(seed)
		return setmetatable({ state = (seed or os.time()) % 2147483647 + 1 }, RandomClass)
	end,
}
function RandomClass:_next()
	self.state = (self.state * 48271) % 2147483647
	return self.state
end
function RandomClass:NextNumber(minimum, maximum)
	local value = (self:_next() - 1) / 2147483646
	if minimum then
		return minimum + value * (maximum - minimum)
	end
	return value
end
function RandomClass:NextInteger(minimum, maximum)
	return minimum + (self:_next() % (maximum - minimum + 1))
end

warn = function(...)
	print("[warn]", ...)
end

-- Fake instance tree ------------------------------------------------------------------
local moduleCache = {}
local Node = {}

local function newNode(name, className, fsPath, parent)
	local node = { __name = name, __class = className, __path = fsPath or false, __parent = parent or false }
	return setmetatable(node, Node)
end

local function childrenOf(node)
	local cached = rawget(node, "__children")
	if cached then
		return cached
	end
	local children = {}
	rawset(node, "__children", children)
	local dir = rawget(node, "__dirPath") or rawget(node, "__path")
	if not dir or not isdir(dir) then
		return children
	end
	for _, entry in listdir(dir) do
		local full = dir .. "/" .. entry
		if isdir(full) then
			local init = full .. "/init.luau"
			if readfile(init) then
				local child = newNode(entry, "ModuleScript", init, node)
				rawset(child, "__dirPath", full)
				children[entry] = child
			else
				children[entry] = newNode(entry, "Folder", full, node)
			end
		elseif entry:match("%.luau$") and entry ~= "init.luau" then
			local name = entry:gsub("%.server%.luau$", ""):gsub("%.client%.luau$", ""):gsub("%.luau$", "")
			local className = entry:match("%.server%.luau$") and "Script"
				or (entry:match("%.client%.luau$") and "LocalScript" or "ModuleScript")
			children[name] = newNode(name, className, full, node)
		end
	end
	return children
end

local methods = {}
local function extraChild(node, name)
	local extra = rawget(node, "__extra")
	return extra and extra[name] or nil
end
function methods:FindFirstChild(name)
	return childrenOf(self)[name] or extraChild(self, name)
end
function methods:WaitForChild(name)
	local child = childrenOf(self)[name] or extraChild(self, name)
	assert(child, "WaitForChild: missing " .. tostring(name) .. " under " .. tostring(self.__name))
	return child
end
function methods:GetChildren()
	local list = {}
	for _, child in childrenOf(self) do
		table.insert(list, child)
	end
	table.sort(list, function(a, b)
		return a.__name < b.__name
	end)
	return list
end
function methods:GetDescendants()
	local list = {}
	local function walk(node)
		for _, child in methods.GetChildren(node) do
			table.insert(list, child)
			walk(child)
		end
	end
	walk(self)
	return list
end
function methods:IsA(className)
	return self.__class == className
end
function methods:GetFullName()
	local parts = {}
	local node = self
	while node do
		table.insert(parts, 1, node.__name)
		node = rawget(node, "__parent") or nil
	end
	return table.concat(parts, ".")
end

Node.__index = function(node, key)
	if key == "Name" then
		return node.__name
	elseif key == "Parent" then
		return rawget(node, "__parent") or nil
	elseif key == "ClassName" then
		return node.__class
	elseif methods[key] then
		return methods[key]
	end
	local child = childrenOf(node)[key] or extraChild(node, key)
	if child then
		return child
	end
	error("fake instance: " .. tostring(key) .. " is not a member of " .. tostring(node.__name), 2)
end

local requireModule
local function makeEnv(node)
	return setmetatable({ script = node, require = requireModule }, { __index = _G })
end

requireModule = function(node)
	if type(node) ~= "table" or getmetatable(node) ~= Node then
		error("require expects a fake ModuleScript")
	end
	local path = node.__path
	if moduleCache[path] ~= nil then
		return moduleCache[path]
	end
	local source = readfile(path)
	assert(source, "cannot read " .. path)
	local chunk = loadchunk(source, path, makeEnv(node))
	local result = chunk()
	moduleCache[path] = result
	return result
end
require = requireModule

local function service(name, mounts)
	local node = newNode(name, "Folder", nil, nil)
	local children = {}
	for childName, fsPath in mounts do
		children[childName] = newNode(childName, "Folder", ROOT .. "/" .. fsPath, node)
	end
	rawset(node, "__children", children)
	return node
end

local services = {
	ReplicatedStorage = service("ReplicatedStorage", { WikiRaceShared = "src/shared" }),
	ServerScriptService = service("ServerScriptService", { WikiRaceServer = "src/server" }),
	ServerStorage = service("ServerStorage", { WikiData = "src/wikidata" }),
}
local autoStub = false

-- A permissive stand-in for any Roblox service: every member is callable and connectable.
local function stubValue(label)
	local value = {}
	value.Connect = function()
		return { Disconnect = function() end }
	end
	value.Wait = function() end
	return setmetatable(value, {
		__call = function()
			return nil
		end,
		__index = function(_, key)
			return stubValue(label .. "." .. tostring(key))
		end,
	})
end

game = {
	JobId = "test-job",
	PlaceId = 0,
	GetService = function(_, name)
		if services[name] then
			return services[name]
		end
		assert(autoStub, "service not shimmed: " .. tostring(name))
		services[name] = stubValue(name)
		return services[name]
	end,
	BindToClose = function() end,
}

local Harness = {}
Harness.root = ROOT
Harness.services = services

-- Deterministic runtime: virtual clock + coroutine scheduler emulating task.*, fake Players.
function Harness.installRuntime()
	autoStub = true
	local runtime = { clock = 1000, queue = {}, seq = 0 }
	local function schedule(co, at, ...)
		runtime.seq += 1
		table.insert(runtime.queue, { co = co, at = at, seq = runtime.seq, args = table.pack(...) })
	end
	local function resume(co, ...)
		local ok, err = coroutine.resume(co, ...)
		if not ok then
			error(debug.traceback(co, tostring(err)), 0)
		end
	end
	task = {
		wait = function(seconds)
			local co = coroutine.running()
			schedule(co, runtime.clock + (seconds or 0.03))
			return coroutine.yield()
		end,
		spawn = function(fn, ...)
			local co = type(fn) == "thread" and fn or coroutine.create(fn)
			resume(co, ...)
			return co
		end,
		defer = function(fn, ...)
			local co = coroutine.create(fn)
			schedule(co, runtime.clock, ...)
			return co
		end,
		delay = function(seconds, fn, ...)
			local co = coroutine.create(fn)
			schedule(co, runtime.clock + seconds, ...)
			return co
		end,
	}
	-- Advances virtual time, running every due coroutine in order.
	function runtime.advance(seconds)
		local deadline = runtime.clock + seconds
		while true do
			local bestIndex = nil
			for index, item in runtime.queue do
				if item.at <= deadline then
					local best = bestIndex and runtime.queue[bestIndex]
					if not best or item.at < best.at or (item.at == best.at and item.seq < best.seq) then
						bestIndex = index
					end
				end
			end
			if not bestIndex then
				break
			end
			local item = table.remove(runtime.queue, bestIndex)
			runtime.clock = math.max(runtime.clock, item.at)
			if coroutine.status(item.co) == "suspended" then
				resume(item.co, table.unpack(item.args, 1, item.args.n))
			end
		end
		runtime.clock = deadline
	end

	workspace = {
		GetServerTimeNow = function()
			return runtime.clock
		end,
	}
	-- Rate limiters and debounces use os.clock(); drive it from the virtual clock too.
	local realOs = os
	os = setmetatable({
		clock = function()
			return runtime.clock
		end,
	}, { __index = realOs })

	local playerList = {}
	local fakePlayers = stubValue("Players")
	rawset(fakePlayers, "GetPlayers", function()
		return table.clone(playerList)
	end)
	rawset(fakePlayers, "GetPlayerByUserId", function(_, userId)
		for _, player in playerList do
			if player.UserId == userId then
				return player
			end
		end
		return nil
	end)
	services.Players = fakePlayers
	function runtime.addPlayer(userId, name)
		local player = { UserId = userId, Name = name, DisplayName = name, Parent = true }
		table.insert(playerList, player)
		return player
	end
	function runtime.removePlayer(player)
		local index = table.find(playerList, player)
		if index then
			table.remove(playerList, index)
		end
		player.Parent = nil
	end
	return runtime
end

function Harness.server(path)
	local node = services.ServerScriptService.WikiRaceServer
	for part in string.gmatch(path, "[^/]+") do
		node = node:WaitForChild(part)
	end
	return requireModule(node)
end

-- Mounts an arbitrary source folder as a fake instance tree (e.g. the client scripts).
function Harness.node(path, name)
	return newNode(name, "Folder", ROOT .. "/" .. path, nil)
end

-- Runs a Script/LocalScript node with `script` bound, inside a coroutine.
function Harness.runScript(node)
	local path = rawget(node, "__path")
	local chunk = loadchunk(readfile(path), path, makeEnv(node))
	return task.spawn(chunk)
end

function Harness.require(node)
	return requireModule(node)
end

function Harness.shared(name)
	return requireModule(services.ReplicatedStorage.WikiRaceShared:WaitForChild(name))
end

function Harness.loadAllPages()
	local repoModule = Harness.server("Wiki/WikiRepository")
	return repoModule.collectPages(services.ServerStorage.WikiData)
end

return Harness
