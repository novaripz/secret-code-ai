-- Inline rich paragraph renderer with clickable links.
--
-- Roblox text can't contain clickable spans, so paragraphs are laid out manually: text runs are
-- split into words, measured with TextService (cached), wrapped into lines, and consecutive
-- words that share style/link are merged back into single labels/buttons. A link that wraps
-- across lines becomes several buttons that highlight together.

local TextService = game:GetService("TextService")

local FlowText = {}

local widthCache = {}
local cacheSize = 0

local function measure(text: string, font: Enum.Font, size: number): number
	local key = font.Name .. "|" .. size .. "|" .. text
	local width = widthCache[key]
	if width then
		return width
	end
	width = TextService:GetTextSize(text, size, font, Vector2.new(10000, 1000)).X
	cacheSize += 1
	if cacheSize > 6000 then
		widthCache = {}
		cacheSize = 0
	end
	widthCache[key] = width
	return width
end
FlowText.measure = measure

local function tokenize(runs)
	local tokens = {}
	for _, run in runs do
		local text = run.t or ""
		local position = 1
		while position <= #text do
			local s, e = string.find(text, "%S+", position)
			if not s then
				-- Trailing whitespace: attach to previous token.
				local last = tokens[#tokens]
				if last then
					last.trail ..= string.sub(text, position)
				end
				break
			end
			if s > position then
				local last = tokens[#tokens]
				if last then
					last.trail ..= string.sub(text, position, s - 1)
				end
			end
			table.insert(tokens, { word = string.sub(text, s, e), trail = "", link = run.l, bold = run.b == true })
			position = e + 1
		end
	end
	return tokens
end

--[[
	style = {
		font, boldFont: Enum.Font, size: number, lineHeight: number?,
		color, linkColor, linkHover: Color3, visited: { [id] = true }?,
		interactive: boolean, zIndex: number?,
	}
	Returns height, { buttons }.
]]
function FlowText.render(container: GuiObject, runs, style, width: number, onLink)
	for _, child in container:GetChildren() do
		child:Destroy()
	end
	width = math.max(40, width)
	local size = style.size
	local lineHeight = style.lineHeight or math.floor(size * 1.45)
	local tokens = tokenize(runs)
	local spaceWidth = measure("a a", style.font, size) - measure("aa", style.font, size)

	-- Line layout.
	local x, line = 0, 0
	for _, token in tokens do
		local font = token.bold and style.boldFont or style.font
		token.font = font
		token.wordWidth = measure(token.word, font, size)
		token.trailWidth = #token.trail > 0 and spaceWidth * #token.trail or 0
		if x > 0 and x + token.wordWidth > width then
			line += 1
			x = 0
		end
		token.line = line
		token.x = x
		x += token.wordWidth + token.trailWidth
	end

	-- Merge consecutive tokens with the same style/link on the same line.
	local segments = {}
	for _, token in tokens do
		local last = segments[#segments]
		if last and last.line == token.line and last.link == token.link and last.bold == token.bold then
			last.text ..= last.pendingTrail .. token.word
			last.pendingTrail = token.trail
		else
			table.insert(segments, {
				text = token.word,
				pendingTrail = token.trail,
				line = token.line,
				x = token.x,
				link = token.link,
				bold = token.bold,
				font = token.font,
			})
		end
	end

	local groups = {} -- link id → { buttons }
	local buttons = {}
	local zIndex = style.zIndex or 2
	for index, segment in segments do
		local segmentWidth = measure(segment.text, segment.font, size) + 2
		local position = UDim2.fromOffset(segment.x, segment.line * lineHeight)
		if segment.link then
			local visited = style.visited and style.visited[segment.link]
			local button = Instance.new("TextButton")
			button.Name = "Link"
			button.AutoButtonColor = false
			button.BackgroundTransparency = 1
			button.Text = segment.text
			button.Font = segment.font
			button.TextSize = size
			button.TextColor3 = style.linkColor
			button.TextTransparency = visited and 0.22 or 0
			button.TextXAlignment = Enum.TextXAlignment.Left
			button.Size = UDim2.fromOffset(segmentWidth, lineHeight)
			button.Position = position
			button.ZIndex = zIndex
			button.Active = style.interactive ~= false
			button:SetAttribute("PageId", segment.link)
			button.Parent = container
			local underline = Instance.new("Frame")
			underline.Name = "Underline"
			underline.BorderSizePixel = 0
			underline.BackgroundColor3 = style.linkHover
			underline.BackgroundTransparency = 1
			underline.AnchorPoint = Vector2.new(0, 1)
			underline.Position = UDim2.new(0, 0, 1, -math.floor((lineHeight - size) / 2) + 1)
			underline.Size = UDim2.new(1, -2, 0, 2)
			underline.ZIndex = zIndex
			underline.Parent = button
			-- Group key: contiguous link segments with the same target highlight together.
			local previous = segments[index - 1]
			local groupKey = segment.link
				.. "#"
				.. ((previous and previous.link == segment.link) and (previous.groupIndex or index) or index)
			segment.groupIndex = (previous and previous.link == segment.link) and (previous.groupIndex or index)
				or index
			groups[groupKey] = groups[groupKey] or {}
			table.insert(groups[groupKey], button)
			button:SetAttribute("Group", groupKey)
			table.insert(buttons, button)
		else
			local label = Instance.new("TextLabel")
			label.Name = "Text"
			label.BackgroundTransparency = 1
			label.Text = segment.text
			label.Font = segment.font
			label.TextSize = size
			label.TextColor3 = style.color
			label.TextXAlignment = Enum.TextXAlignment.Left
			label.Size = UDim2.fromOffset(segmentWidth, lineHeight)
			label.Position = position
			label.ZIndex = zIndex
			label.Parent = container
		end
	end

	for _, button in buttons do
		local group = groups[button:GetAttribute("Group")]
		local function highlight(on: boolean)
			for _, member in group do
				member.TextColor3 = on and style.linkHover or style.linkColor
				local underline = member:FindFirstChild("Underline")
				if underline then
					underline.BackgroundTransparency = on and 0 or 1
				end
			end
		end
		button.MouseEnter:Connect(function()
			if button.Active then
				highlight(true)
			end
		end)
		button.MouseLeave:Connect(function()
			highlight(false)
		end)
		button.Activated:Connect(function()
			if button.Active and onLink then
				onLink(button:GetAttribute("PageId"), button, group)
			end
		end)
	end

	local height = (#tokens > 0) and (line + 1) * lineHeight or 0
	container.Size = UDim2.new(container.Size.X.Scale, container.Size.X.Offset, 0, height)
	return height, buttons
end

return FlowText
