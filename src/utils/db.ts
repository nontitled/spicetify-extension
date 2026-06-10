import { openDB } from "idb";
import Logger from "./logger";

const dbLogger = new Logger("Database");

export const ObjectStores = {
  LyricsStore: "lyricsStore",
  SourcesConfigStore: "sourcesConfigStore",
  SourcesCacheStore: "sourcesCacheStore",
}

export const dbPromise = openDB("spicylyrics", 2, {
  upgrade(db, oldVersion) {
    dbLogger.debug("Upgrade invoked");
    if (!db.objectStoreNames.contains(ObjectStores.LyricsStore)) {
      db.createObjectStore(ObjectStores.LyricsStore);
      dbLogger.debug("Created '", ObjectStores.LyricsStore, "' store");
    }

    if (oldVersion < 2) {
      if (!db.objectStoreNames.contains(ObjectStores.SourcesConfigStore)) {
        db.createObjectStore(ObjectStores.SourcesConfigStore, { keyPath: "id" });
        dbLogger.debug("Created '", ObjectStores.SourcesConfigStore, "' store");
      }
      if (!db.objectStoreNames.contains(ObjectStores.SourcesCacheStore)) {
        db.createObjectStore(ObjectStores.SourcesCacheStore, { keyPath: "id" });
        dbLogger.debug("Created '", ObjectStores.SourcesCacheStore, "' store");
      }
    }
  },
});

export async function ensurePersistence() {
  try {
    if (await navigator.storage.persisted()) return true;

    const granted = await navigator.storage.persist();
    if (!granted) {
      dbLogger.warn("Data persistence request was denied; This can lead to potential data loss")
    } else {
      dbLogger.debug("Data persistence request was accepted")
    }
    return granted;
  } catch (e) {
    dbLogger.warn("Persistence check failed")
    return false;
  }
}