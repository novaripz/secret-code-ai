-- Input validation for everything that arrives from a client. Every helper returns the
-- sanitized value or nil; never trust a client-provided type, range or length.

local Validate = {}

function Validate.string(value: any, maxLength: number?): string?
	if type(value) ~= "string" then
		return nil
	end
	if #value == 0 or #value > (maxLength or 64) then
		return nil
	end
	if not utf8.len(value) then
		return nil
	end
	return value
end

function Validate.id(value: any): string?
	-- Page ids are slugs: lowercase letters, digits and underscores.
	local s = Validate.string(value, 80)
	if s and s:match("^[%w_]+$") then
		return s
	end
	return nil
end

function Validate.integer(value: any, minimum: number, maximum: number): number?
	if type(value) ~= "number" or value ~= value or value % 1 ~= 0 then
		return nil
	end
	if value < minimum or value > maximum then
		return nil
	end
	return value
end

function Validate.number(value: any, minimum: number, maximum: number): number?
	if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge then
		return nil
	end
	return math.clamp(value, minimum, maximum)
end

function Validate.boolean(value: any): boolean?
	if type(value) == "boolean" then
		return value
	end
	return nil
end

function Validate.oneOf(value: any, options: { any }): any
	for _, option in options do
		if value == option then
			return value
		end
	end
	return nil
end

function Validate.userId(value: any): number?
	return Validate.integer(value, -10000, 1e15)
end

return Validate
