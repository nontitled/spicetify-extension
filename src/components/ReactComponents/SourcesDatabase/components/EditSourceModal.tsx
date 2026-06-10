import React, { useState, useRef, useEffect, useMemo } from "react";
import type {
  SourceConfig,
  HttpMethod,
  Header,
  SourceLyricsEntry,
} from "../../../../utils/SourcesDatabase/types";
import { ExternalSourcesManager } from "../../../../utils/SourcesDatabase";
import { IconButton } from "../../LyricsManager/components/IconButton";
import {
  ArrowLeftIcon,
  PlayIcon,
  DownloadIcon,
} from "../../LyricsManager/components/Icons";
import { GetTracks } from "../../LyricsManager/utils/getTracks";
import { useCurrentUri } from "../../LyricsManager/hooks/useCurrentUri";

interface EditSourceModalProps {
  source?: SourceConfig;
  onSave: (source: SourceConfig) => Promise<void>;
  onTest: (source: SourceConfig) => Promise<void>;
  onBack: () => void;
}

const MethodColors: Record<HttpMethod, string> = {
  GET: "#61affe",
  POST: "#49cc90",
  PUT: "#fca130",
  PATCH: "#50e3c2",
};

const MethodIcons = {
  GET: (
    <path
      d="M5 12h14M12 5l7 7-7 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  POST: (
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  PUT: (
    <path
      d="M12 5v14M5 12l7-7 7 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  PATCH: (
    <path
      d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const ToggleSwitch = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (c: boolean) => void;
}) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: "44px",
      height: "24px",
      background: checked ? "#1db954" : "rgba(255,255,255,0.2)",
      borderRadius: "12px",
      position: "relative",
      cursor: "pointer",
      transition: "background 0.2s",
    }}
  >
    <div
      style={{
        width: "20px",
        height: "20px",
        background: "white",
        borderRadius: "50%",
        position: "absolute",
        top: "2px",
        left: checked ? "22px" : "2px",
        transition: "left 0.2s",
      }}
    />
  </div>
);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- .]/g, "_").slice(0, 100);
}

function getSyncType(ttml: string): "Word" | "Line" | "Unsynced" {
  if (!ttml) return "Unsynced";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(ttml, "application/xml");

    const spans = doc.getElementsByTagName("span");
    for (let i = 0; i < spans.length; i++) {
      if (
        spans[i].hasAttribute("begin") ||
        spans[i].hasAttribute("end") ||
        spans[i].hasAttribute("dur")
      ) {
        return "Word";
      }
    }

    const paragraphs = doc.getElementsByTagName("p");
    for (let i = 0; i < paragraphs.length; i++) {
      if (
        paragraphs[i].hasAttribute("begin") ||
        paragraphs[i].hasAttribute("end") ||
        paragraphs[i].hasAttribute("dur")
      ) {
        return "Line";
      }
    }
  } catch (e) {
    console.error("Error parsing TTML for sync type:", e);
  }
  return "Unsynced";
}

