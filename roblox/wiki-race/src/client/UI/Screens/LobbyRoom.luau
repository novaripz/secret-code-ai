-- Lobby room: members, host controls, match settings, ready/start, invites and chaos buttons.
-- Every control sends a request; the server validates host permissions and pushes the new
-- lobby state back, which re-renders this screen.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local SocialService = game:GetService("SocialService")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Difficulty = require(Shared.Difficulty)
local Format = require(Shared.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Anim = require(UI.Anim)
local ChaosMenu = require(UI.Overlays.ChaosMenu)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)
local Sound = require(UI.Parent.Core.Sound)

local LobbyRoom = {}
LobbyRoom.__index = LobbyRoom

local SHORT_NAMES = {
	SuperEasy = "Super Easy",
	Easy = "Easy",
	Medium = "Medium",
	Hard = "Hard",
	Extreme = "Extreme",
	GiveUp = "Give Up",
}

function LobbyRoom.new(App)
	local self = setmetatable({ App = App, controls = {} }, LobbyRoom)
	local frame = Kit.frame({ Name = "LobbyRoom", Size = UDim2.fromScale(1, 1), Parent = App.root })
	self.frame = frame

	-- Header -----------------------------------------------------------------------------
	local header = Kit.frame(
		{ Size = UDim2.new(1, -48, 0, 60), Position = UDim2.fromOffset(24, 14), Parent = frame },
		{ Kit.list("x", 10, "Left", "Center") }
	)
	Kit.button({
		text = "Leave",
		emoji = "←",
		Size = UDim2.fromOffset(110, 44),
		Parent = header,
		order = 1,
		onClick = function()
			self:leave()
		end,
	})
	self.nameLabel = Kit.text({
		text = "Lobby",
		style = "h1",
		truncate = true,
		wrap = false,
		Size = UDim2.new(1, -620, 0, 40),
		Parent = header,
		order = 2,
	})
	self.visibilityChip = Kit.chip("🔒 Private", nil, { Parent = header, order = 3, height = 32, textSize = 14 })
	local codePanel = Kit.panel(
		{ Size = UDim2.fromOffset(190, 48), LayoutOrder = 4, Parent = header },
		{ Kit.padding(4, 10, 4, 10), Kit.list("y", 0, "Center", "Center") }
	)
	Kit.text({
		text = "LOBBY CODE",
		style = "tiny",
		tone = "textFaint",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 12),
		Parent = codePanel,
		order = 1,
	})
	self.codeLabel = Kit.text({
		text = "······",
		style = "h2",
		font = "fontMono",
		size = 22,
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 26),
		Parent = codePanel,
		order = 2,
	})
	Kit.button({
		text = "Invite",
		emoji = "📨",
		variant = "primary",
		Size = UDim2.fromOffset(120, 44),
		Parent = header,
		order = 5,
		onClick = function()
			self:invite()
		end,
	})

	-- Body ---------------------------------------------------------------------------------
	local body = Kit.frame({ Size = UDim2.new(1, -48, 1, -170), Position = UDim2.fromOffset(24, 84), Parent = frame })
	self.body = body
	local playersPanel = Kit.panel(
		{ Name = "Players", Size = UDim2.new(0.58, -10, 1, 0), Parent = body },
		{ Kit.padding(14) }
	)
	self.playersPanel = playersPanel
	self.playersTitle =
		Kit.text({ text = "Players", style = "h2", Size = UDim2.new(1, 0, 0, 26), Parent = playersPanel })
	self.memberGrid = Kit.scroll(
		{ Size = UDim2.new(1, 0, 1, -34), Position = UDim2.fromOffset(0, 34), Parent = playersPanel },
		{ Kit.grid(UDim2.fromOffset(150, 176), 10) }
	)

	local settingsPanel = Kit.panel({
		Name = "Settings",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0.42, -10, 1, 0),
		Parent = body,
	}, { Kit.padding(14) })
	self.settingsPanel = settingsPanel
	local settingsScroll = Kit.scroll(
		{ Size = UDim2.fromScale(1, 1), Parent = settingsPanel },
		{ Kit.list("y", 10), Kit.padding(0, 10, 10, 0) }
	)
	self:_buildSettings(settingsScroll)

	-- Footer ------------------------------------------------------------------------------
	local footer = Kit.panel({
		Name = "Footer",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 24, 1, -14),
		Size = UDim2.new(1, -48, 0, 66),
		Parent = frame,
	}, { Kit.padding(10, 14, 10, 14) })
	self.status = Kit.text({
		text = "",
		style = "body",
		font = "fontBold",
		tone = "textDim",
		Size = UDim2.new(0.34, 0, 1, 0),
		Parent = footer,
	})
	local buttons = Kit.frame({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0.66, 0, 1, 0),
		Parent = footer,
	}, { Kit.list("x", 8, "Right", "Center") })
	self.rigPlayerButton = Kit.button({
		text = "Rig a player",
		emoji = "🤡",
		Size = UDim2.fromOffset(150, 46),
		Parent = buttons,
		order = 1,
		onClick = function()
			ChaosMenu.rigPlayer(App)
		end,
	})
	self.rigServerButton = Kit.button({
		text = ("RIG SERVER · %d R$"):format(Config.Products.ServerRig.price),
		emoji = "🎰",
		variant = "danger",
		Size = UDim2.fromOffset(200, 46),
		Parent = buttons,
		order = 2,
		onClick = function()
			ChaosMenu.serverRig(App)
		end,
	})
	self.readyButton = Kit.button({
		text = "Ready",
		emoji = "✅",
		variant = "success",
		Size = UDim2.fromOffset(130, 46),
		Parent = buttons,
		order = 3,
		onClick = function()
			self:toggleReady()
		end,
	})
	self.startButton = Kit.button({
		text = "START MATCH",
		emoji = "▶",
		variant = "primary",
		textSize = 18,
		Size = UDim2.fromOffset(190, 46),
		Parent = buttons,
		order = 4,
		onClick = function(button)
			Kit.busy(button, true, "Starting…")
			local ok, err = Net.request(Net.Actions.StartMatch, {})
			Kit.busy(button, false)
			if not ok then
				App.toast(err, "error")
			end
		end,
	})
	Anim.pulse(Anim.scaleOf(self.startButton), "Scale", 1, 1.04, 1.4)

	App.layoutChanged:Connect(function(compact)
		self:_layout(compact)
	end)
	self:_layout(App.compact)

	Store.changed:Connect(function(key)
		if key == "lobby" and frame.Visible then
			self:render()
		end
	end)
	return self
