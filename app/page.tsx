"use client";

import React, { useState, useEffect } from "react";

// TIME UTILITIES FORCE-CALIBRATED TO GMT+8 (Asia/Singapore)
const formatSGDate = (date: Date): string => {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
};

const formatSGTime = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

// Returns the SG time split into pieces
const getSGTimeParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, number> = {};
  parts.forEach((p) => {
    if (p.type !== "literal") {
      map[p.type] = parseInt(p.value, 10);
    }
  });
  return {
    year: map.year,
    month: map.month - 1, // 0-indexed month
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
};

// Converts an epoch timestamp to a 24-hour time string "HH:MM" in Singapore timezone
const getSG24hTime = (timestamp: number): string => {
  const d = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  let h = "00";
  let m = "00";
  parts.forEach((p) => {
    if (p.type === "hour") h = p.value.padStart(2, "0");
    if (p.type === "minute") m = p.value.padStart(2, "0");
  });
  if (h === "24") h = "00";
  return `${h}:${m}`;
};

// Calculates the timestamp (UTC milliseconds) of the most recent 08:00 AM Singapore time
const getSGResetTimestamp = (date: Date): number => {
  const sg = getSGTimeParts(date);
  let targetYear = sg.year;
  let targetMonth = sg.month;
  let targetDay = sg.day;

  // If the Singapore hour is before 8:00 AM, the reset period dates back to yesterday's 8:00 AM
  if (sg.hour < 8) {
    const prevDate = new Date(Date.UTC(sg.year, sg.month, sg.day - 1));
    targetYear = prevDate.getUTCFullYear();
    targetMonth = prevDate.getUTCMonth();
    targetDay = prevDate.getUTCDate();
  }

  // 08:00 AM Singapore time always aligns exactly with 00:00:00 UTC on the target day
  return Date.UTC(targetYear, targetMonth, targetDay, 0, 0, 0);
};

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Core Data Logs (Epoch timestamps)
  const [feedLog, setFeedLog] = useState<number[]>([]);
  const [peeLog, setPeeLog] = useState<number[]>([]);
  const [poopLog, setPoopLog] = useState<number[]>([]);

  // Feed Interval Option (Whole number from 1 to 10)
  const [feedIntervalInput, setFeedIntervalInput] = useState<string>("3");

  // Inline Editing State for Feeds
  const [editingFeedIndex, setEditingFeedIndex] = useState<number | null>(null);
  const [editTimeValue, setEditTimeValue] = useState<string>("");

  // Load state and evaluate daily 08:00 AM boundary triggers
  useEffect(() => {
    const now = new Date();
    setCurrentTime(now);

    const activeResetBound = getSGResetTimestamp(now);
    const storedResetBound = localStorage.getItem("io_chart_last_reset");

    let shouldClear = false;

    if (storedResetBound) {
      const lastReset = parseInt(storedResetBound, 10);
      if (activeResetBound > lastReset) {
        shouldClear = true;
      }
    } else {
      localStorage.setItem("io_chart_last_reset", activeResetBound.toString());
    }

    if (shouldClear) {
      // Clear data for the new day starting at 08:00 AM
      localStorage.setItem("io_chart_feed_log", JSON.stringify([]));
      localStorage.setItem("io_chart_pee_log", JSON.stringify([]));
      localStorage.setItem("io_chart_poop_log", JSON.stringify([]));
      localStorage.setItem("io_chart_last_reset", activeResetBound.toString());
      setFeedLog([]);
      setPeeLog([]);
      setPoopLog([]);
    } else {
      // Load saved logs
      const savedFeeds = localStorage.getItem("io_chart_feed_log");
      const savedPees = localStorage.getItem("io_chart_pee_log");
      const savedPoops = localStorage.getItem("io_chart_poop_log");
      const savedInterval = localStorage.getItem("io_chart_feed_interval");

      if (savedFeeds) setFeedLog(JSON.parse(savedFeeds));
      if (savedPees) setPeeLog(JSON.parse(savedPees));
      if (savedPoops) setPoopLog(JSON.parse(savedPoops));
      if (savedInterval) setFeedIntervalInput(savedInterval);
    }

    setMounted(true);
  }, []);

  // Update Clock & Periodic Check for 08:00 AM trigger
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      const activeResetBound = getSGResetTimestamp(now);
      const storedResetBound = localStorage.getItem("io_chart_last_reset");

      if (storedResetBound) {
        const lastReset = parseInt(storedResetBound, 10);
        if (activeResetBound > lastReset) {
          // Trigger automated clean-up
          setFeedLog([]);
          setPeeLog([]);
          setPoopLog([]);
          localStorage.setItem("io_chart_feed_log", JSON.stringify([]));
          localStorage.setItem("io_chart_pee_log", JSON.stringify([]));
          localStorage.setItem("io_chart_poop_log", JSON.stringify([]));
          localStorage.setItem("io_chart_last_reset", activeResetBound.toString());
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Sync log array data into local storage safely
  const updateLog = (
    type: "feed" | "pee" | "poop",
    newLog: number[]
  ) => {
    const key = `io_chart_${type}_log`;
    localStorage.setItem(key, JSON.stringify(newLog));
    if (type === "feed") setFeedLog(newLog);
    if (type === "pee") setPeeLog(newLog);
    if (type === "poop") setPoopLog(newLog);
  };

  const handleIncrement = (type: "feed" | "pee" | "poop") => {
    const nowTimestamp = Date.now();
    let targetLog: number[] = [];
    if (type === "feed") targetLog = [...feedLog];
    if (type === "pee") targetLog = [...peeLog];
    if (type === "poop") targetLog = [...poopLog];

    targetLog.push(nowTimestamp);
    updateLog(type, targetLog);
  };

  const handleDecrement = (type: "feed" | "pee" | "poop") => {
    let targetLog: number[] = [];
    if (type === "feed") targetLog = [...feedLog];
    if (type === "pee") targetLog = [...peeLog];
    if (type === "poop") targetLog = [...poopLog];

    if (targetLog.length > 0) {
      targetLog.pop();
      updateLog(type, targetLog);
    }
  };

  const handleIntervalChange = (val: string) => {
    setFeedIntervalInput(val);
    localStorage.setItem("io_chart_feed_interval", val);
  };

  // Trigger inline editing for a feed log index
  const startEditingFeed = (index: number) => {
    setEditingFeedIndex(index);
    setEditTimeValue(getSG24hTime(feedLog[index]));
  };

  // Save the retrospectively edited feed timestamp
  const saveEditedFeed = (index: number) => {
    const originalTimestamp = feedLog[index];
    const sgParts = getSGTimeParts(new Date(originalTimestamp));

    const [hoursStr, minutesStr] = editTimeValue.split(":");
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    // Compute UTC equivalent base: local SG time = UTC + 8 -> UTC time = local SG time - 8 hours
    const utcBase = Date.UTC(sgParts.year, sgParts.month, sgParts.day, hours, minutes, 0);
    const newSGEpoch = utcBase - 8 * 60 * 60 * 1000;

    const updatedLog = [...feedLog];
    updatedLog[index] = newSGEpoch;

    // Sort chronologically in case parent changed order
    updatedLog.sort((a, b) => a - b);

    updateLog("feed", updatedLog);
    setEditingFeedIndex(null);
  };

  // Safe parsed interval for display math (fallback to 3 if input is invalid or out of bounds)
  const parsedInterval = parseInt(feedIntervalInput, 10);
  const validInterval = !isNaN(parsedInterval) && parsedInterval >= 1 && parsedInterval <= 10
    ? parsedInterval
    : 3;

  // Next feed timing calculations
  const calculateNextFeed = (): string => {
    if (feedLog.length === 0) return "Not scheduled";
    const lastFeedTime = feedLog[feedLog.length - 1];
    const nextFeedDate = new Date(lastFeedTime + validInterval * 60 * 60 * 1000);
    return formatSGTime(nextFeedDate);
  };

  // Safeguard view against server-side rendering mismatch
  if (!mounted || !currentTime) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-stone-400 p-6 space-y-2">
        <p className="animate-pulse font-medium text-lg">Loading Chart...</p>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      
      {/* Header section */}
      <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-stone-200/60 pb-6 mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">Cedric&apos;s IO chart</h1>
          <p className="text-sm font-medium text-stone-400 mt-1 uppercase tracking-wider">becos GS</p>
        </div>
        
        {/* Dynamic Display in GMT+8 */}
        <div className="bg-stone-100 rounded-2xl px-5 py-3 flex flex-row md:flex-col items-center md:items-end justify-between gap-4 md:gap-1 shadow-sm/5 border border-stone-200/40">
          <span className="text-stone-500 font-medium text-sm">
            {formatSGDate(currentTime)}
          </span>
          <span className="text-stone-800 font-bold text-lg tabular-nums">
            {formatSGTime(currentTime)}
          </span>
        </div>
      </header>

      {/* Info indicator */}
      <div className="mb-6 flex items-center justify-between text-xs text-stone-400 font-medium bg-stone-50 border border-stone-200/50 rounded-xl px-4 py-2.5">
        <span>🔄 Dashboard automatically resets daily at 08:00 AM (GMT+8)</span>
      </div>

      {/* 3 Main Grid Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* 1. FEEDING SECTION (Color Theme: #FAE1DD) */}
        <section className="bg-[#FAE1DD] border border-[#ECD1CD] rounded-3xl p-6 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              🍼 Feeding
            </h2>
            <span className="bg-[#F5CECA] text-[#863730] text-xs font-bold px-2.5 py-1 rounded-full">
              Feed Counter
            </span>
          </div>

          {/* Large display counter */}
          <div className="text-center my-6">
            <div className="text-6xl font-black text-[#863730] tabular-nums">
              {feedLog.length}
            </div>
            <p className="text-xs text-[#863730]/80 font-medium mt-1">feeds today</p>
          </div>

          {/* Massive Mobile-Optimized Action Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => handleDecrement("feed")}
              disabled={feedLog.length === 0}
              className="h-18 md:h-22 bg-white/80 hover:bg-white active:scale-95 disabled:opacity-40 disabled:hover:bg-white/80 disabled:pointer-events-none border border-[#E9C4BF] rounded-2xl text-[#863730] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
              title="Decrease feed"
            >
              −
            </button>
            <button
              onClick={() => handleIncrement("feed")}
              className="h-18 md:h-22 bg-[#F7CECA] hover:bg-[#F2BDBC] active:scale-95 rounded-2xl text-[#6D2721] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
              title="Increase feed"
            >
              +
            </button>
          </div>

          {/* Log List with Inline Time Editor */}
          <div className="flex-1 bg-white/65 rounded-2xl p-4 border border-[#ECD1CD]/50 min-h-[140px] max-h-[160px] overflow-y-auto mb-6">
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide block mb-2">Logs</span>
            {feedLog.length === 0 ? (
              <p className="text-xs text-stone-400 italic mt-6 text-center">No feeds logged since 0800 AM</p>
            ) : (
              <ul className="space-y-2">
                {feedLog.map((timestamp, index) => (
                  <li key={index} className="text-xs font-semibold text-stone-600 flex justify-between items-center py-0.5 border-b border-stone-100 last:border-0 pb-1.5 last:pb-0">
                    {editingFeedIndex === index ? (
                      <div className="flex items-center gap-2 w-full justify-between">
                        <span className="font-bold text-stone-500">Edit #{index + 1}</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={editTimeValue}
                            onChange={(e) => setEditTimeValue(e.target.value)}
                            className="text-xs font-bold px-2 py-1 border border-stone-300 rounded bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-[#863730]"
                          />
                          <button
                            onClick={() => saveEditedFeed(index)}
                            className="text-[10px] bg-[#863730] text-white font-bold px-2 py-1 rounded hover:bg-[#6D2721]"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingFeedIndex(null)}
                            className="text-[10px] text-stone-500 hover:text-stone-700 font-bold px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span>Feed #{index + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums font-bold text-stone-700">
                            {formatSGTime(new Date(timestamp))}
                          </span>
                          <button
                            onClick={() => startEditingFeed(index)}
                            className="text-[10px] bg-white/90 hover:bg-white text-stone-500 hover:text-stone-800 px-2 py-0.5 rounded border border-stone-200 shadow-sm font-semibold"
                          >
                            Edit
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Calculated Next Planned Feed Section */}
          <div className="border-t border-[#ECD1CD]/70 pt-4 mt-auto">
            <div className="bg-white/50 border border-[#F5C9C4] rounded-2xl p-3 text-center">
              <span className="text-xs font-semibold text-[#863730]/80 uppercase tracking-wider block">Next Feed Due</span>
              <span className="text-base font-black text-[#6D2721] block mt-1">
                {calculateNextFeed()}
              </span>
            </div>

            {/* Interval modifier custom input */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <label htmlFor="feed-interval" className="text-xs text-stone-600 font-semibold">
                Interval (1-10 hrs):
              </label>
              <input
                id="feed-interval"
                type="number"
                min="1"
                max="10"
                step="1"
                value={feedIntervalInput}
                onChange={(e) => handleIntervalChange(e.target.value)}
                className="w-16 text-center text-xs font-bold py-1.5 px-2 bg-white border border-stone-200 focus:outline-none focus:ring-1 focus:ring-[#863730] rounded-lg text-stone-700"
                placeholder="3"
              />
            </div>
            {(!feedIntervalInput || isNaN(parsedInterval) || parsedInterval < 1 || parsedInterval > 10) && (
              <p className="text-[10px] text-red-600 font-medium mt-1.5 text-right">
                Please enter a whole number from 1 to 10
              </p>
            )}
          </div>
        </section>


        {/* 2. PEEING SECTION (Color Theme: #D8E2DC) */}
        <section className="bg-[#D8E2DC] border border-[#CAD4CE] rounded-3xl p-6 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              💧 Peeing
            </h2>
            <span className="bg-[#CAD4CE] text-[#3E5C56] text-xs font-bold px-2.5 py-1 rounded-full">
              Pee Counter
            </span>
          </div>

          {/* Large display counter */}
          <div className="text-center my-6">
            <div className="text-6xl font-black text-[#3E5C56] tabular-nums">
              {peeLog.length}
            </div>
            <p className="text-xs text-[#3E5C56]/80 font-medium mt-1">occurrences today</p>
          </div>

          {/* Massive Mobile-Optimized Action Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => handleDecrement("pee")}
              disabled={peeLog.length === 0}
              className="h-18 md:h-22 bg-white/80 hover:bg-white active:scale-95 disabled:opacity-40 disabled:hover:bg-white/80 disabled:pointer-events-none border border-[#C6D1CA] rounded-2xl text-[#3E5C56] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
              title="Decrease pee"
            >
              −
            </button>
            <button
              onClick={() => handleIncrement("pee")}
              className="h-18 md:h-22 bg-[#CAD4CE] hover:bg-[#BEC8C2] active:scale-95 rounded-2xl text-[#2F4440] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
              title="Increase pee"
            >
              +
            </button>
          </div>

          {/* Log List */}
          <div className="flex-1 bg-white/65 rounded-2xl p-4 border border-[#CAD4CE]/50 min-h-[140px] max-h-[160px] overflow-y-auto">
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide block mb-2">Logs</span>
            {peeLog.length === 0 ? (
              <p className="text-xs text-stone-400 italic mt-6 text-center">No pees logged since 0800 AM</p>
            ) : (
              <ul className="space-y-1.5">
                {peeLog.map((timestamp, index) => (
                  <li key={index} className="text-xs font-semibold text-stone-600 flex justify-between py-0.5 border-b border-stone-100 last:border-0 pb-1.5 last:pb-0">
                    <span>Pee #{index + 1}</span>
                    <span className="tabular-nums font-bold text-stone-700">{formatSGTime(new Date(timestamp))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>


        {/* 3. POOING SECTION (Color Theme: #F8EDEB) */}
        <section className="bg-[#F8EDEB] border border-[#ECE0DE] rounded-3xl p-6 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              💩 Pooing
            </h2>
            <span className="bg-[#EFE2DF] text-[#7A5853] text-xs font-bold px-2.5 py-1 rounded-full">
              Poo Counter
            </span>
          </div>

          {/* Large display counter */}
          <div className="text-center my-6">
            <div className="text-6xl font-black text-[#7A5853] tabular-nums">
              {poopLog.length}
            </div>
            <p className="text-xs text-[#7A5853]/80 font-medium mt-1">occurrences today</p>
          </div>

          {/* Massive Mobile-Optimized Action Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => handleDecrement("poop")}
              disabled={poopLog.length === 0}
              className="h-18 md:h-22 bg-white/80 hover:bg-white active:scale-95 disabled:opacity-40 disabled:hover:bg-white/80 disabled:pointer-events-none border border-[#E9DAD8] rounded-2xl text-[#7A5853] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
              title="Decrease poo"
            >
              −
            </button>
            <button
              onClick={() => handleIncrement("poop")}
              className="h-18 md:h-22 bg-[#EFE2DF] hover:bg-[#E3D4D1] active:scale-95 rounded-2xl text-[#533935] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
              title="Increase poo"
            >
              +
            </button>
          </div>

          {/* Log List */}
          <div className="flex-1 bg-white/65 rounded-2xl p-4 border border-[#ECE0DE]/50 min-h-[140px] max-h-[160px] overflow-y-auto">
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide block mb-2">Logs</span>
            {poopLog.length === 0 ? (
              <p className="text-xs text-stone-400 italic mt-6 text-center">No poos logged since 0800 AM</p>
            ) : (
              <ul className="space-y-1.5">
                {poopLog.map((timestamp, index) => (
                  <li key={index} className="text-xs font-semibold text-stone-600 flex justify-between py-0.5 border-b border-stone-100 last:border-0 pb-1.5 last:pb-0">
                    <span>Poo #{index + 1}</span>
                    <span className="tabular-nums font-bold text-stone-700">{formatSGTime(new Date(timestamp))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}