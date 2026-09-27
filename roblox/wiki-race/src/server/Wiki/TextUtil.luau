-- Text normalization used by redirects, search and the banned-subject filter.
-- normalize("Timothée  Chalamet!") == "timothee chalamet"

local TextUtil = {}

local FOLD = {
	["á"] = "a",
	["à"] = "a",
	["â"] = "a",
	["ä"] = "a",
	["ã"] = "a",
	["å"] = "a",
	["ā"] = "a",
	["Á"] = "a",
	["À"] = "a",
	["Â"] = "a",
	["Ä"] = "a",
	["Ã"] = "a",
	["Å"] = "a",
	["Ā"] = "a",
	["é"] = "e",
	["è"] = "e",
	["ê"] = "e",
	["ë"] = "e",
	["ē"] = "e",
	["ę"] = "e",
	["ě"] = "e",
	["É"] = "e",
	["È"] = "e",
	["Ê"] = "e",
	["Ë"] = "e",
	["Ē"] = "e",
	["í"] = "i",
	["ì"] = "i",
	["î"] = "i",
	["ï"] = "i",
	["ī"] = "i",
	["Í"] = "i",
	["Ì"] = "i",
	["Î"] = "i",
	["Ï"] = "i",
	["Ī"] = "i",
	["ó"] = "o",
	["ò"] = "o",
	["ô"] = "o",
	["ö"] = "o",
	["õ"] = "o",
	["ø"] = "o",
	["ō"] = "o",
	["Ó"] = "o",
	["Ò"] = "o",
	["Ô"] = "o",
	["Ö"] = "o",
	["Õ"] = "o",
	["Ø"] = "o",
	["Ō"] = "o",
	["ú"] = "u",
	["ù"] = "u",
	["û"] = "u",
	["ü"] = "u",
	["ū"] = "u",
	["Ú"] = "u",
	["Ù"] = "u",
	["Û"] = "u",
	["Ü"] = "u",
	["Ū"] = "u",
	["ñ"] = "n",
	["Ñ"] = "n",
	["ç"] = "c",
	["Ç"] = "c",
	["ý"] = "y",
	["ÿ"] = "y",
	["Ý"] = "y",
	["ß"] = "ss",
	["æ"] = "ae",
	["Æ"] = "ae",
	["œ"] = "oe",
	["Œ"] = "oe",
	["š"] = "s",
	["Š"] = "s",
	["ž"] = "z",
	["Ž"] = "z",
	["č"] = "c",
	["Č"] = "c",
	["ł"] = "l",
	["Ł"] = "l",
	["’"] = "'",
	["‘"] = "'",
	["“"] = '"',
	["”"] = '"',
	["–"] = "-",
	["—"] = "-",
}

-- Lowercases ASCII and folds common Latin accents. Other characters are kept as-is.
-- Implemented with native gsub passes (2-byte UTF-8 letters, then the 3-byte quotes and
-- dashes) because the whole wiki text is normalized at server start.
function TextUtil.fold(text: string): string
	local folded = string.lower(text)
	if string.find(folded, "[\128-\255]") then
		folded = string.gsub(folded, "[\194-\223][\128-\191]", FOLD)
		folded = string.gsub(folded, "\226\128[\147-\157]", FOLD)
	end
	return folded
end

-- Folds, then turns anything that isn't a-z/0-9 into single spaces.
function TextUtil.normalize(text: string): string
	local folded = TextUtil.fold(text)
	folded = folded:gsub("'", "")
	folded = folded:gsub("[^%w]+", " ")
	folded = folded:gsub("^%s+", ""):gsub("%s+$", "")
	return folded
end

function TextUtil.slug(title: string): string
	return (TextUtil.normalize(title):gsub(" ", "_"))
end

-- Whole-word phrase containment on already-normalized strings.
function TextUtil.containsPhrase(normalizedText: string, normalizedPhrase: string): boolean
	if normalizedPhrase == "" then
		return false
	end
	return string.find(" " .. normalizedText .. " ", " " .. normalizedPhrase .. " ", 1, true) ~= nil
end

-- Splits wiki markup into sentences without breaking inside [[links]].
function TextUtil.splitSentences(text: string): { string }
	local sentences = {}
	local depth = 0
	local start = 1
	local i = 1
	local length = #text
	while i <= length do
		local two = string.sub(text, i, i + 1)
		if two == "[[" then
			depth += 1
			i += 2
		elseif two == "]]" then
			depth = math.max(0, depth - 1)
			i += 2
		else
			local char = string.sub(text, i, i)
			if depth == 0 and (char == "." or char == "!" or char == "?") then
				local nextChar = string.sub(text, i + 1, i + 1)
				if nextChar == " " or nextChar == "" then
					table.insert(sentences, string.sub(text, start, i))
					start = i + 2
					i += 1
				end
			end
			i += 1
		end
	end
	if start <= length then
		table.insert(sentences, string.sub(text, start))
	end
	for index, sentence in sentences do
		sentences[index] = sentence:gsub("^%s+", ""):gsub("%s+$", "")
	end
	return sentences
end

-- Removes markup, returning the text a reader would see.
function TextUtil.plain(markup: string): string
	local text = markup:gsub("%[%[([^%]|]-)|([^%]]-)%]%]", "%2")
	text = text:gsub("%[%[([^%]]-)%]%]", "%1")
	text = text:gsub("%*%*", "")
	return text
end

-- Every link target referenced by a chunk of markup.
function TextUtil.linkTargets(markup: string): { string }
	local targets = {}
	for inner in string.gmatch(markup, "%[%[(.-)%]%]") do
		local target = string.match(inner, "^([^|]*)|") or inner
		table.insert(targets, target)
	end
	return targets
end

-- Deterministic 32-bit string hash (FNV-1a) used for stable pseudo-random metadata.
function TextUtil.hash(text: string): number
	local h = 2166136261
	for i = 1, #text do
		h = bit32.bxor(h, string.byte(text, i))
		h = (h * 16777619) % 4294967296
	end
	return h
end

return TextUtil
