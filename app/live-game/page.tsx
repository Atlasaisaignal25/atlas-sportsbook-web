"use client";

import { useSearchParams, useRouter } from "next/navigation";

export default function LiveGamePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sport = searchParams.get("sport") || "NHL";
  const gameId = searchParams.get("gameId") || "";

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5">
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80"
          >
            Back
          </button>

          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/90">
            Atlas Signals
          </p>
        </div>

        <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
            {sport}
          </p>

          <h1 className="mt-2 text-[24px] font-bold tracking-tight text-white">
            Game Detail
          </h1>

          <p className="mt-2 text-sm text-white/50">
            Game ID: {gameId || "N/A"}
          </p>
        </section>

        <section className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Signal Detected
          </p>

          <p className="mt-3 text-[20px] font-semibold tracking-tight text-white">
            Pending Signal
          </p>

          <p className="mt-2 text-[12px] uppercase tracking-[0.08em] text-white/50">
            Status: Pending
          </p>
        </section>

        <section className="mt-4 rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Unlock More
          </p>

          <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-white">
            Validate this signal with a subscription
          </h2>

          <p className="mt-2 text-sm leading-6 text-white/70">
            Subscribe to unlock confirmed signals, ranked Top 5 plays and premium signal access.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Exclusive: Top 5
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Premium: Ranked + Top Signal
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Elite: Top by Sport
            </span>
          </div>

          <button className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all">
            View Subscription Options
          </button>
        </section>
      </div>
    </main>
  );
}