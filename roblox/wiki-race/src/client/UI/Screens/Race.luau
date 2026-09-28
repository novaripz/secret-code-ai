-- The race screen. Everything competitive is decided by the server; this screen renders the
-- current page, the meter, the clock and opponents, and sends navigation requests.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Difficulty = require(Shared.Difficulty)
local Format = require(Shared.Format)
local Temperature = require(Shared.Temperature)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Anim = require(UI.Anim)
local Fx = require(UI.Fx)
local WikiBrowser = require(UI.Components.WikiBrowser)
local TemperatureMeter = require(UI.Components.TemperatureMeter)
local PlayerList = require(UI.Components.PlayerList)
local Reveal = require(UI.Overlays.Reveal)
local ChaosMenu = require(UI.Overlays.ChaosMenu)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)
local Sound = require(UI.Parent.Core.Sound)

local Race = {}
Race.__index = Race

local SIDEBAR_WIDTH = 300

local function serverNow(): number
	return workspace:GetServerTimeNow()
end

function Race.new(App)
	local self = setmetatable({ App = App, pending = false, round = nil, state = nil }, Race)
	local frame = Kit.frame({ Name = "Race", Size = UDim2.fromScale(1, 1), Parent = App.root })
	self.frame = frame

	-- Top bar ------------------------------------------------------------------------------
	local top = Kit.panel(
		{ Name = "TopBar", Size = UDim2.new(1, -24, 0, 76), Position = UDim2.fromOffset(12, 10), Parent = frame },
		nil,
		"surface"
	)
	self.top = top
	local left = Kit.frame(
		{ Size = UDim2.new(0.3, 0, 1, 0), Parent = top },
		{ Kit.padding(10, 12, 10, 12), Kit.list("y", 6, "Left", "Center") }
	)
	self.roundChip = Kit.chip("Round 1/3", nil, { Parent = left, order = 1, height = 26, textSize = 14 })
	self.difficultyChip = Kit.chip("Easy", nil, { Parent = left, order = 2, height = 26, textSize = 14 })

	local center = Kit.frame({
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.36, 0),
		Size = UDim2.new(0.16, 0, 1, 0),
		Parent = top,
	}, { Kit.list("y", 0, "Center", "Center") })
	self.timer = Kit.text({
		text = "5:00",
		style = "title",
		size = 34,
		font = "fontMono",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 38),
		Parent = center,
		order = 1,
	})
	self.timerCaption = Kit.text({
		text = "remaining",
		style = "tiny",
		tone = "textFaint",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 14),
		Parent = center,
		order = 2,
	})

	local targetCard = Kit.panel({
		Name = "Target",
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0.45, 0, 0.5, 0),
		Size = UDim2.new(0.24, 0, 0, 58),
		Parent = top,
	}, nil, "surface2")
	self.targetCard = targetCard
	Kit.stroke("danger", 2, 0.2).Parent = targetCard
	self.targetEmoji = Kit.text({
		text = "🎯",
		size = 30,
		align = Enum.TextXAlignment.Center,
		Size = UDim2.fromOffset(46, 58),
		Parent = targetCard,
	})
	Kit.text({
		text = "🎯 TARGET",
		style = "tiny",
		tone = "danger",
		font = "fontHeavy",
		Size = UDim2.new(1, -56, 0, 14),
		Position = UDim2.fromOffset(50, 8),
		Parent = targetCard,
	})
	self.targetTitle = Kit.text({
		text = "…",
		style = "h3",
		size = 17,
		truncate = true,
		wrap = false,
		Size = UDim2.new(1, -56, 0, 26),
		Position = UDim2.fromOffset(50, 20),
		Parent = targetCard,
	})
	-- 25-word hint (first words of the target article); tap the card to read it all.
	self.targetHint = Kit.text({
		text = "",
		style = "tiny",
		tone = "textDim",
		truncate = true,
		wrap = false,
		Size = UDim2.new(1, -56, 0, 14),
		Position = UDim2.fromOffset(50, 42),
		Parent = targetCard,
	})
	Kit.hoverable(targetCard, function()
		self:showTargetInfo()
	end)

	self.meter = TemperatureMeter.new(top, {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.29, -12, 0, 60),
		onState = function(state, info)
			self:_onTemperature(state, info)
		end,
	})

	self.sidebarToggle = Kit.iconButton("👥", function()
		self:toggleSidebar()
	end, {
		Parent = top,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0.3, -50, 1, -8),
		Size = UDim2.fromOffset(40, 36),
	})

	-- Main area ---------------------------------------------------------------------------
	local main = Kit.frame({
		Name = "Main",
		Position = UDim2.fromOffset(12, 96),
		Size = UDim2.new(1, -24, 1, -106),
		Parent = frame,
	})
	self.main = main
	self.browserHolder =
		Kit.frame({ Name = "BrowserHolder", Size = UDim2.new(1, -(SIDEBAR_WIDTH + 12), 1, 0), Parent = main })
	self.browser = WikiBrowser.new(self.browserHolder, {
		mode = "race",
		onLink = function(pageId)
			self:navigate("link", pageId)
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
		onHistory = function(pageId)
			self:navigate("history", pageId)
		end,
	})

	local sidebar = Kit.panel({
		Name = "Sidebar",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0, SIDEBAR_WIDTH, 1, 0),
		ZIndex = 10,
		Parent = main,
	}, { Kit.padding(10) })
	sidebar.BackgroundTransparency = 0
	self.sidebar = sidebar
	Kit.text({ text = "Racers", style = "h3", Size = UDim2.new(1, 0, 0, 24), Parent = sidebar })
	self.playerList = PlayerList.new(sidebar, {
		Position = UDim2.fromOffset(0, 30),
		Size = UDim2.new(1, 0, 1, -230),
		onInspect = function(userId)
			App.show("Profile", { userId = userId })
		end,
	})
	local mine = Kit.panel({
		Name = "Mine",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.fromScale(0, 1),
		Size = UDim2.new(1, 0, 0, 190),
		Parent = sidebar,
	}, { Kit.padding(10), Kit.list("y", 8) }, "surface2")
	local statsRow = Kit.frame(
		{ Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 1, Parent = mine },
		{ Kit.list("x", 6, "Center", "Center") }
	)
	self.clicksStat = self:_stat(statsRow, "🖱", "Clicks", 1)
	self.redosStat = self:_stat(statsRow, "♻", "Redos", 2)
	self.startStat = self:_stat(statsRow, "📄", "Start", 3)
	self.restartButton = Kit.button({
		text = "Restart route (1 redo)",
		emoji = "↺",
		Size = UDim2.new(1, 0, 0, 38),
		textSize = 14,
		Parent = mine,
		order = 2,
		onClick = function()
			self:navigate("restart")
		end,
	})
	self.giveUpButton = Kit.button({
		text = "Give up",
		emoji = "🏳️",
		variant = "danger",
		Size = UDim2.new(1, 0, 0, 38),
		textSize = 14,
		Parent = mine,
		order = 3,
		onClick = function()
			self:giveUp()
		end,
	})
	local extra = Kit.frame(
		{ Size = UDim2.new(1, 0, 0, 34), LayoutOrder = 4, Parent = mine },
		{ Kit.list("x", 6, "Center", "Center") }
	)
	self.rigButton = Kit.button({
		text = "Rig",
		emoji = "🤡",
		Size = UDim2.new(0.5, -3, 1, 0),
		textSize = 13,
		Parent = extra,
		order = 1,
		onClick = function()
			ChaosMenu.rigPlayer(App)
		end,
	})
	self.endButton = Kit.button({
		text = "End match",
		emoji = "⏹",
		Size = UDim2.new(0.5, -3, 1, 0),
		textSize = 13,
		Parent = extra,
		order = 2,
		onClick = function()
			App.confirm(
				"End the match?",
				"The current round will finish now and final results will be shown.",
				"End match",
				function()
					App.request(Net.Actions.EndMatch, {})
				end,
				"danger"
			)
		end,
	})

	-- Banner (finished / spectating / generating)
	self.banner = Kit.panel({
		Name = "Banner",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 100),
		Size = UDim2.fromOffset(520, 64),
		Visible = false,
		ZIndex = 30,
		Parent = frame,
	}, { Kit.padding(10) }, "surface2")
	self.bannerText = Kit.text({
		text = "",
		style = "h2",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.fromScale(1, 1),
		Parent = self.banner,
		ZIndex = 31,
	})

	self.vignette = Fx.vignette(frame)

	App.layoutChanged:Connect(function(compact)
		self:_layout(compact)
	end)
	self:_layout(App.compact)

	RunService.Heartbeat:Connect(function()
		if frame.Visible then
			self:_tickTimer()
		end
	end)
	return self
