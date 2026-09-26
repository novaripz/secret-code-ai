return function(t, H)
	local WikiRepository = H.server("Wiki/WikiRepository")
	local RaceSession = H.server("Race/RaceSession")
	local graph = WikiRepository.new(H.loadAllPages()).graph

	local function newSession(options)
		options.graph = graph
		return RaceSession.new(options)
	end

	t.test("only real links can be followed", function()
		local s = newSession({ start = "pizza", target = "moon", redos = 3, startTime = 0 })
		local ok, err = s:apply("link", "moon", 1)
		t.ok(not ok and err == "NotALink", "teleport rejected")
		ok = s:apply("link", "italy", 1)
		t.ok(ok, "real link accepted")
		t.eq(s.clicks, 1)
		t.eq(s:current(), "italy")
	end)

	t.test("navigation before the start signal is rejected", function()
		local s = newSession({ start = "pizza", target = "moon", redos = 3, startTime = 10 })
		local ok, err = s:apply("link", "italy", 5)
		t.ok(not ok and err == "NotStarted")
	end)

	t.test("back spends a redo, forward costs a click, and redos run out", function()
		local s = newSession({ start = "pizza", target = "moon", redos = 1, startTime = 0 })
		s:apply("link", "italy", 1)
		s:apply("link", "rome", 2)
		t.ok(s:apply("back", nil, 3))
		t.eq(s.redosUsed, 1)
		t.eq(s:current(), "italy")
		t.ok(s:apply("forward", nil, 4))
		t.eq(s.clicks, 3)
		t.eq(s:current(), "rome")
		local ok, err = s:apply("back", nil, 5)
		t.ok(not ok and err == "NoRedos", "no redos left")
		t.ok(not s:canBack())
	end)

	t.test("restart and history jumps are validated redos", function()
		local s = newSession({ start = "pizza", target = "moon", redos = 5, startTime = 0 })
		s:apply("link", "italy", 1)
		s:apply("link", "rome", 2)
		t.ok(not s:apply("history", "moon", 3), "cannot jump to an unvisited page")
		t.ok(s:apply("history", "pizza", 3))
		t.eq(s:current(), "pizza")
		t.eq(s.redosUsed, 1)
		s:apply("link", "italy", 4)
		t.ok(s:apply("restart", nil, 5))
		t.eq(s.redosUsed, 2)
		t.eq(s:current(), "pizza")
	end)

	t.test("reaching the target completes with server time", function()
		local path = graph:shortestPath("pizza", "moon")
		local s = newSession({ start = "pizza", target = "moon", redos = 0, startTime = 100 })
		local sawBurning = false
		for i = 2, #path do
			t.ok(s:apply("link", path[i], 100 + i))
			if s:temperature() == "Burning" then
				sawBurning = true
			end
		end
		t.ok(s.completed and s.finished)
		t.eq(s:temperature(), "Completed")
		t.eq(s.finishTime, #path)
		t.eq(s.clicks, #path - 1)
		t.ok(sawBurning and s.reachedBurning)
		t.ok(not s:apply("link", "italy", 200), "no moves after finishing")
	end)

	t.test("giving up is tracked and final", function()
		local s = newSession({ start = "pizza", target = "moon", redos = 2, startTime = 0 })
		t.ok(s:giveUp(30))
		t.ok(s.gaveUp and s.finished and not s.completed)
		t.ok(not s:giveUp(31))
	end)

	t.test("server rig retargets and removes redos", function()
		local s = newSession({ start = "pizza", target = "moon", redos = 4, startTime = 0 })
		s:apply("link", "italy", 1)
		s:apply("back", nil, 2)
		s:retarget("tardigrade", 0)
		t.eq(s.target, "tardigrade")
		t.eq(s:redosLeft(), 0)
		t.eq(s.redosUsed, 1, "redo history preserved")
	end)

	t.test("free roam has no redo cost or target", function()
		local s = newSession({ start = "pizza", mode = "free", startTime = 0 })
		s:apply("link", "italy", 1)
		t.ok(s:apply("back", nil, 2))
		t.eq(s.redosUsed, 0)
		t.eq(s:temperature(), nil)
	end)
end
