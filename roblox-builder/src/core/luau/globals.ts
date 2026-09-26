// What exists in a Roblox script's global environment, and what it means.

export const LUAU_GLOBALS = new Set([
  "assert",
  "error",
  "getmetatable",
  "setmetatable",
  "ipairs",
  "pairs",
  "next",
  "pcall",
  "xpcall",
  "print",
  "rawequal",
  "rawget",
  "rawset",
  "rawlen",
  "select",
  "tonumber",
  "tostring",
  "type",
  "typeof",
  "unpack",
  "require",
  "getfenv",
  "setfenv",
  "newproxy",
  "gcinfo",
  "collectgarbage",
  "_G",
  "_VERSION",
  "math",
  "string",
  "table",
  "coroutine",
  "bit32",
  "utf8",
  "os",
  "debug",
  "buffer",
  "vector",
]);

export const ROBLOX_GLOBALS = new Set([
  "game",
  "workspace",
  "script",
  "plugin",
  "shared",
  "task",
  "Instance",
  "Vector3",
  "Vector2",
  "Vector3int16",
  "Vector2int16",
  "CFrame",
  "Color3",
  "BrickColor",
  "UDim",
  "UDim2",
  "Rect",
  "Region3",
  "Region3int16",
  "Ray",
  "Enum",
  "TweenInfo",
  "NumberRange",
  "NumberSequence",
  "NumberSequenceKeypoint",
  "ColorSequence",
  "ColorSequenceKeypoint",
  "PhysicalProperties",
  "RaycastParams",
  "OverlapParams",
  "Random",
  "DateTime",
  "Axes",
  "Faces",
  "Font",
  "SharedTable",
  "PathWaypoint",
  "Path2DControlPoint",
  "CatalogSearchParams",
  "FloatCurveKey",
  "RotationCurveKey",
  "Content",
  "DockWidgetPluginGuiInfo",
  "SecurityCapabilities",
  "elapsedTime",
  "tick",
  "time",
  "wait",
  "spawn",
  "delay",
  "settings",
  "UserSettings",
  "version",
  "warn",
  "stats",
  "printidentity",
  "ypcall",
  "loadstring",
  "Game",
  "Workspace",
]);

/** Globals that still work but should not appear in new code. */
export const DEPRECATED_GLOBALS: Record<string, { replacement: string; fix?: string }> = {
  wait: { replacement: "task.wait", fix: "task.wait" },
  spawn: { replacement: "task.spawn", fix: "task.spawn" },
  delay: { replacement: "task.delay", fix: "task.delay" },
  ypcall: { replacement: "pcall", fix: "pcall" },
  Game: { replacement: "game", fix: "game" },
  Workspace: { replacement: "workspace", fix: "workspace" },
  version: { replacement: "the Version property of a DataModel" },
  elapsedTime: { replacement: "os.clock()" },
};

/** Methods whose lowercase / legacy spellings are deprecated. */
export const DEPRECATED_METHODS: Record<string, { replacement: string; fix?: string }> = {
  connect: { replacement: "Connect", fix: "Connect" },
  disconnect: { replacement: "Disconnect", fix: "Disconnect" },
  remove: { replacement: "Destroy", fix: "Destroy" },
  Remove: { replacement: "Destroy", fix: "Destroy" },
  destroy: { replacement: "Destroy", fix: "Destroy" },
  clone: { replacement: "Clone", fix: "Clone" },
  children: { replacement: "GetChildren", fix: "GetChildren" },
  getChildren: { replacement: "GetChildren", fix: "GetChildren" },
  findFirstChild: { replacement: "FindFirstChild", fix: "FindFirstChild" },
  isA: { replacement: "IsA", fix: "IsA" },
  FindPartOnRay: { replacement: "WorldRoot:Raycast with RaycastParams" },
  FindPartOnRayWithIgnoreList: { replacement: "WorldRoot:Raycast with RaycastParams" },
  FindPartOnRayWithWhitelist: { replacement: "WorldRoot:Raycast with RaycastParams" },
  FindPartsInRegion3: { replacement: "WorldRoot:GetPartBoundsInBox" },
};

export const DEPRECATED_CLASSES: Record<string, string> = {
  BodyVelocity: "LinearVelocity",
  BodyPosition: "AlignPosition",
  BodyGyro: "AlignOrientation",
  BodyAngularVelocity: "AngularVelocity",
  BodyForce: "VectorForce",
  BodyThrust: "VectorForce",
  RocketPropulsion: "AlignPosition + AlignOrientation",
  Message: "a ScreenGui with a TextLabel",
  Hint: "a ScreenGui with a TextLabel",
  Hat: "Accessory",
};

