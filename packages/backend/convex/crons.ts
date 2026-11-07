import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"

const crons = cronJobs()

// Visitor analytics (analytics.ts): roll changed days up for the dashboard,
// and drop raw page views once they're old enough to live only in rollups.
crons.interval("analytics rollup", { minutes: 10 }, internal.analytics.rollup, {})
crons.daily("analytics prune", { hourUTC: 3, minuteUTC: 30 }, internal.analytics.prune, {})

export default crons
