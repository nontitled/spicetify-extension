import { dbPromise, ObjectStores } from "../db";
import Logger from "../logger.ts";
import type {
  SourceConfig,
  SourceResponse,
  CachedSource,
  SourceLyricsEntry,
  ResolvedSourceMatch,
} from "./types";

const logger = new Logger("ExternalSourcesManager");
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const NONTITLED_SOURCE_ID = "nontitled-builtin";
const NONTITLED_SOURCE_URL = "https://nontitled.eu/spicetify/list";

export class ExternalSourcesManager {
  /**
   * Returns true if the given source ID is the built-in nontitled source.
   */
  static isNontitledSource(id: string): boolean {
    return id === NONTITLED_SOURCE_ID;
  }

  /**
   * Ensures the built-in nontitled source exists in the database.
   * Idempotent — if already present, does nothing.
   */
  static async ensureNontitledSource(): Promise<void> {
    const existing = await this.getSourceById(NONTITLED_SOURCE_ID);
    if (existing) return;

    const source: SourceConfig = {
      id: NONTITLED_SOURCE_ID,
      url: NONTITLED_SOURCE_URL,
      method: "GET",
      headers: [],
      body: "",
      enabled: true,
    };

    await this.saveSource(source);
    logger.debug("Built-in nontitled source auto-registered");
  }

  /**
   * Retrieves all configured sources.
   */
  static async getSources(): Promise<SourceConfig[]> {
    const db = await dbPromise;
    return db.getAll(ObjectStores.SourcesConfigStore);
  }

  /**
   * Retrieves a single source by ID.
   */
  static async getSourceById(id: string): Promise<SourceConfig | undefined> {
    const db = await dbPromise;
    return db.get(ObjectStores.SourcesConfigStore, id);
  }

  /**
   * Adds or updates a source configuration.
   */
  static async saveSource(source: SourceConfig): Promise<void> {
    const db = await dbPromise;
    await db.put(ObjectStores.SourcesConfigStore, source);
    await db.delete(ObjectStores.SourcesCacheStore, source.id);
  }

  /**
   * Deletes a source configuration and its cache.
   */
  static async deleteSource(id: string): Promise<void> {
    const db = await dbPromise;
    await db.delete(ObjectStores.SourcesConfigStore, id);
    await db.delete(ObjectStores.SourcesCacheStore, id);
  }

