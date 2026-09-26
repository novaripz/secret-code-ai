# Wiki Race (Roblox)

Start on one wiki page. Reach another. Only by clicking links. Beat everyone else.

A complete, UI-only multiplayer Roblox game written entirely in Luau: a 729-page encyclopedia
graph, an in-game wiki browser, server-authoritative races with a hot/cold meter, lobbies,
rounds, timers, scoring, a podium ceremony, persistent stats, world records, leaderboards,
achievements, ranks, cosmetics, game passes, developer products and the **Server Rig** chaos
button.

## Quick start (Roblox Studio)

1. Open **`build/WikiRace.rbxlx`** in Roblox Studio.
2. Press **Play**. You land on the main menu → **Quick Play** → **Start Match**.
3. To test multiplayer: **Test** tab → *Clients and Servers* → 2+ players → **Start**.

In Studio, game passes are auto-granted and developer products can be "bought" with a simulated
Studio purchase (no Robux). Both switches live in `Config.Studio` and are ignored on live servers.
If the place isn't published or API access is off, profiles are kept in memory for the session.

To rebuild the place after editing source: `rojo build default.project.json -o build/WikiRace.rbxlx`
(or `rojo serve` plus the Rojo Studio plugin for live sync).

## Before you publish

| What | Where |
|---|---|
| Publish the place, then **Game Settings → Security → Enable Studio Access to API Services** (for DataStores/MemoryStores in Studio) | Studio |
| Set max players per server (e.g. 30; lobbies hold 10) | Game Settings → Places |
| Create game passes **VIP** (299 R$) and **Jumpscare Pack** (149 R$), paste their IDs into `Config.GamePasses` | Creator Hub → Monetization → Passes |
| Create developer products **Server Rig** (199), **Rig a Player** (49), **500/1,500/5,000 Wiki Coins** and paste IDs into `Config.Products` | Creator Hub → Monetization → Developer Products |
| Upload the 31 generated sounds in `assets/sounds/*.ogg` (bulk import in Asset Manager works) and paste the IDs into `Config.Sounds` | Asset Manager / Creator Hub |
| Optional: create badges and paste IDs into `Config.Badges` | Creator Hub → Badges |
| Optional: upload page images and map page ids → `rbxassetid://…` in `Config.PageImages` | Creator Hub → Decals |

Until sounds are uploaded, a few sounds bundled with the Roblox client are used as fallbacks.
Pages without an image show a generated category card (emoji + color).

## How a race works

- **Start page → target page.** Everyone gets the same pair. Search is disabled during races;
  the only way to move is to click a link, and the server checks that link really exists on
  your current page.
- **Temperature meter** (true shortest-path distance, computed server-side):
  Freezing (5+) · Cold (4) · Warm (3) · Hot (2) · **Burning** (1, the target is linked on this page) · Completed.
- **Starting-page rule:** a round never starts Warm/Hot/Burning (minimum distance 4), and
  Medium/Hard/Extreme/Give Up always start Freezing (≥ 5). Every challenge is validated before
  the round starts; failing candidates are discarded and regenerated.
- **Browser navigation:** Back, Forward, Refresh and History behave like a real browser
  (a new link after going back clears forward history). **Back, History jumps and Restart
  route each spend a redo**; Forward re-follows a link and costs a click.
- **Difficulty** changes generation, not labels:

  | Difficulty | Start distance | Targets | Redos | Score × |
  |---|---|---|---|---|
  | Super Easy | exactly 4 | famous hubs with many links in | 8 | 0.8 |
  | Easy | 4–5 | well-known | 6 | 1.0 |
  | Medium | 5 (Freezing) | well-known, different subject | 4 | 1.3 |
  | Hard | 5–7, prefers 6 | lesser-known | 3 | 1.6 |
  | Extreme | 6–8, prefers 7 | obscure, few links in | 2 | 2.0 |
  | Give Up Mode | the farthest page available | obscure | 0 | 1.5 |

- **Interesting pairs:** targets and starts are drawn from weighted category templates
  (person → place, game → concept, food → country, animal → science, company → invention…),
  usually from different subject groups, avoiding recently used pages.
- **Timer:** 2 min, 5 min, unlimited, or custom (30–3600 s, validated server-side). With an
  unlimited timer, once half the lobby finishes everyone else gets 90 seconds.
- **Rounds:** 1–10 or unlimited (the host ends the match).
- **Scoring (deterministic):** completed = (600 + placement 100–500 + time 0–400 +
  route efficiency 0–400 − 50/redo, max 250) × difficulty. Not completed = progress toward the
  target 0–250 (halved for giving up, except in Give Up Mode). Match totals are ranked by score,
  then completed rounds, total time, clicks, redos. Special awards: fastest time, fewest clicks,
  fewest redos.

## Chaos

- **Server Rig (199 R$ developer product):** a giant *SERVER RIGGED* slam, siren and banner with
  the buyer's name for everyone on the server. Every race in progress switches to Give Up Mode
  (a new target that is Freezing for every player, zero redos, at least 90 s left on the clock),
  and rounds starting within 90 s are rigged too. Lobby settings are never modified, so the next
  round uses the host's settings again. It changes nobody's saved progress and gives the buyer
  no stats.
