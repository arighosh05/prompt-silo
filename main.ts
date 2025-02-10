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

/**
 * PiiRedactionService performs redaction of PII from text.
 * It searches for common PII patterns (e.g., email addresses, phone numbers, SSNs)
 * and replaces them with a redacted placeholder.
 */
class PiiRedactionService {
  static redact(text: string): string {
    // Redact email addresses.
    text = text.replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[REDACTED_EMAIL]"
    );
    // Redact phone numbers.
    text = text.replace(
      /(\+?\d{1,2}\s?)?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g,
      "[REDACTED_PHONE]"
    );
    // Redact US Social Security Numbers (format: XXX-XX-XXXX).
    text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]");
    return text;
  }
}

export default class PromptSilo extends Plugin {
  async onload() {
    console.log("Prompt Silo loaded.");

    // Command to add a new prompt entry.
    this.addCommand({
      id: "add-prompt-entry",
      name: "Add Prompt Entry",
      callback: () => this.openPromptModal(),
    });

    // Command to decrypt all prompt entries.
    this.addCommand({
      id: "decrypt-prompt-entry",
      name: "Decrypt Prompt Entry",
      callback: () => this.handleDecryption(),
    });

    // New command: Reference Lookup.
    this.addCommand({
      id: "reference-lookup",
      name: "Reference Lookup",
      callback: () => this.openReferenceLookupModal(),
    });
  }

  onunload() {
    console.log("Prompt Silo unloaded.");
  }

  // Opens the modal to add a new prompt entry.
  private openPromptModal() {
    new PromptModal(this.app, (content, metadata, notes, tags) => {
      this.insertEncryptedPromptEntry(content, metadata, notes, tags);
    }).open();
  }

  /**
   * Inserts an encrypted prompt entry into the active Markdown file.
   * The plaintext reference block includes a unique ID, timestamp, notes, and tags.
   * The prompt content (redacted for PII) and metadata are encrypted.
   */
  private insertEncryptedPromptEntry(content: string, metadata: string, notes: string, tags: string) {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const key = EncryptionService.extractKey(fileContent);
    if (!key) {
      new Notice('Encryption key not found in file. Add a line like: Key = "your-key"');
      return;
    }

    // Redact PII from the prompt content before encryption.
    const redactedContent = PiiRedactionService.redact(content);
    const timestamp = new Date().toISOString();
    const uniqueId = Date.now().toString();

    const encryptedContent = EncryptionService.encrypt(redactedContent, key);
    const encryptedMetadata = EncryptionService.encrypt(metadata, key);

    // Build the formatted entry with a plaintext reference block.
    const entry = [
      "<!-- Encrypted Prompt Entry -->",
      `**ID:** ${uniqueId}`,
      `**Timestamp:** ${timestamp}`,
      `**Tags:** ${tags}`,
      `**Notes:** ${notes}`,
      `**Encrypted Content:** ENC:${encryptedContent}`,
      `**Encrypted Metadata:** ENC:${encryptedMetadata}`,
      "<!-- End Encrypted Prompt Entry -->",
      ""
    ].join("\n");

    editor.replaceSelection(entry);
    new Notice("Encrypted prompt entry added!");
  }

  /**
   * Decrypts all prompt entries from the active Markdown file and displays them.
   * (This is a full decryption command; it may be used separately.)
   */
  private handleDecryption() {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const key = EncryptionService.extractKey(fileContent);
    if (!key) {
      new Notice("Encryption key not found in file.");
      return;
    }

    // This regex finds the encrypted content and metadata in our new block.
    const regex = /\*\*Encrypted Content:\*\*\s*ENC:(.+)\n\*\*Encrypted Metadata:\*\*\s*ENC:(.+)/g;
    const matches = [...fileContent.matchAll(regex)];

    if (matches.length === 0) {
      new Notice("No encrypted prompts found in this file.");
      return;
    }

    const decryptedEntries = matches.map(match => ({
      content: EncryptionService.decrypt(match[1], key),
      metadata: EncryptionService.decrypt(match[2], key)
    }));

    new DecryptionModal(this.app, decryptedEntries).open();
  }

