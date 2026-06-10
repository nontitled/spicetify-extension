import { isDev } from "../../components/Global/Defaults.ts";
import { $currentLyricsData, $currentLyricsType, $currentlyFetching } from "../stores.ts";
import Platform from "../../components/Global/Platform.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import PageView, { PageContainer } from "../../components/Pages/PageView.ts";
import { Query } from "../API/Query.ts";
import { ProcessLyrics } from "./ProcessLyrics.ts";
import Logger from "../logger.ts";
import { LocalLyricsManager } from "./manager/index.ts";
import { ParseTTML } from "./manager/parseTTML.ts";
import { ExternalSourcesManager } from "../SourcesDatabase/index.ts";
const NONTITLED_SOURCE_ID = "nontitled-builtin";
import { GetExpireStore } from "../../modules/Store.ts";
import { SLObjPack } from "../objpack.ts";
import type { SourceLyricsEntry } from "../SourcesDatabase/types.ts";

const lyricsLogger = new Logger("Lyrics Pipeline");
const lyricsCacheLogger = new Logger("Lyrics Cache");

export const LyricsStore = GetExpireStore<any>("SpicyLyrics_LyricsStore", 13, {
  Unit: "Days",
  Duration: 3,
}, isDev as true);

const lyricsPacker = new SLObjPack();

function setRomanizationClass(hasTransliterations: boolean | undefined): void {
  if (hasTransliterations) {
    PageContainer?.classList.add("Lyrics_RomanizationAvailable");
  } else {
    PageContainer?.classList.remove("Lyrics_RomanizationAvailable");
  }
}

/**
 * Shared "lyrics are ready" presentation: toggle the romanization class, hide the
 * loader, publish the type, reveal the containers and view controls, and clear the
 * fetching flag. Used by every successful return path.
 */
export function presentLyrics(lyricsData: any): void {
  setRomanizationClass(lyricsData?.HasTransliterations);
  HideLoaderContainer();
  $currentLyricsType.set(lyricsData.Type);
  PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.remove("LyricsHidden");
  PageContainer?.querySelector(".ContentBox .LyricsContainer")?.classList.remove("Hidden");
  PageView.AppendViewControls(true);
  $currentlyFetching.set(false);
}

/**
 * Force-fetches lyrics from the Internal API for the given URI.
 * Returns the lyrics tuple [lyricsData, 200] ready to pass to ApplyLyrics(),
 * or null on failure.
 */
export async function applyAPILyrics(uri: string): Promise<[object, number] | null> {
  const trackId = uri.split(":")[2];
  if (!trackId) return null;

  try {
    const Token = await Platform.GetSpotifyAccessToken();
    ShowLoaderContainer();

    const queries = await Query(
      [{ operation: "lyrics", variables: { id: trackId, auth: "SpicyLyrics-WebAuth" } }],
      { "SpicyLyrics-WebAuth": `Bearer ${Token}` }
    );

    const lyricsQuery = queries.get("0");
    if (!lyricsQuery || lyricsQuery.httpStatus !== 200) {
      HideLoaderContainer();
      return null;
    }

    const lyrics = lyricsPacker.unpack(lyricsQuery.data);
    if (lyrics === null || lyrics === undefined || lyrics === "") {
      HideLoaderContainer();
      return null;
    }

    await ProcessLyrics(lyrics);
    $currentLyricsData.set(JSON.stringify(lyrics));

    if (LyricsStore) {
      try { await LyricsStore.SetItem(trackId, lyrics); } catch (_) { /* ignore */ }
    }

    presentLyrics(lyrics);
    return [lyrics as object, 200];
  } catch (err) {
    lyricsLogger.error("applyAPILyrics failed", err);
    HideLoaderContainer();
    return null;
  }
}

/**
 * Parses and presents lyrics from an external source entry for the given URI.
 * Returns the lyrics tuple [lyricsData, 200] ready to pass to ApplyLyrics(),
 * or null on failure.
 */
export async function applyExternalSourceLyrics(
  uri: string,
  entry: SourceLyricsEntry,
  sourceName: string
): Promise<[object, number] | null> {
  const trackId = uri.split(":")[2];
  if (!trackId) return null;

  try {
    const parsed = await ParseTTML(entry.ttml);
    const result = (parsed && typeof parsed === "object" && "Result" in parsed)
      ? (parsed as Record<string, unknown>).Result
      : undefined;

    if (result && typeof result === "object" && result !== null) {
      const lyricsData = Object.assign({}, result, {
        id: trackId,
        source: "ext",
        sourceName,
      });
      $currentLyricsData.set(JSON.stringify(lyricsData));
      presentLyrics(lyricsData);
      return [lyricsData, 200];
    }
  } catch (err) {
    lyricsLogger.error("applyExternalSourceLyrics failed", err);
  }
  return null;
}

