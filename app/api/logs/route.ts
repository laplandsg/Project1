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

// GET /api/logs?code=your-sync-code
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing sync code" }, { status: 400 });
  }

  try {
    const data = await redis.get(`baby_tracker_${code.toLowerCase()}`);
    
    let payload = null;
    if (data) {
      try {
        payload = JSON.parse(data);
      } catch (e) {
        console.error("Error parsing string from Redis:", e);
      }
    }

    return NextResponse.json(payload || { 
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