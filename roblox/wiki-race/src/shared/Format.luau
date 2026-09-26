-- Small formatting helpers shared by server messages and client UI.

local Format = {}

function Format.time(seconds: number?): string
	if seconds == nil or seconds ~= seconds or seconds == math.huge then
		return "—"
	end
	seconds = math.max(0, seconds)
	local minutes = math.floor(seconds / 60)
	local rest = seconds - minutes * 60
	return string.format("%d:%04.1f", minutes, math.floor(rest * 10) / 10)
end

function Format.clock(seconds: number?): string
	if seconds == nil then
		return "∞"
	end
	seconds = math.max(0, math.ceil(seconds))
	return string.format("%d:%02d", math.floor(seconds / 60), seconds % 60)
end

function Format.number(n: number?): string
	n = math.floor(n or 0)
	local s = tostring(math.abs(n))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if out:sub(1, 1) == "," then
		out = out:sub(2)
	end
	return (n < 0 and "-" or "") .. out
end

function Format.ordinal(n: number): string
	local suffix = "th"
	local lastTwo = n % 100
	if lastTwo < 11 or lastTwo > 13 then
		local last = n % 10
		if last == 1 then
			suffix = "st"
		elseif last == 2 then
			suffix = "nd"
		elseif last == 3 then
			suffix = "rd"
		end
	end
	return tostring(n) .. suffix
end

function Format.timerLabel(timer: string, customSeconds: number?): string
	if timer == "unlimited" then
		return "Unlimited"
	elseif timer == "custom" then
		return Format.clock(customSeconds or 0) .. " (custom)"
	end
	local seconds = tonumber(timer) or 0
	return string.format("%d min", math.floor(seconds / 60))
end

function Format.roundsLabel(rounds: number): string
	return rounds == 0 and "Unlimited" or tostring(rounds)
end

return Format
