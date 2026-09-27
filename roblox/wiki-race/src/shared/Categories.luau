-- Broad article categories. Every wiki page declares exactly one of these as its `category`
-- (plus any number of free-form tags). Groups drive "interesting pair" rules in challenge
-- generation: starts and targets should usually come from different groups.

local Categories = {}

Categories.Defs = {
	["Person"] = { group = "People", emoji = "👤", color = Color3.fromRGB(99, 102, 241) },
	["Athlete"] = { group = "People", emoji = "🏅", color = Color3.fromRGB(234, 88, 12) },
	["Musician"] = { group = "People", emoji = "🎤", color = Color3.fromRGB(219, 39, 119) },
	["Actor"] = { group = "People", emoji = "🎭", color = Color3.fromRGB(190, 24, 93) },
	["Fictional Character"] = { group = "Fiction", emoji = "🦸", color = Color3.fromRGB(220, 38, 38) },
	["Anime"] = { group = "Fiction", emoji = "🌸", color = Color3.fromRGB(236, 72, 153) },
	["Film"] = { group = "Fiction", emoji = "🎬", color = Color3.fromRGB(124, 58, 237) },
	["Television"] = { group = "Fiction", emoji = "📺", color = Color3.fromRGB(109, 40, 217) },
	["Book"] = { group = "Culture", emoji = "📚", color = Color3.fromRGB(146, 64, 14) },
	["Video Game"] = { group = "Games", emoji = "🎮", color = Color3.fromRGB(22, 163, 74) },
	["Company"] = { group = "Society", emoji = "🏢", color = Color3.fromRGB(71, 85, 105) },
	["Organization"] = { group = "Society", emoji = "🏛️", color = Color3.fromRGB(51, 65, 85) },
	["Country"] = { group = "Places", emoji = "🗺️", color = Color3.fromRGB(13, 148, 136) },
	["City"] = { group = "Places", emoji = "🏙️", color = Color3.fromRGB(8, 145, 178) },
	["Landmark"] = { group = "Places", emoji = "🗽", color = Color3.fromRGB(2, 132, 199) },
	["Geography"] = { group = "Earth", emoji = "🏔️", color = Color3.fromRGB(21, 128, 61) },
	["Animal"] = { group = "Nature", emoji = "🐾", color = Color3.fromRGB(161, 98, 7) },
	["Plant"] = { group = "Nature", emoji = "🌿", color = Color3.fromRGB(77, 124, 15) },
	["Food"] = { group = "Food", emoji = "🍽️", color = Color3.fromRGB(234, 88, 12) },
	["Sport"] = { group = "Sports", emoji = "⚽", color = Color3.fromRGB(22, 101, 52) },
	["Science"] = { group = "Science", emoji = "🔬", color = Color3.fromRGB(37, 99, 235) },
	["Space"] = { group = "Science", emoji = "🪐", color = Color3.fromRGB(67, 56, 202) },
	["Mathematics"] = { group = "Science", emoji = "➗", color = Color3.fromRGB(79, 70, 229) },
	["Technology"] = { group = "Technology", emoji = "💻", color = Color3.fromRGB(14, 116, 144) },
	["Programming"] = { group = "Technology", emoji = "⌨️", color = Color3.fromRGB(15, 118, 110) },
	["Invention"] = { group = "Technology", emoji = "💡", color = Color3.fromRGB(202, 138, 4) },
	["Engineering"] = { group = "Technology", emoji = "⚙️", color = Color3.fromRGB(87, 83, 78) },
	["Vehicle"] = { group = "Technology", emoji = "🚗", color = Color3.fromRGB(185, 28, 28) },
	["History"] = { group = "History", emoji = "📜", color = Color3.fromRGB(120, 53, 15) },
	["Event"] = { group = "History", emoji = "📅", color = Color3.fromRGB(154, 52, 18) },
	["Art"] = { group = "Culture", emoji = "🎨", color = Color3.fromRGB(192, 38, 211) },
	["Music"] = { group = "Culture", emoji = "🎵", color = Color3.fromRGB(168, 85, 247) },
	["Mythology"] = { group = "Culture", emoji = "🐉", color = Color3.fromRGB(180, 83, 9) },
	["Object"] = { group = "Everyday", emoji = "📦", color = Color3.fromRGB(100, 116, 139) },
	["Concept"] = { group = "Ideas", emoji = "💭", color = Color3.fromRGB(71, 85, 105) },
	["Meme"] = { group = "Internet", emoji = "🤪", color = Color3.fromRGB(217, 70, 239) },
}

Categories.Fallback = { group = "Misc", emoji = "📄", color = Color3.fromRGB(100, 116, 139) }

-- Weighted "interesting route" templates: start category → target category.
Categories.PairTemplates = {
	{ weight = 5, from = { "Person", "Athlete", "Musician", "Actor" }, to = { "Country", "City", "Landmark" } },
	{ weight = 4, from = { "Video Game" }, to = { "Concept", "Science", "Mathematics", "History" } },
	{ weight = 4, from = { "Food" }, to = { "Country", "City", "Geography" } },
	{ weight = 4, from = { "Animal", "Plant" }, to = { "Science", "Space", "Mathematics", "Technology" } },
	{ weight = 3, from = { "Company" }, to = { "Invention", "Technology", "Event" } },
	{ weight = 4, from = { "Film", "Television", "Anime" }, to = { "City", "Landmark", "Country", "Geography" } },
	{ weight = 3, from = { "Sport", "Athlete" }, to = { "Country", "Invention", "Science" } },
	{ weight = 3, from = { "Technology", "Programming", "Invention" }, to = { "Event", "History", "Person" } },
	{ weight = 3, from = { "Mythology", "Book", "Art" }, to = { "Space", "Animal", "Technology", "Vehicle" } },
	{ weight = 3, from = { "Fictional Character" }, to = { "Food", "Science", "Vehicle", "Country" } },
	{ weight = 3, from = { "Musician", "Music" }, to = { "Technology", "Invention", "Geography" } },
	{ weight = 2, from = { "Landmark", "City", "Country" }, to = { "Animal", "Food", "Video Game" } },
	{ weight = 2, from = { "Space", "Science", "Mathematics" }, to = { "Film", "Video Game", "Sport", "Food" } },
	{ weight = 2, from = { "History", "Event" }, to = { "Food", "Video Game", "Animal", "Music" } },
	{ weight = 2, from = { "Object", "Concept" }, to = { "Person", "Athlete", "Musician", "Landmark" } },
	{ weight = 2, from = { "Vehicle", "Engineering" }, to = { "Art", "Mythology", "Music", "Food" } },
	{ weight = 3, from = { "Meme" }, to = { "Science", "History", "Country", "Mathematics", "Space" } },
	{ weight = 2, from = { "Science", "History", "Mathematics", "Book" }, to = { "Meme" } },
}

function Categories.get(category: string?)
	return (category and Categories.Defs[category]) or Categories.Fallback
end

function Categories.group(category: string?): string
	return Categories.get(category).group
end

return Categories