end

function LobbyRoom:_layout(compact: boolean)
	if compact then
		self.playersPanel.Size = UDim2.new(0.5, -6, 1, 0)
		self.settingsPanel.Size = UDim2.new(0.5, -6, 1, 0)
		self.memberGrid:FindFirstChildOfClass("UIGridLayout").CellSize = UDim2.fromOffset(130, 164)
	else
		self.playersPanel.Size = UDim2.new(0.58, -10, 1, 0)
		self.settingsPanel.Size = UDim2.new(0.42, -10, 1, 0)
		self.memberGrid:FindFirstChildOfClass("UIGridLayout").CellSize = UDim2.fromOffset(150, 176)
	end
end

local function sectionTitle(parent, text: string, order: number)
	return Kit.text({
		text = text,
		style = "small",
		font = "fontBold",
		tone = "textDim",
		Parent = parent,
		order = order,
	})
end

local function toggleRow(parent, label: string, hint: string, order: number, onChange)
	local row = Kit.frame({ Size = UDim2.new(1, 0, 0, 44), LayoutOrder = order, Parent = parent })
	Kit.text({ text = label, style = "body", font = "fontBold", Size = UDim2.new(1, -70, 0, 22), Parent = row })
	Kit.text({
		text = hint,
		style = "tiny",
		tone = "textFaint",
		Size = UDim2.new(1, -70, 0, 16),
		Position = UDim2.fromOffset(0, 22),
		Parent = row,
	})
	local toggle = Kit.toggle(false, onChange, { Parent = row })
	toggle.frame.AnchorPoint = Vector2.new(1, 0.5)
	toggle.frame.Position = UDim2.new(1, 0, 0.5, 0)
	return toggle
end

function LobbyRoom:_update(patch)
	task.spawn(function()
		local ok, err = Net.request(Net.Actions.UpdateLobby, { settings = patch })
		if not ok then
			self.App.toast(err, "error")
			self:render()
		end
	end)
end

