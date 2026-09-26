-- Free Roam practice: untimed browsing with search, categories, random pages, full browser
-- navigation, and "start a solo race" (random, or from the page you're reading).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Difficulty = require(Shared.Difficulty)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local WikiBrowser = require(UI.Components.WikiBrowser)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)

local FreeRoam = {}
FreeRoam.__index = FreeRoam

function FreeRoam.new(App)
	local self = setmetatable({ App = App, pending = false, started = false, difficulty = "Easy" }, FreeRoam)
	local frame = Kit.frame({ Name = "FreeRoam", Size = UDim2.fromScale(1, 1), Parent = App.root })
	self.frame = frame

	local header = Kit.frame(
		{ Size = UDim2.new(1, -24, 0, 50), Position = UDim2.fromOffset(12, 10), Parent = frame },
		{ Kit.list("x", 10, "Left", "Center") }
	)
	Kit.button({
		text = "Menu",
		emoji = "←",
		Size = UDim2.fromOffset(110, 44),
		Parent = header,
		order = 1,
		onClick = function()
			App.show("Menu")
		end,
	})
	Kit.text({ text = "🧭 Free Roam", style = "h1", Size = UDim2.fromOffset(240, 40), Parent = header, order = 2 })
	self.visitedLabel = Kit.chip("0 pages explored", nil, { Parent = header, order = 3, height = 30 })

	local main = Kit.frame({ Position = UDim2.fromOffset(12, 68), Size = UDim2.new(1, -24, 1, -78), Parent = frame })
	self.browserHolder = Kit.frame({ Size = UDim2.new(1, -312, 1, 0), Parent = main })
	self.browser = WikiBrowser.new(self.browserHolder, {
		mode = "free",
		onLink = function(id)
			self:navigate("link", id)
		end,
		onBack = function()
			self:navigate("back")
		end,
		onForward = function()
			self:navigate("forward")
		end,
		onRefresh = function()
			self:navigate("refresh")
		end,
		onHistory = function(id)
			self:navigate("history", id)
		end,
		onRandom = function()
			self:navigate("random")
		end,
		onOpen = function(id)
			self:navigate("open", id)
		end,
		onSearch = function(query, callback)
			task.spawn(function()
				local ok, results = Net.request(Net.Actions.Search, { query = query })
				callback(ok and results or {})
			end)
		end,
		onCategory = function(name)
			self:openCategory(name)
		end,
	})

	local side = Kit.panel({
		Name = "Side",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0, 300, 1, 0),
		Parent = main,
	}, { Kit.padding(14) })
	self.side = side
	local scroll = Kit.scroll(
		{ Size = UDim2.fromScale(1, 1), Parent = side },
		{ Kit.list("y", 10), Kit.padding(0, 8, 8, 0) }
	)
	Kit.text({ text = "Solo race", style = "h2", Parent = scroll, order = 1 })
	Kit.text({
		text = "Practice against the clock. Solo results count toward stats and world records.",
		style = "tiny",
		tone = "textDim",
		Size = UDim2.new(1, 0, 0, 30),
		Parent = scroll,
		order = 2,
	})
	local options = {}
	for _, key in Difficulty.Selectable do
		local def = Difficulty.get(key)
		table.insert(options, { value = key, label = def.emoji })
	end
	self.difficultyControl = Kit.segmented(options, "Easy", function(value)
		self.difficulty = value
		self.difficultyName.Text = Difficulty.get(value).name .. " — " .. Difficulty.get(value).description
	end, { Parent = scroll, order = 3, textSize = 16 })
	self.difficultyName = Kit.text({
		text = "Easy — " .. Difficulty.get("Easy").description,
		style = "tiny",
		tone = "textDim",
		Size = UDim2.new(1, 0, 0, 30),
		Parent = scroll,
		order = 4,
	})
	Kit.button({
		text = "Race from this page",
		emoji = "📍",
		variant = "primary",
		Size = UDim2.new(1, 0, 0, 44),
		Parent = scroll,
		order = 5,
		onClick = function(button)
			self:startSolo(true, button)
		end,
	})
	Kit.button({
		text = "Random solo race",
		emoji = "🎲",
		Size = UDim2.new(1, 0, 0, 44),
		Parent = scroll,
		order = 6,
		onClick = function(button)
			self:startSolo(false, button)
		end,
	})
	Kit.divider(7).Parent = scroll
	Kit.text({ text = "Browse categories", style = "h2", Parent = scroll, order = 8 })
	self.categoryList = Kit.frame({
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 9,
		Parent = scroll,
	})
	local wrap = Kit.list("x", 6, "Left", "Top")
	wrap.Wraps = true
	wrap.Parent = self.categoryList

	App.layoutChanged:Connect(function(compact)
		self.side.Visible = not compact
		self.browserHolder.Size = compact and UDim2.fromScale(1, 1) or UDim2.new(1, -312, 1, 0)
	end)
	self.side.Visible = not App.compact
	if App.compact then
		self.browserHolder.Size = UDim2.fromScale(1, 1)
		Kit.iconButton("🏁", function()
			self.side.Visible = not self.side.Visible
		end, { Parent = header, order = 4 })
	end
	return self
