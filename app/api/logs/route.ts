import Redis from "ioredis";
import { NextResponse } from "next/server";

const redisUrl = process.env.REDIS_URL || "redis://default:khRyqWekqbdjvwaILW4jsXrIFUEKAqs6@zipper-formal-cover-24405.db.redis.io:13961";

let redis: Redis;

try {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 10000,
  });
} catch (error) {
  console.error("Failed to initialize Redis:", error);
}

// Helper to determine the SG 08:00 AM reset epoch timestamp
const getSGResetTimestamp = (date: Date): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, number> = {};
  parts.forEach((p) => {
    if (p.type !== "literal") {
      map[p.type] = parseInt(p.value, 10);
    }
  });

  let targetYear = map.year;
  let targetMonth = map.month - 1;
  let targetDay = map.day;

  if (map.hour < 8) {
    const prevDate = new Date(Date.UTC(map.year, map.month - 1, map.day - 1));
    targetYear = prevDate.getUTCFullYear();
    targetMonth = prevDate.getUTCMonth();
    targetDay = prevDate.getUTCDate();
  }

  return Date.UTC(targetYear, targetMonth, targetDay, 0, 0, 0);
};

// GET /api/logs?code=your-sync-code
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing sync code" }, { status: 400 });
  }

  try {
    const rawData = await redis.get(`baby_tracker_${code.toLowerCase()}`);
    
    let data: any = null;
    if (rawData) {
      try {
        data = JSON.parse(rawData);
      } catch (e) {
        console.error("Error parsing Redis data:", e);
      }
    }

    if (data) {
      const now = new Date();
      const activeResetBound = getSGResetTimestamp(now);
      const lastReset = data.lastReset ? parseInt(data.lastReset, 10) : 0;

      // SERVER-SIDE RESET: If the daily boundary has crossed, update database immediately
      if (activeResetBound > lastReset) {
        const resetData = {
          feedLog: [],
          peeLog: [],
          poopLog: [],
          lastReset: activeResetBound,
          // Explicitly carry over the absolute historical poop timestamps
          lastPoopTimestamp: data.lastPoopTimestamp || null,
          historicalLastPoop: data.lastPoopTimestamp || data.historicalLastPoop || null
        };

        await redis.set(`baby_tracker_${code.toLowerCase()}`, JSON.stringify(resetData));
        return NextResponse.json(resetData);
      }
    }

    return NextResponse.json(data || { 
      feedLog: [], 
      peeLog: [], 
      poopLog: [], 
      lastReset: 0,
      lastPoopTimestamp: null,
      historicalLastPoop: null
    });
  } catch (error) {
    console.error("Database read error:", error);
    return NextResponse.json({ error: "Failed to read data" }, { status: 500 });
  }
}

// POST /api/logs
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, feedLog, peeLog, poopLog, lastReset, lastPoopTimestamp, historicalLastPoop } = body;

    if (!code) {
      return NextResponse.json({ error: "Missing sync code" }, { status: 400 });
    }

    const payloadString = JSON.stringify({
      code,
      feedLog,
      peeLog,
      poopLog,
      lastReset,
      lastPoopTimestamp,
      historicalLastPoop
    });

    await redis.set(`baby_tracker_${code.toLowerCase()}`, payloadString);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database write error:", error);
    return NextResponse.json({ error: "Failed to write data" }, { status: 500 });
  }
}