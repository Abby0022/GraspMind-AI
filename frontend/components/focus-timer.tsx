"use client";

import { Coffee, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

export function FocusTimer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"focus" | "break">("focus");

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      // Automatically switch modes
      if (mode === "focus") {
        setMode("break");
        setTimeLeft(5 * 60);
      } else {
        setMode("focus");
        setTimeLeft(25 * 60);
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === "focus" ? 25 * 60 : 5 * 60);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`flex items-center h-9 px-3 rounded-full border transition-colors shadow-sm ${
        isActive ? "bg-[#e8f0fe] border-[#1a73e8]" : "bg-white border-[#e8eaed]"
      }`}
    >
      {/* Mode Indicator */}
      <div className="flex items-center gap-1.5 mr-3 border-r border-[#dadce0] pr-3">
        {mode === "focus" ? (
          <div
            className={`w-2 h-2 rounded-full ${isActive ? "bg-[#1a73e8] animate-pulse" : "bg-[#dadce0]"}`}
          />
        ) : (
          <Coffee
            className={`w-3.5 h-3.5 ${isActive ? "text-[#f59e0b]" : "text-[#bdc1c6]"}`}
          />
        )}
        <span
          className={`text-xs font-mono font-semibold tracking-tight tabular-nums ${
            isActive ? "text-[#1a73e8]" : "text-[#5f6368]"
          }`}
        >
          {formatTime(timeLeft)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTimer}
          className={`p-1 rounded hover:bg-[#f1f3f4] transition-colors ${
            isActive ? "text-[#1a73e8]" : "text-[#5f6368]"
          }`}
        >
          {isActive ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
        </button>
        <button
          onClick={resetTimer}
          className="p-1 rounded hover:bg-[#f1f3f4] text-[#9aa0a6] hover:text-[#5f6368] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
