-- Removes banned subjects from the wiki BEFORE the graph is built.
--
-- This is not a visual filter: banned pages, their redirects, every link to them, every sentence
-- that mentions them and every category/related entry naming them are stripped from the raw data.
-- Because the graph is built from the cleaned data, no route can pass through a banned page.
-- This module is server-only (ServerScriptService) and never replicated to clients.

local TextUtil = require(script.Parent.TextUtil)

local BannedFilter = {}

-- Normalized (lowercase, accent-folded, punctuation → spaces) whole-word phrases.
-- Includes names, surname-only references, common abbreviations and misspellings.
BannedFilter.Phrases = {
	-- Timothée Chalamet
	"timothee chalamet",
	"timothy chalamet",
	"chalamet",
	-- John F. Kennedy
	"john f kennedy",
	"john fitzgerald kennedy",
	"john kennedy",
	"jack kennedy",
	"president kennedy",
	"jfk",
	"j f k",
	"kennedy",
	-- Jacob Elordi
	"jacob elordi",
	"elordi",
	-- Armin Arlert (Attack on Titan)
	"armin arlert",
	"armin arlelt",
	"arlert",
	"armin",
}

local function hasBannedPhrase(normalized: string): boolean
	for _, phrase in BannedFilter.Phrases do
		if TextUtil.containsPhrase(normalized, phrase) then
			return true
		end
	end
	return false
end

function BannedFilter.isBanned(text: any): boolean
	if type(text) ~= "string" or text == "" then
		return false
	end
	return hasBannedPhrase(TextUtil.normalize(text))
end

-- A chunk of markup is dirty if its visible text, or any link target inside it, is banned.
local function markupIsDirty(markup: string, bannedTargets): boolean
	if hasBannedPhrase(TextUtil.normalize(TextUtil.plain(markup))) then
		return true
	end
	for _, target in TextUtil.linkTargets(markup) do
		local normalized = TextUtil.normalize(target)
		if bannedTargets[normalized] or hasBannedPhrase(normalized) then
			return true
		end
	end
	return false
end

-- Drops every sentence that mentions a banned subject or links to a banned page.
function BannedFilter.scrubMarkup(markup: string?, bannedTargets, report): string
	if type(markup) ~= "string" or markup == "" then
		return ""
	end
	bannedTargets = bannedTargets or {}
	-- Fast path: a chunk with no banned mention or link anywhere is kept verbatim.
	if not markupIsDirty(markup, bannedTargets) then
		return markup
	end
	local kept = {}
	for _, sentence in TextUtil.splitSentences(markup) do
		if markupIsDirty(sentence, bannedTargets) then
			if report then
				report.sentences += 1
			end
		elseif sentence ~= "" then
			table.insert(kept, sentence)
		end
	end
	return table.concat(kept, " ")
end

local function pageIsBanned(page): boolean
	if BannedFilter.isBanned(page.title) or BannedFilter.isBanned(page.id) then
		return true
	end
	for _, alias in page.aliases or {} do
		if BannedFilter.isBanned(alias) then
			-- A redirect that names a banned subject means the page itself is about that
			-- subject (e.g. an abbreviation redirect), so the whole page goes.
			return true
		end
	end
	return false
end

-- Returns cleaned copies of the raw pages and a report of what was removed.
function BannedFilter.cleanPages(rawPages)
	local report = { pages = 0, aliases = 0, sentences = 0, sections = 0, infobox = 0, related = 0, tags = 0 }
	local bannedTargets = {}
	local keptRaw = {}

	for _, page in rawPages do
		if type(page) ~= "table" or type(page.title) ~= "string" then
			continue
		end
		if pageIsBanned(page) then
			report.pages += 1
			bannedTargets[TextUtil.normalize(page.title)] = true
			for _, alias in page.aliases or {} do
				bannedTargets[TextUtil.normalize(alias)] = true
			end
		else
			table.insert(keptRaw, page)
		end
	end

	local cleaned = {}
	for _, page in keptRaw do
		local copy = table.clone(page)

		copy.aliases = {}
		for _, alias in page.aliases or {} do
			if BannedFilter.isBanned(alias) then
				report.aliases += 1
			else
				table.insert(copy.aliases, alias)
			end
		end

		copy.tags = {}
		for _, tag in page.tags or {} do
			if BannedFilter.isBanned(tag) then
				report.tags += 1
			else
				table.insert(copy.tags, tag)
			end
		end

		copy.summary = BannedFilter.scrubMarkup(page.summary, bannedTargets, report)

		copy.sections = {}
		for _, section in page.sections or {} do
			local heading, body = section[1] or section.heading, section[2] or section.body
			if BannedFilter.isBanned(heading) then
				report.sections += 1
				continue
			end
			local scrubbed = BannedFilter.scrubMarkup(body, bannedTargets, report)
			if scrubbed ~= "" then
				table.insert(copy.sections, { heading, scrubbed })
			else
				report.sections += 1
			end
		end

		copy.infobox = {}
		for _, row in page.infobox or {} do
			local label, value = row[1], row[2]
			if BannedFilter.isBanned(label) or markupIsDirty(value or "", bannedTargets) then
				report.infobox += 1
			else
				table.insert(copy.infobox, { label, value })
			end
		end

		copy.related = {}
		for _, related in page.related or {} do
			local normalized = TextUtil.normalize(related)
			if bannedTargets[normalized] or hasBannedPhrase(normalized) then
				report.related += 1
			else
				table.insert(copy.related, related)
			end
		end

		table.insert(cleaned, copy)
	end

	return cleaned, report
end

-- Final defensive audit over a built graph: returns ids of any node that still contains a
-- banned phrase anywhere (title, aliases, tags, text runs, related titles).
function BannedFilter.auditGraph(graph): { string }
	local violations = {}
	local function runsDirty(runs)
		for _, run in runs do
			if BannedFilter.isBanned(run.t) then
				return true
			end
		end
		return false
	end
	for id, node in graph.nodes do
		local dirty = BannedFilter.isBanned(node.title) or BannedFilter.isBanned(id)
		for _, alias in node.aliases do
			dirty = dirty or BannedFilter.isBanned(alias)
		end
		for _, tag in node.tags do
			dirty = dirty or BannedFilter.isBanned(tag)
		end
		dirty = dirty or runsDirty(node.summary)
		for _, section in node.sections do
			dirty = dirty or BannedFilter.isBanned(section.heading)
			for _, paragraph in section.paragraphs do
				dirty = dirty or runsDirty(paragraph)
			end
		end
		for _, row in node.infobox do
			dirty = dirty or BannedFilter.isBanned(row.label) or runsDirty(row.runs)
		end
		if dirty then
			table.insert(violations, id)
		end
	end
	table.sort(violations)
	return violations
end

return BannedFilter
