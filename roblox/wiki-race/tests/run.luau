-- Test runner: luaurun tests/run.luau <projectRoot> [specFilter]
local ROOT = arg[1] or "."
local FILTER = arg[2]

local H = loadchunk(readfile(ROOT .. "/tests/harness.luau"), "harness", _G)()

local passed, failed = 0, 0
local failures = {}

local t = {}
function t.ok(condition, message)
	if not condition then
		error(message or "expected truthy value", 2)
	end
end
function t.eq(actual, expected, message)
	if actual ~= expected then
		error(("%s: expected %s, got %s"):format(message or "eq", tostring(expected), tostring(actual)), 2)
	end
end
function t.test(name, fn)
	local ok, err = pcall(fn)
	if ok then
		passed += 1
		print("  ✓ " .. name)
	else
		failed += 1
		table.insert(failures, name .. ": " .. tostring(err))
		print("  ✗ " .. name .. "\n      " .. tostring(err))
	end
end

local specDir = ROOT .. "/tests/specs"
for _, file in listdir(specDir) do
	if file:match("%.luau$") and (not FILTER or file:find(FILTER, 1, true)) then
		print(file)
		local spec = loadchunk(readfile(specDir .. "/" .. file), file, _G)()
		spec(t, H)
	end
end

print(("\n%d passed, %d failed"):format(passed, failed))
if failed > 0 then
	error("tests failed")
end
