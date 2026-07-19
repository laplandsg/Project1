import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Fallback chain to ensure we bind to whichever environment keys Vercel generated
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!redisUrl || !redisToken) {
  console.warn("⚠️ Redis Environment variables are missing. App is running in fallback local mode.");
}

const redis = new Redis({
  url: redisUrl || "",
  token: redisToken || "",
});

// GET /api/logs?code=your-sync-code
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing sync code" }, { status: 400 });
  }

  try {
    const data = await redis.get(`baby_tracker_${code.toLowerCase()}`);
    
    // Safely deserialize string payloads if stored as raw strings
    let payload = data;
    if (typeof data === "string") {
      try {
        payload = JSON.parse(data);
      } catch {
        // Fallback if data is not JSON string
      }
    }

    return NextResponse.json(payload || { feedLog: [], peeLog: [], poopLog: [], lastReset: 0 });
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