import type { DreamSkinStatus, EngineContext, ThemeLibrary } from "./model";

export interface CachedDreamSkinState {
  context: EngineContext;
  status?: DreamSkinStatus;
  library: ThemeLibrary;
}

export function parseCachedDreamSkinState(
  raw: string | undefined,
): CachedDreamSkinState | undefined {
  if (!raw) return undefined;

  try {
    const value = JSON.parse(raw) as Partial<CachedDreamSkinState>;
    if (
      !value.context ||
      typeof value.context.installedRoot !== "string" ||
      !value.status ||
      !value.library ||
      !Array.isArray(value.library.themes) ||
      !Array.isArray(value.library.skipped)
    ) {
      return undefined;
    }
    return value as CachedDreamSkinState;
  } catch {
    return undefined;
  }
}
