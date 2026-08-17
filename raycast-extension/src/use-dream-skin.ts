import { Cache, environment, getPreferenceValues } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { readStatus, resolveEngine, themesRoot } from "./engine";
import type { DreamSkinPreferences, DreamSkinStatus, EngineContext, ThemeLibrary } from "./model";
import { parseCachedDreamSkinState } from "./state-cache";
import { discoverThemes } from "./theme-library";

const stateCache = new Cache({ namespace: "dream-skin-state" });
const stateCacheKey = "last-successful-state";

export function useDreamSkin(): {
  context?: EngineContext;
  status?: DreamSkinStatus;
  library: ThemeLibrary;
  loading: boolean;
  error?: string;
  reload: () => Promise<void>;
} {
  const preferences = getPreferenceValues<DreamSkinPreferences>();
  const [initial] = useState(() => parseCachedDreamSkinState(stateCache.get(stateCacheKey)));
  const [context, setContext] = useState<EngineContext | undefined>(initial?.context);
  const [status, setStatus] = useState<DreamSkinStatus | undefined>(initial?.status);
  const [library, setLibrary] = useState<ThemeLibrary>(
    initial?.library ?? { themes: [], skipped: [] },
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const resolved = await resolveEngine(preferences.repository ?? "");
      setContext(resolved);
      let nextStatus: DreamSkinStatus | undefined;
      let nextLibrary: ThemeLibrary = { themes: [], skipped: [] };
      let nextError: string | undefined;
      if (resolved.runtimeReady) {
        try {
          nextStatus = await readStatus(resolved);
        } catch (failure) {
          nextError = failure instanceof Error ? failure.message : String(failure);
        }
      }
      try {
        nextLibrary = await discoverThemes(themesRoot, environment.supportPath);
      } catch (failure) {
        nextError ??= failure instanceof Error ? failure.message : String(failure);
      }
      setStatus(nextStatus);
      setLibrary(nextLibrary);
      setError(nextError);
      stateCache.set(
        stateCacheKey,
        JSON.stringify({
          context: resolved,
          status: nextStatus,
          library: nextLibrary,
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoading(false);
    }
  }, [preferences.repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { context, status, library, loading, error, reload };
}
