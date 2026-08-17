import { Icon, LaunchType, MenuBarExtra, environment, launchCommand } from "@raycast/api";
import { engineLabel, shouldShowMenuBar, statusIconName } from "./engine";
import {
  applySkin,
  diagnoseEngine,
  exitDreamSkin,
  openGallery,
  openStateFolder,
  openStudio,
  openThemesFolder,
  pauseSkin,
  repairEngine,
  syncEngine,
  switchTheme,
  verifySkin,
} from "./operations";
import { useDreamSkin } from "./use-dream-skin";

export default function DreamSkinMenuBar() {
  const { context, status, library, loading, error, reload } = useDreamSkin();
  if (!shouldShowMenuBar(status)) return null;
  const activeId = status?.appliedThemeId || (status?.session === "active" ? status.themeId : "");

  async function changed(action: () => Promise<boolean>) {
    if (await action()) await reload();
  }

  return (
    <MenuBarExtra
      isLoading={loading}
      icon={`${environment.assetsPath}/${statusIconName(status)}`}
      tooltip={
        error ? `Dream Skin · ${error}` : `Dream Skin · ${status?.appliedThemeName || "未选择主题"}`
      }
    >
      {error ? <MenuBarExtra.Item title={`错误：${error}`} icon={Icon.Warning} /> : null}
      <MenuBarExtra.Item
        title={`当前：${status?.appliedThemeName || status?.themeName || "未选择主题"}`}
        icon={status?.session === "active" ? Icon.CheckCircle : Icon.Circle}
      />
      {context ? (
        <MenuBarExtra.Item
          title={`引擎：${engineLabel(context)}`}
          icon={context.runtimeReady && context.synchronized ? Icon.CheckCircle : Icon.Warning}
        />
      ) : null}
      <MenuBarExtra.Item
        title="打开主题管理"
        icon={Icon.List}
        onAction={() => launchCommand({ name: "manage-themes", type: LaunchType.UserInitiated })}
      />
      <MenuBarExtra.Separator />
      {context?.runtimeReady ? (
        <>
          <MenuBarExtra.Item
            title="启动或重新应用"
            icon={Icon.Play}
            onAction={() => changed(() => applySkin(context))}
          />
          <MenuBarExtra.Item
            title="暂停皮肤"
            icon={Icon.Pause}
            onAction={() => changed(() => pauseSkin(context))}
          />
          <MenuBarExtra.Item
            title="验证并截图"
            icon={Icon.Camera}
            onAction={() => changed(() => verifySkin(context))}
          />
          <MenuBarExtra.Submenu title="已保存主题" icon={Icon.Image}>
            {library.themes.map((theme) => (
              <MenuBarExtra.Item
                key={theme.libraryId}
                title={`${theme.id === activeId ? "✓ " : ""}${theme.name}`}
                icon={theme.mediaKind === "video" ? Icon.Video : Icon.Image}
                onAction={() => changed(() => switchTheme(context, theme.libraryId))}
              />
            ))}
          </MenuBarExtra.Submenu>
        </>
      ) : null}
      <MenuBarExtra.Separator />
      {context ? (
        <>
          <MenuBarExtra.Item
            title={context.runtimeReady ? "同步引擎" : "安装引擎"}
            icon={Icon.Download}
            onAction={() => changed(() => syncEngine(context))}
          />
          <MenuBarExtra.Item
            title="诊断引擎"
            icon={Icon.CheckCircle}
            onAction={() => changed(() => diagnoseEngine(context))}
          />
          <MenuBarExtra.Item
            title="修复引擎"
            icon={Icon.ArrowClockwise}
            onAction={() => changed(() => repairEngine(context))}
          />
          <MenuBarExtra.Separator />
        </>
      ) : null}
      <MenuBarExtra.Item title="打开主题目录" icon={Icon.Folder} onAction={openThemesFolder} />
      <MenuBarExtra.Item
        title="打开状态与日志目录"
        icon={Icon.Document}
        onAction={openStateFolder}
      />
      <MenuBarExtra.Item title="主题库 Gallery" icon={Icon.Globe} onAction={openGallery} />
      <MenuBarExtra.Item title="在线 Studio" icon={Icon.Brush} onAction={openStudio} />
      <MenuBarExtra.Item title="刷新状态" icon={Icon.ArrowClockwise} onAction={reload} />
      {context?.runtimeReady ? (
        <MenuBarExtra.Item
          title="彻底退出 Dream Skin"
          icon={Icon.Power}
          onAction={() => changed(() => exitDreamSkin(context))}
        />
      ) : null}
    </MenuBarExtra>
  );
}
