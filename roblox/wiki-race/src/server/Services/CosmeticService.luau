-- Cosmetic ownership, purchases (Wiki Coins) and equipping. Purely visual: nothing here can
-- affect race calculations.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Catalog = require(Shared.Catalog)
local Net = require(Shared.Net)
local Router = require(script.Parent.Router)
local DataService = require(script.Parent.DataService)
local MonetizationService = require(script.Parent.MonetizationService)
local Validate = require(script.Parent.Validate)

local CosmeticService = {}

function CosmeticService.owns(player: Player, itemId: string): boolean
	local item = Catalog.ById[itemId]
	local data = DataService.get(player)
	if not item or not data then
		return false
	end
	if item.requires then
		return MonetizationService.ownsPass(player, item.requires)
	end
	if item.achievement then
		return data.achievements[item.achievement] ~= nil
	end
	if item.price == 0 then
		return true
	end
	return data.owned[itemId] == true
end

-- Equipped items the player no longer owns fall back to the slot default.
function CosmeticService.equipped(player: Player)
	local data = DataService.get(player)
	local result = Catalog.defaults()
	if not data then
		return result
	end
	for slot, itemId in data.equipped do
		local item = Catalog.ById[itemId]
		if item and item.slot == slot and CosmeticService.owns(player, itemId) then
			result[slot] = itemId
		end
	end
	return result
end

-- What OTHER players see: frame, title, badge, victory/podium effects and VIP flag.
function CosmeticService.look(player: Player)
	local equipped = CosmeticService.equipped(player)
	local title = Catalog.ById[equipped.title]
	local badge = Catalog.ById[equipped.badge]
	return {
		frame = equipped.frame,
		title = title and title.text or nil,
		badge = badge and badge.glyph or nil,
		victory = equipped.victory,
		podium = equipped.podium,
		vip = MonetizationService.ownsPass(player, "VIP"),
	}
end

function CosmeticService.addCoins(player: Player, amount: number)
	if amount <= 0 then
		return
	end
	DataService.update(player, function(data)
		data.coins += math.floor(amount)
	end)
end

function CosmeticService.init()
	DataService.addSnapshotProvider(function(player, snap)
		snap.equipped = CosmeticService.equipped(player)
		local owned = {}
		for _, item in Catalog.Items do
			if CosmeticService.owns(player, item.id) then
				owned[item.id] = true
			end
		end
		snap.ownedAll = owned
	end)

	for key, product in Config.Products do
		if product.coins then
			MonetizationService.registerProduct(key, function(player)
				CosmeticService.addCoins(player, product.coins)
				Router.toast(
					player,
					("+%d Wiki Coins! Thanks for supporting Wiki Race."):format(product.coins),
					"success"
				)
				return true
			end)
		end
	end

	Router.on(Net.Actions.EquipItem, function(player, payload)
		local itemId = Validate.string(payload.itemId, 40)
		local item = itemId and Catalog.ById[itemId]
		if not item then
			return nil, "Unknown item"
		end
		if not CosmeticService.owns(player, itemId) then
			return nil, "You don't own that yet"
		end
		DataService.update(player, function(data)
			data.equipped[item.slot] = itemId
		end)
		return CosmeticService.equipped(player)
	end, { rate = 4, burst = 10 })

	Router.on(Net.Actions.BuyItem, function(player, payload)
		local itemId = Validate.string(payload.itemId, 40)
		local item = itemId and Catalog.ById[itemId]
		local data = DataService.get(player)
		if not item or not data then
			return nil, "Unknown item"
		end
		if item.requires then
			return nil, "This item comes with the " .. Config.GamePasses[item.requires].name .. " pass"
		end
		if item.achievement then
			return nil, "Unlock this with an achievement"
		end
		if CosmeticService.owns(player, itemId) then
			return nil, "Already owned"
		end
		if data.coins < item.price then
			return nil, ("You need %d more Wiki Coins"):format(item.price - data.coins)
		end
		DataService.update(player, function(profile)
			profile.coins -= item.price
			profile.owned[itemId] = true
			profile.equipped[item.slot] = itemId
		end)
		task.spawn(DataService.saveNow, player)
		return { itemId = itemId, coins = data.coins }
	end, { rate = 2, burst = 4 })
end

return CosmeticService
