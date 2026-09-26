// Starter projects. Each one is a complete, valid Rojo project that passes
// the compatibility check with zero errors and zero warnings, so whatever the
// agent builds on top of it starts from a known-good state.
//
// Layout (Rojo mapping in default.project.json):
//   src/server   -> ServerScriptService.Server         server entry points
//   src/modules  -> ServerStorage.Modules              server-only modules (data, economy)
//   src/shared   -> ReplicatedStorage.Shared           modules both sides use, Remotes
//   src/config   -> ReplicatedStorage.Config           shared configuration
//   src/client   -> StarterPlayerScripts.Client        client entry + UI controllers
//   src/ui       -> StarterGui                         ScreenGuis (.model.json)
//   src/assets   -> ReplicatedStorage.Assets           Roblox models from the asset pipeline
//   src/workspace-> Workspace                          map geometry
//   assets/      -> not synced: 3D source files (glTF/GLB/OBJ), textures

export type ProjectKind = "roblox-experience" | "roblox-ui" | "roblox-system" | "roblox-plugin" | "roblox-asset" | "web-app";

export const PROJECT_KINDS: { kind: ProjectKind; label: string; description: string }[] = [
  { kind: "roblox-experience", label: "Roblox Experience", description: "A full game: server, client, UI, data, map" },
  { kind: "roblox-ui", label: "Roblox UI", description: "ScreenGuis with controllers and responsive layout" },
  { kind: "roblox-system", label: "Roblox System", description: "A reusable gameplay system (modules + remotes)" },
  { kind: "roblox-plugin", label: "Roblox Plugin", description: "A Studio plugin with a toolbar and dock widget" },
  { kind: "roblox-asset", label: "Roblox 3D Asset", description: "Models, props and kits for Studio" },
  { kind: "web-app", label: "Web App", description: "A browser app with HTML, CSS and JS" },
];

