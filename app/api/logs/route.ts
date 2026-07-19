import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Auto-loads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from your environment variables
const redis = Redis.fromEnv();

// GET /api/logs?code=your-sync-code
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing sync code" }, { status: 400 });
  }

  try {
    const data = await redis.get(`baby_tracker_${code.toLowerCase()}`);
    return NextResponse.json(data || { feedLog: [], peeLog: [], poopLog: [], lastReset: 0 });
  } catch (error) {
    console.error("Database read error:", error);
    return NextResponse.json({ error: "Failed to read data" }, { status: 500 });
  }
}

// POST /api/logs
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, feedLog, peeLog, poopLog, lastReset } = body;

    if (!code) {
      return NextResponse.json({ error: "Missing sync code" }, { status: 400 });
    }

    await redis.set(`baby_tracker_${code.toLowerCase()}`, {
      feedLog,
      peeLog,
      poopLog,
      lastReset,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database write error:", error);
    return NextResponse.json({ error: "Failed to write data" }, { status: 500 });
  }
}