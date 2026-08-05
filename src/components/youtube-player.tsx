"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type PlayerStateEvent = {
  data: number;
  target: YouTubePlayer;
};

type PlayerReadyEvent = {
  target: YouTubePlayer;
};

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string;
      height?: string;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: PlayerReadyEvent) => void;
        onStateChange?: (event: PlayerStateEvent) => void;
        onError?: () => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
};

function formatSeconds(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve, reject) => {
    const previousReadyCallback = window.onYouTubeIframeAPIReady;
    let timeoutId: number | undefined;

    const finish = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player API did not load."));
    };

    window.onYouTubeIframeAPIReady = () => {
      previousReadyCallback?.();
      finish();
    };

    const existingScript = document.getElementById("youtube-iframe-api");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Unable to load the YouTube player API."));
      document.head.appendChild(script);
    }

    timeoutId = window.setTimeout(() => {
      if (window.YT?.Player) finish();
      else reject(new Error("YouTube player API timed out."));
    }, 12_000);
  });
}

type YouTubePlayerProps = {
  video: {
    id: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
  };
  durationSeconds: number;
  resumePositionSeconds: number;
  completed: boolean;
};

export function YouTubePlayer({
  video,
  durationSeconds,
  resumePositionSeconds,
  completed,
}: YouTubePlayerProps) {
  const playerMountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playbackIntervalRef = useRef<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasCompleted, setHasCompleted] = useState(completed);

  const updatePresence = useCallback(
    async (status: "online" | "offline", watching: boolean) => {
      const payload = {
        status,
        currentVideoId: watching ? video.id : null,
        currentVideoTitle: watching ? video.title : null,
      };
      try {
        await fetch("/api/social/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: status === "offline",
        });
      } catch {
        // Presence is best effort and must never interrupt playback.
      }
    },
    [video.id, video.title],
  );

  const sendOfflinePresence = useCallback(() => {
    if (!navigator.sendBeacon) return;
    navigator.sendBeacon(
      "/api/social/presence",
      new Blob(
        [JSON.stringify({ status: "offline", currentVideoId: null, currentVideoTitle: null })],
        { type: "application/json" },
      ),
    );
  }, []);

  const clearPlaybackInterval = useCallback(() => {
    if (playbackIntervalRef.current !== null) {
      window.clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
  }, []);

  const persistProgress = useCallback(
    async (options: { completed?: boolean; beacon?: boolean } = {}) => {
      const player = playerRef.current;
      if (!player) return;

      const currentTime = Math.max(0, Math.floor(player.getCurrentTime() || 0));
      const resolvedDuration = Math.max(
        0,
        Math.floor(player.getDuration() || durationSeconds || 0),
      );

      // A player that was merely loaded should not create history until it has
      // genuinely played, except for a confirmed ended event.
      if (!options.completed && currentTime < 1) return;

      const payload = {
        videoId: video.id,
        videoTitle: video.title,
        channelName: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl || null,
        durationSeconds: resolvedDuration || null,
        positionSeconds: currentTime,
        completed: options.completed === true,
      };

      if (options.beacon && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/watch",
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
        );
        return;
      }

      setSaveState("saving");
      try {
        const response = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: options.beacon === true,
        });
        if (!response.ok) throw new Error("Unable to save playback position.");
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [durationSeconds, video],
  );

  useEffect(() => {
    let isMounted = true;

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (!isMounted || !playerMountRef.current) return;

        playerRef.current = new YT.Player(playerMountRef.current, {
          width: "100%",
          height: "100%",
          videoId: video.id,
          playerVars: {
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (!isMounted) return;
              playerRef.current = event.target;
              setPlayerReady(true);
              void updatePresence("online", true);

              if (resumePositionSeconds > 3 && !completed) {
                event.target.seekTo(resumePositionSeconds, true);
              }
            },
            onStateChange: (event) => {
              if (!isMounted) return;

              if (event.data === PLAYER_STATE.PLAYING) {
                void updatePresence("online", true);
                void persistProgress();
                clearPlaybackInterval();
                playbackIntervalRef.current = window.setInterval(() => {
                  void persistProgress();
                }, 15_000);
                return;
              }

              if (event.data === PLAYER_STATE.PAUSED) {
                clearPlaybackInterval();
                void updatePresence("online", true);
                void persistProgress();
                return;
              }

              if (event.data === PLAYER_STATE.ENDED) {
                clearPlaybackInterval();
                setHasCompleted(true);
                void updatePresence("online", false);
                void persistProgress({ completed: true });
              }
            },
            onError: () => {
              clearPlaybackInterval();
              setPlayerError("This video cannot be played in the embedded YouTube player.");
            },
          },
        });
      })
      .catch(() => {
        if (isMounted) {
          setPlayerError("The YouTube embedded player could not be loaded. Please try again.");
        }
      });

    return () => {
      isMounted = false;
      clearPlaybackInterval();
      void persistProgress({ beacon: true });
      sendOfflinePresence();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [
    clearPlaybackInterval,
    completed,
    persistProgress,
    resumePositionSeconds,
    sendOfflinePresence,
    updatePresence,
    video.id,
  ]);

  useEffect(() => {
    const saveOnPageExit = () => {
      void persistProgress({ beacon: true });
      sendOfflinePresence();
    };

    window.addEventListener("pagehide", saveOnPageExit);
    return () => window.removeEventListener("pagehide", saveOnPageExit);
  }, [persistProgress, sendOfflinePresence]);

  function handleRestart() {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(0, true);
    player.playVideo();
    setHasCompleted(false);
  }

  const hasResumePoint = resumePositionSeconds > 3 && !completed;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/20">
      <div className="relative aspect-video min-h-[220px] bg-black sm:min-h-[360px]">
        <div ref={playerMountRef} className="absolute inset-0" />
        {!playerReady && !playerError && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-red-500" />
              <p className="mt-3 text-sm text-slate-400">Loading official YouTube player…</p>
            </div>
          </div>
        )}
        {playerError && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950 p-6 text-center">
            <div>
              <p className="text-sm text-red-300">{playerError}</p>
              <a
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Watch on YouTube
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {hasResumePoint && (
            <p className="text-sm font-medium text-amber-300">
              Continuing from {formatSeconds(resumePositionSeconds)}
            </p>
          )}
          {hasCompleted && (
            <p className="text-sm font-medium text-emerald-300">✓ Playback completed and saved</p>
          )}
          {!hasResumePoint && !hasCompleted && (
            <p className="text-sm text-slate-400">Your position saves automatically while you watch.</p>
          )}
          {saveState === "saving" && <p className="mt-1 text-xs text-slate-500">Saving position…</p>}
          {saveState === "saved" && <p className="mt-1 text-xs text-slate-500">Position saved</p>}
          {saveState === "error" && (
            <p className="mt-1 text-xs text-red-300">Position could not be saved. Playback is unaffected.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!playerReady}
            onClick={handleRestart}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Start over
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            Open on YouTube
          </a>
          <Link href="/dashboard" className="text-sm font-semibold text-red-400 hover:text-red-300">
            Back to dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
