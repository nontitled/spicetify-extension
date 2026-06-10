import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { SpotifyPlayer } from "../../../../components/Global/SpotifyPlayer";
import { ExternalSourcesManager } from "../../../../utils/SourcesDatabase";
import { Query } from "../../../../utils/API/Query";
import Platform from "../../../../components/Global/Platform";
import {
  applyAPILyrics,
  applyExternalSourceLyrics,
  LyricsStore,
} from "../../../../utils/Lyrics/fetchLyrics";
import ApplyLyrics from "../../../../utils/Lyrics/Global/Applyer";
import { $currentLyricsData } from "../../../../utils/stores";
import type { ResolvedSourceMatch } from "../../../../utils/SourcesDatabase/types";

type SourceOption =
  | { kind: "api"; name: "Internal API"; available: boolean | "checking" }
  | { kind: "ext"; name: string; match: ResolvedSourceMatch; available: true };

interface SourceSelectorPanelProps {
  onApplied?: () => void;
}

export function SourceSelectorPanel({ onApplied }: SourceSelectorPanelProps) {
  const uri = SpotifyPlayer.GetUri();
  const trackName = SpotifyPlayer.GetName();
  const artistNames = SpotifyPlayer.GetArtists()
    ?.map((a) => a.name)
    .join(", ");
  const cover = SpotifyPlayer.GetCover("small");

  const [sources, setSources] = useState<SourceOption[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [preferredSource, setPreferredSource] = useState<string | null>(null);

  const checkSources = useCallback(async () => {
    if (!uri) return;

    const trackId = uri.split(":")[2];

    setSources([{ kind: "api", name: "Internal API", available: "checking" }]);

    const extMatches =
      await ExternalSourcesManager.getAvailableSourcesForUri(uri);
    const extOptions: SourceOption[] = extMatches.map((m) => ({
      kind: "ext",
      name: m.sourceName,
      match: m,
      available: true,
    }));

    setSources((prev) => [prev[0], ...extOptions]);

    let apiAvailable = false;
    try {
      const Token = await Platform.GetSpotifyAccessToken();
      const queries = await Query(
        [
          {
            operation: "lyrics",
            variables: { id: trackId, auth: "SpicyLyrics-WebAuth" },
          },
        ],
        { "SpicyLyrics-WebAuth": `Bearer ${Token}` },
      );
      const result = queries.get("0");
      apiAvailable = result?.httpStatus === 200;
    } catch (_) {
      apiAvailable = false;
    }

    setSources([
      { kind: "api", name: "Internal API", available: apiAvailable },
      ...extOptions,
    ]);
  }, [uri]);

  useEffect(() => {
    checkSources();
    if (uri) {
      setPreferredSource(
        Spicetify.LocalStorage.get(`SpicyLyrics_PrefSource_${uri}`),
      );
    } else {
      setPreferredSource(null);
    }
  }, [uri, checkSources]);

  const handleApply = async (source: SourceOption) => {
    if (!uri) return;
    const key = source.kind === "api" ? "api" : source.match.sourceId;
    setApplying(key);

    Spicetify.LocalStorage.set(`SpicyLyrics_PrefSource_${uri}`, key);
    setPreferredSource(key);

    $currentLyricsData.set("");
    if (LyricsStore) {
      try {
        const trackId = uri.split(":")[2];
        await LyricsStore.RemoveItem(trackId);
      } catch (_) {}
    }

    try {
      let result: [object, number] | null = null;

      if (source.kind === "api") {
        result = await applyAPILyrics(uri);
      } else {
        result = await applyExternalSourceLyrics(
          uri,
          source.match.entry!,
          source.name,
        );
      }

      if (result) {
        await ApplyLyrics(result);
        toast.success(`Lyrics loaded from ${source.name}`);
        onApplied?.();
      } else {
        toast.error(`No lyrics available from ${source.name}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setApplying(null);
    }
  };

  if (!uri || !trackName) {
    return (
      <div
        style={{
          padding: "16px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          color: "rgba(255,255,255,0.4)",
          fontSize: "13px",
          fontStyle: "italic",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        No track currently playing
      </div>
    );
  }

  const availableSources = sources.filter((s) => s.available !== false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <img
          src={cover}
          alt="cover"
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "6px",
            objectFit: "cover",
            flexShrink: 0,
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: "13px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "white",
            }}
          >
            {trackName}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.5)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {artistNames}
          </div>
        </div>
        <button
          onClick={checkSources}
          title="Re-check sources"
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.4)",
            cursor: "pointer",
            padding: "4px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.4)",
            marginBottom: "4px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Available sources for this track
        </div>

        {sources.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              color: "rgba(255,255,255,0.3)",
              fontSize: "13px",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                border: "2px solid rgba(255,255,255,0.2)",
                borderTopColor: "rgba(255,255,255,0.6)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Checking sources…
          </div>
        ) : availableSources.length === 0 ? (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              color: "rgba(255,255,255,0.3)",
              fontSize: "13px",
            }}
          >
            No sources have lyrics for this track
          </div>
        ) : (
          availableSources.map((source) => {
            const key = source.kind === "api" ? "api" : source.match.sourceId;
            const isApplying = applying === key;
            const isChecking =
              source.kind === "api" && source.available === "checking";

            return (
              <button
                key={key}
                onClick={() =>
                  !isApplying && !isChecking && handleApply(source)
                }
                disabled={isApplying || isChecking}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background:
                    source.kind === "api"
                      ? "rgba(29, 185, 84, 0.1)"
                      : "rgba(97, 175, 254, 0.08)",
                  color: "white",
                  cursor: isApplying || isChecking ? "not-allowed" : "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 0.15s",
                  opacity: isApplying || isChecking ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isApplying && !isChecking)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      source.kind === "api"
                        ? "rgba(29, 185, 84, 0.2)"
                        : "rgba(97, 175, 254, 0.16)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    source.kind === "api"
                      ? "rgba(29, 185, 84, 0.1)"
                      : "rgba(97, 175, 254, 0.08)";
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      source.kind === "api"
                        ? "rgba(29, 185, 84, 0.25)"
                        : "rgba(97, 175, 254, 0.2)",
                    color: source.kind === "api" ? "#1db954" : "#61affe",
                  }}
                >
                  {isChecking ? (
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        border: "2px solid currentColor",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  ) : source.kind === "api" ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: source.kind === "api" ? "#1db954" : "#61affe",
                      }}
                    >
                      {source.name}
                    </span>
                    {key === preferredSource && (
                      <span
                        style={{
                          fontSize: "9px",
                          background: "rgba(255, 215, 0, 0.2)",
                          color: "#ffd700",
                          padding: "2px 6px",
                          borderRadius: "10px",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                        }}
                      >
                        ★ Preferred
                      </span>
                    )}
                  </div>
                  {source.kind === "api" && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      Internal SpicyLyrics API
                    </div>
                  )}
                </div>

                {isApplying ? (
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