export function isRobloxKind(kind: ProjectKind): boolean {
  return kind.startsWith("roblox-");
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

function projectJson(name: string, opts: { workspace?: boolean } = {}) {
  const tree: Record<string, unknown> = {
    $className: "DataModel",
    ReplicatedStorage: {
      $className: "ReplicatedStorage",
      Shared: { $path: "src/shared" },
      Config: { $path: "src/config" },
      Assets: { $path: "src/assets" },
    },
    ServerScriptService: {
      $className: "ServerScriptService",
      Server: { $path: "src/server" },
    },
    ServerStorage: {
      $className: "ServerStorage",
      Modules: { $path: "src/modules" },
    },
    StarterPlayer: {
      $className: "StarterPlayer",
      StarterPlayerScripts: {
        $className: "StarterPlayerScripts",
        Client: { $path: "src/client" },
      },
    },
    StarterGui: { $className: "StarterGui", $path: "src/ui", $properties: { ResetPlayerGuiOnSpawn: false } },
    Lighting: {
      $className: "Lighting",
      $properties: {
        Ambient: [0.27, 0.27, 0.3],
        OutdoorAmbient: [0.5, 0.5, 0.55],
        Brightness: 2,
        ClockTime: 14.5,
        GlobalShadows: true,
      },
    },
    SoundService: { $className: "SoundService" },
  };
  if (opts.workspace !== false) {
    tree.Workspace = { $className: "Workspace", $path: "src/workspace", $properties: { Gravity: 196.2 } };
  }
  return json({ name, tree });
}

const REMOTES = (names: { name: string; kind?: "RemoteEvent" | "RemoteFunction" }[]) =>
  json({
    ClassName: "Folder",
    Children: names.map((n) => ({ Name: n.name, ClassName: n.kind ?? "RemoteEvent" })),
  });

const NET_MODULE = `--!strict
-- Typed access to the remotes defined in Shared/Remotes.model.json.
-- Every remote the game uses is declared there, so both sides agree on names
-- and the compatibility check can verify each FireServer has a listener.

local Remotes = script.Parent:WaitForChild("Remotes")

local Net = {}

function Net.event(name: string): RemoteEvent
	local remote = Remotes:WaitForChild(name, 10)
	assert(remote and remote:IsA("RemoteEvent"), \`Remote event "{name}" is not defined in Shared/Remotes\`)
	return remote :: RemoteEvent
end

function Net.func(name: string): RemoteFunction
	local remote = Remotes:WaitForChild(name, 10)
	assert(remote and remote:IsA("RemoteFunction"), \`Remote function "{name}" is not defined in Shared/Remotes\`)
	return remote :: RemoteFunction
end

return Net
`;

const GAME_CONFIG = `--!strict
-- Shared, read-only tuning values. Clients can read this, so it must never
-- contain secrets.

local GameConfig = table.freeze({
	DataStoreName = "PlayerData_v1",
	StartingCoins = 0,
	AutosaveInterval = 120,
})

return GameConfig
`;

const PLAYER_DATA = `--!strict
-- Persistent player data: loads on join, autosaves, saves on leave and on
-- shutdown, and mirrors values into leaderstats. Server-only (ServerStorage).

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Config.GameConfig)

export type Profile = {
	Coins: number,
}

local MAX_ATTEMPTS = 3
local store = DataStoreService:GetDataStore(GameConfig.DataStoreName)
local profiles: { [Player]: Profile } = {}

local PlayerData = {}

local function defaultProfile(): Profile
	return { Coins = GameConfig.StartingCoins }
end

local function retry<T>(label: string, fn: () -> T): (boolean, T?)
	for attempt = 1, MAX_ATTEMPTS do
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end
		warn(\`[PlayerData] {label} failed (attempt {attempt}/{MAX_ATTEMPTS}): {result}\`)
		task.wait(attempt)
	end
	return false, nil
end

local function keyFor(player: Player): string
	return \`player_{player.UserId}\`
end

local function mirror(player: Player, profile: Profile)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		leaderstats = Instance.new("Folder")
		leaderstats.Name = "leaderstats"
		leaderstats.Parent = player
	end
	local coins = leaderstats:FindFirstChild("Coins") :: IntValue?
	if not coins then
		local value = Instance.new("IntValue")
		value.Name = "Coins"
		value.Parent = leaderstats
		coins = value
	end
	(coins :: IntValue).Value = profile.Coins
end

function PlayerData.load(player: Player)
	local ok, stored = retry("load", function()
		return store:GetAsync(keyFor(player))
	end)
	if not ok then
		-- Never let a player play on a profile we might overwrite real data with.
		player:Kick("Could not load your data. Please rejoin.")
		return
	end
	local profile = defaultProfile()
	if typeof(stored) == "table" and typeof(stored.Coins) == "number" then
		profile.Coins = stored.Coins
	end
	profiles[player] = profile
	mirror(player, profile)
end

function PlayerData.save(player: Player)
	local profile = profiles[player]
	if not profile then
		return
	end
	retry("save", function()
		store:SetAsync(keyFor(player), profile)
		return true
	end)
end

function PlayerData.get(player: Player): Profile?
	return profiles[player]
end

function PlayerData.addCoins(player: Player, amount: number)
	local profile = profiles[player]
	if not profile or amount ~= amount then
		return
	end
	profile.Coins = math.max(0, profile.Coins + math.floor(amount))
	mirror(player, profile)
end

function PlayerData.start()
	Players.PlayerAdded:Connect(PlayerData.load)
	for _, player in Players:GetPlayers() do
		task.spawn(PlayerData.load, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		PlayerData.save(player)
		profiles[player] = nil
	end)
	game:BindToClose(function()
		for _, player in Players:GetPlayers() do
			task.spawn(PlayerData.save, player)
		end
		task.wait(3)
	end)
	task.spawn(function()
		while true do
			task.wait(GameConfig.AutosaveInterval)
			for _, player in Players:GetPlayers() do
				task.spawn(PlayerData.save, player)
			end
		end
	end)
end

return PlayerData
`;

const SERVER_MAIN = `--!strict
-- Server entry point. Starts server-only systems in order.

local ServerStorage = game:GetService("ServerStorage")

local Modules = ServerStorage:WaitForChild("Modules")
local PlayerData = require(Modules.PlayerData)

PlayerData.start()
`;

const CLIENT_MAIN = `--!strict
-- Client entry point. Starts UI controllers once the player's GUI exists.

local Players = game:GetService("Players")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local HudController = require(script.Parent.HudController)
local Notifications = require(script.Parent.Notifications)

HudController.start(player, playerGui)
Notifications.start()
`;

const HUD_CONTROLLER = `--!strict
-- Keeps the HUD's coin counter in sync with leaderstats.

local HudController = {}

function HudController.start(player: Player, playerGui: Instance)
	local hud = playerGui:WaitForChild("HUD")
	local label = hud:WaitForChild("TopBar"):WaitForChild("Coins") :: TextLabel

	local leaderstats = player:WaitForChild("leaderstats")
	local coins = leaderstats:WaitForChild("Coins") :: IntValue

	local function render()
		label.Text = \`🪙 {coins.Value}\`
	end
	coins.Changed:Connect(render)
	render()
end

return HudController
`;

function hudModel(title: string) {
  return json({
    ClassName: "ScreenGui",
    Properties: { ResetOnSpawn: false, IgnoreGuiInset: false, ZIndexBehavior: "Sibling" },
    Children: [
      {
        Name: "TopBar",
        ClassName: "Frame",
        Properties: {
          AnchorPoint: [0.5, 0],
          Position: [
            [0.5, 0],
            [0, 12],
          ],
          Size: [
            [0, 360],
            [0, 52],
          ],
          BackgroundColor3: [0.07, 0.08, 0.11],
          BackgroundTransparency: 0.15,
          BorderSizePixel: 0,
        },
        Children: [
          { Name: "Corner", ClassName: "UICorner", Properties: { CornerRadius: [0, 14] } },
          { Name: "Stroke", ClassName: "UIStroke", Properties: { Color: [1, 1, 1], Transparency: 0.85, Thickness: 1 } },
          {
            Name: "Padding",
            ClassName: "UIPadding",
            Properties: { PaddingLeft: [0, 16], PaddingRight: [0, 16] },
          },
          {
            Name: "Layout",
            ClassName: "UIListLayout",
            Properties: {
              FillDirection: "Horizontal",
              VerticalAlignment: "Center",
              HorizontalAlignment: "Left",
              SortOrder: "LayoutOrder",
              Padding: [0, 12],
            },
          },
          {
            Name: "Title",
            ClassName: "TextLabel",
            Properties: {
              LayoutOrder: 1,
              Size: [
                [0.6, 0],
                [1, 0],
              ],
              BackgroundTransparency: 1,
              Text: title,
              TextColor3: [1, 1, 1],
              TextSize: 20,
              TextXAlignment: "Left",
              FontFace: { Font: { family: "rbxasset://fonts/families/BuilderSans.json", weight: "Bold", style: "Normal" } },
            },
          },
          {
            Name: "Coins",
            ClassName: "TextLabel",
            Properties: {
              LayoutOrder: 2,
              Size: [
                [0.4, -12],
                [1, 0],
              ],
              BackgroundTransparency: 1,
              Text: "🪙 0",
              TextColor3: [1, 0.84, 0.35],
              TextSize: 20,
              TextXAlignment: "Right",
              FontFace: { Font: { family: "rbxasset://fonts/families/BuilderSans.json", weight: "SemiBold", style: "Normal" } },
            },
          },
        ],
      },
    ],
  });
}

const MAP_MODEL = json({
  ClassName: "Model",
  Children: [
    {
      Name: "Baseplate",
      ClassName: "Part",
      Properties: {
        Anchored: true,
        Size: [512, 4, 512],
        CFrame: { CFrame: { position: [0, -2, 0], orientation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] } },
        Color: [0.36, 0.4, 0.44],
        Material: "Concrete",
        TopSurface: "Smooth",
        BottomSurface: "Smooth",
      },
    },
    {
      Name: "SpawnLocation",
      ClassName: "SpawnLocation",
      Properties: {
        Anchored: true,
        Size: [12, 1, 12],
        CFrame: { CFrame: { position: [0, 0.5, 0], orientation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] } },
        Color: [0.36, 0.58, 1],
        Material: "SmoothPlastic",
        Neutral: true,
        Duration: 0,
        TopSurface: "Smooth",
        BottomSurface: "Smooth",
      },
    },
  ],
});