  /**
   * Tests a source connection without saving it.
   */
  static async testSource(source: SourceConfig): Promise<SourceResponse> {
    try {
      const headersObj: Record<string, string> = {
        Accept: "application/json",
      };

      if (source.method !== "GET") {
        headersObj["Content-Type"] = "application/json";
      }

      source.headers.forEach((h) => {
        if (h.key && h.value) {
          headersObj[h.key] = h.value;
        }
      });

      const body =
        source.method !== "GET" && source.body
          ? JSON.parse(source.body)
          : undefined;

      let result: unknown;
      switch (source.method) {
        case "GET":
          result = await Spicetify.CosmosAsync.get(source.url, headersObj);
          break;
        case "POST":
          result = await Spicetify.CosmosAsync.post(
            source.url,
            body,
            headersObj,
          );
          break;
        case "PUT":
          result = await Spicetify.CosmosAsync.put(
            source.url,
            body,
            headersObj,
          );
          break;
        case "PATCH":
          result = await Spicetify.CosmosAsync.patch(
            source.url,
            body,
            headersObj,
          );
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${source.method}`);
      }

      if (!result || !Array.isArray((result as any).lyrics)) {
        throw new Error("Invalid response format: missing 'lyrics' array");
      }

      return result as SourceResponse;
    } catch (err: any) {
      logger.error(`Error testing source ${source.url}`, err);
      throw err;
    }
  }

  /**
   * Fetches and caches data for a source.
   */
  static async refreshSourceCache(
    source: SourceConfig,
  ): Promise<SourceResponse | null> {
    try {
      const data = await this.testSource(source);
      const db = await dbPromise;

      const cachedData: CachedSource = {
        id: source.id,
        timestamp: Date.now(),
        data,
      };

      await db.put(ObjectStores.SourcesCacheStore, cachedData);
      return data;
    } catch (err) {
      logger.warn(`Failed to refresh cache for source ${source.id}`, err);
      return null;
    }
  }

  /**
   * Gets cached data for a source, refreshing it if expired or missing.
   */
  static async getSourceData(
    source: SourceConfig,
  ): Promise<SourceResponse | null> {
    if (!source.enabled) return null;

    const db = await dbPromise;
    const cached = (await db.get(ObjectStores.SourcesCacheStore, source.id)) as
      | CachedSource
      | undefined;

    if (cached) {
      const isExpired = Date.now() - cached.timestamp > CACHE_DURATION_MS;
      if (!isExpired) {
        return cached.data;
      }
    }

    return this.refreshSourceCache(source);
  }

  /**
   * Looks up lyrics for a given Spotify URI across all enabled sources.
   * URI is matched against the spotifyURIs array on each entry.
   */
  static async get(uri: string): Promise<SourceLyricsEntry | null> {
    const sources = await this.getSources();
    const enabledSources = sources.filter((s) => s.enabled);

    if (enabledSources.length === 0) {
      return null;
    }

    const promises = enabledSources.map(async (source) => {
      const data = await this.getSourceData(source);
      if (!data) return null;

      const match = data.lyrics.find((l) => l.spotifyURIs.includes(uri));
      if (!match) return null;
      return { ...match, sourceName: data.name || source.url };
    });

    const results = await Promise.all(promises);

    const match = results.find((r) => r !== null);
    return match || null;
  }

  /**
   * Returns all external sources that have a cached entry matching the given URI.
   * Used by the source selector panel to display only relevant sources.
   */
  static async getAvailableSourcesForUri(
    uri: string,
  ): Promise<ResolvedSourceMatch[]> {
    const sources = await this.getSources();
    const enabledSources = sources.filter((s) => s.enabled);

    const matches: ResolvedSourceMatch[] = [];

    await Promise.all(
      enabledSources.map(async (source) => {
        const data = await this.getSourceData(source);
        if (!data) return;

        const entry = data.lyrics.find((l) => l.spotifyURIs.includes(uri));
        if (!entry) return;

        matches.push({
          sourceId: source.id,
          sourceName: data.name || source.url,
          entry,
          config: source,
        });
      }),
    );

    return matches;
  }

  /**
   * Looks up lyrics for a given Spotify URI in the built-in nontitled source only.
   */
  static async getNontitledEntry(uri: string): Promise<SourceLyricsEntry | null> {
    const source = await this.getSourceById(NONTITLED_SOURCE_ID);
    if (!source || !source.enabled) return null;

    const data = await this.getSourceData(source);
    if (!data) return null;

    const match = data.lyrics.find((l) => l.spotifyURIs.includes(uri));
    if (!match) return null;

    return { ...match, sourceName: data.name || source.url };
  }

  /**
   * Looks up lyrics for a given Spotify URI across all enabled sources,
   * excluding the source with the given ID. Used to skip sources that
   * were already tried (e.g. the nontitled built-in source).
   */
  static async getExcluding(uri: string, excludeId: string): Promise<SourceLyricsEntry | null> {
    const sources = await this.getSources();
    const enabledSources = sources.filter((s) => s.enabled && s.id !== excludeId);

    if (enabledSources.length === 0) {
      return null;
    }

    const promises = enabledSources.map(async (source) => {
      const data = await this.getSourceData(source);
      if (!data) return null;

      const match = data.lyrics.find((l) => l.spotifyURIs.includes(uri));
      if (!match) return null;
      return { ...match, sourceName: data.name || source.url };
    });

    const results = await Promise.all(promises);

    const match = results.find((r) => r !== null);
    return match || null;
  }
}
