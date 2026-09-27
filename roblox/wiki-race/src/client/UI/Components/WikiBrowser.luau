-- The in-game encyclopedia browser: toolbar (back / forward / refresh / address / history /
-- search / random), article with inline links, infobox with image, see-also, categories,
-- page-history popover, loading bar and error state. Used by races and Free Roam.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("WikiRaceShared")
local Categories = require(Shared.Categories)

local UI = script.Parent.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Anim = require(UI.Anim)
local FlowText = require(script.Parent.FlowText)
local FunnyCard = require(script.Parent.FunnyCard)
local Sound = require(UI.Parent.Core.Sound)
local Store = require(UI.Parent.Core.Store)

local WikiBrowser = {}
WikiBrowser.__index = WikiBrowser

local INFOBOX_WIDTH = 270
local GAP = 22
local BODY_SIZE = 17
local NARROW = 620

-- opts: { mode = "race"|"free", onLink(id), onBack(), onForward(), onRefresh(), onHistory(id),
--         onRandom(), onSearch(query, callback(results)), onOpen(id), onCategory(name), transition }
function WikiBrowser.new(parent: GuiObject, opts)
	local self = setmetatable({
		opts = opts,
		mode = opts.mode or "race",
		interactive = true,
		visited = {},
		transition = opts.transition or "transition_fade",
	}, WikiBrowser)

	local root = Kit.panel({
		Name = "WikiBrowser",
		Size = UDim2.fromScale(1, 1),
		ClipsDescendants = true,
		Parent = parent,
		Theme = {
			BackgroundColor3 = "article",
			BackgroundTransparency = function()
				return 0
			end,
		},
	})
	self.frame = root

	-- Scale probe: converts AbsoluteSize (screen px) back into design units for text layout.
	self.probe = Kit.frame({ Name = "ScaleProbe", Size = UDim2.fromOffset(100, 1), Parent = root })

	-- Toolbar ----------------------------------------------------------------------------
	local toolbar = Kit.make("Frame", {
		Name = "Toolbar",
		Size = UDim2.new(1, 0, 0, 52),
		BorderSizePixel = 0,
		ZIndex = 5,
		Parent = root,
		Theme = { BackgroundColor3 = "surface2" },
	}, { Kit.padding(6, 10, 6, 10), Kit.list("x", 6, "Left", "Center") })
	Kit.make("Frame", {
		Name = "ToolbarBorder",
		Position = UDim2.new(0, 0, 0, 52),
		Size = UDim2.new(1, 0, 0, 1),
		BorderSizePixel = 0,
		ZIndex = 6,
		Parent = root,
		Theme = { BackgroundColor3 = "border" },
	})

	self.backButton = Kit.iconButton("◀", function()
		if opts.onBack then
			opts.onBack()
		end
	end, { Parent = toolbar, order = 1, Size = UDim2.fromOffset(40, 38) })
	self.forwardButton = Kit.iconButton("▶", function()
		if opts.onForward then
			opts.onForward()
		end
	end, { Parent = toolbar, order = 2, Size = UDim2.fromOffset(40, 38) })
	self.refreshButton = Kit.iconButton("⟳", function()
		if opts.onRefresh then
			opts.onRefresh()
		end
	end, { Parent = toolbar, order = 3, Size = UDim2.fromOffset(40, 38) })

	local address = Kit.make("Frame", {
		Name = "Address",
		Size = UDim2.new(1, self.mode == "free" and -430 or -214, 0, 38),
		LayoutOrder = 4,
		BorderSizePixel = 0,
		Parent = toolbar,
		Theme = { BackgroundColor3 = "surface" },
	}, { Kit.round(), Kit.padding(0, 14, 0, 14) })
	Kit.stroke("border", 1, 0.4).Parent = address
	self.addressLabel = Kit.text({
		text = "🔒 wiki/",
		style = "small",
		tone = "textDim",
		truncate = true,
		wrap = false,
		Size = UDim2.fromScale(1, 1),
		font = "fontMono",
		Parent = address,
	})
	self.redoBadge = Kit.chip("♻ 0", nil, { Parent = toolbar, order = 5, height = 30 })
	self.historyButton = Kit.iconButton("🕘", function()
		self:toggleHistory()
	end, { Parent = toolbar, order = 6, Size = UDim2.fromOffset(44, 38) })

	if self.mode == "free" then
		self.searchBox = Kit.input({
			placeholder = "🔍 Search the wiki",
			Size = UDim2.fromOffset(170, 38),
			order = 7,
			textSize = 15,
			Parent = toolbar,
		})
		local searchToken = 0
		self.searchBox:GetPropertyChangedSignal("Text"):Connect(function()
			searchToken += 1
			local token = searchToken
			local query = self.searchBox.Text
			task.delay(0.25, function()
				if token ~= searchToken then
					return
				end
				if #query < 2 then
					self:showSearchResults(nil)
					return
				end
				opts.onSearch(query, function(results)
					if token == searchToken then
						self:showSearchResults(results)
					end
				end)
			end)
		end)
		Kit.iconButton("🎲", function()
			opts.onRandom()
		end, { Parent = toolbar, order = 8, Size = UDim2.fromOffset(44, 38) })
		self.redoBadge.Visible = false
	end

	-- Loading bar ------------------------------------------------------------------------
	self.loadingBar = Kit.make("Frame", {
		Name = "LoadingBar",
		Position = UDim2.new(0, 0, 0, 52),
		Size = UDim2.new(0, 0, 0, 3),
		BorderSizePixel = 0,
		ZIndex = 8,
		Visible = false,
		Parent = root,
		Theme = { BackgroundColor3 = "accent" },
	})

	-- Content ----------------------------------------------------------------------------
	self.scroll = Kit.make("ScrollingFrame", {
		Name = "Content",
		Position = UDim2.new(0, 0, 0, 53),
		Size = UDim2.new(1, 0, 1, -53),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 7,
		CanvasSize = UDim2.new(),
		ScrollingDirection = Enum.ScrollingDirection.Y,
		Parent = root,
		Theme = { ScrollBarImageColor3 = "textFaint" },
	})
	self.content = Kit.frame({
		Name = "Page",
		Size = UDim2.new(1, -56, 0, 0),
		Position = UDim2.fromOffset(28, 22),
		Parent = self.scroll,
	})
	self.contentScale = Anim.scaleOf(self.content)

	self.cover = Kit.make("Frame", {
		Name = "Cover",
		Position = UDim2.new(0, 0, 0, 53),
		Size = UDim2.new(1, 0, 1, -53),
		BorderSizePixel = 0,
		BackgroundTransparency = 1,
		ZIndex = 20,
		Parent = root,
		Theme = { BackgroundColor3 = "article" },
	})

	-- Error card
	self.errorCard = Kit.panel({
		Name = "Error",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(360, 170),
		Visible = false,
		ZIndex = 30,
		Parent = root,
	}, { Kit.padding(18), Kit.list("y", 10, "Center", "Center") })
	self.errorText = Kit.text({
		text = "",
		style = "body",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, 0, 0, 60),
		Parent = self.errorCard,
		order = 1,
		ZIndex = 31,
	})
	self.errorRetry = Kit.button({
		text = "Retry",
		emoji = "⟳",
		variant = "primary",
		Parent = self.errorCard,
		order = 2,
		ZIndex = 31,
		onClick = function()
			self.errorCard.Visible = false
			if self.retry then
				self.retry()
			end
		end,
	})

	-- Dropdown panels (history, page history, search results)
	self.dropdown = Kit.panel({
		Name = "Dropdown",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 56),
		Size = UDim2.fromOffset(300, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Visible = false,
		ZIndex = 40,
		Parent = root,
	}, { Kit.padding(10), Kit.list("y", 4) })

	self.probe:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
		self:_scheduleLayout()
	end)
	self.scroll:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
		self:_scheduleLayout()
	end)

	self:setNav({ canBack = false, canForward = false, history = {}, redosLeft = -1 })
	return self
