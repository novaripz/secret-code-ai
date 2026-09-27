-- Serves page photos. Photos live in 1024×1024 sprite atlases (16 tiles of 256 px) uploaded to
-- Roblox by tools/images/upload_atlases.py. Decal ids are resolved to image ids on the server
-- with InsertService (works for assets owned by the game's creator), then cached.

local InsertService = game:GetService("InsertService")

local Images = script.Parent.Parent.Images
local Manifest = require(Images.Manifest)
local AssetIds = require(Images.AssetIds)

local ImageService = {}
ImageService.resolved = {} -- atlas index → "rbxassetid://…"
ImageService.photos = Manifest.photos or {}

local function resolveDecal(decalId: number): string?
	local ok, model = pcall(InsertService.LoadAsset, InsertService, decalId)
	if not ok or not model then
		return nil
	end
	local texture
	for _, child in model:GetDescendants() do
		if child:IsA("Decal") or child:IsA("Texture") then
			texture = child.Texture
			break
		end
	end
	model:Destroy()
	return texture
end

function ImageService.init()
	for index, entry in AssetIds do
		if type(entry) == "table" and entry.image then
			ImageService.resolved[index] = "rbxassetid://" .. tostring(entry.image)
		end
	end
	task.spawn(function()
		for index, entry in AssetIds do
			if type(entry) == "table" and entry.decal and not ImageService.resolved[index] then
				ImageService.resolved[index] = resolveDecal(entry.decal)
				task.wait(0.05)
			end
		end
	end)
end

-- photoResolver for WikiRepository: node → { image, x, y, size, credit } or nil.
function ImageService.resolve(node)
	local photo = node.photo
	if not photo then
		return nil
	end
	local image = ImageService.resolved[photo.atlas]
	if not image then
		return nil
	end
	local size = Manifest.tileSize or 256
	local perRow = Manifest.perRow or 4
	local slot = photo.slot - 1
	return {
		image = image,
		x = (slot % perRow) * size,
		y = (slot // perRow) * size,
		size = size,
		credit = photo.credit,
	}
end

return ImageService
