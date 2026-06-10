import React, { useState } from "react";
import { toast } from "sonner";
import { useSources } from "./hooks/useSources";
import { SearchBar } from "../LyricsManager/components/SearchBar";
import { IconButton } from "../LyricsManager/components/IconButton";
import { ResetIcon } from "../LyricsManager/components/Icons";
import { SourceRow } from "./components/SourceRow";
import { EditSourceModal } from "./components/EditSourceModal";
import { SourceSelectorPanel } from "./components/SourceSelectorPanel";
import type { SourceConfig } from "../../../utils/SourcesDatabase/types";
import { ExternalSourcesManager } from "../../../utils/SourcesDatabase";

type Tab = "sources" | "selector";

export default function SourcesDBPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("selector");
  const [query, setQuery] = useState("");
  const {
    sources,
    loading,
    addOrUpdateSource,
    removeSource,
    toggleSource,
    reload,
  } = useSources();
  const [editingSource, setEditingSource] = useState<
    SourceConfig | null | "new"
  >(null);

  const filtered = sources.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.url.toLowerCase().includes(q) || s.method.toLowerCase().includes(q)
    );
  });

  const handleRefreshAll = async () => {
    toast("Refreshing caches...");
    let success = 0;
    for (const source of sources) {
      if (source.enabled) {
        const res = await ExternalSourcesManager.refreshSourceCache(source);
        if (res) success++;
      }
    }
    toast.success(`Refreshed ${success} caches.`);
    reload();
  };

  const handleRefreshSingle = async (source: SourceConfig) => {
    toast(`Refreshing ${source.url}...`);
    const res = await ExternalSourcesManager.refreshSourceCache(source);
    if (res) {
      toast.success("Cache refreshed successfully.");
    } else {
      toast.error("Failed to refresh cache.");
    }
  };

  const handleSaveSource = async (source: SourceConfig) => {
    await addOrUpdateSource(source);
    toast.success("Source saved successfully.");
    setEditingSource(null);
  };

  const handleTestSource = async (source: SourceConfig) => {
    try {
      const data = await ExternalSourcesManager.testSource(source);
      toast.success(
        `Connection successful! Found ${data.lyrics?.length || 0} tracks.`,
      );
    } catch (err: any) {
      toast.error(`Connection failed: ${err.message}`);
    }
  };

  if (editingSource) {
    return (
      <EditSourceModal
        source={editingSource === "new" ? undefined : editingSource}
        onSave={handleSaveSource}
        onTest={handleTestSource}
        onBack={() => setEditingSource(null)}
      />
    );
  }

  return (
    <div className="sl-ldb-root">
      <div
        style={{
          display: "flex",
          gap: "2px",
          padding: "0 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          marginBottom: "16px",
        }}
      >
        {(
          [
            { id: "selector", label: "Use for Current Track" },
            { id: "sources", label: "Manage Sources" },
          ] as { id: Tab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === tab.id ? 600 : 400,
              background:
                activeTab === tab.id ? "rgba(255,255,255,0.12)" : "transparent",
              color: activeTab === tab.id ? "white" : "rgba(255,255,255,0.45)",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "selector" && (
        <div style={{ padding: "0 16px 16px" }}>
          <SourceSelectorPanel />
        </div>
      )}

      {activeTab === "sources" && (
        <>
          <div className="sl-ldb-toolbar">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search sources…"
            />
            <IconButton
              icon={<ResetIcon size={14} />}
              label="Refresh Caches"
              variant="default"
              onClick={handleRefreshAll}
              title="Refresh cached data for all enabled sources"
            />
            <IconButton
              label="+ Add Source"
              variant="primary"
              onClick={() => setEditingSource("new")}
            />
          </div>

          <div className="sl-ldb-list">
            {loading ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="sl-ldb-empty">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p>
                  {query.trim()
                    ? "No matching sources"
                    : "No sources configured yet"}
                </p>
              </div>
            ) : (
              filtered.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onEdit={() => setEditingSource(source)}
                  onDelete={async () => {
                    await removeSource(source.id);
                    toast.success("Source deleted.");
                  }}
                  onToggle={() => toggleSource(source)}
                  onRefresh={() => handleRefreshSingle(source)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
