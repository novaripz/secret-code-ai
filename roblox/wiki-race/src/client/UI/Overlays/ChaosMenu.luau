-- Purchase flows for the chaos products: "Rig a Player" (pick target + effect) and the
-- server-wide "Server Rig". Validation happens on the server; this is presentation only.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Catalog = require(Shared.Catalog)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Net = require(UI.Parent.Core.Net)
local Store = require(UI.Parent.Core.Store)
local Sound = require(UI.Parent.Core.Sound)

local ChaosMenu = {}

function ChaosMenu.serverRig(App)
	App.modal({
		title = "🎰 RIG THE SERVER",
		width = 500,
		build = function(body)
			Kit.text({
				text = "Every race on this server is instantly forced into GIVE UP MODE: a brand-new absurd target, zero redos, maximum chaos.\n\nEveryone sees a giant SERVER RIGGED announcement with your name on it. It only lasts for the current round, and it never changes anyone's saved stats or lobby settings.",
				style = "body",
				tone = "textDim",
				Size = UDim2.new(1, 0, 0, 0),
				auto = Enum.AutomaticSize.Y,
				Parent = body,
			})
		end,
		buttons = {
			{ text = "Not today" },
			{
				text = ("Rig it — %d R$"):format(Config.Products.ServerRig.price),
				variant = "danger",
				width = 200,
				onClick = function(close)
					close()
					App.purchaseProduct("ServerRig")
				end,
			},
		},
	})
end

-- targets: optional list of { userId, displayName } (defaults to lobby members).
function ChaosMenu.rigPlayer(App, presetTarget: number?)
	local me = Players.LocalPlayer.UserId
	local candidates = {}
	for _, member in (Store.lobby and Store.lobby.members) or {} do
		if member.userId ~= me then
			table.insert(candidates, member)
		end
	end
	if #candidates == 0 then
		App.toast("Nobody to rig here — invite some friends!", "info")
		return
	end
	local selectedTarget = presetTarget or candidates[1].userId
	local selectedEffect = "clown"
	local credits = Store.profile and Store.profile.rigCredits or 0
	local hasJumpscares = App.hasPass("Jumpscares")

	App.modal({
		title = "🤡 Rig a player",
		width = 560,
		build = function(body)
			Kit.text({
				text = ("Harmless, short and very noticeable. Rig credits: %d · Jumpscare Pack: %s"):format(
					credits,
					hasJumpscares and "owned (free every 60s)" or "not owned"
				),
				style = "small",
				tone = "textDim",
				Parent = body,
			})
			Kit.text({ text = "Target", style = "small", font = "fontBold", Parent = body })
			local targetRow = Kit.frame(
				{ Size = UDim2.new(1, 0, 0, 44), Parent = body },
				{ Kit.list("x", 6, "Left", "Center") }
			)
			local targetButtons = {}
			local function paintTargets()
				for userId, button in targetButtons do
					Theme.bind(button, {
						BackgroundColor3 = userId == selectedTarget and "accent" or "surface2",
						TextColor3 = userId == selectedTarget and "accentText" or "text",
					})
				end
			end
			for index, member in candidates do
				targetButtons[member.userId] = Kit.button({
					text = member.displayName,
					Size = UDim2.fromOffset(130, 40),
					order = index,
					textSize = 14,
					Parent = targetRow,
					onClick = function()
						selectedTarget = member.userId
						paintTargets()
					end,
				})
			end
			paintTargets()
			Kit.text({ text = "Effect", style = "small", font = "fontBold", Parent = body })
			local grid = Kit.frame(
				{ Size = UDim2.new(1, 0, 0, 170), Parent = body },
				{ Kit.grid(UDim2.fromOffset(122, 76), 8) }
			)
			local effectCards = {}
			local function paintEffects()
				for id, card in effectCards do
					local stroke = card:FindFirstChild("Selected")
					if stroke then
						stroke.Enabled = id == selectedEffect
					end
				end
			end
			for index, effect in Catalog.ChaosEffects do
				local locked = effect.requires == "Jumpscares" and not hasJumpscares
				local card = Kit.panel(
					{ LayoutOrder = index, Parent = grid },
					{ Kit.padding(6), Kit.list("y", 2, "Center", "Center") }
				)
				local selectedStroke = Kit.stroke("accent", 3, 0)
				selectedStroke.Name = "Selected"
				selectedStroke.Enabled = false
				selectedStroke.Parent = card
				Kit.text({
					text = effect.emoji,
					size = 26,
					align = Enum.TextXAlignment.Center,
					Size = UDim2.new(1, 0, 0, 30),
					Parent = card,
					order = 1,
				})
				Kit.text({
					text = effect.name .. (locked and " 🔒" or ""),
					style = "tiny",
					font = "fontBold",
					align = Enum.TextXAlignment.Center,
					Size = UDim2.new(1, 0, 0, 28),
					Parent = card,
					order = 2,
				})
				effectCards[effect.id] = card
				Kit.hoverable(card, function()
					if locked then
						App.toast("Jumpscares need the Jumpscare Pack game pass.", "info")
						return
					end
					selectedEffect = effect.id
					paintEffects()
				end)
			end
			paintEffects()
			Kit.text({
				text = "Players who turned off incoming chaos can't be targeted. Jumpscares become a harmless warning for players who disabled them.",
				style = "tiny",
				tone = "textFaint",
				Size = UDim2.new(1, 0, 0, 30),
				Parent = body,
			})
		end,
		buttons = {
			{ text = "Cancel" },
			{
				text = "Rig!",
				emoji = "🤡",
				variant = "danger",
				width = 170,
				onClick = function(close)
					local ok, data =
						Net.request(Net.Actions.RigPlayer, { userId = selectedTarget, effect = selectedEffect })
					if not ok then
						App.toast(data, "error")
						return
					end
					close()
					if data and data.needsPurchase then
						Net.request(Net.Actions.SetRigIntent, { userId = selectedTarget, effect = selectedEffect })
						App.purchaseProduct("RigPlayer")
					elseif data and data.delivered then
						Sound.play("boing")
						if data.substituted then
							App.toast("They disabled jumpscares, so they got a dramatic warning instead.", "info")
						end
					end
				end,
			},
		},
	})
end

return ChaosMenu
