-- End-to-end simulation of real Match code on a virtual clock: reveal timing, validated
-- navigation, completion, give-up, Server Rig, timer expiry, results and final standings.
return function(t, H)
	local runtime = H.installRuntime()
	local Config = H.shared("Config")
	local Net = H.shared("Net")
	local Router = H.server("Services/Router")
	local WikiService = H.server("Services/WikiService")
	local ChaosState = H.server("Services/ChaosState")
	local Match = H.server("Race/Match")

	WikiService.init()
	local graph = WikiService.graph

	-- Capture every push instead of firing remotes.
	local inbox = {}
	local function record(player, event, data)
		inbox[player.UserId] = inbox[player.UserId] or {}
		table.insert(inbox[player.UserId], { event = event, data = data })
	end
	Router.push = record
	Router.pushMany = function(players, event, data)
		for _, player in players do
			record(player, event, data)
		end
	end
	Router.pushAll = function() end
	Router.toast = function(player, text)
		record(player, Net.Events.Toast, { text = text })
	end
	local function last(userId, event)
		local events = inbox[userId] or {}
		for i = #events, 1, -1 do
			if events[i].event == event then
				return events[i].data
			end
		end
		return nil
	end

	local alice = runtime.addPlayer(101, "Alice")
	local bob = runtime.addPlayer(102, "Bob")
	local lobby = {
		members = { 101, 102 },
		hostId = 101,
		settings = {
			difficulty = "Medium",
			timer = "120",
			customSeconds = 180,
			rounds = 2,
			showMeters = true,
			showPages = false,
			allowChaos = true,
		},
	}
	local ended = false
	local match = Match.new(lobby, {
		onEnded = function()
			ended = true
		end,
		onChanged = function() end,
	})

	t.test("round 1 reveal, validated navigation and completion", function()
		match:start()
		runtime.advance(0.5)
		local start = last(101, Net.Events.RoundStart)
		t.ok(start, "RoundStart pushed")
		t.eq(start.difficulty, "Medium")
		t.ok(start.raceStartAt > start.targetRevealAt and start.targetRevealAt > start.revealStartAt, "reveal ordering")
		t.eq(start.endsAt, start.raceStartAt + 120, "2 minute timer")
		t.ok(graph:distance(start.start.id, start.target.id) >= Config.Race.FreezingDistance, "Medium starts Freezing")
		t.ok(#start.rollTitles > 10, "slot machine titles")
		t.eq(start.page.id, start.start.id, "start page payload prefetched")

		local path = graph:shortestPath(start.start.id, start.target.id)
		local early = match:navigate(alice, "link", path[2])
		t.eq(early, nil, "no moves during the reveal")

		runtime.advance(start.raceStartAt - runtime.clock + 0.1)
		t.eq(match.phase, "Racing")
		local cheat, message = match:navigate(alice, "link", start.target.id)
		t.ok(cheat == nil and message, "cannot jump straight to the target")

		for i = 2, #path do
			runtime.advance(1)
			local response = match:navigate(alice, "link", path[i])
			t.ok(response, "legal link " .. path[i])
		end
		local state = match.round.sessions[101]:snapshot()
		t.ok(state.completed, "alice completed")
		t.eq(state.temperature, "Completed")
		t.ok(math.abs(state.finishTime - (#path - 1) - 0.1) < 0.01, "server-timed finish")

		t.ok(match:giveUp(bob), "bob gives up")
		runtime.advance(1)
		local results = last(101, Net.Events.RoundResults)
		t.ok(results, "round ended once everyone finished")
		t.eq(results.rows[1].userId, 101, "alice first")
		t.ok(results.rows[1].completed and results.rows[1].score > 0)
		t.ok(results.rows[2].gaveUp, "bob tracked as gave up")
		t.eq(#results.optimalPath, #path, "optimal route shown")
		t.ok(not results.isFinal)
	end)

	t.test("server rig forces Give Up Mode without touching lobby settings", function()
		runtime.advance(Config.Race.RoundResultsSeconds + 1)
		local start = last(102, Net.Events.RoundStart)
		t.eq(start.round, 2)
		runtime.advance(start.raceStartAt - runtime.clock + 0.2)
		t.eq(match.phase, "Racing")
		-- Move a little so players are on different pages.
		local page = graph.nodes[start.start.id].out[1]
		t.ok(match:navigate(bob, "link", page))

		ChaosState.rigId += 1
		ChaosState.riggedUntil = runtime.clock + Config.Chaos.ServerRigWindowSeconds
		ChaosState.riggedBy = "Buyer"
		match:requestRig("Buyer", ChaosState.rigId)
		runtime.advance(0.5)
		local rigged = last(101, Net.Events.RoundRigged)
		t.ok(rigged, "RoundRigged pushed")
		t.eq(rigged.difficulty, "GiveUp")
		t.eq(rigged.by, "Buyer")
		t.eq(rigged.state.redosLeft, 0, "no redos in Give Up Mode")
		local round = match.round
		t.eq(round.difficulty, "GiveUp")
		for _, session in round.sessions do
			t.ok(graph:distance(session:current(), round.target) >= 5, "rig target is Freezing for everyone")
		end
		t.eq(lobby.settings.difficulty, "Medium", "lobby settings untouched")
		t.eq(match.settings.difficulty, "Medium", "match settings untouched")
		t.ok(
			round.endsAt - runtime.clock >= Config.Chaos.ServerRigMinRemainingSeconds - 0.01,
			"players get time to react"
		)

		-- Let the timer run out.
		runtime.advance(round.endsAt - runtime.clock + 1)
		local results = last(101, Net.Events.RoundResults)
		t.eq(results.round, 2)
		t.ok(results.rigged)
		t.ok(results.isFinal, "last round")
	end)

	t.test("final ceremony with podium standings and awards", function()
		runtime.advance(Config.Race.RoundResultsSeconds + 1)
		local final = last(101, Net.Events.MatchResults)
		t.ok(final, "MatchResults pushed")
		t.eq(#final.standings, 2)
		t.eq(final.standings[1].userId, 101, "alice wins")
		t.eq(final.awards.fastestTime.userId, 101)
		t.eq(final.awards.fewestClicks.userId, 101)
		t.ok(ended, "lobby notified")
		t.eq(lobby.settings.difficulty, "Medium", "next match uses host settings")
	end)

	t.test("next match rounds use the host's settings again", function()
		local again = Match.new(lobby, { onEnded = function() end, onChanged = function() end })
		again.lastRigId = ChaosState.rigId -- this lobby already consumed the rig
		again:start()
		runtime.advance(0.5)
		local start = last(101, Net.Events.RoundStart)
		t.eq(start.difficulty, "Medium")
		t.ok(not start.rigged)
		again:abort()
		runtime.advance(
			Config.Race.RevealStartSeconds
				+ Config.Race.RevealTargetSeconds
				+ Config.Race.CountdownSeconds
				+ Config.Race.RoundResultsSeconds
				+ 5
		)
	end)

	t.test("unlimited timer closes after half the lobby finishes; host can end", function()
		local carol = runtime.addPlayer(103, "Carol")
		local lobby2 = {
			members = { 101, 102, 103 },
			hostId = 101,
			settings = {
				difficulty = "SuperEasy",
				timer = "unlimited",
				customSeconds = 180,
				rounds = 0,
				showMeters = false,
				showPages = true,
				allowChaos = true,
			},
		}
		local done = false
		local m = Match.new(lobby2, {
			onEnded = function()
				done = true
			end,
			onChanged = function() end,
		})
		m.lastRigId = ChaosState.rigId
		m:start()
		runtime.advance(0.5)
		local start = last(103, Net.Events.RoundStart)
		t.eq(start.endsAt, nil, "no end time when unlimited")
		runtime.advance(start.raceStartAt - runtime.clock + 0.1)
		for _, player in { alice, bob } do
			local path = graph:shortestPath(start.start.id, start.target.id)
			for i = 2, #path do
				t.ok(m:navigate(player, "link", path[i]))
			end
		end
		runtime.advance(0.5)
		local closing = last(103, Net.Events.RoundClosing)
		t.ok(closing and closing.closesAt, "closing countdown started")
		-- Opponent visibility: meters hidden, pages shown.
		local opponents = last(103, Net.Events.Opponents)
		for _, row in opponents.rows do
			if row.userId ~= 103 then
				t.eq(row.temperature, nil, "opponent meter hidden")
				t.ok(row.page ~= nil, "opponent page visible")
			end
		end
		runtime.advance(Config.Race.UnlimitedClosingSeconds + 1)
		local results = last(103, Net.Events.RoundResults)
		t.ok(results and not results.isFinal, "unlimited rounds continue")
		m:requestEnd()
		runtime.advance(2)
		t.ok(done, "host ended the unlimited match")
		t.ok(last(103, Net.Events.MatchResults))
		runtime.removePlayer(carol)
	end)
end
