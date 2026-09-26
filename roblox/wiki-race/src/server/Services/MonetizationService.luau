-- Game passes and developer products.
--
-- * Game pass ownership is checked on the server with UserOwnsGamePassAsync (cached), never
--   taken from the client.
-- * Developer products are granted only inside ProcessReceipt, idempotently: each PurchaseId is
--   recorded in the buyer's profile and saved before PurchaseGranted is returned.
-- * Other services register product handlers (e.g. ChaosService registers Server Rig), which
--   keeps this module free of gameplay logic.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Router = require(script.Parent.Router)
local DataService = require(script.Parent.DataService)
local Validate = require(script.Parent.Validate)

local MonetizationService = {}

local passCache = {} -- [userId] = { [passKey] = bool }
local productHandlers = {} -- [productKey] = fn(player, receiptInfo) -> granted
local productKeyById = {}

local function studioGrant(): boolean
	return RunService:IsStudio() and Config.Studio.GrantAllGamePasses
end

local function refreshPasses(player: Player)
	local owned = {}
	for key, pass in Config.GamePasses do
		if studioGrant() then
			owned[key] = true
		elseif pass.id and pass.id ~= 0 then
			local ok, result =
				pcall(MarketplaceService.UserOwnsGamePassAsync, MarketplaceService, player.UserId, pass.id)
			owned[key] = ok and result == true
		else
			owned[key] = false
		end
	end
	passCache[player.UserId] = owned
	DataService.markChanged(player)
end

function MonetizationService.ownsPass(player: Player, passKey: string): boolean
	local owned = passCache[player.UserId]
	if not owned then
		refreshPasses(player)
		owned = passCache[player.UserId]
	end
	return owned[passKey] == true
end

function MonetizationService.passesFor(player: Player)
	return passCache[player.UserId] or {}
end

function MonetizationService.registerProduct(productKey: string, handler)
	assert(Config.Products[productKey], "unknown product " .. productKey)
	productHandlers[productKey] = handler
end

local function grant(player: Player, productKey: string, purchaseId: string): boolean
	local handler = productHandlers[productKey]
	if not handler then
		warn("[WikiRace] No handler registered for product " .. productKey)
		return false
	end
	local ok, granted = pcall(handler, player, { PurchaseId = purchaseId, ProductKey = productKey })
	if not ok then
		warn(("[WikiRace] Product %s handler error: %s"):format(productKey, tostring(granted)))
		return false
	end
	return granted == true
end

local function processReceipt(receiptInfo)
	local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local data = DataService.waitFor(player, 15)
	if not data then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local purchaseId = tostring(receiptInfo.PurchaseId)
	if DataService.hasReceipt(player, purchaseId) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	local productKey = productKeyById[receiptInfo.ProductId]
	if not productKey then
		warn("[WikiRace] Receipt for unknown product id " .. tostring(receiptInfo.ProductId))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	if not grant(player, productKey, purchaseId) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	DataService.recordReceipt(player, purchaseId)
	if not DataService.saveNow(player) and DataService.isPersistent() then
		-- The grant is recorded in memory, so a retry won't double-grant; ask Roblox to retry.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

function MonetizationService.init()
	for key, product in Config.Products do
		if product.id and product.id ~= 0 then
			productKeyById[product.id] = key
		end
	end
	MarketplaceService.ProcessReceipt = processReceipt

	Players.PlayerAdded:Connect(refreshPasses)
	for _, player in Players:GetPlayers() do
		task.spawn(refreshPasses, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		passCache[player.UserId] = nil
	end)

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased then
			return
		end
		for key, pass in Config.GamePasses do
			if pass.id == passId then
				-- Re-verify with Roblox instead of trusting the event payload alone.
				task.spawn(function()
					refreshPasses(player)
					if MonetizationService.ownsPass(player, key) then
						Router.toast(player, ("%s unlocked! Enjoy your new cosmetics."):format(pass.name), "success")
					end
				end)
			end
		end
	end)

	DataService.addSnapshotProvider(function(player, snap)
		snap.passes = MonetizationService.passesFor(player)
	end)

	-- Studio-only: simulate a developer product purchase without real Robux, so every
	-- product flow can be tested before product IDs exist.
	Router.on(Net.Actions.DebugPurchase, function(player, payload)
		if not (RunService:IsStudio() and Config.Studio.AllowDebugPurchases) then
			return nil, "Not available"
		end
		local productKey = Validate.string(payload.product, 32)
		if not productKey or not Config.Products[productKey] then
			return nil, "Unknown product"
		end
		local purchaseId = "studio-" .. HttpService:GenerateGUID(false)
		if not grant(player, productKey, purchaseId) then
			return nil, "Purchase could not be applied"
		end
		DataService.recordReceipt(player, purchaseId)
		return true
	end, { rate = 1, burst = 3 })
end

return MonetizationService
