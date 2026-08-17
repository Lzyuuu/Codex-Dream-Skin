export interface DreamSkinPreferences {
  repository?: string;
}

export interface EngineContext {
  repository?: string;
  sourceRoot?: string;
  sourceScriptsRoot?: string;
  installedRoot: string;
  installedScriptsRoot: string;
  sourceReady: boolean;
  runtimeReady: boolean;
  synchronized: boolean;
  sourceError?: string;
  runtimeError?: string;
}

export interface DreamSkinStatus {
  session: string;
  operation: string;
  operationMessage: string;
  port: number;
  injectorAlive: boolean;
  cdpOk: boolean;
  codexRunning: boolean;
  themeId: string;
  themeName: string;
  appliedThemeId: string;
  appliedThemeName: string;
}

export interface ThemeArt {
  focusX?: number;
  focusY?: number;
  safeArea?: string;
  taskMode?: string;
}

export interface ThemeRecord {
  libraryId: string;
  id: string;
  name: string;
  tagline: string;
  appearance: string;
  art: ThemeArt;
  directory: string;
  mediaPath: string;
  mediaKind: "image" | "video";
  coverPath?: string;
}

export interface ThemeLibrary {
  themes: ThemeRecord[];
  skipped: string[];
}