const ROKIT = `[tools]
rojo = "rojo-rbx/rojo@7.4.4"
`;

function readme(name: string, kind: ProjectKind): string {
  return `# ${name}

Generated by Roblox Builder as a ${kind} Rojo project.

## Open it in Roblox Studio

**Fastest:** download \`${name}.rbxlx\` from the Export panel and open it with
File > Open from File. Everything in this project is inside it.

**Live sync (recommended while developing):**

1. Install [Rokit](https://github.com/rojo-rbx/rokit) and run \`rokit install\` (pins Rojo 7.4).
2. Install the Rojo plugin in Studio (\`rojo plugin install\`).
3. Run \`rojo serve\` here, then press Connect in the Rojo plugin.

Edits you make in these files sync into Studio instantly.

## Layout

| Folder | In Studio | Purpose |
| --- | --- | --- |
| src/server | ServerScriptService.Server | server entry points |
| src/modules | ServerStorage.Modules | server-only modules (data, economy) |
| src/shared | ReplicatedStorage.Shared | modules both sides use, and Remotes |
| src/config | ReplicatedStorage.Config | shared configuration |
| src/client | StarterPlayerScripts.Client | client entry point and UI controllers |
| src/ui | StarterGui | ScreenGuis |
| src/assets | ReplicatedStorage.Assets | Roblox models from the asset pipeline |
| src/workspace | Workspace | map geometry |
| assets/ | (not synced) | 3D source files (glTF/GLB/OBJ) for Studio's 3D Importer |

## Enable API services for data saving

DataStores only work in Studio when *Game Settings > Security > Enable Studio
Access to API Services* is on, and only in a published place.
`;
}

