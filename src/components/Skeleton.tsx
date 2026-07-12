import React from 'react';

export function Shimmer() {
  return (
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
  );
}

export function CardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-slate-100/50 flex flex-col gap-3">
      <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
      <div className="h-8 w-40 rounded bg-slate-100 animate-pulse mt-1" />
      <div className="h-3 w-32 rounded bg-slate-100 animate-pulse" />
      <Shimmer />
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="relative overflow-hidden flex items-center justify-between p-4 rounded-xl bg-white border border-slate-50/50 mb-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse" />
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-28 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="h-5 w-24 rounded bg-slate-100 animate-pulse" />
      <Shimmer />
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-slate-100/50 flex flex-col gap-4 items-center justify-center min-h-[300px]">
      <div className="w-48 h-48 rounded-full border-12 border-slate-100 animate-pulse flex items-center justify-center" />
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-3 w-12 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-3 w-12 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <Shimmer />
    </div>
  );
}
