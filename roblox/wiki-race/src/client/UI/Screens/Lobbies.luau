-- Public lobby browser (this server + other servers), plus Create Lobby and Join-with-Code.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Difficulty = require(Shared.Difficulty)
local Format = require(Shared.Format)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Anim = require(UI.Anim)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)

local Lobbies = {}
Lobbies.__index = Lobbies

function Lobbies.new(App)
	local self = setmetatable({ App = App }, Lobbies)
	local frame = Kit.frame({ Name = "Lobbies", Size = UDim2.fromScale(1, 1), Parent = App.root })
	self.frame = frame

	local header = Kit.frame(
		{ Size = UDim2.new(1, -48, 0, 56), Position = UDim2.fromOffset(24, 16), Parent = frame },
		{ Kit.list("x", 10, "Left", "Center") }
	)
	Kit.iconButton("←", function()
		App.show("Menu")
	end, { Parent = header, order = 1 })
	Kit.text({ text = "Lobbies", style = "title", Size = UDim2.fromOffset(200, 44), Parent = header, order = 2 })
	local spacer = Kit.frame({ Size = UDim2.new(1, -760, 0, 1), LayoutOrder = 3, Parent = header })
	local _ = spacer
	self.codeBox = Kit.input({
		placeholder = "Lobby code",
		Size = UDim2.fromOffset(150, 44),
		order = 4,
		Parent = header,
		font = "fontMono",
	})
	Kit.button({
		text = "Join",
		emoji = "🔑",
		Size = UDim2.fromOffset(100, 44),
		Parent = header,
		order = 5,
		onClick = function()
			self:joinCode(self.codeBox.Text)
		end,
	})
	Kit.button({
		text = "Create",
		emoji = "➕",
		variant = "primary",
		Size = UDim2.fromOffset(120, 44),
		Parent = header,
		order = 6,
		onClick = function()
			self:openCreate()
		end,
	})
	Kit.iconButton("⟳", function()
		self:refresh(true)
	end, { Parent = header, order = 7 })

	local list = Kit.scroll(
		{ Name = "List", Size = UDim2.new(1, -48, 1, -100), Position = UDim2.fromOffset(24, 84), Parent = frame },
		{ Kit.list("y", 8), Kit.padding(2, 8, 12, 2) }
	)
	self.list = list
	self.empty = Kit.text({
		text = "",
		style = "h3",
		tone = "textDim",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 80),
		Parent = list,
		order = 9999,
	})

	Store.changed:Connect(function(key)
		if key == "lobbies" and frame.Visible then
			self:render(Store.lobbies)
		end
	end)
	return self
end

function Lobbies:show()
	self:refresh(false)
end

function Lobbies:refresh(explicit: boolean)
	self.empty.Text = "Loading lobbies…"
	task.spawn(function()
		local ok, data = Net.request(Net.Actions.ListLobbies, {})
		if ok then
			Store.set("lobbies", data)
			self:render(data)
		else
			self.empty.Text = "Couldn't load lobbies. Tap ⟳ to retry."
			if explicit then
				self.App.toast(data, "error")
			end
		end
	end)
end

