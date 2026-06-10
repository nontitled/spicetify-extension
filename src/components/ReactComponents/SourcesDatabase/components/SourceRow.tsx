import React from "react";
import type { SourceConfig } from "../../../../utils/SourcesDatabase/types";
import { IconButton } from "../../LyricsManager/components/IconButton";
import { TrashIcon, ResetIcon } from "../../LyricsManager/components/Icons";
import { ExternalSourcesManager } from "../../../../utils/SourcesDatabase";

interface SourceRowProps {
  source: SourceConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRefresh: () => void;
}

export function SourceRow({ source, onEdit, onDelete, onToggle, onRefresh }: SourceRowProps) {
  const isBuiltIn = ExternalSourcesManager.isNontitledSource(source.id);

  return (
    <div className="sl-ldb-row" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div
        className="sl-ldb-row__cover"
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "8px",
          background: source.enabled ? "rgba(29, 185, 84, 0.2)" : "rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: source.enabled ? "#1db954" : "rgba(255,255,255,0.5)"
        }}
        onClick={onToggle}
        title={source.enabled ? "Disable source" : "Enable source"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </div>

      <div className="sl-ldb-row__info" style={{ flex: 1, overflow: "hidden", cursor: "pointer" }} onClick={onEdit}>
        <div className="sl-ldb-row__title" style={{ fontWeight: "bold", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: "6px" }}>
          {source.url}
          {isBuiltIn && (
            <span
              style={{
                fontSize: "9px",
                background: "rgba(29, 185, 84, 0.15)",
                color: "#1db954",
                padding: "2px 6px",
                borderRadius: "10px",
                fontWeight: "bold",
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              Built-in
            </span>
          )}
        </div>
        <div className="sl-ldb-row__artist" style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {source.method} • {source.enabled ? "Enabled" : "Disabled"}
        </div>
      </div>

      <div className="sl-ldb-row__actions" style={{ display: "flex", gap: "8px" }}>
        <IconButton
          icon={<ResetIcon size={16} />}
          variant="default"
          onClick={onRefresh}
          title="Refresh Cache"
        />
        {!isBuiltIn && (
          <IconButton
            icon={<TrashIcon size={16} />}
            variant="danger"
            onClick={onDelete}
            title="Delete Source"
          />
        )}
      </div>
    </div>
  );
}
