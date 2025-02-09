import { Plugin, MarkdownView, Modal, App, Notice } from "obsidian";

export default class SecurePromptManager extends Plugin {
  async onload() {
    console.log("Secure Prompt Manager loaded.");

    this.addCommand({
      id: "add-prompt-entry",
      name: "Add Prompt Entry",
      callback: () => {
        new PromptModal(this.app, (content, metadata) => {
          this.insertPromptEntry(content, metadata);
        }).open();
      },
    });
  }

  onunload() {
    console.log("Secure Prompt Manager unloaded.");
  }

  private insertPromptEntry(content: string, metadata: string) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active markdown file.");
      return;
    }

    const editor = activeView.editor;
    const timestamp = new Date().toISOString();
    const entry = `<!-- Prompt Entry -->\n**Content:** ${content}\n**Timestamp:** ${timestamp}\n**Metadata:** ${metadata}\n<!-- End Prompt Entry -->\n`;

    editor.replaceSelection(entry);
    new Notice("Prompt entry added!");
  }
}

class PromptModal extends Modal {
  onSubmit: (content: string, metadata: string) => void;

  constructor(app: App, onSubmit: (content: string, metadata: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Add Prompt Entry" });

    const promptInput = contentEl.createEl("textarea", { cls: "prompt-input", placeholder: "Enter your prompt here..." });
    const metadataInput = contentEl.createEl("input", { type: "text", cls: "metadata-input", placeholder: "Metadata (optional)" });

    const submitBtn = contentEl.createEl("button", { text: "Save Prompt" });
    submitBtn.addEventListener("click", () => {
      const promptContent = promptInput.value.trim();
      const metadataContent = metadataInput.value.trim() || "{}";

      if (promptContent) {
        this.onSubmit(promptContent, metadataContent);
        this.close();
      } else {
        new Notice("Prompt cannot be empty!");
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
