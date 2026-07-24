export interface LrcLibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  syncedLyrics?: string;
  plainLyrics?: string;
  instrumental?: boolean;
}

interface ParsedLrcLine {
  text: string;
  startTime: number;
}

export function parseLrc(lrcText: string): ParsedLrcLine[] {
  const lines = lrcText.split(/\r?\n/);
  const parsedLines: ParsedLrcLine[] = [];
  // Matches [mm:ss.xx] or [mm:ss:xx] or [mm:ss]
  const tagRegex = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (
      trimmedLine.startsWith("[ar:") ||
      trimmedLine.startsWith("[ti:") ||
      trimmedLine.startsWith("[al:") ||
      trimmedLine.startsWith("[by:") ||
      trimmedLine.startsWith("[offset:")
    ) {
      continue;
    }

    const tags: number[] = [];
    let match;
    tagRegex.lastIndex = 0;

    // Extract all timestamp tags on this line
    while ((match = tagRegex.exec(trimmedLine)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      let ms = 0;
      const msStr = match[3];
      if (msStr) {
        if (msStr.length === 1) {
          ms = parseInt(msStr, 10) * 100;
        } else if (msStr.length === 2) {
          ms = parseInt(msStr, 10) * 10;
        } else {
          ms = parseInt(msStr.slice(0, 3), 10);
        }
      }
      const time = min * 60 * 1000 + sec * 1000 + ms;
      tags.push(time);
    }

    if (tags.length > 0) {
      const text = trimmedLine.replace(tagRegex, "").trim();
      if (!text) continue;
      for (const time of tags) {
        parsedLines.push({ text, startTime: time });
      }
    }
  }

  // Sort chronologically (useful if tags are out of order or multiple tags exist)
  parsedLines.sort((a, b) => a.startTime - b.startTime);
  return parsedLines;
}

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  let i: number, j: number;
  for (i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

export function findBestLrcMatch(
  results: LrcLibRecord[],
  targetName: string,
  targetArtists: string[],
  targetDurationMs?: number
): LrcLibRecord | null {
  if (!results || results.length === 0) return null;

  const cleanStr = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/\s*\((feat|ft|with).*?\)/gi, "")
      .replace(/[^\p{L}\p{N}]/gu, "");

  const cleanTargetName = cleanStr(targetName);
  const targetArtistsClean = targetArtists.map(cleanStr);

  const scored = results.map(r => {
    // 1. Sync type preference
    if (!r.syncedLyrics) return { record: r, score: null };
    let score = 100;

    // 2. Track name matching using Levenshtein distance
    const cleanResultName = cleanStr(r.trackName);
    const maxLen = Math.max(cleanResultName.length, cleanTargetName.length);
    const dist = getLevenshteinDistance(cleanResultName, cleanTargetName);
    const similarity = maxLen === 0 ? 1 : 1 - dist / maxLen;

    if (similarity > 0.85) {
      score += 50;
    } else if (similarity > 0.6) {
      score += 20;
    }

    // 3. Artist name matching
    const cleanResultArtist = cleanStr(r.artistName);
    const resultArtists = cleanResultArtist.split(/[,&;]/).map(a => a.trim());
    const artistMatches = targetArtistsClean.some(target =>
      resultArtists.some(result =>
        result.includes(target) || target.includes(result)
      )
    );
    if (artistMatches) {
      score += 30;
    }

    // 4. Duration matching (Spotify: ms, LRCLIB: s)
    if (targetDurationMs && r.duration) {
      const diffSec = Math.abs(r.duration - (targetDurationMs / 1000));
      if (diffSec < 2) {
        score += 40;
      } else if (diffSec < 5) {
        score += 20;
      } else if (diffSec < 10) {
        score += 5;
      } else {
        score -= 30;
      }
    }

    return { record: r, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score > 20) {
    return best.record;
  }
  return null;
}

export function convertLrcToLyricsData(record: LrcLibRecord, targetUri: string, targetDurationMs?: number): any {
  const trackId = targetUri.split(":")[2];

  if (record.instrumental) {
    return {
      Type: "Static",
      Lines: [{ Text: "♪ Instrumental ♪" }],
      id: trackId,
      uri: targetUri,
      source: "lrclib",
    };
  }

  if (record.syncedLyrics) {
    const parsedLines = parseLrc(record.syncedLyrics);
    if (parsedLines.length > 0) {
      const totalDurationMs = targetDurationMs || (record.duration ? record.duration * 1000 : 0);

      const content = parsedLines.map((line, index) => {
        const nextLine = parsedLines[index + 1];

        let endTimeMs;
        if (nextLine) {
          endTimeMs = nextLine.startTime;
        } else {
          endTimeMs = totalDurationMs > line.startTime ? totalDurationMs : line.startTime + 4000;
        }

        return {
          Text: line.text,
          StartTime: line.startTime / 1000,
          EndTime: endTimeMs / 1000,
        };
      });

      return {
        Type: "Line",
        Content: content,
        StartTime: content[0].StartTime,
        id: trackId,
        uri: targetUri,
        source: "lrclib",
      };
    }
  }

  if (record.plainLyrics) {
    const lines = record.plainLyrics.split(/\r?\n/).map((line: string) => ({
      Text: line.trim()
    })).filter((line: any) => line.Text.length > 0);

    return {
      Type: "Static",
      Lines: lines,
      id: trackId,
      uri: targetUri,
      source: "lrclib",
    };
  }

  return null;
}

// Throttling and rate limit management
let lastRequestTime = 0;
let rateLimitResetTime = 0;

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let queuePromise = Promise.resolve();

export async function requestLrcLib(url: string): Promise<any> {
  const result = queuePromise.then(async () => {
    const now = Date.now();
    if (now < rateLimitResetTime) {
      const waitTime = rateLimitResetTime - now;
      await wait(waitTime);
    }

    const timeSinceLast = Date.now() - lastRequestTime;
    const minDelay = 350;
    if (timeSinceLast < minDelay) {
      await wait(minDelay - timeSinceLast);
    }

    lastRequestTime = Date.now();

    const response = await fetch(url, {
      headers: {
        "Lrclib-Client": "SpicyLyrics-Extension/1.0.0 (https://github.com/nontitled/spicetify-extension)"
      }
    });

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
      rateLimitResetTime = Date.now() + retryAfterSec * 1000;

      await wait(retryAfterSec * 1000);
      return requestLrcLib(url);
    }

    if (!response.ok) {
      throw new Error(`LRCLIB returned status ${response.status}`);
    }

    return response.json();
  });

  queuePromise = result.then(() => { }).catch(() => { });
  return result;
}

export async function searchAndMatchLrcLib(
  trackName: string,
  artists: string[],
  durationMs?: number
): Promise<LrcLibRecord | null> {
  const params = new URLSearchParams();
  params.append("track_name", trackName);
  if (artists.length > 0) {
    params.append("artist_name", artists[0]);
  }

  const url = `https://lrclib.net/api/search?${params.toString()}`;
  try {
    const results = await requestLrcLib(url);
    return findBestLrcMatch(results, trackName, artists, durationMs);
  } catch (err) {
    console.error("LRCLIB search error:", err);
    return null;
  }
}