export default async function fetchLyrics(uri: string): Promise<[object | string, number] | null> {
  lyricsLogger.debug("Fetch requested", uri);
  //if (!PageContainer) return;
  const LyricsContent =
    PageContainer?.querySelector(".LyricsContainer .LyricsContent") ?? undefined;
  if (LyricsContent?.classList.contains("offline")) {
    LyricsContent.classList.remove("offline");
  }

  //if (!Fullscreen.IsOpen) PageView.AppendViewControls(true);\

  if (SpotifyPlayer.IsDJ()) {
    $currentlyFetching.set(false);
    return ["dj", 400];
  }

  const mediaType = SpotifyPlayer.GetMediaType();

  if (
    mediaType &&
    mediaType !== "audio"
  ) {
    $currentlyFetching.set(false);
    if (mediaType === "video") {
      return ["video-track", 400];
    } else if (mediaType === "mixed") {
      return ["mixed-track", 400];
    }
    return ["unknown-track", 400];
  }

  const contentType = SpotifyPlayer.GetContentType();
  if (contentType !== "track") {
    $currentlyFetching.set(false);
    if (contentType === "episode") {
      return ["episode-track", 400];
    }
    return ["unknown-track", 400];
  }

  const trackId = uri.split(":")[2];

  if ($currentlyFetching.get()) {
    $currentlyFetching.set(false);
    return null;
  }

  $currentlyFetching.set(true);

  if (LyricsContent) {
    LyricsContent.classList.add("HiddenTransitioned");
  }


  // Check if there's already data in localStorage
  const savedLyricsData = $currentLyricsData.get();

  if (savedLyricsData && !isDev) {
    try {
      if (savedLyricsData.includes("NO_LYRICS")) {
        const split = savedLyricsData.split(":");
        const id = split[1];
        if (id === trackId) {
          $currentlyFetching.set(false);
          return ["lyrics-not-found", 404];
        }
      } else {
        const lyricsData = JSON.parse(savedLyricsData);
        // Return the stored lyrics if the ID matches the track ID
        if (lyricsData?.id === trackId) {
          presentLyrics(lyricsData);
          return [lyricsData, 200];
        }
      }
    } catch (error) {
      lyricsCacheLogger.error("Error parsing saved lyrics data", error);
      $currentlyFetching.set(false);
      HideLoaderContainer();
    }
  }

  const localLyric = await LocalLyricsManager.get(uri);
  if (localLyric) {
    const lyricsData = { ...localLyric, id: trackId };
    $currentLyricsData.set(JSON.stringify(lyricsData));
    presentLyrics(lyricsData);
    return [lyricsData, 200];
  }

  // Local files have no real track id (uri.split(":")[2] is the URL-encoded
  // artist name), so they can't be looked up in LyricsStore or fetched from the
  // API. Bail out here — after LocalLyricsManager.get() (which serves any
  // user-uploaded TTML) but before the meaningless remote cache read.
  if (uri.startsWith("spotify:local:")) {
    $currentlyFetching.set(false);
    return ["local-track", 400];
  }

  if (LyricsStore) {
    try {
      const lyricsFromCacheRes = await LyricsStore.GetItem(trackId);
      if (lyricsFromCacheRes) {
        if (lyricsFromCacheRes?.Value === "NO_LYRICS") {
          $currentlyFetching.set(false);
          return ["lyrics-not-found", 404];
        }
        const lyricsFromCache = lyricsFromCacheRes ?? {};
        $currentLyricsData.set(JSON.stringify(lyricsFromCache));
        presentLyrics(lyricsFromCache);
        return [{ ...lyricsFromCache, fromCache: true }, 200];
      }
    } catch (error) {
      lyricsCacheLogger.error("Error parsing cache entry", error);
      $currentlyFetching.set(false);
      return ["unknown-error", 0];
    }
  }


  if (!navigator.onLine) {
    $currentlyFetching.set(false);
    return ["offline", 400];
  }

  // --- Preferred Source Check ---
  const prefSourceKey = Spicetify.LocalStorage.get(`SpicyLyrics_PrefSource_${uri}`);
  if (prefSourceKey) {
    lyricsLogger.debug("Preferred source configured:", prefSourceKey);
    if (prefSourceKey === "api") {
      try {
        const apiResult = await applyAPILyrics(uri);
        if (apiResult) {
          $currentlyFetching.set(false);
          return apiResult;
        }
      } catch (err) {
        lyricsLogger.error("Failed to load lyrics from preferred API source", err);
      }
    } else {
      try {
        const source = await ExternalSourcesManager.getSourceById(prefSourceKey);
        if (source && source.enabled) {
          const sourceData = await ExternalSourcesManager.getSourceData(source);
          if (sourceData) {
            const entry = sourceData.lyrics.find(l => l.spotifyURIs.includes(uri));
            if (entry) {
              const extResult = await applyExternalSourceLyrics(uri, entry, sourceData.name || source.url);
              if (extResult) {
                $currentlyFetching.set(false);
                return extResult;
              }
            }
          }
        }
      } catch (err) {
        lyricsLogger.error(`Failed to load lyrics from preferred external source: ${prefSourceKey}`, err);
      }
    }
    lyricsLogger.debug("Preferred source failed or unavailable, falling back to default pipeline");
  }

  ShowLoaderContainer();

  // --- Nontitled source (highest priority for songs it has) ---
  const nontitledEntry = await ExternalSourcesManager.getNontitledEntry(uri);
  if (nontitledEntry) {
    try {
      const parsed = await ParseTTML(nontitledEntry.ttml);
      const result = (parsed && typeof parsed === "object" && "Result" in parsed)
        ? (parsed as Record<string, unknown>).Result
        : undefined;

      if (result && typeof result === "object" && result !== null) {
        const lyricsData = Object.assign({}, result, {
          id: trackId,
          source: "ext",
          sourceName: nontitledEntry.sourceName,
        });
        $currentLyricsData.set(JSON.stringify(lyricsData));
        presentLyrics(lyricsData);
        return [lyricsData, 200];
      }
    } catch (err) {
      lyricsLogger.error("Failed to parse TTML from nontitled source", err);
    }
    lyricsLogger.debug("Nontitled source had entry but TTML parsing failed, falling back to API");
  }

  // Fetch new lyrics if no match in nontitled — Internal API is next
  try {
    const Token = await Platform.GetSpotifyAccessToken();

    let status = 0;

    lyricsLogger.debug("API lyrics query", { trackId });
    const queries = await Query(
      [
        {
          operation: "lyrics",
          variables: {
            id: trackId,
            auth: "SpicyLyrics-WebAuth",
          },
        },
      ],
      {
        "SpicyLyrics-WebAuth": `Bearer ${Token}`,
      }
    );

    const lyricsQuery = queries.get("0");
    if (!lyricsQuery) {
      lyricsLogger.error("Lyrics query not found");
      HideLoaderContainer();
      $currentlyFetching.set(false);
      // API failed — fall through to external sources below
    } else {
      status = lyricsQuery.httpStatus;

      if (status === 200) {
        const lyrics = lyricsPacker.unpack(lyricsQuery.data);

        if (lyrics !== null && lyrics !== undefined && lyrics !== "") {
          await ProcessLyrics(lyrics);

          $currentLyricsData.set(JSON.stringify(lyrics));

          if (LyricsStore) {
            try {
              await LyricsStore.SetItem(trackId, lyrics);
            } catch (error) {
              lyricsCacheLogger.error("Error saving lyrics to cache", error);
            }
          }

          presentLyrics(lyrics);
          return [{ ...(lyrics as Record<string, unknown>), fromCache: false }, 200];
        }
      } else if (status === 404) {
        // API definitively has no lyrics — fall through to external sources
        lyricsLogger.debug("API returned 404, trying external sources", { trackId });
      } else {
        HideLoaderContainer();
        $currentlyFetching.set(false);
        return ["status-not-200", status];
      }
    }
  } catch (error) {
    lyricsLogger.error("Error fetching lyrics from API, trying external sources", error);
  }

  // --- External sources fallback (lower priority than Internal API, skips nontitled which was already tried) ---
  const sourceLyricEntry = await ExternalSourcesManager.getExcluding(uri, NONTITLED_SOURCE_ID);
  if (sourceLyricEntry) {
    try {
      const parsed = await ParseTTML(sourceLyricEntry.ttml);
      const result = (parsed && typeof parsed === "object" && "Result" in parsed)
        ? (parsed as Record<string, unknown>).Result
        : undefined;

      if (result && typeof result === "object" && result !== null) {
        const lyricsData = Object.assign({}, result, {
          id: trackId,
          source: "ext",
          sourceName: sourceLyricEntry.sourceName,
        });
        $currentLyricsData.set(JSON.stringify(lyricsData));
        presentLyrics(lyricsData);
        return [lyricsData, 200];
      }
    } catch (err) {
      lyricsLogger.error("Failed to parse TTML from external source", err);
    }
  }

  HideLoaderContainer();
  $currentlyFetching.set(false);
  return ["lyrics-not-found", 404];
}

let ContainerShowLoaderTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Show the loader container after a delay
 */
function ShowLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    ContainerShowLoaderTimeout = setTimeout(() => {
      loaderContainer.classList.add("active");
    }, 2000);
  }
}

/**
 * Hide the loader container and clear any pending timeout
 */
function HideLoaderContainer(): void {
  const loaderContainer = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .loaderContainer"
  );
  if (loaderContainer) {
    if (ContainerShowLoaderTimeout) {
      clearTimeout(ContainerShowLoaderTimeout);
      ContainerShowLoaderTimeout = null;
    }
    loaderContainer.classList.remove("active");
  }
}

/**
 * Clear the lyrics container content
 */
export function ClearLyricsPageContainer(): void {
  const lyricsContent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (lyricsContent) {
    lyricsContent.innerHTML = "";
  }
}
