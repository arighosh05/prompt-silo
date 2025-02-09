import { Plugin, MarkdownView, Modal, App, Notice } from "obsidian";
import CryptoJS from "crypto-js";

// For now, we use a hardcoded encryption key.
// In a later phase, you can provide this via settings.
const ENCRYPTION_KEY = "my-hardcoded-key";

// Helper function to encrypt a string using AES-256
function encryptData(plaintext: string, key: string): string {
  return CryptoJS.AES.encrypt(plaintext, key).toString();
}

export default class PromptSilo extends Plugin {
  async onload() {
    console.log("Prompt Silo loaded.");

    this.addCommand({
      id: "add-prompt-entry",
      name: "Add Prompt Entry",
      callback: () => {
        new PromptModal(this.app, (content, metadata) => {
          this.insertEncryptedPromptEntry(content, metadata);
        }).open();
      },
    });
  }

  onunload() {
    console.log("Prompt Silo unloaded.");
  }

  private insertEncryptedPromptEntry(content: string, metadata: string) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active markdown file.");
      return;
    }

    const editor = activeView.editor;
    const timestamp = new Date().toISOString();

    // Encrypt the content and metadata using AES-256.
    const encryptedContent = encryptData(content, ENCRYPTION_KEY);
    const encryptedMetadata = encryptData(metadata, ENCRYPTION_KEY);

    // Format the entry to indicate that it contains encrypted data.
    const entry = `<!-- Encrypted Prompt Entry -->\n` +
                  `**Timestamp:** ${timestamp}\n` +
                  `**Encrypted Content:** ENC:${encryptedContent}\n` +
                  `**Encrypted Metadata:** ENC:${encryptedMetadata}\n` +
                  `<!-- End Encrypted Prompt Entry -->\n`;

    editor.replaceSelection(entry);
    new Notice("Encrypted prompt entry added!");
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

    // Create textarea for prompt content.
    const promptInput = contentEl.createEl("textarea", {
      cls: "prompt-input",
      placeholder: "Enter your prompt here..."
    });
    
    // Create input for metadata.
    const metadataInput = contentEl.createEl("input", {
      type: "text",
      cls: "metadata-input",
      placeholder: "Metadata (optional)"
    });

    // Create submit button.
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