function LobbyRoom:_buildSettings(parent)
	Kit.text({ text = "Match settings", style = "h2", Parent = parent, order = 0 })
	self.hostNote = Kit.text({ text = "", style = "tiny", tone = "textFaint", Parent = parent, order = 1 })

	sectionTitle(parent, "DIFFICULTY", 2)
	local difficultyOptions = {}
	for _, key in Difficulty.Selectable do
		table.insert(difficultyOptions, { value = key, label = SHORT_NAMES[key] })
	end
	self.controls.difficulty = Kit.segmented(difficultyOptions, "Easy", function(value)
		self:_update({ difficulty = value })
	end, { Parent = parent, order = 3, textSize = 12, Size = UDim2.new(1, 0, 0, 40) })
	self.difficultyHint = Kit.text({
		text = "",
		style = "tiny",
		tone = "textDim",
		Size = UDim2.new(1, 0, 0, 30),
		Parent = parent,
		order = 4,
	})

	sectionTitle(parent, "TIMER", 5)
	self.controls.timer = Kit.segmented(
		{
			{ value = "120", label = "2 min" },
			{ value = "300", label = "5 min" },
			{ value = "unlimited", label = "∞ Unlimited" },
			{ value = "custom", label = "Custom" },
		},
		"300",
		function(value)
			self:_update({ timer = value })
		end,
		{ Parent = parent, order = 6 }
	)
	local customRow = Kit.frame(
		{ Size = UDim2.new(1, 0, 0, 40), LayoutOrder = 7, Parent = parent },
		{ Kit.list("x", 8, "Left", "Center") }
	)
	self.customRow = customRow
	Kit.text({
		text = "Custom time (seconds):",
		style = "small",
		Size = UDim2.fromOffset(170, 30),
		Parent = customRow,
		order = 1,
	})
	self.customBox = Kit.input({
		text = "180",
		Size = UDim2.fromOffset(90, 36),
		order = 2,
		Parent = customRow,
		font = "fontMono",
		onSubmit = function(text)
			local seconds = tonumber(text)
			if
				not seconds
				or seconds % 1 ~= 0
				or seconds < Config.Race.CustomTimerMin
				or seconds > Config.Race.CustomTimerMax
			then
				self.App.toast(
					("Enter whole seconds between %d and %d."):format(
						Config.Race.CustomTimerMin,
						Config.Race.CustomTimerMax
					),
					"error"
				)
				self:render()
				return
			end
			self:_update({ customSeconds = seconds, timer = "custom" })
		end,
	})
	self.customPreview = Kit.text({
		text = "",
		style = "small",
		tone = "textDim",
		Size = UDim2.fromOffset(80, 30),
		Parent = customRow,
		order = 3,
	})

	sectionTitle(parent, "ROUNDS", 8)
	local roundRow = Kit.frame(
		{ Size = UDim2.new(1, 0, 0, 44), LayoutOrder = 9, Parent = parent },
		{ Kit.list("x", 8, "Left", "Center") }
	)
	self.roundMinus = Kit.iconButton("−", function()
		self:_stepRounds(-1)
	end, { Parent = roundRow, order = 1 })
	self.roundLabel = Kit.text({
		text = "3 rounds",
		style = "h3",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.fromOffset(130, 36),
		Parent = roundRow,
		order = 2,
	})
	self.roundPlus = Kit.iconButton("+", function()
		self:_stepRounds(1)
	end, { Parent = roundRow, order = 3 })
	self.roundUnlimited = Kit.button({
		text = "∞ Unlimited",
		Size = UDim2.fromOffset(130, 40),
		Parent = roundRow,
		order = 4,
		onClick = function()
			self:_update({ rounds = 0 })
		end,
	})

	sectionTitle(parent, "VISIBILITY", 10)
	self.controls.showMeters = toggleRow(
		parent,
		"Show player meters",
		"Everyone sees opponents' Freezing…Burning status",
		11,
		function(value)
			self:_update({ showMeters = value })
		end
	)
	self.controls.showPages = toggleRow(
		parent,
		"Show current pages",
		"Everyone sees which article opponents are on",
		12,
		function(value)
			self:_update({ showPages = value })
		end
	)
	self.controls.allowChaos = toggleRow(
		parent,
		"Allow targeted chaos",
		"Lets players rig each other with 🤡 effects",
		13,
		function(value)
			self:_update({ allowChaos = value })
		end
	)
	self.controls.isPublic = toggleRow(parent, "Public lobby", "Listed in the lobby browser", 14, function(value)
		task.spawn(function()
			local ok, err = Net.request(Net.Actions.UpdateLobby, { isPublic = value })
			if not ok then
				self.App.toast(err, "error")
			end
		end)
	end)