end

function Race:_stat(parent, emoji: string, caption: string, order: number)
	local holder = Kit.frame(
		{ Size = UDim2.new(1 / 3, -4, 1, 0), LayoutOrder = order, Parent = parent },
		{ Kit.list("y", 0, "Center", "Center") }
	)
	local value = Kit.text({
		text = emoji .. " 0",
		style = "h3",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 24),
		Parent = holder,
		order = 1,
	})
	Kit.text({
		text = caption,
		style = "tiny",
		tone = "textFaint",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 14),
		Parent = holder,
		order = 2,
	})
	return value
end

function Race:_layout(compact: boolean)
	self.compact = compact
	self.sidebarToggle.Visible = compact
	if compact then
		self.browserHolder.Size = UDim2.fromScale(1, 1)
		self.sidebar.Visible = self.sidebarOpen == true
		self.sidebar.Size = UDim2.new(0, SIDEBAR_WIDTH, 1, 0)
	else
		self.browserHolder.Size = UDim2.new(1, -(SIDEBAR_WIDTH + 12), 1, 0)
		self.sidebar.Visible = true
	end
end

function Race:toggleSidebar()
	self.sidebarOpen = not self.sidebarOpen
	self.sidebar.Visible = self.sidebarOpen
	if self.sidebarOpen then
		Anim.slideIn(self.sidebar, UDim2.fromOffset(80, 0), 0.25)
	end