end

function WikiBrowser:_unitScale(): number
	local scale = self.probe.AbsoluteSize.X / 100
	return scale > 0 and scale or 1
end

function WikiBrowser:_scheduleLayout()
	if self.layoutPending then
		return
	end
	self.layoutPending = true
	task.delay(0.08, function()
		self.layoutPending = false
		if self.page then
			self:_layout()
		end
	end)
end

function WikiBrowser:setInteractive(on: boolean)
	self.interactive = on
	for _, button in self.content:GetDescendants() do
		if button:IsA("TextButton") then
			button.Active = on
		end
	end
end

function WikiBrowser:setTransition(itemId: string)
	self.transition = itemId or "transition_fade"
end

function WikiBrowser:setNav(nav)
	self.nav = nav
	local redosLeft = nav.redosLeft or -1
	local backAllowed = nav.canBack
	Kit.setDisabled(self.backButton, not backAllowed)
	Kit.setDisabled(self.forwardButton, not nav.canForward)
	if self.mode == "race" then
		self.redoBadge.Visible = true
		self.redoBadge.Text = redosLeft < 0 and "♻ ∞" or ("♻ " .. redosLeft)
		Theme.bind(self.redoBadge, { BackgroundColor3 = redosLeft == 0 and "danger" or "surface3" })
	end
