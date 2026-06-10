export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

export interface Header {
  key: string;
  value: string;
}

export interface SourceConfig {
  id: string;
  url: string;
  method: HttpMethod;
  headers: Header[];
  body: string;
  enabled: boolean;
}

export interface SourceLyricsEntry {
  spotifyURIs: string[];
  ttml: string;
  sourceName: string;
}

export interface SourceResponse {
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  enabled: boolean;
  description: string;
  lyrics: SourceLyricsEntry[];
}

export interface CachedSource {
  id: string;
  timestamp: number;
  data: SourceResponse;
}

/** Represents a resolved source that has lyrics for a specific track URI */
export interface ResolvedSourceMatch {
  sourceId: "api" | string;
  sourceName: string;
  entry?: SourceLyricsEntry;
  config?: SourceConfig;
}