const GITIGNORE = `*.rbxl
*.rbxlx.lock
*.rbxl.lock
sourcemap.json
node_modules/
`;

const SELENE = `std = "roblox"
`;

export function robloxTemplate(name: string, kind: ProjectKind): Record<string, string> {
  const safeName = name.replace(/[^\w -]/g, "").trim() || "Experience";
  const base: Record<string, string> = {
    "default.project.json": projectJson(safeName, { workspace: kind !== "roblox-ui" && kind !== "roblox-system" }),
    "rokit.toml": ROKIT,
    "selene.toml": SELENE,
    ".gitignore": GITIGNORE,
    "README.md": readme(safeName, kind),
    "src/shared/Remotes.model.json": REMOTES([{ name: "Notify" }]),
    "src/shared/Net.luau": NET_MODULE,
    "src/config/GameConfig.luau": GAME_CONFIG,
    "src/assets/init.meta.json": json({ className: "Folder" }),
    "src/modules/PlayerData.luau": PLAYER_DATA,
    "src/server/Main.server.luau": SERVER_MAIN,
    "src/client/Main.client.luau": CLIENT_MAIN,
    "src/client/HudController.luau": HUD_CONTROLLER,
    "src/client/Notifications.luau": NOTIFICATIONS_CLIENT,
    "src/ui/HUD.model.json": hudModel(safeName),
  };
  if (kind !== "roblox-ui" && kind !== "roblox-system") base["src/workspace/Map.model.json"] = MAP_MODEL;
  if (kind === "roblox-plugin") return pluginTemplate(safeName);
  return base;
}