end

function WikiBrowser:setLoading(on: boolean)
	if on then
		self.loadingBar.Visible = true
		self.loadingBar.Size = UDim2.new(0, 0, 0, 3)
		Anim.tween(self.loadingBar, 0.9, { Size = UDim2.new(0.85, 0, 0, 3) }, Enum.EasingStyle.Quad)
	else
		Anim.tween(self.loadingBar, 0.12, { Size = UDim2.new(1, 0, 0, 3) })
		task.delay(0.15, function()
			self.loadingBar.Visible = false
		end)
	end
end

function WikiBrowser:showError(message: string, retry)
	self.errorText.Text = "⚠️ " .. message
	self.retry = retry
	self.errorRetry.Visible = retry ~= nil
	self.errorCard.Visible = true
	Anim.punchIn(self.errorCard, 0.85)
end

function WikiBrowser:_closeDropdown()
	self.dropdown.Visible = false
	self.dropdownKind = nil
end

function WikiBrowser:_openDropdown(kind: string, build)
	if self.dropdownKind == kind and self.dropdown.Visible then
		self:_closeDropdown()
		return
	end
	for _, child in self.dropdown:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	build(self.dropdown)
	self.dropdownKind = kind
	self.dropdown.Visible = true
	Anim.punchIn(self.dropdown, 0.92)
end

-- How many rows a horizontally wrapping list of items occupies.
local function wrapRows(widths, maxWidth: number, gap: number): number
	local rows, x = 1, 0
	for _, w in widths do
		if x > 0 and x + w > maxWidth then
			rows += 1
			x = 0
		end
		x += w + gap
	end
	return rows
end

local function dropdownRow(parent, text: string, order: number, onClick)
	local row = Kit.button({
		text = text,
		variant = "ghost",
		textSize = 14,
		Size = UDim2.new(1, 0, 0, 32),
		order = order,
		font = "font",
		Parent = parent,
		onClick = onClick,
		ZIndex = 41,
	})
	row.TextXAlignment = Enum.TextXAlignment.Left
	Kit.padding(0, 10, 0, 10).Parent = row
	return row
end

function WikiBrowser:toggleHistory()
	local history = (self.nav and self.nav.history) or {}
	self:_openDropdown("history", function(panel)
		Kit.text({ text = "Recently visited", style = "h3", Parent = panel, order = 0, ZIndex = 41 })
		if self.mode == "race" then
			Kit.text({
				text = "Jumping back uses 1 redo.",
				style = "tiny",
				tone = "textFaint",
				Parent = panel,
				order = 1,
				ZIndex = 41,
			})
		end
		local current = self.page and self.page.id
		for index, id in history do
			if id ~= current then
				dropdownRow(panel, "📄 " .. Store.titleOf(id), index + 1, function()
					self:_closeDropdown()
					if self.opts.onHistory then
						self.opts.onHistory(id)
					end
				end)
			end
		end
		if #history <= 1 then
			Kit.text({
				text = "Nothing yet — start clicking links!",
				style = "small",
				tone = "textDim",
				Parent = panel,
				order = 99,
				ZIndex = 41,
			})
		end
	end)
end