  // Opens the reference lookup modal that allows the user to search by tag.
  private openReferenceLookupModal() {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const key = EncryptionService.extractKey(fileContent);
    if (!key) {
      new Notice("Encryption key not found in file.");
      return;
    }

    // Regex to capture the plaintext reference information along with encrypted fields.
    const regex = /<!-- Encrypted Prompt Entry -->\s*\n\*\*ID:\*\*\s*(.+)\n\*\*Timestamp:\*\*\s*(.+)\n\*\*Tags:\*\*\s*(.*)\n\*\*Notes:\*\*\s*(.*)\n\*\*Encrypted Content:\*\*\s*ENC:(.+)\n\*\*Encrypted Metadata:\*\*\s*ENC:(.+)\n<!-- End Encrypted Prompt Entry -->/g;
    const matches = [...fileContent.matchAll(regex)];

    if (matches.length === 0) {
      new Notice("No prompt entries found for lookup.");
      return;
    }

    const entries = matches.map(match => ({
      id: match[1].trim(),
      timestamp: match[2].trim(),
      tags: match[3].trim(),
      notes: match[4].trim(),
      encryptedContent: match[5].trim(),
      encryptedMetadata: match[6].trim()
    }));

    new ReferenceLookupModal(this.app, entries, key).open();
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
 * It now includes additional inputs for "Notes" and "Tags" (for reference lookup).
 */
class PromptModal extends Modal {
  private onSubmit: (content: string, metadata: string, notes: string, tags: string) => void;

  constructor(app: App, onSubmit: (content: string, metadata: string, notes: string, tags: string) => void) {
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

    // Input for reference notes (will be shown in lookup).
    const notesInput = contentEl.createEl("input", {
      type: "text",
      cls: "notes-input",
      placeholder: "Notes (for reference lookup)"
    });

    // Input for tags (comma-separated, for searching).
    const tagsInput = contentEl.createEl("input", {
      type: "text",
      cls: "tags-input",
      placeholder: "Tags (comma-separated)"
    });

    // Submit button.
    const submitBtn = contentEl.createEl("button", { text: "Save Prompt" });
    submitBtn.addEventListener("click", () => {
      const promptContent = promptInput.value.trim();
      const metadataContent = metadataInput.value.trim() || "{}";
      const notesContent = notesInput.value.trim() || "";
      const tagsContent = tagsInput.value.trim() || "";
      if (promptContent) {
        this.onSubmit(promptContent, metadataContent, notesContent, tagsContent);
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
 * DecryptionModal displays all decrypted prompt entries.
 * (This modal shows only the decrypted content and metadata.)
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

/**
 * ReferenceLookupModal allows the user to view the plaintext reference information
 * for each prompt entry (ID, Timestamp, Notes, Tags) and search/filter by tag.
 */
class ReferenceLookupModal extends Modal {
  private entries: Array<{
    id: string;
    timestamp: string;
    tags: string;
    notes: string;
    encryptedContent: string;
    encryptedMetadata: string;
  }>;
  private encryptionKey: string;
  private searchQuery: string = "";

  constructor(app: App, entries: Array<{ id: string; timestamp: string; tags: string; notes: string; encryptedContent: string; encryptedMetadata: string; }>, key: string) {
    super(app);
    this.entries = entries;
    this.encryptionKey = key;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Reference Lookup" });

    // Create a search input for filtering by tags.
    const searchInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "Search by tag...",
      cls: "lookup-search"
    });
    searchInput.addEventListener("input", (evt: Event) => {
      this.searchQuery = (evt.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderEntries();
    });

    // Create a container for the lookup results.
    const resultsContainer = contentEl.createEl("div", { cls: "lookup-results" });
    resultsContainer.id = "lookup-results";

    // Initial render.
    this.renderEntries();
  }

  // Re-render the list of entries according to the current search query.
  private renderEntries() {
    const resultsContainer = this.contentEl.querySelector("#lookup-results");
    if (!resultsContainer) return;
    resultsContainer.innerHTML = "";

    // Filter entries by tag (case-insensitive substring match).
    const filtered = this.entries.filter(entry => {
      return entry.tags.toLowerCase().includes(this.searchQuery);
    });

    if (filtered.length === 0) {
      resultsContainer.createEl("p", { text: "No matching entries found." });
      return;
    }

    // Display each filtered entry.
    filtered.forEach(entry => {
      const entryDiv = resultsContainer.createEl("div", { cls: "lookup-entry" });
      entryDiv.createEl("p", { text: `ID: ${entry.id}` });
      entryDiv.createEl("p", { text: `Timestamp: ${entry.timestamp}` });
      entryDiv.createEl("p", { text: `Tags: ${entry.tags}` });
      entryDiv.createEl("p", { text: `Notes: ${entry.notes}` });

      // "View Details" button to open the EntryDetailsModal.
      const detailsBtn = entryDiv.createEl("button", { text: "View Details" });
      detailsBtn.addEventListener("click", () => {
        new EntryDetailsModal(this.app, entry, this.encryptionKey).open();
      });

      entryDiv.createEl("hr");
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * EntryDetailsModal decrypts and displays the full details of a single prompt entry.
 */
class EntryDetailsModal extends Modal {
  private entry: {
    id: string;
    timestamp: string;
    tags: string;
    notes: string;
    encryptedContent: string;
    encryptedMetadata: string;
  };
  private key: string;

  constructor(app: App, entry: { id: string; timestamp: string; tags: string; notes: string; encryptedContent: string; encryptedMetadata: string; }, key: string) {
    super(app);
    this.entry = entry;
    this.key = key;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Entry Details" });
    contentEl.createEl("p", { text: `ID: ${this.entry.id}` });
    contentEl.createEl("p", { text: `Timestamp: ${this.entry.timestamp}` });
    contentEl.createEl("p", { text: `Tags: ${this.entry.tags}` });
    contentEl.createEl("p", { text: `Notes: ${this.entry.notes}` });

    // Decrypt content and metadata.
    const decryptedContent = EncryptionService.decrypt(this.entry.encryptedContent, this.key);
    const decryptedMetadata = EncryptionService.decrypt(this.entry.encryptedMetadata, this.key);
    contentEl.createEl("p", { text: `Content: ${decryptedContent}` });
    contentEl.createEl("p", { text: `Metadata: ${decryptedMetadata}` });
  }

  onClose() {
    this.contentEl.empty();
  }
}