- **Rig a Player (49 R$ = one rig credit):** a 4-second harmless gag on a lobby-mate or friend
  (clown rain, jelly wobble, fake Burning, airhorn, fake warning). Sender cooldown 20 s, target
  protection 30 s, hosts can disable it per lobby, players can opt out in Settings.
- **Jumpscare Pack (game pass):** unlocks the scream and fake-crash jumpscares (free every 60 s)
  plus spooky cosmetics. Players who disable jumpscares receive a harmless warning instead.

Nothing can be bought that affects race calculations. Cosmetics are bought with Wiki Coins
(earned by racing and achievements, optionally topped up with coin packs) or come with a pass.

## Project layout

```
default.project.json        Rojo project (→ ReplicatedStorage / ServerScriptService / ServerStorage / StarterPlayerScripts)
build/WikiRace.rbxlx        Ready-to-open place file
assets/sounds/              Generated sound effects (tools/generate_sounds.py)
src/shared/                 Config, Difficulty, Temperature, Categories, Catalog, Achievements, Ranks, Net, Format, Signal
src/wikidata/               The encyclopedia: one module per domain, each returns a list of pages (server-only)
src/server/
  Main.server.luau          Boot order
  Wiki/                     TextUtil, BannedFilter, WikiGraph (BFS + SCC), WikiRepository, ChallengeGenerator
  Race/                     BrowserHistory, RaceSession, Scoring, Match (round state machine)
  Services/                 Router (+RateLimiter, Validate), WikiService, DataService, MonetizationService,
                            CosmeticService, AchievementService, RecordService, LeaderboardService,
                            LobbyService, LobbyDirectory (cross-server), ChaosService, ChaosState, FreeRoamService
src/client/
  Main.client.luau          Wires server pushes → UI, boot with retry
  Core/                     Net, Store, Sound
  UI/                       App shell, Kit (components), Theme + Themes, Anim, Fx
  UI/Components/            WikiBrowser, FlowText (inline links), TemperatureMeter, PlayerList
  UI/Screens/               Menu, Lobbies, LobbyRoom, Race, FreeRoam, Profile, Shop, Leaderboards, Settings
  UI/Overlays/              Reveal, RoundResults, FinalResults, Chaos, ChaosMenu, Announcer
tests/                      Luau test suites, graph report and a headless end-to-end smoke test
tools/                      Sound generator, Luau test runner source
```

## Wiki data format

Each module in `src/wikidata/` returns a list of pages. Add modules or pages freely; nothing
else needs to change.

```lua
{
	title = "Pizza",
	category = "Food",        -- one of Categories.Defs
	fame = 1,                 -- 1 household name · 2 well known · 3 niche (drives difficulty)
	emoji = "🍕",
	tags = { "Italian cuisine" },           -- extra categories
	aliases = { "Pizzas" },                 -- redirects
	summary = "**Pizza** is … from [[Naples]], [[Italy]].",
	sections = { { "History", "… [[Tomato|tomato]] …" } },
	infobox = { { "Origin", "[[Naples]]" } },
	related = { "Pasta" },                  -- "See also" links (also graph edges)
	image = nil,                            -- optional rbxassetid://
}
```

`[[Target]]` / `[[Target|label]]` become clickable links (edges) when the target page exists,
otherwise plain text. Run `tests/graph_report.luau` after editing to see unresolved links,
pages outside the main connected component and the distance distribution.

**Banned subjects** are removed in `src/server/Wiki/BannedFilter.luau` before the graph is
built: pages (and pages whose redirects name them), redirects, links pointing at them,
sentences mentioning them, categories and related entries. A final audit drops anything that
slips through, so they can't be a start, target, search result or part of any route.

## Server authority & anti-exploit

The server owns challenge generation and validation, the clock (`workspace:GetServerTimeNow()`),
every navigation (only real links, redo budget enforced), completion, clicks, redos, placement,
scores, records, stats, lobby state and host permissions, purchases (ProcessReceipt with
idempotent receipt tracking) and game pass ownership (UserOwnsGamePassAsync). Every request goes
through one Router with per-action rate limits and type/range validation. Clients never receive
distances, only the meter state. Profiles are session-locked to prevent cross-server overwrites.

## Tests

The tests run on a tiny Luau host (`tools/luaurun`, built with `cargo build --release`):

```
luaurun tests/run.luau .           # 32 unit/simulation tests (graph, generator rules, banned filter,
                                   #  navigation, scoring, full Match simulation incl. Server Rig)
luaurun tests/graph_report.luau .  # wiki health + generation stats per difficulty
luaurun tests/smoke.luau .         # headless end-to-end: real server + real client on a fake engine,
                                   #  playing a full session through the UI
```

The game has been exercised through these headless tests. It has not been play-tested inside
Roblox Studio yet, so expect some visual tuning (spacing, sizes) on first run.
