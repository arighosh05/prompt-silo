import { Plugin, MarkdownView, Modal, App, Notice } from "obsidian";
import CryptoJS from "crypto-js";

/**
 * EncryptionService encapsulates key extraction,
 * encryption, and decryption logic.
 */
class EncryptionService {
  // Extracts the encryption key from a file's content.
  static extractKey(content: string): string | null {
    const match = content.match(/^Key\s*=\s*"(.+?)"/m);
    return match ? match[1] : null;
  }

  // Encrypts plaintext using AES-256 with the given key.
  static encrypt(plaintext: string, key: string): string {
    return CryptoJS.AES.encrypt(plaintext, key).toString();
  }

  // Decrypts ciphertext using AES-256 with the given key.
  static decrypt(ciphertext: string, key: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error("Decryption failed:", error);
      return "[Decryption Error]";
    }
  }
}

export default class PromptSilo extends Plugin {
  async onload() {
    console.log("Prompt Silo loaded.");

    // Register command to add an encrypted prompt entry.
    this.addCommand({
      id: "add-prompt-entry",
      name: "Add Prompt Entry",
      callback: () => this.openPromptModal(),
    });

    // Register command to decrypt prompt entries.
    this.addCommand({
      id: "decrypt-prompt-entry",
      name: "Decrypt Prompt Entry",
      callback: () => this.handleDecryption(),
    });
  }

  onunload() {
    console.log("Prompt Silo unloaded.");
  }

  // Opens the modal to add a new prompt entry.
  private openPromptModal() {
    new PromptModal(this.app, (content, metadata) => {
      this.insertEncryptedPromptEntry(content, metadata);
    }).open();
  }

  // Inserts an encrypted prompt entry into the active Markdown file.
  private insertEncryptedPromptEntry(content: string, metadata: string) {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const key = EncryptionService.extractKey(fileContent);
    if (!key) {
      new Notice("Encryption key not found in file. Add a line like: Key = \"your-key\"");
      return;
    }

    const timestamp = new Date().toISOString();
    const encryptedContent = EncryptionService.encrypt(content, key);
    const encryptedMetadata = EncryptionService.encrypt(metadata, key);

    // Build the formatted entry.
    const entry = [
      "<!-- Encrypted Prompt Entry -->",
      `**Timestamp:** ${timestamp}`,
      `**Encrypted Content:** ENC:${encryptedContent}`,
      `**Encrypted Metadata:** ENC:${encryptedMetadata}`,
      "<!-- End Encrypted Prompt Entry -->"
    ].join("\n") + "\n";

    editor.replaceSelection(entry);
    new Notice("Encrypted prompt entry added!");
  }

  // Decrypts prompt entries from the active Markdown file and displays them.
  private handleDecryption() {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const key = EncryptionService.extractKey(fileContent);
    if (!key) {
      new Notice("Encryption key not found in file.");
      return;
    }

    // Regex to capture the encrypted content and metadata.
    const regex = /\*\*Encrypted Content:\*\* ENC:(.+)\n\*\*Encrypted Metadata:\*\* ENC:(.+)/g;
    const matches = [...fileContent.matchAll(regex)];

    if (matches.length === 0) {
      new Notice("No encrypted prompts found in this file.");
      return;
    }

    // Decrypt each entry.
    const decryptedEntries = matches.map(match => ({
      content: EncryptionService.decrypt(match[1], key),
      metadata: EncryptionService.decrypt(match[2], key)
    }));

    new DecryptionModal(this.app, decryptedEntries).open();
  }

  // Helper function to retrieve the active Markdown editor.
  private getActiveEditor() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active markdown file.");
      return null;
    }
    return activeView.editor;
  }
}

/**
 * PromptModal handles the UI for adding a new prompt entry.
 */
class PromptModal extends Modal {
  private onSubmit: (content: string, metadata: string) => void;

  constructor(app: App, onSubmit: (content: string, metadata: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Add Prompt Entry" });

    // Textarea for prompt content.
    const promptInput = contentEl.createEl("textarea", {
      cls: "prompt-input",
      placeholder: "Enter your prompt here..."
    });

    // Input for metadata.
    const metadataInput = contentEl.createEl("input", {
      type: "text",
      cls: "metadata-input",
      placeholder: "Metadata (optional)"
    });

    // Submit button.
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

/**
 * DecryptionModal displays the decrypted prompt entries.
 */
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
