-- Remote layout. One RemoteFunction carries every client → server request (dispatched and
-- validated by the server Router) and one RemoteEvent carries every server → client push.

local Net = {}

Net.FolderName = "WikiRaceNet"
Net.RequestName = "Request"
Net.PushName = "Push"

-- Every request the server understands. The client only uses these names.
Net.Actions = {
	Bootstrap = "Bootstrap",
	GetProfile = "GetProfile",
	UpdateSettings = "UpdateSettings",
	EquipItem = "EquipItem",
	BuyItem = "BuyItem",
	GetLeaderboards = "GetLeaderboards",

	ListLobbies = "ListLobbies",
	QuickPlay = "QuickPlay",
	CreateLobby = "CreateLobby",
	JoinLobby = "JoinLobby",
	LeaveLobby = "LeaveLobby",
	UpdateLobby = "UpdateLobby",
	SetReady = "SetReady",
	KickPlayer = "KickPlayer",
	TransferHost = "TransferHost",
	StartMatch = "StartMatch",
	EndMatch = "EndMatch",
	NextRound = "NextRound",

	Navigate = "Navigate",
	GiveUp = "GiveUp",

	StartFreeRoam = "StartFreeRoam",
	FreeNavigate = "FreeNavigate",
	Search = "Search",
	GetCategory = "GetCategory",
	StartSoloRace = "StartSoloRace",

	SetRigIntent = "SetRigIntent",
	RigPlayer = "RigPlayer",
	DebugPurchase = "DebugPurchase",
}

-- Every push event the client may receive.
Net.Events = {
	Profile = "Profile",
	Toast = "Toast",
	LobbyList = "LobbyList",
	LobbyState = "LobbyState",
	LobbyLeft = "LobbyLeft",
	RoundGenerating = "RoundGenerating",
	RoundStart = "RoundStart",
	RaceState = "RaceState",
	Opponents = "Opponents",
	RoundClosing = "RoundClosing",
	RoundRigged = "RoundRigged",
	RoundResults = "RoundResults",
	MatchResults = "MatchResults",
	MatchAborted = "MatchAborted",
	ServerRigged = "ServerRigged",
	ChaosEffect = "ChaosEffect",
	Achievement = "Achievement",
	RecordBroken = "RecordBroken",
	Teleporting = "Teleporting",
}

function Net.createServerRemotes(parent: Instance)
	local folder = Instance.new("Folder")
	folder.Name = Net.FolderName
	local request = Instance.new("RemoteFunction")
	request.Name = Net.RequestName
	request.Parent = folder
	local push = Instance.new("RemoteEvent")
	push.Name = Net.PushName
	push.Parent = folder
	folder.Parent = parent
	return request, push
end

function Net.waitForRemotes(parent: Instance)
	local folder = parent:WaitForChild(Net.FolderName)
	return folder:WaitForChild(Net.RequestName), folder:WaitForChild(Net.PushName)
end

return Net
