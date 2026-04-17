"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function LiveGameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sport = searchParams.get("sport") || "MLB";
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

        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
              {sport}
            </p>
            <p className="mt-2 text-[13px] font-medium text-white/55">
              6:11 pm
            </p>
            <p className="mt-2 text-[11px] text-white/35 break-all">
              Game ID: {gameId}
            </p>
          </div>

          <div className="mt-2">
            <div className="mb-2 grid grid-cols-[128px_70px_70px_70px] gap-x-[6px]">
              <div />
              <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Spread
              </div>
              <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/75">
                Total
              </div>
              <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                ML
              </div>
            </div>

            <div className="grid grid-cols-[128px_70px_70px_70px] gap-x-[6px] gap-y-[8px] items-center">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 p-1">
                  <img
                    src="/team-logos/mlb/baltimoreorioles.png"
                    alt="Baltimore Orioles"
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="truncate text-[16px] font-medium tracking-tight text-white">
                  BAL
                </p>
              </div>

              <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                <span className="text-[13px] font-semibold leading-none text-white">
                  +1.5
                </span>
                <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                  -186
                </span>
              </div>

              <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                <span className="text-[13px] font-semibold leading-none text-white">
                  O 8
                </span>
                <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                  -108
                </span>
              </div>

              <div className="flex h-[64px] w-[70px] items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                <span className="text-[13px] font-semibold leading-none text-[#8f7cff]">
                  +119
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 p-1">
                  <img
                    src="/team-logos/mlb/clevelandguardians.png"
                    alt="Cleveland Guardians"
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="truncate text-[16px] font-medium tracking-tight text-white">
                  CLE
                </p>
              </div>

              <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                <span className="text-[13px] font-semibold leading-none text-white">
                  -1.5
                </span>
                <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                  +153
                </span>
              </div>

              <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                <span className="text-[13px] font-semibold leading-none text-white">
                  U 8
                </span>
                <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                  -112
                </span>
              </div>

              <div className="flex h-[64px] w-[70px] items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                <span className="text-[13px] font-semibold leading-none text-[#8f7cff]">
                  -143
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[22px] border border-cyan-400/25 bg-cyan-400/10 p-4">
            <div className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Signal Detected
            </div>

            <p className="text-[17px] font-semibold leading-tight tracking-tight text-white">
              Cleveland Guardians ML
            </p>

            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">
              Pending
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Unlock More
          </p>

          <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-white">
            Validate this signal with a subscription
          </h2>

          <p className="mt-2 text-sm leading-6 text-white/70">
            Subscribe to unlock confirmed signals, ranked Top 5 plays, premium signal access and stronger validation layers for this matchup.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Regular: Top 5
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Premium: Ranked + Top Signal
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Elite: Top by Sport
            </span>
          </div>

          <div className="mt-5 space-y-2 text-[13px] text-white/65">
            <p>• Confirmed signal access</p>
            <p>• Ranked top plays by sport</p>
            <p>• Premium signal visibility</p>
            <p>• Stronger daily decision support</p>
          </div>

          <button className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all">
            View Subscription Options
          </button>
        </section>
      </div>
    </main>
  );
}

export default function LiveGamePage() {
  return (
    <Suspense fallback={<div className="p-4 text-white">Loading...</div>}>
      <LiveGameContent />
    </Suspense>
  );
}