function SongsListView({
  source,
  onBack,
}: {
  source: SourceConfig;
  onBack: () => void;
}) {
  const [songs, setSongs] = useState<SourceLyricsEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copiedUri, setCopiedUri] = useState<string | null>(null);
  const [trackMetadata, setTrackMetadata] = useState<Record<string, any>>({});
  const currentUri = useCurrentUri();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await ExternalSourcesManager.getSourceData(source);
        const entries = data?.lyrics ?? [];
        setSongs(entries);

        const uris = Array.from(new Set(entries.flatMap((e) => e.spotifyURIs)));
        if (uris.length > 0) {
          try {
            const trackList = await GetTracks(uris);
            const metadataMap: Record<string, any> = {};
            for (const track of trackList) {
              metadataMap[track.uri] = track;
            }
            setTrackMetadata(metadataMap);
          } catch (err) {
            console.error("Failed to fetch track metadata:", err);
          }
        }
      } catch {
        setSongs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [source.id]);

  const handleCopy = (uri: string) => {
    navigator.clipboard.writeText(uri).catch(() => {});
    setCopiedUri(uri);
    setTimeout(() => setCopiedUri(null), 1500);
  };

  const handlePlay = (uri: string) => {
    Spicetify.Player.playUri(uri);
  };

  const handleDownload = (uri: string, ttml: string) => {
    const meta = trackMetadata[uri];
    const filename = meta
      ? `${sanitizeFilename(meta.name)}.ttml`
      : `${sanitizeFilename(uri)}.ttml`;
    const blob = new Blob([ttml], { type: "application/ttml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const flatSongs = useMemo(() => {
    if (!songs) return [];
    const seen = new Set<string>();
    const list: { entry: SourceLyricsEntry; uri: string }[] = [];
    for (const entry of songs) {
      for (const uri of entry.spotifyURIs) {
        if (!seen.has(uri)) {
          seen.add(uri);
          list.push({ entry, uri });
        }
      }
    }
    return list;
  }, [songs]);

  const syncTypes = useMemo(() => {
    const cache: Record<string, "Word" | "Line" | "Unsynced"> = {};
    if (!songs) return cache;
    for (const entry of songs) {
      if (entry.ttml) {
        cache[entry.ttml] = getSyncType(entry.ttml);
      }
    }
    return cache;
  }, [songs]);

  const filtered = useMemo(() => {
    const list = flatSongs.filter((item) => {
      if (!search.trim()) return true;
      const query = search.toLowerCase();

      if (item.uri.toLowerCase().includes(query)) return true;

      const meta = trackMetadata[item.uri];
      if (!meta) return false;
      const nameMatch = meta.name?.toLowerCase().includes(query);
      const artistMatch = meta.artists?.some((a: any) =>
        a.name?.toLowerCase().includes(query),
      );
      return nameMatch || artistMatch;
    });

    return [...list].sort((a, b) => {
      const nameA = trackMetadata[a.uri]?.name || "Unknown Track";
      const nameB = trackMetadata[b.uri]?.name || "Unknown Track";
      return nameA.localeCompare(nameB, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    });
  }, [flatSongs, search, trackMetadata]);

  const syncColors = {
    Word: {
      bg: "rgba(29, 185, 84, 0.1)",
      border: "rgba(29, 185, 84, 0.25)",
      text: "#1db954",
    },
    Line: {
      bg: "rgba(97, 175, 254, 0.1)",
      border: "rgba(97, 175, 254, 0.25)",
      text: "#61affe",
    },
    Unsynced: {
      bg: "rgba(255, 255, 255, 0.05)",
      border: "rgba(255, 255, 255, 0.08)",
      text: "rgba(255, 255, 255, 0.5)",
    },
  };

  return (
    <div className="sl-ldb-root">
      <div
        className="sl-ldb-toolbar"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          paddingBottom: "12px",
          marginBottom: "16px",
        }}
      >
        <IconButton
          icon={<ArrowLeftIcon size={14} />}
          label="Back"
          variant="default"
          onClick={onBack}
        />
        <h2
          style={{ margin: 0, fontSize: "16px", flex: 1, textAlign: "center" }}
        >
          Songs list
        </h2>
        <div style={{ width: "70px" }} />
      </div>

      <div
        style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "rgba(255,255,255,0.4)",
            textAlign: "center",
          }}
        >
          {source.url}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by song name, artist or URI..."
          className="sl-sp-search"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "white",
            outline: "none",
            fontSize: "13px",
            boxSizing: "border-box",
          }}
        />

        <div className="sl-ldb-list" style={{ padding: 0 }}>
          {loading ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "rgba(255,255,255,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid rgba(255,255,255,0.2)",
                  borderTopColor: "rgba(255,255,255,0.7)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Loading tracks…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "rgba(255,255,255,0.3)",
                fontSize: "13px",
              }}
            >
              {search.trim()
                ? "No matching songs"
                : "No songs cached yet — try refreshing the source"}
            </div>
          ) : (
            filtered.map((item, i) => {
              const meta = trackMetadata[item.uri];

              const trackName = meta?.name || "Unknown Track";
              const artistNames =
                meta?.artists?.map((a: any) => a.name).join(", ") ||
                "Unknown Artist";

              const coverArtObj =
                meta?.coverArt?.find(
                  (c: any) => c.size === "standard" || c.size === "large",
                ) || meta?.coverArt?.[0];

              let coverUrl = "";
              if (coverArtObj?.uri) {
                if (coverArtObj.uri.startsWith("spotify:image:")) {
                  const id = coverArtObj.uri.split(":").pop();
                  coverUrl = id ? `https://i.scdn.co/image/${id}` : "";
                } else {
                  coverUrl = coverArtObj.uri;
                }
              }

              const syncType = syncTypes[item.entry.ttml] || "Unsynced";
              const colors = syncColors[syncType];
              const isCurrentlyPlaying = item.uri === currentUri;

              return (
                <div
                  key={`${item.uri}-${i}`}
                  className={`sl-ldb-row${isCurrentlyPlaying ? " sl-ldb-row--playing" : ""}`}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <img
                    className="sl-ldb-row__cover"
                    src={
                      coverUrl ||
                      "https://images.spikerko.org/SongPlaceholderFull.png"
                    }
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "https://images.spikerko.org/SongPlaceholderFull.png";
                    }}
                  />

                  <div className="sl-ldb-row__info">
                    <div
                      className="sl-ldb-row__title-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {isCurrentlyPlaying && (
                        <span
                          className="sl-ldb-row__playing-dot"
                          role="img"
                          aria-label="Currently playing"
                          title="Currently playing"
                        />
                      )}
                      <span
                        className="sl-ldb-row__title"
                        title={trackName}
                        style={{ flexShrink: 1, minWidth: 0 }}
                      >
                        {trackName}
                      </span>
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.text,
                          whiteSpace: "nowrap",
                          lineHeight: "1.2",
                          display: "inline-flex",
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        {syncType === "Word"
                          ? "Word synced"
                          : syncType === "Line"
                            ? "Line synced"
                            : "Unsynced"}
                      </span>
                    </div>
                    <div className="sl-ldb-row__artists" title={artistNames}>
                      {artistNames}
                    </div>
                  </div>

                  <div className="sl-ldb-row__actions" style={{ gap: "8px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        background: "rgba(255,255,255,0.05)",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        marginRight: "4px",
                      }}
                    >
                      <code
                        style={{
                          fontSize: "9px",
                          color: "rgba(255,255,255,0.5)",
                          fontFamily: "monospace",
                          maxWidth: "90px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={item.uri}
                      >
                        {item.uri.split(":").pop()}
                      </code>
                      <button
                        onClick={() => handleCopy(item.uri)}
                        title="Copy full Spotify URI"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "0",
                          display: "flex",
                          alignItems: "center",
                          color:
                            copiedUri === item.uri
                              ? "#1db954"
                              : "rgba(255,255,255,0.3)",
                          transition: "color 0.15s",
                        }}
                      >
                        {copiedUri === item.uri ? (
                          "✓"
                        ) : (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>

                    <IconButton
                      icon={<PlayIcon size={14} />}
                      onClick={() => handlePlay(item.uri)}
                      title="Play"
                      variant="default"
                    />
                    <IconButton
                      icon={<DownloadIcon size={14} />}
                      onClick={() => handleDownload(item.uri, item.entry.ttml)}
                      title="Download TTML"
                      variant="default"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && songs !== null && (
          <div
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.3)",
              textAlign: "right",
              paddingBottom: "12px",
            }}
          >
            {filtered.length} / {flatSongs.length} tracks
          </div>
        )}
      </div>
    </div>
  );
}