end

function FreeRoam:_renderCategories()
	if self.categoriesRendered or not Store.boot then
		return
	end
	self.categoriesRendered = true
	for index, category in Store.boot.categories or {} do
		if index > 60 then
			break
		end
		Kit.button({
			text = ("%s (%d)"):format(category.name, category.count),
			textSize = 12,
			font = "font",
			Size = UDim2.fromOffset(0, 30),
			order = index,
			Parent = self.categoryList,
			onClick = function()
				self:openCategory(category.name)
			end,
		}).AutomaticSize =
			Enum.AutomaticSize.X
	end
end

function FreeRoam:show(args)
	self:_renderCategories()
	if not self.started then
		self.started = true
		self.browser:setLoading(true)
		task.spawn(function()
			local ok, data = Net.request(Net.Actions.StartFreeRoam, { pageId = args and args.pageId })
			self.browser:setLoading(false)
			if ok then
				self:_apply(data, "none")
			else
				self.started = false
				self.browser:showError(data, function()
					self:show(args)
				end)
			end
		end)
	end
end

function FreeRoam:_apply(data, direction)
	self.browser:setPage(data.page, direction)
	local state = data.state
	self.browser:setNav({
		canBack = state.canBack,
		canForward = state.canForward,
		history = state.history,
		redosLeft = -1,
	})
	local stats = Store.profile and Store.profile.stats
	self.visitedLabel.Text = ("🗺️ %d pages explored"):format(stats and stats.freeRoamPages or 0)
end

function FreeRoam:navigate(op: string, pageId: string?)
	if self.pending then
		return
	end
	self.pending = true
	self.browser:setLoading(true)
	task.spawn(function()
		local ok, data = Net.request(Net.Actions.FreeNavigate, { op = op, pageId = pageId })
		self.pending = false
		self.browser:setLoading(false)
		if ok then
			self:_apply(data, (op == "back" or op == "history") and "back" or "forward")
		else
			self.App.toast(data, "error")
		end
	end)
end

function FreeRoam:openCategory(name: string)
	task.spawn(function()
		local ok, data = Net.request(Net.Actions.GetCategory, { name = name })
		if not ok then
			self.App.toast(data, "error")
			return
		end
		self.App.modal({
			title = "📂 Category: " .. data.name,
			width = 520,
			build = function(body, close)
				Kit.text({ text = ("%d pages"):format(#data.pages), style = "small", tone = "textDim", Parent = body })
				local list = Kit.scroll({ Size = UDim2.new(1, 0, 0, 320), Parent = body }, { Kit.list("y", 4) })
				for index, page in data.pages do
					local row = Kit.button({
						text = page.emoji .. "  " .. page.title,
						variant = "ghost",
						textSize = 15,
						font = "font",
						Size = UDim2.new(1, -8, 0, 34),
						order = index,
						Parent = list,
						onClick = function()
							close()
							self:navigate("open", page.id)
						end,
					})
					row.TextXAlignment = Enum.TextXAlignment.Left
					Kit.padding(0, 10, 0, 10).Parent = row
				end
			end,
			buttons = { { text = "Close" } },
		})
	end)
end

function FreeRoam:startSolo(fromCurrent: boolean, button)
	Kit.busy(button, true, "Generating…")
	task.spawn(function()
		local ok, data =
			Net.request(Net.Actions.StartSoloRace, { difficulty = self.difficulty, fromCurrent = fromCurrent })
		Kit.busy(button, false)
		if ok then
			Store.set("lobby", data)
			Anim.pop(button)
		else
			self.App.toast(data, "error")
		end
	end)
end

return FreeRoam