end

function Race:_showBanner(text: string?, token: string?)
	if not text then
		self.banner.Visible = false
		return
	end
	self.bannerText.Text = text
	Theme.bind(self.bannerText, { TextColor3 = token or "text" })
	self.banner.Visible = true
	Anim.punchIn(self.banner, 0.8)
end

function Race:_onTemperature(state: string, info)
	if not self.vignette then
		return -- the meter reports its initial state before the screen finishes building
	end
	if state == "Burning" then
		self.vignette:set(info.color, 0.55)
	elseif state == "Hot" then
		self.vignette:set(info.color, 0.25)
	elseif state == "Completed" then
		self.vignette:set(info.color, 0.35)
	else
		self.vignette:set(info.color, 0)
	end
end

function Race:_tickTimer()
	local round = self.round
	if not round then
		return
	end
	local now = serverNow()
	if now < round.raceStartAt then
		local limit = round.endsAt and (round.endsAt - round.raceStartAt) or nil
		self.timer.Text = limit and Format.clock(limit) or "∞"
		self.timerCaption.Text = "get ready"
		return
	end
	if self.state and (self.state.completed or self.state.gaveUp) then
		self.timerCaption.Text = self.state.completed and "finished" or "gave up"
		if self.state.finishTime then
			self.timer.Text = Format.time(self.state.finishTime)
		end
		return
	end
	local closingAt = self.closingAt
	if round.endsAt then
		local remaining = math.max(0, round.endsAt - now)
		self.timer.Text = Format.clock(remaining)
		self.timerCaption.Text = "remaining"
		local urgent = remaining <= 15
		Theme.bind(self.timer, { TextColor3 = urgent and "danger" or "text" })
		local second = math.ceil(remaining)
		if urgent and second ~= self.lastTickSecond and remaining > 0 then
			self.lastTickSecond = second
			Sound.play("tick", { pitch = 1 + (15 - second) * 0.03 })
			Anim.pop(self.timer, 1.08)
		end
	elseif closingAt then
		local remaining = math.max(0, closingAt - now)
		self.timer.Text = Format.clock(remaining)
		self.timerCaption.Text = "closing!"
		Theme.bind(self.timer, { TextColor3 = "danger" })
	else
		self.timer.Text = Format.clock(now - round.raceStartAt)
		self.timerCaption.Text = "elapsed · unlimited"
		Theme.bind(self.timer, { TextColor3 = "text" })
	end
