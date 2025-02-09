import { Plugin, MarkdownView, Modal, App, Notice } from "obsidian";
import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = "my-hardcoded-key";

// Helper function to encrypt a string using AES-256
function encryptData(plaintext: string, key: string): string {
  return CryptoJS.AES.encrypt(plaintext, key).toString();
}

// Helper function to decrypt a string using AES-256
function decryptData(ciphertext: string, key: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Decryption Error]";
  }
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

    this.addCommand({
      id: "decrypt-prompt-entry",
      name: "Decrypt Prompt Entry",
      callback: () => {
        this.decryptPromptEntry();
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

  private decryptPromptEntry() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active markdown file.");
      return;
    }

    const editor = activeView.editor;
    const fileContent = editor.getValue();

    const regex = /\*\*Encrypted Content:\*\* ENC:(.+)\n\*\*Encrypted Metadata:\*\* ENC:(.+)/g;
    const matches = [...fileContent.matchAll(regex)];

    if (matches.length === 0) {
      new Notice("No encrypted prompts found in this file.");
      return;
    }

    const decryptedEntries = matches.map(match => {
      const decryptedContent = decryptData(match[1], ENCRYPTION_KEY);
      const decryptedMetadata = decryptData(match[2], ENCRYPTION_KEY);
      return { content: decryptedContent, metadata: decryptedMetadata };
    });

    new DecryptionModal(this.app, decryptedEntries).open();
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

class DecryptionModal extends Modal {
  private entries: { content: string, metadata: string }[];

  constructor(app: App, entries: { content: string, metadata: string }[]) {
    super(app);
    this.entries = entries;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Decrypted Prompts" });

    this.entries.forEach(entry => {
      const entryEl = contentEl.createEl("div", { cls: "decrypted-entry" });
      entryEl.createEl("p", { text: `Content: ${entry.content}` });
      entryEl.createEl("p", { text: `Metadata: ${entry.metadata}` });
      contentEl.createEl("hr");
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