end

function LobbyRoom:_stepRounds(delta: number)
	local lobby = Store.lobby
	if not lobby then
		return
	end
	local options = {}
	for _, value in Config.Race.RoundOptions do
		if value > 0 then
			table.insert(options, value)
		end
	end
	local current = lobby.settings.rounds
	local index = table.find(options, current) or (delta > 0 and 0 or #options + 1)
	index = math.clamp(index + delta, 1, #options)
	self:_update({ rounds = options[index] })
end

function LobbyRoom:_memberCard(member, index: number, lobby)
	local me = Players.LocalPlayer.UserId
	local card = Kit.panel(
		{ Name = tostring(member.userId), LayoutOrder = index, Parent = self.memberGrid },
		{ Kit.padding(10), Kit.list("y", 4, "Center", "Top") },
		member.userId == me and "surface2" or "surface"
	)
	if member.look and member.look.vip then
		Kit.stroke("gold", 2, 0.1).Parent = card
	end
	local avatarHolder = Kit.frame({ Size = UDim2.fromOffset(70, 70), LayoutOrder = 1, Parent = card })
	Kit.avatar(member.userId, 70, member.look, { Parent = avatarHolder })
	if member.isHost then
		Kit.text({
			text = "👑",
			size = 24,
			Size = UDim2.fromOffset(30, 30),
			Position = UDim2.fromOffset(46, -8),
			Parent = avatarHolder,
		})
	end
	Kit.nameBlock(member.displayName, member.look, {
		Parent = card,
		order = 2,
		hAlign = "Center",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 36),
		nameSize = 15,
	})
	Kit.chip(
		member.rank.emoji .. " " .. member.rank.name,
		nil,
		{ Parent = card, order = 3, height = 20, textSize = 11 }
	)
	local readyText = lobby.isPublic and (member.ready and "✅ Ready" or "⏳ Not ready")
		or (member.isHost and "Host" or "")
	Kit.text({
		text = readyText,
		style = "tiny",
		tone = member.ready and "success" or "textFaint",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 16),
		Parent = card,
		order = 4,
	})
	Kit.hoverable(card, function()
		self:_memberMenu(member, lobby)
	end)
	Anim.punchIn(card, 0.9)
end

function LobbyRoom:_memberMenu(member, lobby)
	local App = self.App
	local me = Players.LocalPlayer.UserId
	local isHost = lobby.hostId == me
	App.modal({
		title = member.displayName,
		width = 380,
		build = function(body, close)
			Kit.button({
				text = "View profile",
				emoji = "👤",
				Size = UDim2.new(1, 0, 0, 44),
				Parent = body,
				onClick = function()
					close()
					App.show("Profile", { userId = member.userId })
				end,
			})
			if member.userId ~= me then
				Kit.button({
					text = "Rig this player",
					emoji = "🤡",
					Size = UDim2.new(1, 0, 0, 44),
					Parent = body,
					onClick = function()
						close()
						ChaosMenu.rigPlayer(App, member.userId)
					end,
				})
			end
			if isHost and member.userId ~= me then
				Kit.button({
					text = "Make host",
					emoji = "👑",
					Size = UDim2.new(1, 0, 0, 44),
					Parent = body,
					onClick = function()
						close()
						App.request(Net.Actions.TransferHost, { userId = member.userId })
					end,
				})
				Kit.button({
					text = "Remove from lobby",
					emoji = "🚪",
					variant = "danger",
					Size = UDim2.new(1, 0, 0, 44),
					Parent = body,
					onClick = function()
						close()
						App.request(Net.Actions.KickPlayer, { userId = member.userId })
					end,
				})
			end
		end,
		buttons = { { text = "Close" } },
	})
end

