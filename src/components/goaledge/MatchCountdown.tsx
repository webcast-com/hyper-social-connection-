"use client";

import { useState, useEffect } from "react";
import { Timer } from "lucide-react";

export function MatchCountdown({ matchTime }: { matchTime: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  
  useEffect(() => {
    // Parse match time like "16 Jul, 01:08" and calculate time remaining
    const update = () => {
      const now = new Date();
      // Create a date from the match time format
      const parts = matchTime.match(/(\d+)\s+(\w+)\s*,\s*(\d+):(\d+)/);
      if (!parts) { setTimeLeft(""); return; }
      
      const day = parseInt(parts[1]);
      const monthMap: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const month = monthMap[parts[2]] ?? 0;
      const hours = parseInt(parts[3]);
      const mins = parseInt(parts[4]);
      
      const matchDate = new Date(now.getFullYear(), month, day, hours, mins);
      // If match date is in the past, assume it's the next month
      if (matchDate < now) {
        matchDate.setMonth(matchDate.getMonth() + 1);
      }
      
      const diff = matchDate.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeLeft("Starting soon");
        return;
      }
      
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [matchTime]);

  if (!timeLeft) return null;
  
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <Timer className="h-3 w-3" />
      {timeLeft}
    </span>
  );
}