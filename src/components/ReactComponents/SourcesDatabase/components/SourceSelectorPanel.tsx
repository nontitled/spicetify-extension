import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { SpotifyPlayer } from "../../../../components/Global/SpotifyPlayer";
import { ExternalSourcesManager } from "../../../../utils/SourcesDatabase";
import { Query } from "../../../../utils/API/Query";
import Platform from "../../../../components/Global/Platform";
import {
  applyAPILyrics,
  applyExternalSourceLyrics,
  applyLrcLibLyrics,
  checkLrcLibLyricsAvailable,
  LyricsStore,
} from "../../../../utils/Lyrics/fetchLyrics";
import ApplyLyrics from "../../../../utils/Lyrics/Global/Applyer";
import { $currentLyricsData } from "../../../../utils/stores";
import type { ResolvedSourceMatch } from "../../../../utils/SourcesDatabase/types";

type SourceOption =
  | { kind: "api"; name: "Internal API"; available: boolean | "checking" }
  | { kind: "lrclib"; name: "LRCLIB"; available: boolean | "checking" }
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

    setSources([
      { kind: "api", name: "Internal API", available: "checking" },
      { kind: "lrclib", name: "LRCLIB", available: "checking" },
    ]);

    const extMatches =
      await ExternalSourcesManager.getAvailableSourcesForUri(uri);
    const extOptions: SourceOption[] = extMatches.map((m) => ({
      kind: "ext",
      name: m.sourceName,
      match: m,
      available: true,
    }));

    setSources((prev) => [prev[0], prev[1], ...extOptions]);

    let apiAvailable = false;
    let lrclibAvailable = false;

    const apiPromise = (async () => {
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
    })();

    const lrclibPromise = (async () => {
      try {
        lrclibAvailable = await checkLrcLibLyricsAvailable(uri);
      } catch (_) {
        lrclibAvailable = false;
      }
    })();

    await Promise.all([apiPromise, lrclibPromise]);

    setSources([
      { kind: "api", name: "Internal API", available: apiAvailable },
      { kind: "lrclib", name: "LRCLIB", available: lrclibAvailable },
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
    const key = source.kind === "api" ? "api" : source.kind === "lrclib" ? "lrclib" : source.match.sourceId;
    setApplying(key);

    Spicetify.LocalStorage.set(`SpicyLyrics_PrefSource_${uri}`, key);
    setPreferredSource(key);

    $currentLyricsData.set("");
    if (LyricsStore) {
      try {
        const trackId = uri.split(":")[2];
        await LyricsStore.RemoveItem(trackId);
      } catch (_) { }
    }

    try {
      let result: [object, number, string?] | null = null;

      if (source.kind === "api") {
        result = await applyAPILyrics(uri);
      } else if (source.kind === "lrclib") {
        result = await applyLrcLibLyrics(uri);
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
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={async () => {
              const dataString = $currentLyricsData.get();
              if (!dataString) {
                toast.error("No lyrics currently displayed.");
                return;
              }
              let data;
              try {
                data = JSON.parse(dataString);
              } catch (e) {
                toast.error("Failed to parse lyrics data.");
                return;
              }

              let ttml: string | null = null;

              if (data.source === "ldb") {
                const { LocalLyricsManager } = await import("../../../../utils/Lyrics/manager");
                ttml = await LocalLyricsManager.getRaw(uri || "");
              } else if (data.source === "ext") {
                const extSource = sources.find((s) => s.kind === "ext" && s.name === data.sourceName);
                if (extSource && extSource.kind === "ext") {
                  ttml = extSource.match.entry.ttml;
                } else {
                  // Fallback: search in ExternalSourcesManager if not in `sources` array yet
                  const extMatches = await ExternalSourcesManager.getAvailableSourcesForUri(uri || "");
                  const match = extMatches.find((m) => m.sourceName === data.sourceName);
                  if (match) ttml = match.entry.ttml;
                }
              }

              if (!ttml && data) {
                const formatTime = (timeInSeconds: any) => {
                  if (typeof timeInSeconds !== 'number') return "00:00.000";
                  const totalSeconds = Math.floor(timeInSeconds);
                  const minutes = Math.floor(totalSeconds / 60);
                  const seconds = totalSeconds % 60;
                  const milliseconds = Math.floor((timeInSeconds % 1) * 1000);
                  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
                };

                const escapeXml = (unsafe: string) => unsafe.replace(/[<>&'"]/g, (c) => {
                    switch (c) {
                        case '<': return '&lt;';
                        case '>': return '&gt;';
                        case '&': return '&amp;';
                        case '\'': return '&apos;';
                        case '"': return '&quot;';
                        default: return c;
                    }
                });

                let timing = "None";
                if (data.Type === "Syllable") timing = "Word";
                else if (data.Type === "Line") timing = "Line";
                
                ttml = `<?xml version="1.0" encoding="utf-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:amll="http://www.example.com/ns/amll" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="${timing}" xml:lang="en">\n  <head>\n    <metadata>\n      <ttm:agent type="person" xml:id="v1"/>\n      <ttm:agent type="other" xml:id="v2"/>\n    </metadata>\n  </head>\n  <body>\n    <div>\n`;
                let lineIndex = 1;
                if (data.Type === "Static" && Array.isArray(data.Lines)) {
                  for (const line of data.Lines) {
                    ttml += `      <p ttm:agent="v1" itunes:key="L${lineIndex++}">${escapeXml(line.Text || "")}</p>\n`;
                  }
                } else if (Array.isArray(data.Content)) {
                  for (const item of data.Content) {
                    if (item.Type === "Vocal") {
                      const agent = item.OppositeAligned ? "v2" : "v1";
                      if (data.Type === "Syllable" && item.Lead && Array.isArray(item.Lead.Syllables)) {
                         ttml += `      <p begin="${formatTime(item.Lead.StartTime)}" end="${formatTime(item.Lead.EndTime)}" ttm:agent="${agent}" itunes:key="L${lineIndex++}">`;
                         for (let i = 0; i < item.Lead.Syllables.length; i++) {
                           const syl = item.Lead.Syllables[i];
                           const text = escapeXml(syl.Text || "");
                           if (typeof syl.StartTime === 'number' && typeof syl.EndTime === 'number') {
                               ttml += `<span begin="${formatTime(syl.StartTime)}" end="${formatTime(syl.EndTime)}">${text}</span>`;
                           } else {
                               ttml += `<span>${text}</span>`;
                           }
                           if (i < item.Lead.Syllables.length - 1 && !syl.IsPartOfWord) {
                               ttml += " ";
                           }
                         }
                         if (Array.isArray(item.Background) && item.Background.length > 0) {
                             for (const bg of item.Background) {
                                 if (Array.isArray(bg.Syllables)) {
                                     ttml += `<span ttm:role="x-bg" begin="${formatTime(bg.StartTime)}" end="${formatTime(bg.EndTime)}">`;
                                     for (let j = 0; j < bg.Syllables.length; j++) {
                                         const syl = bg.Syllables[j];
                                         const text = escapeXml(syl.Text || "");
                                         if (typeof syl.StartTime === 'number' && typeof syl.EndTime === 'number') {
                                             ttml += `<span begin="${formatTime(syl.StartTime)}" end="${formatTime(syl.EndTime)}">${text}</span>`;
                                         } else {
                                             ttml += `<span>${text}</span>`;
                                         }
                                         if (j < bg.Syllables.length - 1 && !syl.IsPartOfWord) {
                                             ttml += " ";
                                         }
                                     }
                                     ttml += `</span>`;
                                 }
                             }
                         }
                         ttml += `</p>\n`;
                      } else if (item.Lead) {
                         ttml += `      <p begin="${formatTime(item.Lead.StartTime)}" end="${formatTime(item.Lead.EndTime)}" ttm:agent="${agent}" itunes:key="L${lineIndex++}">${escapeXml(item.Text || item.Lead.Text || "")}</p>\n`;
                      } else {
                         ttml += `      <p begin="${formatTime(item.StartTime)}" end="${formatTime(item.EndTime)}" ttm:agent="${agent}" itunes:key="L${lineIndex++}">${escapeXml(item.Text || "")}</p>\n`;
                      }
                    }
                  }
                }
                ttml += `    </div>\n  </body>\n</tt>`;
              }

              if (!ttml) {
                  toast.error("Original TTML not available for this source.");
                  return;
              }

              console.log('Current TTML:', ttml);
              const blob = new Blob([ttml], { type: "application/ttml+xml" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const safeTrack = (trackName || "lyrics").replace(/[\\/:*?"<>|]/g, "_");
              a.download = `${safeTrack}.ttml`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast.success("TTML downloaded");
            }}
            title="Download TTML"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
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
            const key = source.kind === "api" ? "api" : source.kind === "lrclib" ? "lrclib" : source.match.sourceId;
            const isApplying = applying === key;
            const isChecking =
              (source.kind === "api" || source.kind === "lrclib") && source.available === "checking";

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
                      : source.kind === "lrclib"
                      ? "rgba(255, 107, 107, 0.08)"
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
                        : source.kind === "lrclib"
                        ? "rgba(255, 107, 107, 0.16)"
                        : "rgba(97, 175, 254, 0.16)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    source.kind === "api"
                      ? "rgba(29, 185, 84, 0.1)"
                      : source.kind === "lrclib"
                      ? "rgba(255, 107, 107, 0.08)"
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
                        : source.kind === "lrclib"
                        ? "rgba(255, 107, 107, 0.2)"
                        : "rgba(97, 175, 254, 0.2)",
                    color: source.kind === "api" ? "#1db954" : source.kind === "lrclib" ? "#ff6b6b" : "#61affe",
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
                  ) : source.kind === "lrclib" ? (
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
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
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
                        color: source.kind === "api" ? "#1db954" : source.kind === "lrclib" ? "#ff6b6b" : "#61affe",
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
                  {source.kind === "lrclib" && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      LRCLIB Synced Lyrics Database
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
