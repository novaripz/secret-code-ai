-- Token-bucket rate limiter keyed by player (or any key).

local RateLimiter = {}
RateLimiter.__index = RateLimiter

function RateLimiter.new(ratePerSecond: number, burst: number)
	return setmetatable({ rate = ratePerSecond, burst = burst, buckets = {} }, RateLimiter)
end

function RateLimiter:allow(key, now: number): boolean
	local bucket = self.buckets[key]
	if not bucket then
		bucket = { tokens = self.burst, at = now }
		self.buckets[key] = bucket
	end
	bucket.tokens = math.min(self.burst, bucket.tokens + (now - bucket.at) * self.rate)
	bucket.at = now
	if bucket.tokens >= 1 then
		bucket.tokens -= 1
		return true
	end
	return false
end

function RateLimiter:forget(key)
	self.buckets[key] = nil
end

return RateLimiter