end

function Race:showTargetInfo()
	local round = self.round
	if not round then
		return
	end
	local target = round.target
	self.App.modal({
		title = "🎯 " .. target.title,
		build = function(body)
			Kit.chip(target.category, nil, { Parent = body })
			Kit.text({
				text = "💡 " .. (target.hint or target.blurb or ""),
				style = "body",
				tone = "textDim",
				Size = UDim2.new(1, 0, 0, 0),
				auto = Enum.AutomaticSize.Y,
				Parent = body,
			})
			Kit.text({
				text = "Reach this article by clicking links. The meter heats up as you get closer.",
				style = "tiny",
				tone = "textFaint",
				Parent = body,
			})
		end,
		buttons = { { text = "Got it", variant = "primary" } },
	})
end

function Race:setTarget(preview)
	self.round.target = preview
	self.targetTitle.Text = preview.title
	self.targetEmoji.Text = preview.emoji or "🎯"
	self.targetHint.Text = "💡 " .. (preview.hint or "tap for info")
	Store.rememberTitle(preview.id, preview.title)
end

function Race:setDifficulty(key: string)
	local def = Difficulty.get(key)
	self.difficultyChip.Text = def.emoji .. " " .. def.name
	self.difficultyChip.BackgroundColor3 = def.color
	self.difficultyChip.TextColor3 = Color3.fromRGB(20, 20, 20)
	Theme.unbind(self.difficultyChip)
end

function Race:onGenerating(data)
	self.App.show("Race")
	self:_showBanner(("🎲 Generating round %d…"):format(data.round), "textDim")
end

function Race:onRoundStart(data)
	self.App.show("Race")
	self:_showBanner(nil)
	self.round = {
		index = data.round,
		totalRounds = data.totalRounds,
		raceStartAt = data.raceStartAt,
		endsAt = data.endsAt,
		start = data.start,
		target = data.target,
		difficulty = data.difficulty,
		solo = data.solo,
	}
	self.closingAt = nil
	self.lastTickSecond = nil
	self.roundChip.Text = data.totalRounds == 0 and ("Round %d · ∞"):format(data.round)
		or ("Round %d/%d"):format(data.round, data.totalRounds)
	self:setDifficulty(data.difficulty)
	self:setTarget(data.target)
	self.startStat.Text = "📄 " .. string.sub(data.start.title, 1, 10)
	local profile = Store.profile
	self.browser:setTransition(profile and profile.equipped and profile.equipped.transition)
	self.meter:setEffect(profile and profile.equipped and profile.equipped.meter)
	self.playerList:setPlayers(data.players)
	self.browser:setPage(data.page, "none")
	self:applyState(data.state, false)
	self.browser:setInteractive(false)
	local me = Players.LocalPlayer.UserId
	self.endButton.Visible = Store.lobby ~= nil and Store.lobby.hostId == me and not data.solo
	self.rigButton.Visible = not data.solo and #data.players > 1
	Reveal.play(self.App, data, function()
		self.browser:setInteractive(not (self.state and self.state.finished))
	end)
end