function Lobbies:render(lobbies)
	for _, child in self.list:GetChildren() do
		if child:IsA("GuiObject") and child ~= self.empty then
			child:Destroy()
		end
	end
	self.empty.Text = #lobbies == 0 and "No public lobbies right now. Create one!" or ""
	for index, lobby in lobbies do
		local def = Difficulty.get(lobby.difficulty)
		local row = Kit.panel(
			{ Name = "Lobby", Size = UDim2.new(1, 0, 0, 74), LayoutOrder = index, Parent = self.list },
			{ Kit.padding(12, 16, 12, 16) }
		)
		Kit.text({
			text = lobby.name,
			style = "h3",
			truncate = true,
			wrap = false,
			Size = UDim2.new(0.45, 0, 0, 24),
			Parent = row,
		})
		local meta = Kit.frame(
			{ Position = UDim2.fromOffset(0, 28), Size = UDim2.new(0.7, 0, 0, 24), Parent = row },
			{ Kit.list("x", 6, "Left", "Center") }
		)
		Kit.chip(def.emoji .. " " .. def.name, def.color, { Parent = meta, order = 1 })
		Kit.chip("🔁 " .. Format.roundsLabel(lobby.rounds) .. " rounds", nil, { Parent = meta, order = 2 })
		Kit.chip("⏱ " .. Format.timerLabel(lobby.timer, lobby.customSeconds), nil, { Parent = meta, order = 3 })
		local stateText = lobby.state == "InMatch"
				and ("🏁 Racing" .. (lobby.match and (" · round " .. lobby.match.round) or ""))
			or "🟢 Waiting"
		Kit.chip(stateText, nil, { Parent = meta, order = 4 })
		if lobby.remote then
			Kit.chip("🌐 Other server", nil, { Parent = meta, order = 5 })
		end
		local count = Kit.text({
			text = ("👥 %d/%d"):format(lobby.count, lobby.max),
			style = "h3",
			align = Enum.TextXAlignment.Right,
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -140, 0.5, 0),
			Size = UDim2.fromOffset(90, 30),
			Parent = row,
		})
		local _ = count
		local full = lobby.count >= lobby.max
		local join = Kit.button({
			text = full and "Full" or "Join",
			variant = full and "secondary" or "primary",
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, 0, 0.5, 0),
			Size = UDim2.fromOffset(120, 44),
			Parent = row,
			onClick = function(button)
				if lobby.remote then
					self:joinCode(lobby.code)
				else
					Kit.busy(button, true, "Joining…")
					local ok, data = Net.request(Net.Actions.JoinLobby, { lobbyId = lobby.id })
					Kit.busy(button, false)
					if ok then
						Store.set("lobby", data)
						self.App.show("LobbyRoom")
					else
						self.App.toast(data, "error")
						self:refresh(false)
					end
				end
			end,
		})
		Kit.setDisabled(join, full)
		Anim.slideIn(row, UDim2.fromOffset(40, 0), 0.35, math.min(index, 10) * 0.03)
	end
end

function Lobbies:joinCode(code: string?)
	code = (code or ""):upper():gsub("[^%w]", "")
	if #code ~= Config.Lobby.CodeLength then
		self.App.toast(("Lobby codes are %d characters."):format(Config.Lobby.CodeLength), "error")
		return
	end
	local ok, data = self.App.request(Net.Actions.JoinLobby, { code = code }, "Joining lobby " .. code .. "…")
	if ok and data then
		if data.teleporting then
			self.App.loading("Teleporting to that lobby's server…")
		else
			Store.set("lobby", data)
			self.App.show("LobbyRoom")
		end
	end
end

function Lobbies:openJoinCode()
	local box
	self.App.modal({
		title = "🔑 Join with code",
		build = function(body)
			Kit.text({
				text = "Ask your friend for their 6-character lobby code.",
				style = "small",
				tone = "textDim",
				Parent = body,
				ZIndex = 82,
			})
			box = Kit.input({ placeholder = "e.g. K7QX2M", Parent = body, font = "fontMono", textSize = 22 })
			box.ZIndex = 83
			box.TextXAlignment = Enum.TextXAlignment.Center
		end,
		buttons = {
			{ text = "Cancel" },
			{
				text = "Join",
				variant = "primary",
				onClick = function(close)
					close()
					self:joinCode(box.Text)
				end,
			},
		},
	})
end

function Lobbies:openCreate()
	local nameBox
	local visibility = "private"
	self.App.modal({
		title = "➕ Create a lobby",
		build = function(body)
			nameBox = Kit.input({ placeholder = "Lobby name (optional)", Parent = body })
			nameBox.ZIndex = 83
			Kit.text({ text = "Who can join?", style = "small", font = "fontBold", Parent = body, ZIndex = 82 })
			local seg = Kit.segmented(
				{
					{ value = "private", label = "🔒 Private (code / invite)" },
					{ value = "public", label = "🌐 Public (listed)" },
				},
				visibility,
				function(value)
					visibility = value
				end,
				{ Parent = body }
			)
			seg.frame.ZIndex = 83
			Kit.text({
				text = "You'll be the host: pick difficulty, timer, rounds and visibility options in the lobby.",
				style = "tiny",
				tone = "textFaint",
				Size = UDim2.new(1, 0, 0, 30),
				Parent = body,
				ZIndex = 82,
			})
		end,
		buttons = {
			{ text = "Cancel" },
			{
				text = "Create",
				variant = "primary",
				onClick = function(close)
					close()
					local ok, data = self.App.request(
						Net.Actions.CreateLobby,
						{ name = nameBox.Text ~= "" and nameBox.Text or nil, isPublic = visibility == "public" },
						"Creating lobby…"
					)
					if ok then
						Store.set("lobby", data)
						self.App.show("LobbyRoom")
					end
				end,
			},
		},
	})
end

return Lobbies
