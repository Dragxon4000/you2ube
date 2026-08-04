"use client";

export function XpBar({
  progress,
  current,
  next,
}: {
  progress: number;
  current: number;
  next: number;
}) {
  const percent = Math.round(progress * 100);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>{current} XP</span>
        <span>{next} XP</span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500 text-right">{percent}% to next level</p>
    </div>
  );
}