export const SERVICES = new Set([
  "Players",
  "Workspace",
  "ReplicatedStorage",
  "ReplicatedFirst",
  "ServerScriptService",
  "ServerStorage",
  "StarterGui",
  "StarterPack",
  "StarterPlayer",
  "Lighting",
  "SoundService",
  "Teams",
  "Chat",
  "TextChatService",
  "RunService",
  "UserInputService",
  "ContextActionService",
  "TweenService",
  "HttpService",
  "DataStoreService",
  "MemoryStoreService",
  "MessagingService",
  "MarketplaceService",
  "BadgeService",
  "GroupService",
  "PhysicsService",
  "PathfindingService",
  "CollectionService",
  "Debris",
  "TeleportService",
  "GuiService",
  "HapticService",
  "VRService",
  "TextService",
  "LocalizationService",
  "PolicyService",
  "SocialService",
  "AvatarEditorService",
  "ProximityPromptService",
  "AssetService",
  "InsertService",
  "ContentProvider",
  "Selection",
  "ChangeHistoryService",
  "StudioService",
  "CoreGui",
  "MaterialService",
  "AnalyticsService",
  "ExperienceNotificationService",
  "Stats",
  "TestService",
  "LogService",
  "ScriptContext",
  "KeyframeSequenceProvider",
  "ControllerService",
  "VoiceChatService",
  "UserService",
  "CaptureService",
  "EncodingService",
  "GeometryService",
  "HttpRbxApiService",
  "SafetyService",
  "ServerScriptService",
]);

/** Services whose use from a LocalScript is always a mistake. */
export const SERVER_ONLY_SERVICES = new Set([
  "DataStoreService",
  "ServerStorage",
  "ServerScriptService",
  "MessagingService",
  "MemoryStoreService",
  "AnalyticsService",
]);

/** Services that only do something useful on the client. */
export const CLIENT_ONLY_SERVICES = new Set(["UserInputService", "ContextActionService", "GuiService", "HapticService", "VRService"]);

export const CLIENT_ONLY_MEMBERS: Record<string, string> = {
  LocalPlayer: "Players.LocalPlayer is nil on the server",
  RenderStepped: "RunService.RenderStepped only fires on the client",
  BindToRenderStep: "RunService:BindToRenderStep only works on the client",
  FireServer: "RemoteEvent:FireServer can only be called from the client",
  InvokeServer: "RemoteFunction:InvokeServer can only be called from the client",
  OnClientEvent: "RemoteEvent.OnClientEvent only fires on the client",
  OnClientInvoke: "RemoteFunction.OnClientInvoke is only invoked on the client",
  GetMouse: "Player:GetMouse only works for the local player on the client",
  SetCore: "StarterGui:SetCore only works on the client",
};

export const SERVER_ONLY_MEMBERS: Record<string, string> = {
  FireClient: "RemoteEvent:FireClient can only be called from the server",
  FireAllClients: "RemoteEvent:FireAllClients can only be called from the server",
  InvokeClient: "RemoteFunction:InvokeClient can only be called from the server",
  OnServerEvent: "RemoteEvent.OnServerEvent only fires on the server",
  OnServerInvoke: "RemoteFunction.OnServerInvoke is only invoked on the server",
  GetDataStore: "DataStoreService is server-only",
  GetOrderedDataStore: "DataStoreService is server-only",
  AwardBadge: "BadgeService:AwardBadge is server-only",
  ProcessReceipt: "MarketplaceService.ProcessReceipt must be set on the server",
  SetNetworkOwner: "BasePart:SetNetworkOwner is server-only",
};

export const DATASTORE_METHODS = new Set([
  "GetAsync",
  "SetAsync",
  "UpdateAsync",
  "IncrementAsync",
  "RemoveAsync",
  "GetSortedAsync",
  "ListKeysAsync",
]);

export const HTTP_SERVER_METHODS = new Set(["GetAsync", "PostAsync", "RequestAsync"]);

/** Classic Levenshtein, for "did you mean" suggestions. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

export function suggest(name: string, candidates: Iterable<string>, maxDistance = 3): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(name, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD <= Math.min(maxDistance, Math.max(1, Math.floor(name.length / 3))) ? best : undefined;
}