function Race:applyState(state, animate: boolean?)
	if not state then
		return
	end
	local previous = self.state
	self.state = state
	if state.temperature then
		self.meter:set(state.temperature, animate ~= false)
	end
	self.browser:setNav({
		canBack = state.canBack,
		canForward = state.canForward,
		history = state.history,
		redosLeft = state.redosLeft,
	})
	if previous and state.clicks ~= previous.clicks then
		Anim.pop(self.clicksStat, 1.2)
	end
	self.clicksStat.Text = "🖱 " .. state.clicks
	self.redosStat.Text = "♻ "
		.. state.redosUsed
		.. (state.redosLeft >= 0 and ("/" .. (state.redosUsed + state.redosLeft)) or "")
	local canRedo = state.redosLeft ~= 0 and not state.atStart and not state.finished
	Kit.setDisabled(self.restartButton, not canRedo)
	Kit.setDisabled(self.giveUpButton, state.finished)
	if state.completed and not (previous and previous.completed) then
		self:_celebrate(state)
	elseif state.gaveUp and not (previous and previous.gaveUp) then
		self.browser:setInteractive(false)
		self:_showBanner("🏳️ You gave up — watching the others finish", "textDim")
	end
end

function Race:_celebrate(state)
	self.browser:setInteractive(false)
	Sound.play("complete")
	Fx.burst(self.App.fx, { count = 70, maxDistance = 420 })
	Fx.flash(self.frame, Temperature.Info.Completed.color, 0.6, 0.5)
	self:_showBanner(
		("🏁 TARGET REACHED in %s · %d clicks"):format(Format.time(state.finishTime), state.clicks),
		"success"
	)
end

function Race:navigate(op: string, pageId: string?)
	if self.pending or not self.round then
		return
	end
	if serverNow() < self.round.raceStartAt then
		return
	end
	if op == "restart" or (op == "history") then
		-- These spend a redo; make it explicit.
		if self.state and self.state.redosLeft == 0 then
			self.App.toast("You're out of redos!", "error")
			return
		end
	end
	self.pending = true
	self.browser:setLoading(true)
	task.spawn(function()
		local ok, data = Net.request(Net.Actions.Navigate, { op = op, pageId = pageId })
		self.pending = false
		self.browser:setLoading(false)
		if not ok then
			self.App.toast(data, "error")
			if op ~= "refresh" then
				Anim.shake(self.browserHolder, 5, 0.25)
			end
			return
		end
		self.browser:setPage(data.page, (op == "back" or op == "history" or op == "restart") and "back" or "forward")
		if op == "back" or op == "history" or op == "restart" then
			Sound.play("back")
		end
		self:applyState(data.state, true)
	end)
end

function Race:giveUp()
	local def = self.round and Difficulty.get(self.round.difficulty)
	local message = (def and def.giveUpMode)
			and "Give Up Mode doesn't penalize surrender. Your closest distance still counts."
		or "You'll keep partial points for how close you got (halved for giving up)."
	self.App.confirm("Give up this round?", message, "🏳️ Give up", function()
		task.spawn(function()
			local ok, data = Net.request(Net.Actions.GiveUp, {})
			if ok then
				Sound.play("tempDown")
				self:applyState(data.state, true)
			else
				self.App.toast(data, "error")
			end
		end)
	end, "danger")
end

function Race:onOpponents(data)
	self.playerList:update(data.rows)
	if self.round then
		self.round.endsAt = data.endsAt
	end
	self.closingAt = data.closingAt
end

function Race:onClosing(data)
	self.closingAt = data.closesAt
	if not (self.state and self.state.finished) then
		self.App.toast("⏳ Half the lobby has finished — the round closes in 90 seconds!", "finish")
	end
end

function Race:onRigged(data)
	if not self.round then
		return
	end
	self.round.endsAt = data.endsAt
	self.round.difficulty = data.difficulty
	self:setDifficulty(data.difficulty)
	self:setTarget(data.target)
	Anim.shake(self.targetCard, 12, 0.8)
	Fx.flash(self.targetCard, Color3.fromRGB(255, 40, 40), 0.8, 0.9)
	Anim.pop(self.targetCard, 1.25)
	if data.state then
		self:applyState(data.state, true)
	end
end

function Race:hide()
	self.vignette:set(Color3.new(0, 0, 0), 0, 0.1)
end

return Race
