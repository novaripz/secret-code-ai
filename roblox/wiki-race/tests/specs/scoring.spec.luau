return function(t, H)
	local Scoring = H.server("Race/Scoring")
	local Temperature = H.shared("Temperature")

	local function result(userId, completed, time, clicks, redos, extra)
		local r = {
			userId = userId,
			completed = completed,
			time = time,
			clicks = clicks,
			redos = redos,
			startDistance = 5,
			optimal = 5,
			bestDistance = completed and 0 or 2,
		}
		for k, v in extra or {} do
			r[k] = v
		end
		return r
	end

	t.test("temperature thresholds", function()
		t.eq(Temperature.fromDistance(0), "Completed")
		t.eq(Temperature.fromDistance(1), "Burning")
		t.eq(Temperature.fromDistance(2), "Hot")
		t.eq(Temperature.fromDistance(3), "Warm")
		t.eq(Temperature.fromDistance(4), "Cold")
		t.eq(Temperature.fromDistance(5), "Freezing")
		t.eq(Temperature.fromDistance(9), "Freezing")
		t.eq(Temperature.fromDistance(math.huge), "Freezing")
	end)

	t.test("round ranking puts finishers first, by time then clicks", function()
		local results = {
			result(3, false, nil, 9, 0),
			result(1, true, 40, 7, 0),
			result(2, true, 40, 6, 1),
			result(4, true, 20, 12, 3),
		}
		Scoring.scoreRound(results, { difficulty = "Medium", timeLimit = 300 })
		t.eq(results[1].userId, 4)
		t.eq(results[2].userId, 2)
		t.eq(results[3].userId, 1)
		t.eq(results[4].userId, 3)
		t.ok(results[4].score > 0, "progress credit for unfinished player")
	end)

	t.test("scoring is deterministic and multi-factor", function()
		local function run()
			local results = { result(1, true, 60, 5, 0), result(2, true, 50, 14, 4) }
			Scoring.scoreRound(results, { difficulty = "Hard", timeLimit = 300 })
			local byId = {}
			for _, r in results do
				byId[r.userId] = r.score
			end
			return byId
		end
		local a, b = run(), run()
		t.eq(a[1], b[1])
		t.eq(a[2], b[2])
		-- Faster finisher with a sloppy route and redos should not automatically win the round.
		t.ok(a[1] > a[2], "efficient route beats fast-but-sloppy route")
	end)

	t.test("giving up halves progress except in Give Up Mode", function()
		local normal = Scoring.roundScore(result(1, false, nil, 4, 0, { gaveUp = true }), { difficulty = "Medium" })
		local stayed = Scoring.roundScore(result(1, false, nil, 4, 0), { difficulty = "Medium" })
		t.ok(normal < stayed, "surrender costs points")
		local giveUpMode = Scoring.roundScore(result(1, false, nil, 4, 0, { gaveUp = true }), { difficulty = "GiveUp" })
		local giveUpStay = Scoring.roundScore(result(1, false, nil, 4, 0), { difficulty = "GiveUp" })
		t.eq(giveUpMode, giveUpStay, "no surrender penalty in Give Up Mode")
	end)

	t.test("standings and awards", function()
		local rounds = {
			{ result(1, true, 30, 6, 1), result(2, true, 45, 5, 0) },
			{ result(1, true, 50, 9, 2), result(2, false, nil, 7, 0) },
		}
		local totals = {
			{ userId = 1, score = 3000, completedRounds = 2, totalTime = 80, totalClicks = 15, totalRedos = 3 },
			{ userId = 2, score = 3000, completedRounds = 1, totalTime = 345, totalClicks = 12, totalRedos = 0 },
		}
		Scoring.standings(totals)
		t.eq(totals[1].userId, 1, "tie broken by completed rounds")
		local awards = Scoring.awards(rounds, totals)
		t.eq(awards.fastestTime.userId, 1)
		t.eq(awards.fewestClicks.userId, 2)
		t.eq(awards.fewestRedos.userId, 2)
	end)
end