function WikiBrowser:showPageHistory()
	local page = self.page
	if not page then
		return
	end
	self:_openDropdown("revisions", function(panel)
		Kit.text({ text = "📝 Revision history", style = "h3", Parent = panel, order = 0, ZIndex = 41 })
		Kit.text({
			text = ("%d revisions · %d words · %d links out · %d links in"):format(
				page.meta.revisions,
				page.meta.words,
				page.meta.linksOut,
				page.meta.linksIn
			),
			style = "tiny",
			tone = "textFaint",
			Parent = panel,
			order = 1,
			ZIndex = 41,
		})
		for index, revision in page.history do
			Kit.text({
				text = ('<b>#%d</b> · %s · <font transparency="0.3">%s</font>\n%s'):format(
					revision.revision,
					revision.when,
					revision.editor,
					revision.note
				),
				rich = true,
				style = "small",
				Size = UDim2.new(1, 0, 0, 38),
				Parent = panel,
				order = index + 1,
				ZIndex = 41,
			})
		end
	end)
end

function WikiBrowser:showSearchResults(results)
	if not results then
		if self.dropdownKind == "search" then
			self:_closeDropdown()
		end
		return
	end
	self.dropdownKind = nil
	self:_openDropdown("search", function(panel)
		if #results == 0 then
			Kit.text({
				text = "No pages found.",
				style = "small",
				tone = "textDim",
				Parent = panel,
				order = 1,
				ZIndex = 41,
			})
		end
		for index, result in results do
			local label = result.emoji .. "  " .. result.title
			if result.redirectFrom then
				label ..= "  ↪ " .. result.redirectFrom
			end
			dropdownRow(panel, label, index, function()
				self:_closeDropdown()
				self.searchBox.Text = ""
				self.opts.onOpen(result.id)
			end)
		end
	end)
end

-- Renders a page payload with the equipped transition. direction: "forward"|"back"|"none"
function WikiBrowser:setPage(page, direction: string?)
	self.errorCard.Visible = false
	self:_closeDropdown()
	local changed = not self.page or self.page.id ~= page.id
	self.page = page
	self.visited[page.id] = true
	Store.rememberTitle(page.id, page.title)
	for _, related in page.related or {} do
		Store.rememberTitle(related.id, related.title)
	end
	self.addressLabel.Text = "🔒 wiki/" .. page.title:gsub(" ", "_")
	self:_layout()
	if changed then
		self.scroll.CanvasPosition = Vector2.zero
		self:_playTransition(direction or "forward")
	end
end

function WikiBrowser:_playTransition(direction: string)
	self.cover.BackgroundTransparency = 0.05
	Anim.tween(self.cover, 0.22, { BackgroundTransparency = 1 })
	local kind = self.transition
	local sign = direction == "back" and -1 or 1
	if kind == "transition_slide" then
		self.content.Position = UDim2.fromOffset(28 + 60 * sign, 22)
		Anim.tween(self.content, 0.28, { Position = UDim2.fromOffset(28, 22) })
	elseif kind == "transition_zoom" then
		self.contentScale.Scale = 0.94
		Anim.tween(self.contentScale, 0.3, { Scale = 1 }, Enum.EasingStyle.Back)
	elseif kind == "transition_flip" then
		self.content.Rotation = -4 * sign
		self.contentScale.Scale = 1.04
		Anim.tween(self.content, 0.3, { Rotation = 0 }, Enum.EasingStyle.Back)
		Anim.tween(self.contentScale, 0.3, { Scale = 1 })
	end
end

function WikiBrowser:_onLink(pageId: string, button: TextButton, group)
	if not self.interactive or not self.opts.onLink then
		return
	end
	for _, member in group or { button } do
		Anim.pop(member, 1.15)
	end
	Sound.play("link")
	self.opts.onLink(pageId)
end

function WikiBrowser:_textStyle(size: number?)
	local t = Theme.current
	return {
		font = t.fontBody,
		boldFont = t.fontBodyBold,
		size = size or BODY_SIZE,
		color = t.articleText,
		linkColor = t.link,
		linkHover = t.linkHover,
		visited = self.visited,
		interactive = self.interactive,
	}
end

