-- Shared, server-only state for the Server Rig effect. Written by ChaosService, read by
-- matches when a round starts. It never touches lobby settings: a rigged round simply runs in
-- Give Up Mode, and every later round goes back to the host's configuration.

local ChaosState = {
	rigId = 0,
	riggedUntil = 0,
	riggedBy = nil,
}

function ChaosState.isRigActive(now: number): boolean
	return now < ChaosState.riggedUntil
end

return ChaosState
