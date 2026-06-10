import { useState, useEffect, useCallback } from "react";
import { ExternalSourcesManager } from "../../../../utils/SourcesDatabase";
import type { SourceConfig } from "../../../../utils/SourcesDatabase/types";

export function useSources() {
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ExternalSourcesManager.getSources();
      setSources(data);
    } catch (err) {
      console.error("Failed to load sources", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const addOrUpdateSource = async (source: SourceConfig) => {
    await ExternalSourcesManager.saveSource(source);
    await loadSources();
  };

  const removeSource = async (id: string) => {
    await ExternalSourcesManager.deleteSource(id);
    await loadSources();
  };

  const toggleSource = async (source: SourceConfig) => {
    await addOrUpdateSource({ ...source, enabled: !source.enabled });
  };

  return {
    sources,
    loading,
    addOrUpdateSource,
    removeSource,
    toggleSource,
    reload: loadSources
  };
}
