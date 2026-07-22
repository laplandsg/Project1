"use client";

import React, { useState, useEffect, useRef } from "react";

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
    month: map.month - 1,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
};

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

const getSGResetTimestamp = (date: Date): number => {
  const sg = getSGTimeParts(date);
  let targetYear = sg.year;
  let targetMonth = sg.month;
  let targetDay = sg.day;

  if (sg.hour < 8) {
    const prevDate = new Date(Date.UTC(sg.year, sg.month, sg.day - 1));
    targetYear = prevDate.getUTCFullYear();
    targetMonth = prevDate.getUTCMonth();
    targetDay = prevDate.getUTCDate();
  }

  return Date.UTC(targetYear, targetMonth, targetDay, 0, 0, 0);
};

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Core Data Logs
  const [feedLog, setFeedLog] = useState<number[]>([]);
  const [peeLog, setPeeLog] = useState<number[]>([]);
  const [poopLog, setPoopLog] = useState<number[]>([]);
  const [feedIntervalInput, setFeedIntervalInput] = useState<string>("3");

  // Non-resetting Poop memory states
  const [lastPoopTimestamp, setLastPoopTimestamp] = useState<number | null>(null);
  const [historicalLastPoop, setHistoricalLastPoop] = useState<number | null>(null);

  // Sync / Cloud States
  const [syncCode, setSyncCode] = useState<string>("");
  const [syncInput, setSyncInput] = useState<string>("");
  const [syncStatus, setSyncStatus] = useState<"local" | "syncing" | "synced" | "error">("local");

  // Inline Editing State for Feeds
  const [editingFeedIndex, setEditingFeedIndex] = useState<number | null>(null);
  const [editTimeValue, setEditTimeValue] = useState<string>("");

  // Keep ref of logs to prevent closure races during sync fetches
  const stateRef = useRef({ feedLog, peeLog, poopLog, lastPoopTimestamp, historicalLastPoop, syncCode });
  useEffect(() => {
    stateRef.current = { feedLog, peeLog, poopLog, lastPoopTimestamp, historicalLastPoop, syncCode };
  }, [feedLog, peeLog, poopLog, lastPoopTimestamp, historicalLastPoop, syncCode]);

  // Initial local or cloud setup
  useEffect(() => {
    const now = new Date();
    setCurrentTime(now);

    const savedCode = localStorage.getItem("io_chart_sync_code") || "";
    if (savedCode) {
      setSyncCode(savedCode);
      setSyncInput(savedCode);
      fetchFromCloud(savedCode);
    } else {
      loadLocalStorage(now);
    }

    setMounted(true);
  }, []);

  // Update Clock & 10s background sync poll
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      const activeResetBound = getSGResetTimestamp(now);
      const storedResetBound = localStorage.getItem("io_chart_last_reset");

      if (storedResetBound) {
        const lastReset = parseInt(storedResetBound, 10);
        if (activeResetBound > lastReset) {
          // Reset local active states only.
          // In sync mode, the server handles resetting the DB cleanly.
          handleStateResetLocal(activeResetBound);
        }
      }
    }, 1000);

    const syncInterval = setInterval(() => {
      if (stateRef.current.syncCode && editingFeedIndex === null) {
        fetchFromCloud(stateRef.current.syncCode, true);
      }
    }, 10000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(syncInterval);
    };
  }, [editingFeedIndex]);

  const loadLocalStorage = (now: Date) => {
    const activeResetBound = getSGResetTimestamp(now);
    const storedResetBound = localStorage.getItem("io_chart_last_reset");
    let shouldClear = false;

    if (storedResetBound) {
      if (activeResetBound > parseInt(storedResetBound, 10)) {
        shouldClear = true;
      }
    } else {
      localStorage.setItem("io_chart_last_reset", activeResetBound.toString());
    }

    if (shouldClear) {
      // Local-only reset routine
      handleStateResetLocal(activeResetBound);
    } else {
      const savedFeeds = localStorage.getItem("io_chart_feed_log");
      const savedPees = localStorage.getItem("io_chart_pee_log");
      const savedPoops = localStorage.getItem("io_chart_poop_log");
      const savedInterval = localStorage.getItem("io_chart_feed_interval");

      const savedLastPoop = localStorage.getItem("io_chart_last_poop_timestamp");
      const savedHistPoop = localStorage.getItem("io_chart_historical_poop");

      if (savedFeeds) setFeedLog(JSON.parse(savedFeeds));
      if (savedPees) setPeeLog(JSON.parse(savedPees));
      if (savedPoops) setPoopLog(JSON.parse(savedPoops));
      if (savedInterval) setFeedIntervalInput(savedInterval);

      if (savedLastPoop) setLastPoopTimestamp(parseInt(savedLastPoop, 10));
      if (savedHistPoop) setHistoricalLastPoop(parseInt(savedHistPoop, 10));
    }
  };

  const handleStateResetLocal = (resetTime: number) => {
    setFeedLog([]);
    setPeeLog([]);
    setPoopLog([]);

    localStorage.setItem("io_chart_feed_log", JSON.stringify([]));
    localStorage.setItem("io_chart_pee_log", JSON.stringify([]));
    localStorage.setItem("io_chart_poop_log", JSON.stringify([]));
    localStorage.setItem("io_chart_last_reset", resetTime.toString());

    // Carry forward pooping timestamps
    const finalPreservedPoop = stateRef.current.lastPoopTimestamp;
    if (finalPreservedPoop) {
      setLastPoopTimestamp(finalPreservedPoop);
      setHistoricalLastPoop(finalPreservedPoop);
      localStorage.setItem("io_chart_last_poop_timestamp", finalPreservedPoop.toString());
      localStorage.setItem("io_chart_historical_poop", finalPreservedPoop.toString());
    }
  };

  // Cloud Database Interactions
  const fetchFromCloud = async (code: string, isSilent = false) => {
    if (!isSilent) setSyncStatus("syncing");
    try {
      const res = await fetch(`/api/logs?code=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();

      // The server resolves any 08:00 AM reset checks securely and returns a safe payload
      setFeedLog(data.feedLog || []);
      setPeeLog(data.peeLog || []);
      setPoopLog(data.poopLog || []);

      setLastPoopTimestamp(data.lastPoopTimestamp || null);
      setHistoricalLastPoop(data.historicalLastPoop || null);

      localStorage.setItem("io_chart_feed_log", JSON.stringify(data.feedLog || []));
      localStorage.setItem("io_chart_pee_log", JSON.stringify(data.peeLog || []));
      localStorage.setItem("io_chart_poop_log", JSON.stringify(data.poopLog || []));
      
      if (data.lastPoopTimestamp) {
        localStorage.setItem("io_chart_last_poop_timestamp", data.lastPoopTimestamp.toString());
      } else {
        localStorage.removeItem("io_chart_last_poop_timestamp");
      }

      if (data.historicalLastPoop) {
        localStorage.setItem("io_chart_historical_poop", data.historicalLastPoop.toString());
      } else {
        localStorage.removeItem("io_chart_historical_poop");
      }

      if (data.lastReset) {
        localStorage.setItem("io_chart_last_reset", data.lastReset.toString());
      }
      
      setSyncStatus("synced");
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
    }
  };

  const pushToCloud = async (
    code: string,
    f: number[],
    pe: number[],
    po: number[],
    lastPoop?: number | null,
    histPoop?: number | null
  ) => {
    setSyncStatus("syncing");
    try {
      const rTime = parseInt(localStorage.getItem("io_chart_last_reset") || "0", 10);
      const lp = lastPoop !== undefined ? lastPoop : stateRef.current.lastPoopTimestamp;
      const hp = histPoop !== undefined ? histPoop : stateRef.current.historicalLastPoop;

      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          feedLog: f,
          peeLog: pe,
          poopLog: po,
          lastReset: rTime,
          lastPoopTimestamp: lp,
          historicalLastPoop: hp,
        }),
      });
      if (!res.ok) throw new Error("Push failed");
      setSyncStatus("synced");
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
    }
  };

  // State log updates (handles dual local + cloud targets)
  const updateLog = (
    type: "feed" | "pee" | "poop",
    newLog: number[],
    newLp?: number | null,
    newHp?: number | null
  ) => {
    const key = `io_chart_${type}_log`;
    localStorage.setItem(key, JSON.stringify(newLog));

    let f = feedLog;
    let pe = peeLog;
    let po = poopLog;
    let lp = lastPoopTimestamp;
    let hp = historicalLastPoop;

    if (type === "feed") { setFeedLog(newLog); f = newLog; }
    if (type === "pee") { setPeeLog(newLog); pe = newLog; }
    if (type === "poop") {
      setPoopLog(newLog);
      po = newLog;
      if (newLp !== undefined) {
        setLastPoopTimestamp(newLp);
        lp = newLp;
        if (newLp) {
          localStorage.setItem("io_chart_last_poop_timestamp", newLp.toString());
        } else {
          localStorage.removeItem("io_chart_last_poop_timestamp");
        }
      }
      if (newHp !== undefined) {
        setHistoricalLastPoop(newHp);
        hp = newHp;
        if (newHp) {
          localStorage.setItem("io_chart_historical_poop", newHp.toString());
        } else {
          localStorage.removeItem("io_chart_historical_poop");
        }
      }
    }

    if (syncCode) {
      pushToCloud(syncCode, f, pe, po, lp, hp);
    }
  };

  const handleIncrement = (type: "feed" | "pee" | "poop") => {
    const nowTimestamp = Date.now();
    let targetLog: number[] = [];
    if (type === "feed") targetLog = [...feedLog];
    if (type === "pee") targetLog = [...peeLog];
    
    if (type === "poop") {
      targetLog = [...poopLog, nowTimestamp];
      updateLog(type, targetLog, nowTimestamp, historicalLastPoop);
    } else {
      targetLog.push(nowTimestamp);
      updateLog(type, targetLog);
    }
  };

  const handleDecrement = (type: "feed" | "pee" | "poop") => {
    let targetLog: number[] = [];
    if (type === "feed") targetLog = [...feedLog];
    if (type === "pee") targetLog = [...peeLog];
    if (type === "poop") targetLog = [...poopLog];

    if (targetLog.length > 0) {
      targetLog.pop();
      if (type === "poop") {
        if (targetLog.length > 0) {
          const previousTodayPoop = targetLog[targetLog.length - 1];
          updateLog(type, targetLog, previousTodayPoop, historicalLastPoop);
        } else {
          updateLog(type, targetLog, historicalLastPoop, historicalLastPoop);
        }
      } else {
        updateLog(type, targetLog);
      }
    }
  };

  const handleConnectSync = () => {
    if (syncCode) {
      setSyncCode("");
      setSyncInput("");
      localStorage.removeItem("io_chart_sync_code");
      setSyncStatus("local");
      loadLocalStorage(new Date());
    } else {
      const code = syncInput.trim().toLowerCase();
      if (code) {
        setSyncCode(code);
        localStorage.setItem("io_chart_sync_code", code);
        fetchFromCloud(code);
      }
    }
  };

  const handleIntervalChange = (val: string) => {
    setFeedIntervalInput(val);
    localStorage.setItem("io_chart_feed_interval", val);
  };

  const startEditingFeed = (index: number) => {
    setEditingFeedIndex(index);
    setEditTimeValue(getSG24hTime(feedLog[index]));
  };

  const saveEditedFeed = (index: number) => {
    const originalTimestamp = feedLog[index];
    const sgParts = getSGTimeParts(new Date(originalTimestamp));

    const [hoursStr, minutesStr] = editTimeValue.split(":");
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    const utcBase = Date.UTC(sgParts.year, sgParts.month, sgParts.day, hours, minutes, 0);
    const newSGEpoch = utcBase - 8 * 60 * 60 * 1000;

    const updatedLog = [...feedLog];
    updatedLog[index] = newSGEpoch;
    updatedLog.sort((a, b) => a - b);

    updateLog("feed", updatedLog);
    setEditingFeedIndex(null);
  };

  const parsedInterval = parseInt(feedIntervalInput, 10);
  const validInterval = !isNaN(parsedInterval) && parsedInterval >= 1 && parsedInterval <= 10
    ? parsedInterval
    : 3;

  const calculateNextFeed = (): string => {
    if (feedLog.length === 0) return "Not scheduled";
    const lastFeedTime = feedLog[feedLog.length - 1];
    const nextFeedDate = new Date(lastFeedTime + validInterval * 60 * 60 * 1000);
    return formatSGTime(nextFeedDate);
  };

  const formatLastPoopDisplay = (timestamp: number | null): string => {
    if (!timestamp) return "No poo logged yet";
    const d = new Date(timestamp);
    return `${formatSGDate(d)}, ${formatSGTime(d)}`;
  };

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

      {/* Sync Management Panel */}
      <div className="mb-6 bg-stone-50 border border-stone-200/60 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              syncStatus === "synced" ? "bg-emerald-400" : syncStatus === "syncing" ? "bg-amber-400" : syncStatus === "error" ? "bg-rose-400" : "bg-stone-400"
            }`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${
              syncStatus === "synced" ? "bg-emerald-500" : syncStatus === "syncing" ? "bg-amber-500" : syncStatus === "error" ? "bg-rose-500" : "bg-stone-500"
            }`}></span>
          </span>
          <span className="text-xs font-semibold text-stone-600">
            {syncStatus === "synced" && `Synced with code: "${syncCode}"`}
            {syncStatus === "syncing" && "Syncing with cloud..."}
            {syncStatus === "error" && "Sync connection error."}
            {syncStatus === "local" && "Offline / Local-only mode"}
          </span>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Sync Code..."
            value={syncInput}
            onChange={(e) => setSyncInput(e.target.value)}
            className="text-xs font-bold px-3 py-2 border border-stone-200 rounded-xl bg-white w-full md:w-48 text-stone-700 placeholder-stone-400 focus:outline-none"
          />
          <button
            onClick={handleConnectSync}
            className="text-xs bg-stone-800 text-white font-bold px-4 py-2 rounded-xl hover:bg-stone-700 active:scale-95 transition-all"
          >
            {syncCode ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>

      {/* 3 Main Grid Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* 1. FEEDING SECTION */}
        <section className="bg-[#FAE1DD] border border-[#ECD1CD] rounded-3xl p-6 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">🍼 Feeding</h2>
            <span className="bg-[#F5CECA] text-[#863730] text-xs font-bold px-2.5 py-1 rounded-full">Feed Counter</span>
          </div>

          <div className="text-center my-6">
            <div className="text-6xl font-black text-[#863730] tabular-nums">{feedLog.length}</div>
            <p className="text-xs text-[#863730]/80 font-medium mt-1">feeds today</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => handleDecrement("feed")}
              disabled={feedLog.length === 0}
              className="h-18 md:h-22 bg-white/80 hover:bg-white active:scale-95 disabled:opacity-40 disabled:hover:bg-white/80 disabled:pointer-events-none border border-[#E9C4BF] rounded-2xl text-[#863730] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
            >
              −
            </button>
            <button
              onClick={() => handleIncrement("feed")}
              className="h-18 md:h-22 bg-[#F7CECA] hover:bg-[#F2BDBC] active:scale-95 rounded-2xl text-[#6D2721] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
            >
              +
            </button>
          </div>

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
                            className="text-xs font-bold px-2 py-1 border border-stone-300 rounded bg-white text-stone-800 focus:outline-none"
                          />
                          <button
                            onClick={() => saveEditedFeed(index)}
                            className="text-[10px] bg-[#863730] text-white font-bold px-2 py-1 rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingFeedIndex(null)}
                            className="text-[10px] text-stone-500 font-bold px-1"
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
                            className="text-[10px] bg-white/90 hover:bg-white text-stone-500 px-2 py-0.5 rounded border border-stone-200 font-semibold"
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

          <div className="border-t border-[#ECD1CD]/70 pt-4 mt-auto">
            <div className="bg-white/50 border border-[#F5C9C4] rounded-2xl p-3 text-center">
              <span className="text-xs font-semibold text-[#863730]/80 uppercase tracking-wider block">Next Feed Due</span>
              <span className="text-base font-black text-[#6D2721] block mt-1">{calculateNextFeed()}</span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <label htmlFor="feed-interval" className="text-xs text-stone-600 font-semibold">Interval (1-10 hrs):</label>
              <input
                id="feed-interval"
                type="number"
                min="1"
                max="10"
                step="1"
                value={feedIntervalInput}
                onChange={(e) => handleIntervalChange(e.target.value)}
                className="w-16 text-center text-xs font-bold py-1.5 px-2 bg-white border border-stone-200 focus:outline-none rounded-lg text-stone-700"
              />
            </div>
          </div>
        </section>


        {/* 2. PEEING SECTION */}
        <section className="bg-[#D8E2DC] border border-[#CAD4CE] rounded-3xl p-6 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">💧 Peeing</h2>
            <span className="bg-[#CAD4CE] text-[#3E5C56] text-xs font-bold px-2.5 py-1 rounded-full">Pee Counter</span>
          </div>

          <div className="text-center my-6">
            <div className="text-6xl font-black text-[#3E5C56] tabular-nums">{peeLog.length}</div>
            <p className="text-xs text-[#3E5C56]/80 font-medium mt-1">occurrences today</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => handleDecrement("pee")}
              disabled={peeLog.length === 0}
              className="h-18 md:h-22 bg-white/80 hover:bg-white active:scale-95 disabled:opacity-40 disabled:hover:bg-white/80 disabled:pointer-events-none border border-[#C6D1CA] rounded-2xl text-[#3E5C56] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
            >
              −
            </button>
            <button
              onClick={() => handleIncrement("pee")}
              className="h-18 md:h-22 bg-[#CAD4CE] hover:bg-[#BEC8C2] active:scale-95 rounded-2xl text-[#2F4440] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
            >
              +
            </button>
          </div>

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


        {/* 3. POOING SECTION */}
        <section className="bg-[#F8EDEB] border border-[#ECE0DE] rounded-3xl p-6 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">💩 Pooing</h2>
            <span className="bg-[#EFE2DF] text-[#7A5853] text-xs font-bold px-2.5 py-1 rounded-full">Poo Counter</span>
          </div>

          <div className="text-center my-6">
            <div className="text-6xl font-black text-[#7A5853] tabular-nums">{poopLog.length}</div>
            <p className="text-xs text-[#7A5853]/80 font-medium mt-1">occurrences today</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => handleDecrement("poop")}
              disabled={poopLog.length === 0}
              className="h-18 md:h-22 bg-white/80 hover:bg-white active:scale-95 disabled:opacity-40 disabled:hover:bg-white/80 disabled:pointer-events-none border border-[#E9DAD8] rounded-2xl text-[#7A5853] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
            >
              −
            </button>
            <button
              onClick={() => handleIncrement("poop")}
              className="h-18 md:h-22 bg-[#EFE2DF] hover:bg-[#E3D4D1] active:scale-95 rounded-2xl text-[#533935] font-black text-3xl transition-all shadow-sm flex items-center justify-center"
            >
              +
            </button>
          </div>

          <div className="flex-1 bg-white/65 rounded-2xl p-4 border border-[#ECE0DE]/50 min-h-[140px] max-h-[160px] overflow-y-auto mb-6">
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

          {/* Persistent Non-Resetting Last Poop Display */}
          <div className="border-t border-[#ECE0DE]/70 pt-4 mt-auto">
            <div className="bg-white/50 border border-[#E9DAD8] rounded-2xl p-3 text-center">
              <span className="text-xs font-semibold text-[#7A5853]/80 uppercase tracking-wider block">Last Poop Logged</span>
              <span className="text-base font-black text-[#533935] block mt-1">
                {formatLastPoopDisplay(lastPoopTimestamp)}
              </span>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}