function LobbyRoom:render()
	local lobby = Store.lobby
	if not lobby then
		return
	end
	local me = Players.LocalPlayer.UserId
	local isHost = lobby.hostId == me
	local settings = lobby.settings

	self.nameLabel.Text = lobby.name
	self.visibilityChip.Text = lobby.isPublic and "🌐 Public" or "🔒 Private"
	self.codeLabel.Text = lobby.code
	self.playersTitle.Text = ("Players  %d/%d"):format(#lobby.members, lobby.maxPlayers)

	for _, child in self.memberGrid:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	for index, member in lobby.members do
		self:_memberCard(member, index, lobby)
	end

	-- Settings
	self.hostNote.Text = isHost and "You're the host — changes apply to the next match."
		or "Only the host can change these."
	self.controls.difficulty.set(settings.difficulty)
	self.difficultyHint.Text = Difficulty.get(settings.difficulty).description
	self.controls.timer.set(settings.timer)
	self.customRow.Visible = settings.timer == "custom"
	self.customBox.Text = tostring(settings.customSeconds)
	self.customPreview.Text = "= " .. Format.clock(settings.customSeconds)
	self.roundLabel.Text = settings.rounds == 0 and "∞ Unlimited"
		or (settings.rounds .. (settings.rounds == 1 and " round" or " rounds"))
	self.controls.showMeters.set(settings.showMeters)
	self.controls.showPages.set(settings.showPages)
	self.controls.allowChaos.set(settings.allowChaos)
	self.controls.isPublic.set(lobby.isPublic)
	for key, control in self.controls do
		control.setEnabled(isHost and not (key == "isPublic" and (lobby.standing or lobby.solo)))
	end
	self.customBox.TextEditable = isHost
	for _, button in { self.roundMinus, self.roundPlus, self.roundUnlimited } do
		Kit.setDisabled(button, not isHost)
	end

	-- Footer
	local myReady = false
	for _, member in lobby.members do
		if member.userId == me then
			myReady = member.ready
		end
	end
	self.readyButton.Visible = lobby.isPublic and lobby.state == "Waiting"
	self.readyButton.Text = myReady and "✅  Ready!" or "⏳  Ready up"
	Theme.bind(self.readyButton, {
		BackgroundColor3 = myReady and "success" or "surface2",
		TextColor3 = myReady and function()
			return Color3.new(1, 1, 1)
		end or "text",
	})
	self.startButton.Visible = isHost and lobby.state == "Waiting"
	self.rigPlayerButton.Visible = settings.allowChaos and #lobby.members > 1

	local status
	if lobby.state == "InMatch" then
		local match = lobby.match
		status = ("🏁 Match in progress%s — you'll join at the next round."):format(
			match and (" · round " .. match.round) or ""
		)
	elseif lobby.autoStartAt then
		status = "🚀 Everyone's ready — starting soon!"
	elseif isHost then
		status = #lobby.members > 1 and "👑 Start whenever you're ready."
			or "👑 Invite friends, or start a solo match."
	elseif lobby.isPublic then
		status = lobby.hostId and "Ready up! The race starts when everyone is ready or the host starts it."
			or "Waiting for players…"
	else
		status = "⏳ Waiting for the host to start…"
	end
	self.status.Text = status
end

function LobbyRoom:toggleReady()
	local lobby = Store.lobby
	if not lobby then
		return
	end
	local me = Players.LocalPlayer.UserId
	local ready = false
	for _, member in lobby.members do
		if member.userId == me then
			ready = member.ready
		end
	end
	task.spawn(function()
		local ok, err = Net.request(Net.Actions.SetReady, { ready = not ready })
		if not ok then
			self.App.toast(err, "error")
		elseif not ready then
			Sound.play("tempUp")
		end
	end)
end

function LobbyRoom:invite()
	local lobby = Store.lobby
	if not lobby then
		return
	end
	local player = Players.LocalPlayer
	local ok, canInvite = pcall(SocialService.CanSendGameInviteAsync, SocialService, player)
	if ok and canInvite then
		local options = Instance.new("ExperienceInviteOptions")
		options.PromptMessage = ("Race me in Wiki Race! Lobby code: %s"):format(lobby.code)
		options.LaunchData = "lobby:" .. lobby.code
		pcall(SocialService.PromptGameInvite, SocialService, player, options)
	else
		self.App.toast(("Share this code with friends: %s"):format(lobby.code), "info")
	end
end

function LobbyRoom:leave()
	task.spawn(function()
		Net.request(Net.Actions.LeaveLobby, {})
	end)
	Store.set("lobby", nil)
	self.App.show("Menu")
end

function LobbyRoom:show()
	self:render()
end

return LobbyRoom
