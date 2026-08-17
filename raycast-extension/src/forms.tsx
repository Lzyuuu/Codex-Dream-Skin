import { Action, ActionPanel, Form, Icon, popToRoot } from "@raycast/api";
import type { EngineContext } from "./model";
import { createImageTheme, importThemeZip } from "./operations";

interface FormProps {
  context: EngineContext;
  onDone: () => Promise<void>;
}

interface ImageValues {
  files: string[];
  name: string;
}

interface ZipValues {
  files: string[];
}

export function ImageThemeForm({ context, onDone }: FormProps) {
  async function submit(values: ImageValues) {
    const file = values.files[0];
    if (!file) return;
    if (await createImageTheme(context, file, values.name)) {
      await onDone();
      await popToRoot();
    }
  }

  return (
    <Form
      navigationTitle="从图片创建主题"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="创建并应用" icon={Icon.Image} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="files"
        title="背景图片"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles
      />
      <Form.TextField id="name" title="主题名称" placeholder="默认使用文件名" />
      <Form.Description text="支持 PNG、JPEG、WebP、HEIC 和 TIFF；源文件不会被修改。" />
    </Form>
  );
}

export function ImportThemeForm({ context, onDone }: FormProps) {
  async function submit(values: ZipValues) {
    const file = values.files[0];
    if (!file) return;
    if (await importThemeZip(context, file)) {
      await onDone();
      await popToRoot();
    }
  }

  return (
    <Form
      navigationTitle="导入主题 ZIP"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="验证并导入" icon={Icon.Download} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="files"
        title="主题 ZIP"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles
      />
      <Form.Description text="导入只加入已保存主题，不会自动切换当前主题。" />
    </Form>
  );
}