const NOTIFICATIONS_CLIENT = `--!strict
-- Shows server notifications (sent with Net.event("Notify"):FireClient) as
-- core toasts.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")

local Net = require(ReplicatedStorage.Shared.Net)

local Notifications = {}

function Notifications.start()
	Net.event("Notify").OnClientEvent:Connect(function(title: unknown, text: unknown)
		if typeof(title) ~= "string" or typeof(text) ~= "string" then
			return
		end
		pcall(StarterGui.SetCore, StarterGui, "SendNotification", { Title = title, Text = text, Duration = 4 })
	end)
end

return Notifications
`;

function pluginTemplate(name: string): Record<string, string> {
  return {
    "default.project.json": json({ name, tree: { $path: "src" } }),
    "rokit.toml": ROKIT,
    "selene.toml": SELENE,
    ".gitignore": GITIGNORE,
    "README.md": `# ${name}\n\nA Roblox Studio plugin. Export \`${name}.rbxmx\` and save it into your Studio Plugins folder (Plugins > Plugins Folder), or run \`rojo build -o ${name}.rbxmx\` and do the same.\n`,
    "src/init.server.luau": `--!strict
-- ${name}: a toolbar button that toggles a dock widget.

local toolbar = plugin:CreateToolbar("${name}")
local button = toolbar:CreateButton("${name}", "Open ${name}", "rbxasset://textures/ui/GuiImagePlaceholder.png")
button.ClickableWhenViewportHidden = true

local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 320, 420, 240, 200)
local widget = plugin:CreateDockWidgetPluginGui("${name.replace(/\W/g, "")}Widget", info)
widget.Title = "${name}"

local Panel = require(script.Panel)
Panel.mount(widget)

button.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	button:SetActive(widget.Enabled)
end)
`,
    "src/init.meta.json": json({ properties: { RunContext: "Plugin" } }),
    "src/Panel.luau": `--!strict
local Panel = {}

function Panel.mount(parent: Instance)
	local frame = Instance.new("Frame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = Color3.fromRGB(30, 32, 38)
	frame.BorderSizePixel = 0

	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, -24, 0, 32)
	label.Position = UDim2.fromOffset(12, 12)
	label.BackgroundTransparency = 1
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.Text = "Ready"
	label.Parent = frame

	frame.Parent = parent
end

return Panel
`,
  };
}

export function webTemplate(name: string): Record<string, string> {
  return {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
    <link rel="stylesheet" href="src/styles.css" />
  </head>
  <body>
    <main class="app">
      <h1>${name}</h1>
      <p class="lede">Describe what this app should do, and the builder will make it.</p>
      <button id="counter" type="button">Clicked 0 times</button>
    </main>
    <script type="module" src="src/main.js"></script>
  </body>
</html>
`,
    "src/styles.css": `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f1115; color: #e8eaf0; }
.app { text-align: center; padding: 2rem; }
.lede { color: #9aa3b2; }
button { font: inherit; padding: .7rem 1.2rem; border-radius: .7rem; border: 1px solid #2b3140; background: #1a1f2b; color: inherit; cursor: pointer; }
button:hover { background: #222838; }
`,
    "src/main.js": `import { nextLabel } from "./counter.js";

const button = document.getElementById("counter");
let count = 0;
button.addEventListener("click", () => {
  count += 1;
  button.textContent = nextLabel(count);
});
`,
    "src/counter.js": `export function nextLabel(count) {
  return \`Clicked \${count} \${count === 1 ? "time" : "times"}\`;
}
`,
    "tests/counter.test.js": `import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLabel } from "../src/counter.js";

test("pluralises", () => {
  assert.equal(nextLabel(1), "Clicked 1 time");
  assert.equal(nextLabel(2), "Clicked 2 times");
});
`,
    "package.json": json({ name: name.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "app", private: true, type: "module", scripts: { test: "node --test" } }),
    "README.md": `# ${name}\n\nOpen index.html in a browser, or use the builder's live preview. Run tests with \`npm test\`.\n`,
  };
}

export function templateFor(name: string, kind: ProjectKind): Record<string, string> {
  return kind === "web-app" ? webTemplate(name) : robloxTemplate(name, kind);
}