export function EditSourceModal({
  source,
  onSave,
  onTest,
  onBack,
}: EditSourceModalProps) {
  const [url, setUrl] = useState(source?.url || "");
  const [method, setMethod] = useState<HttpMethod>(source?.method || "GET");
  const [headers, setHeaders] = useState<Header[]>(source?.headers || []);
  const [body, setBody] = useState(source?.body || "");
  const [enabled, setEnabled] = useState(source?.enabled ?? true);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [methodOpen, setMethodOpen] = useState(false);
  const [showHiddenHeaders, setShowHiddenHeaders] = useState(false);
  const [showSongsList, setShowSongsList] = useState(false);

  const methodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (methodRef.current && !methodRef.current.contains(e.target as Node)) {
        setMethodOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (showSongsList && source) {
    return (
      <SongsListView source={source} onBack={() => setShowSongsList(false)} />
    );
  }

  const handleAddHeader = () => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const handleHeaderChange = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
  };

  const handleRemoveHeader = (index: number) => {
    const newHeaders = [...headers];
    newHeaders.splice(index, 1);
    setHeaders(newHeaders);
  };

  const getCurrentConfig = (): SourceConfig => ({
    id: source?.id || crypto.randomUUID(),
    url,
    method,
    headers: headers.filter((h) => h.key.trim() !== ""),
    body,
    enabled,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(getCurrentConfig());
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTest(getCurrentConfig());
    } finally {
      setTesting(false);
    }
  };

  const defaultHeaders = [
    { key: "Accept", value: "application/json" },
    ...(method !== "GET"
      ? [{ key: "Content-Type", value: "application/json" }]
      : []),
    {
      key: "User-Agent",
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
  ];

  return (
    <div className="sl-ldb-root">
      <div
        className="sl-ldb-toolbar"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          paddingBottom: "12px",
          marginBottom: "16px",
        }}
      >
        <IconButton
          icon={<ArrowLeftIcon size={14} />}
          label="Back"
          variant="default"
          onClick={onBack}
        />
        <h2
          style={{ margin: 0, fontSize: "16px", flex: 1, textAlign: "center" }}
        >
          {source ? "Edit Source" : "Add Source"}
        </h2>
        {source ? (
          <button
            onClick={() => setShowSongsList(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 500,
              transition: "background 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.07)")
            }
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Songs list
          </button>
        ) : (
          <div style={{ width: "90px" }} />
        )}
      </div>

      <div
        className="sl-ldb-list"
        style={{
          padding: "0 16px",
          gap: "20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              flex: 1,
            }}
          >
            <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
              Source URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/lyrics"
              className="sl-sp-search"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "white",
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
              Enabled
            </label>
            <div style={{ padding: "8px 0" }}>
              <ToggleSwitch checked={enabled} onChange={setEnabled} />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.05)",
            padding: "12px 16px",
            borderRadius: "8px",
          }}
        >
          <label
            style={{ fontSize: "14px", fontWeight: "bold", color: "white" }}
          >
            HTTP Method
          </label>

          <div ref={methodRef} style={{ position: "relative" }}>
            <div
              onClick={() => setMethodOpen(!methodOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.1)",
                borderRadius: "8px",
                cursor: "pointer",
                color: MethodColors[method],
                fontWeight: "bold",
                minWidth: "120px",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  {MethodIcons[method]}
                </svg>
                {method}
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: methodOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                  color: "white",
                }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>

            {methodOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "4px",
                  background: "#282828",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  padding: "4px",
                  zIndex: 10,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  width: "100%",
                }}
              >
                {(Object.keys(MethodColors) as HttpMethod[]).map((m) => (
                  <div
                    key={m}
                    onClick={() => {
                      setMethod(m);
                      setMethodOpen(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      borderRadius: "4px",
                      color: MethodColors[m],
                      fontWeight: "bold",
                      background:
                        method === m ? "rgba(255,255,255,0.1)" : "transparent",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.1)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        method === m ? "rgba(255,255,255,0.1)" : "transparent")
                    }
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      {MethodIcons[m]}
                    </svg>
                    {m}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            background: "rgba(255,255,255,0.05)",
            padding: "16px",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <label
              style={{ fontSize: "14px", fontWeight: "bold", color: "white" }}
            >
              Headers
            </label>
            <button
              onClick={handleAddHeader}
              style={{
                background: "none",
                border: "none",
                color: "#1db954",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "bold",
              }}
            >
              + Add Header
            </button>
          </div>

          <div
            onClick={() => setShowHiddenHeaders(!showHiddenHeaders)}
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "8px",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: showHiddenHeaders ? "rotate(90deg)" : "none",
                transition: "transform 0.2s",
              }}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            {showHiddenHeaders
              ? "Hide default headers"
              : "Show hidden default headers"}
          </div>

          {showHiddenHeaders &&
            defaultHeaders.map((h, i) => (
              <div
                key={`def-${i}`}
                style={{ display: "flex", gap: "8px", opacity: 0.5 }}
              >
                <input
                  type="text"
                  value={h.key}
                  readOnly
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "6px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white",
                  }}
                />
                <input
                  type="text"
                  value={h.value}
                  readOnly
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "6px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white",
                  }}
                />
                <div style={{ width: "24px" }} />
              </div>
            ))}

          {headers.map((h, i) => (
            <div key={`custom-${i}`} style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={h.key}
                onChange={(e) => handleHeaderChange(i, "key", e.target.value)}
                placeholder="Key"
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "white",
                  outline: "none",
                }}
              />
              <input
                type="text"
                value={h.value}
                onChange={(e) => handleHeaderChange(i, "value", e.target.value)}
                placeholder="Value"
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "white",
                  outline: "none",
                }}
              />
              <button
                onClick={() => handleRemoveHeader(i)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ff4d4d",
                  cursor: "pointer",
                  width: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
          {headers.length === 0 && !showHiddenHeaders && (
            <span
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.3)",
                fontStyle: "italic",
              }}
            >
              No custom headers
            </span>
          )}
        </div>

        {method !== "GET" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              background: "rgba(255,255,255,0.05)",
              padding: "16px",
              borderRadius: "8px",
            }}
          >
            <label
              style={{ fontSize: "14px", fontWeight: "bold", color: "white" }}
            >
              Request Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"example": "data"}'
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "white",
                minHeight: "100px",
                resize: "vertical",
                fontFamily: "monospace",
                outline: "none",
              }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "8px",
            paddingBottom: "16px",
          }}
        >
          <IconButton
            label={testing ? "Testing..." : "Test Connection"}
            variant="default"
            onClick={handleTest}
            disabled={testing || saving || !url}
            className="sl-ldb-icon-btn--flex"
            style={{
              flex: 1,
              justifyContent: "center",
              padding: "12px 0",
              fontSize: "14px",
            }}
          />
          <IconButton
            label={saving ? "Saving..." : "Save Source"}
            variant="primary"
            onClick={handleSave}
            disabled={testing || saving || !url}
            className="sl-ldb-icon-btn--flex"
            style={{
              flex: 1,
              justifyContent: "center",
              padding: "12px 0",
              fontSize: "14px",
            }}
          />
        </div>
      </div>
    </div>
  );
}