function WikiBrowser:_layout()
	local page = self.page
	local content = self.content
	for _, child in content:GetChildren() do
		if not child:IsA("UIScale") then
			child:Destroy()
		end
	end
	local unit = self:_unitScale()
	local width = math.floor(self.scroll.AbsoluteSize.X / unit) - 56 - 8
	if width < 60 then
		return
	end
	local narrow = width < NARROW
	local t = Theme.current
	local categoryInfo = Categories.get(page.category)
	local y = 0
	local onLink = function(id, button, group)
		self:_onLink(id, button, group)
	end

	-- Title block
	local titleSize = narrow and 28 or 34
	local titleLines = math.max(1, math.ceil(FlowText.measure(page.title, t.fontHeading, titleSize) / width))
	local titleHeight = titleLines * (titleSize + 10)
	local title = Kit.text({
		text = page.title,
		style = "title",
		size = titleSize,
		font = "fontHeading",
		Size = UDim2.new(1, 0, 0, titleHeight),
		Parent = content,
	})
	Theme.bind(title, { TextColor3 = "heading" })
	title.Position = UDim2.fromOffset(0, y)
	title.TextWrapped = true
	y += titleHeight + 2
	local subtitle = Kit.text({
		text = "From Wiki Race, the free encyclopedia",
		style = "small",
		tone = "textFaint",
		Size = UDim2.new(1, 0, 0, 18),
		Parent = content,
	})
	subtitle.Position = UDim2.fromOffset(0, y)
	y += 24

	local meta = Kit.frame(
		{ Name = "Meta", Position = UDim2.fromOffset(0, y), Size = UDim2.new(1, 0, 0, 26), Parent = content },
		{ Kit.list("x", 6, "Left", "Center") }
	)
	Kit.chip(categoryInfo.emoji .. " " .. page.category, categoryInfo.color, { Parent = meta, order = 1 })
	Kit.chip(("🔗 %d links"):format(page.meta.linksOut), nil, { Parent = meta, order = 2 })
	local historyChip = Kit.chip(
		("📝 %d revisions · updated %s"):format(page.meta.revisions, page.meta.updated),
		nil,
		{ Parent = meta, order = 3 }
	)
	local hit = Instance.new("TextButton")
	hit.BackgroundTransparency = 1
	hit.Text = ""
	hit.Size = UDim2.fromScale(1, 1)
	hit.Parent = historyChip
	hit.Activated:Connect(function()
		Sound.play("click")
		self:showPageHistory()
	end)
	y += 36
	local rule = Kit.divider()
	rule.Position = UDim2.fromOffset(0, y)
	rule.Parent = content
	y += 14

	-- Infobox
	local infoboxWidth = narrow and width or INFOBOX_WIDTH
	local infobox = Kit.make("Frame", {
		Name = "Infobox",
		Size = UDim2.fromOffset(infoboxWidth, 0),
		BorderSizePixel = 0,
		Parent = content,
		Theme = { BackgroundColor3 = "infobox" },
	}, { Kit.corner() })
	Kit.stroke("border", 1, 0.3).Parent = infobox
	local iy = 10
	local heading = Kit.text({
		text = page.title,
		style = "h3",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, -20, 0, 24),
		Parent = infobox,
	})
	heading.Position = UDim2.fromOffset(10, iy)
	iy += 30
	-- Picture: the page's uploaded photo (a tile of a sprite atlas) or a generated meme card.
	-- The little button flips between them; the choice sticks for the session.
	local imageHeight = narrow and 150 or math.min(infoboxWidth - 20, 230)
	local imageFrame = Kit.make("Frame", {
		Name = "Picture",
		BackgroundColor3 = categoryInfo.color,
		BorderSizePixel = 0,
		Size = UDim2.new(1, -20, 0, imageHeight),
		Position = UDim2.fromOffset(10, iy),
		Parent = infobox,
	}, { Kit.corner() })
	local caption
	local function drawPicture()
		for _, child in imageFrame:GetChildren() do
			if not child:IsA("UICorner") then
				child:Destroy()
			end
		end
		local photo = page.photo
		local showPhoto = (photo ~= nil or page.image ~= nil) and not WikiBrowser.preferFunny
		if showPhoto and photo then
			Kit.make("ImageLabel", {
				Image = photo.image,
				ImageRectOffset = Vector2.new(photo.x, photo.y),
				ImageRectSize = Vector2.new(photo.size, photo.size),
				ScaleType = Enum.ScaleType.Crop,
				BackgroundTransparency = 1,
				Size = UDim2.fromScale(1, 1),
				Parent = imageFrame,
			}, { Kit.corner() })
		elseif showPhoto then
			Kit.make("ImageLabel", {
				Image = page.image,
				ScaleType = Enum.ScaleType.Crop,
				BackgroundTransparency = 1,
				Size = UDim2.fromScale(1, 1),
				Parent = imageFrame,
			}, { Kit.corner() })
		else
			FunnyCard.render(imageFrame, page)
		end
		if photo or page.image then
			local flip = Instance.new("TextButton")
			flip.Name = "PictureToggle"
			flip.AnchorPoint = Vector2.new(1, 0)
			flip.Position = UDim2.new(1, -6, 0, 6)
			flip.Size = UDim2.fromOffset(30, 30)
			flip.BackgroundColor3 = Color3.new(0, 0, 0)
			flip.BackgroundTransparency = 0.35
			flip.Text = showPhoto and "🤪" or "📷"
			flip.TextScaled = true
			flip.ZIndex = 8
			flip.Parent = imageFrame
			Kit.corner().Parent = flip
			flip.Activated:Connect(function()
				Sound.play("boing")
				WikiBrowser.preferFunny = not WikiBrowser.preferFunny
				drawPicture()
			end)
		end
		if caption then
			caption.Text = (showPhoto and photo and photo.credit) and ("📷 " .. photo.credit)
				or (showPhoto and page.category or ("🤪 Meme card · " .. page.category))
		end
	end
	drawPicture()
	iy += imageHeight + 6
	caption = Kit.text({
		text = page.category,
		style = "tiny",
		tone = "textFaint",
		align = Enum.TextXAlignment.Center,
		Size = UDim2.new(1, -20, 0, 28),
		Parent = infobox,
	})
	caption.TextWrapped = true
	caption.Position = UDim2.fromOffset(10, iy)
	drawPicture()
	iy += 34
	local labelWidth = math.floor((infoboxWidth - 20) * 0.38)
	for _, row in page.infobox do
		local label = Kit.text({
			text = row.label,
			style = "tiny",
			font = "fontBold",
			Size = UDim2.fromOffset(labelWidth, 18),
			Parent = infobox,
		})
		label.Position = UDim2.fromOffset(10, iy)
		label.TextYAlignment = Enum.TextYAlignment.Top
		local valueFrame = Kit.frame({
			Position = UDim2.fromOffset(10 + labelWidth + 6, iy),
			Size = UDim2.fromOffset(infoboxWidth - labelWidth - 26, 0),
			Parent = infobox,
		})
		local height =
			FlowText.render(valueFrame, row.runs, self:_textStyle(14), infoboxWidth - labelWidth - 26, onLink)
		iy += math.max(20, height) + 6
	end
	iy += 6
	infobox.Size = UDim2.fromOffset(infoboxWidth, iy)

	-- Article column
	local columnX = 0
	local columnWidth = width
	local articleTop = y
	if narrow then
		infobox.Position = UDim2.fromOffset(0, y)
		articleTop = y + iy + 16
	else
		infobox.Position = UDim2.fromOffset(width - infoboxWidth, y)
		columnWidth = width - infoboxWidth - GAP
	end
	local ay = articleTop
	local function paragraph(runs)
		local holder = Kit.frame({
			Position = UDim2.fromOffset(columnX, ay),
			Size = UDim2.fromOffset(columnWidth, 0),
			Parent = content,
		})
		local height = FlowText.render(holder, runs, self:_textStyle(), columnWidth, onLink)
		ay += height + 12
	end
	paragraph(page.summary)
	for _, section in page.sections do
		ay += 6
		local sectionTitle = Kit.text({
			text = section.heading,
			style = "h2",
			size = 22,
			font = "fontHeading",
			Size = UDim2.fromOffset(columnWidth, 30),
			Parent = content,
		})
		Theme.bind(sectionTitle, { TextColor3 = "heading" })
		sectionTitle.Position = UDim2.fromOffset(columnX, ay)
		ay += 32
		local line = Kit.divider()
		line.Size = UDim2.fromOffset(columnWidth, 1)
		line.Position = UDim2.fromOffset(columnX, ay)
		line.Parent = content
		ay += 10
		for _, runs in section.paragraphs do
			paragraph(runs)
		end
	end
	if page.source == "wikipedia" then
		paragraph({
			{
				t = 'Text adapted from the Wikipedia article "'
					.. page.title
					.. '" (CC BY-SA 4.0) and shortened for Wiki Race. Photos from Wikimedia Commons.',
			},
		})
	end
	local bottom = math.max(ay, narrow and ay or (y + iy))

	-- See also
	if page.related and #page.related > 0 then
		bottom += 10
		local seeAlso = Kit.text({
			text = "See also",
			style = "h2",
			size = 20,
			font = "fontHeading",
			Size = UDim2.fromOffset(width, 28),
			Parent = content,
		})
		Theme.bind(seeAlso, { TextColor3 = "heading" })
		seeAlso.Position = UDim2.fromOffset(0, bottom)
		bottom += 34
		local row = Kit.frame({
			Position = UDim2.fromOffset(0, bottom),
			Size = UDim2.fromOffset(width, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			Parent = content,
		})
		local layout = Kit.list("x", 8, "Left", "Top")
		layout.Wraps = true
		layout.Parent = row
		for index, related in page.related do
			local chip = Kit.button({
				text = related.emoji .. "  " .. related.title,
				variant = "secondary",
				textSize = 14,
				font = "fontBold",
				Size = UDim2.fromOffset(
					FlowText.measure(related.emoji .. "  " .. related.title, t.fontBold, 14) + 36,
					34
				),
				order = index,
				Parent = row,
				sound = false,
				onClick = function(button)
					self:_onLink(related.id, button)
				end,
			})
			Theme.bind(chip, { TextColor3 = "link" })
			chip.Active = self.interactive
		end
		local widths = {}
		for _, related in page.related do
			table.insert(widths, FlowText.measure(related.emoji .. "  " .. related.title, t.fontBold, 14) + 36)
		end
		bottom += wrapRows(widths, width, 8) * 42 + 6
	end

	-- Categories
	bottom += 12
	local catBox = Kit.make("Frame", {
		Name = "Categories",
		Position = UDim2.fromOffset(0, bottom),
		Size = UDim2.fromOffset(width, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BorderSizePixel = 0,
		Parent = content,
		Theme = { BackgroundColor3 = "surface2" },
	}, { Kit.corner(), Kit.padding(8, 10, 8, 10) })
	local catLayout = Kit.list("x", 6, "Left", "Center")
	catLayout.Wraps = true
	catLayout.Parent = catBox
	Kit.text({
		text = "Categories:",
		style = "tiny",
		font = "fontBold",
		Size = UDim2.fromOffset(78, 24),
		Parent = catBox,
		order = 0,
	})
	for index, name in page.categories do
		local chip = Kit.chip(name, nil, { Parent = catBox, order = index })
		if self.mode == "free" and self.opts.onCategory then
			local button = Instance.new("TextButton")
			button.BackgroundTransparency = 1
			button.Text = ""
			button.Size = UDim2.fromScale(1, 1)
			button.Parent = chip
			button.Activated:Connect(function()
				Sound.play("click")
				self.opts.onCategory(name)
			end)
			Theme.bind(chip, { TextColor3 = "link" })
		end
	end
	local catWidths = { 78 }
	for _, name in page.categories do
		table.insert(catWidths, FlowText.measure(name, t.fontBold, 13) + 20)
	end
	bottom += wrapRows(catWidths, width - 20, 6) * 30 + 22

	content.Size = UDim2.new(1, -56, 0, bottom)
	self.scroll.CanvasSize = UDim2.fromOffset(0, (bottom + 60) * 1)
	self:setInteractive(self.interactive)
end

function WikiBrowser:destroy()
	self.frame:Destroy()
end

return WikiBrowser
