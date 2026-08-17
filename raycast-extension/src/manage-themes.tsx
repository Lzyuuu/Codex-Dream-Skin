import { Action, ActionPanel, Color, Icon, Keyboard, List, open } from "@raycast/api";
import { pathToFileURL } from "node:url";
import { ImageThemeForm, ImportThemeForm } from "./forms";
import { engineLabel, statusLabel } from "./engine";
import type { EngineContext, ThemeRecord } from "./model";
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

function coverMarkdown(theme: ThemeRecord): string {
  if (!theme.coverPath) return "### 暂无封面";
  return `![${theme.name}](${pathToFileURL(theme.coverPath).href}?raycast-width=720)`;
}

function ThemeActions({
  theme,
  context,
  reload,
}: {
  theme: ThemeRecord;
  context: EngineContext;
  reload: () => Promise<void>;
}) {
  async function changed(action: () => Promise<boolean>) {
    if (await action()) await reload();
  }

  return (
    <ActionPanel>
      <ActionPanel.Section>
        {context.runtimeReady ? (
          <Action
            title="切换到此主题"
            icon={Icon.Checkmark}
            onAction={() => changed(() => switchTheme(context, theme.libraryId))}
          />
        ) : null}
        <Action.ToggleQuickLook />
        <Action title="打开主题目录" icon={Icon.Folder} onAction={() => open(theme.directory)} />
      </ActionPanel.Section>
      {context.runtimeReady ? (
        <ActionPanel.Section title="Dream Skin">
          <Action
            title="启动或重新应用"
            icon={Icon.Play}
            onAction={() => changed(() => applySkin(context))}
          />
          <Action
            title="暂停皮肤"
            icon={Icon.Pause}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={() => changed(() => pauseSkin(context))}
          />
          <Action
            title="验证并截图"
            icon={Icon.Camera}
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            onAction={() => changed(() => verifySkin(context))}
          />
          <Action
            title="彻底退出 Dream Skin"
            icon={Icon.Power}
            onAction={() => changed(() => exitDreamSkin(context))}
          />
        </ActionPanel.Section>
      ) : null}
      <ActionPanel.Section title="主题库">
        {context.runtimeReady ? (
          <Action.Push
            title="从图片创建主题"
            icon={Icon.Image}
            target={<ImageThemeForm context={context} onDone={reload} />}
          />
        ) : null}
        {context.runtimeReady ? (
          <Action.Push
            title="导入主题 ZIP"
            icon={Icon.Download}
            target={<ImportThemeForm context={context} onDone={reload} />}
          />
        ) : null}
        <Action title="打开全部主题目录" icon={Icon.Folder} onAction={openThemesFolder} />
        <Action title="打开状态与日志目录" icon={Icon.Document} onAction={openStateFolder} />
        <Action title="打开主题库 Gallery" icon={Icon.Globe} onAction={openGallery} />
        <Action title="打开在线 Studio" icon={Icon.Brush} onAction={openStudio} />
        <Action
          title="刷新"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={reload}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function EngineActions({
  context,
  reload,
}: {
  context: EngineContext;
  reload: () => Promise<void>;
}) {
  async function changed(action: () => Promise<boolean>) {
    if (await action()) await reload();
  }

  return (
    <ActionPanel>
      <Action
        title={context.runtimeReady ? "同步引擎" : "安装引擎"}
        icon={Icon.Download}
        onAction={() => changed(() => syncEngine(context))}
      />
      <Action
        title="诊断引擎"
        icon={Icon.CheckCircle}
        onAction={() => changed(() => diagnoseEngine(context))}
      />
      <Action
        title="修复引擎"
        icon={Icon.ArrowClockwise}
        onAction={() => changed(() => repairEngine(context))}
      />
      <Action title="打开状态与日志目录" icon={Icon.Document} onAction={openStateFolder} />
      <Action
        title="刷新"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={reload}
      />
    </ActionPanel>
  );
}

function ThemeDetail({ theme, active }: { theme: ThemeRecord; active: boolean }) {
  return (
    <List.Item.Detail
      markdown={coverMarkdown(theme)}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="状态"
            text={{
              value: active ? "当前主题" : "已保存",
              color: active ? Color.Green : Color.SecondaryText,
            }}
          />
          <List.Item.Detail.Metadata.Label title="主题 ID" text={theme.id} />
          {theme.libraryId !== theme.id ? (
            <List.Item.Detail.Metadata.Label title="主题库 ID" text={theme.libraryId} />
          ) : null}
          <List.Item.Detail.Metadata.Label
            title="媒体"
            text={theme.mediaKind === "video" ? "视频" : "图片"}
          />
          <List.Item.Detail.Metadata.Label title="外观" text={theme.appearance} />
          <List.Item.Detail.Metadata.Label title="安全区" text={theme.art.safeArea ?? "auto"} />
          <List.Item.Detail.Metadata.Label title="任务模式" text={theme.art.taskMode ?? "auto"} />
          <List.Item.Detail.Metadata.Label
            title="焦点"
            text={`${theme.art.focusX ?? "auto"}, ${theme.art.focusY ?? "auto"}`}
          />
          {theme.tagline ? (
            <List.Item.Detail.Metadata.Label title="描述" text={theme.tagline} />
          ) : null}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export default function ManageThemes() {
  const { context, status, library, loading, error, reload } = useDreamSkin();
  const activeId = status?.appliedThemeId || (status?.session === "active" ? status.themeId : "");

  const themes = [...library.themes].sort((left, right) => {
    if (left.id === activeId) return -1;
    if (right.id === activeId) return 1;
    return left.name.localeCompare(right.name);
  });

  return (
    <List
      isLoading={loading}
      isShowingDetail
      searchBarPlaceholder="搜索主题名称或 ID"
      filtering={{ keepSectionOrder: true }}
    >
      {error ? (
        <List.EmptyView title="无法加载 Dream Skin" description={error} icon={Icon.Warning} />
      ) : null}
      {context ? (
        <List.Section title="Raycast 受管引擎">
          <List.Item
            id="managed-engine"
            title={engineLabel(context)}
            subtitle={context.installedRoot}
            icon={context.runtimeReady && context.synchronized ? Icon.CheckCircle : Icon.Warning}
            detail={
              <List.Item.Detail
                markdown={`### ${engineLabel(context)}\n\n日常操作只使用受管引擎。\n\n- 安装路径：\`${context.installedRoot}\`\n- 源码：${context.sourceReady ? `\`${context.repository}\`` : (context.sourceError ?? "未选择")}`}
              />
            }
            actions={<EngineActions context={context} reload={reload} />}
          />
        </List.Section>
      ) : null}
      <List.Section
        title="已保存主题"
        subtitle={`${statusLabel(status)}${status?.appliedThemeName ? ` · ${status.appliedThemeName}` : ""}`}
      >
        {context
          ? themes.map((theme) => {
              const active = theme.id === activeId;
              return (
                <List.Item
                  key={theme.libraryId}
                  id={theme.libraryId}
                  title={theme.name}
                  subtitle={active ? "当前主题" : theme.id}
                  keywords={[theme.id, theme.libraryId, theme.tagline, theme.mediaKind]}
                  icon={theme.coverPath ?? (theme.mediaKind === "video" ? Icon.Video : Icon.Image)}
                  quickLook={{ name: theme.name, path: theme.mediaPath }}
                  detail={<ThemeDetail theme={theme} active={active} />}
                  actions={<ThemeActions theme={theme} context={context} reload={reload} />}
                />
              );
            })
          : null}
      </List.Section>
      {library.skipped.length > 0 ? (
        <List.Section title="已跳过的无效目录" subtitle={`${library.skipped.length}`}>
          {library.skipped.map((message) => (
            <List.Item key={message} title={message} icon={Icon.Warning} />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
