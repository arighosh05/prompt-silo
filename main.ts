import { Plugin, MarkdownView, Modal, App, Notice } from "obsidian";
import CryptoJS from "crypto-js";

/**
 * EncryptionService encapsulates key extraction,
 * encryption, and decryption logic.
 */
class EncryptionService {
  // Extracts both the primary and secondary keys from the file's content.
  // Expect lines like:
  // PrimaryKey = "your-primary-key"
  // SecondaryKey = "your-secondary-key"
  static extractKeys(content: string): { primary: string | null, secondary: string | null } {
    const primaryMatch = content.match(/^PrimaryKey\s*=\s*"(.+?)"/m);
    const secondaryMatch = content.match(/^SecondaryKey\s*=\s*"(.+?)"/m);
    return {
      primary: primaryMatch ? primaryMatch[1] : null,
      secondary: secondaryMatch ? secondaryMatch[1] : null
    };
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
 * It searches for common PII patterns (email addresses, phone numbers, SSNs)
 * and replaces them with a placeholder.
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

    // Command to decrypt full prompt entries (using the primary key).
    this.addCommand({
      id: "decrypt-prompt-entry",
      name: "Decrypt Prompt Entry",
      callback: () => this.handleDecryption(),
    });

    // Command to perform reference lookup (requires the secondary key).
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
   * - The prompt (after PII redaction) and metadata are encrypted with the primary key.
   * - A reference block (timestamp, notes, tags) is encrypted with the secondary key.
   */
  private insertEncryptedPromptEntry(content: string, metadata: string, notes: string, tags: string) {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const keys = EncryptionService.extractKeys(fileContent);
    if (!keys.primary) {
      new Notice('Primary encryption key not found. Add a line like: PrimaryKey = "your-primary-key"');
      return;
    }
    if (!keys.secondary) {
      new Notice('Secondary encryption key not found. Add a line like: SecondaryKey = "your-secondary-key"');
      return;
    }

    // Redact PII from the prompt content before encryption.
    const redactedContent = PiiRedactionService.redact(content);
    const timestamp = new Date().toISOString();
    const uniqueId = Date.now().toString();

    // Encrypt the prompt content and metadata using the primary key.
    const encryptedContent = EncryptionService.encrypt(redactedContent, keys.primary);
    const encryptedMetadata = EncryptionService.encrypt(metadata, keys.primary);

    // Build a reference object and encrypt it using the secondary key.
    const referenceObj = { timestamp, notes, tags };
    const referenceStr = JSON.stringify(referenceObj);
    const encryptedReference = EncryptionService.encrypt(referenceStr, keys.secondary);

    // Build the formatted entry.
    const entry = [
      "<!-- Encrypted Prompt Entry -->",
      `**ID:** ${uniqueId}`,
      `**Primary Encrypted Content:** ENC:${encryptedContent}`,
      `**Primary Encrypted Metadata:** ENC:${encryptedMetadata}`,
      `**Secondary Encrypted Reference:** ENC:${encryptedReference}`,
      "<!-- End Encrypted Prompt Entry -->",
      ""
    ].join("\n");

    editor.replaceSelection(entry);
    new Notice("Encrypted prompt entry added!");
  }

  /**
   * Decrypts prompt entries from the active Markdown file using the primary key
   * and displays the full decrypted prompt content and metadata.
   */
  private handleDecryption() {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const keys = EncryptionService.extractKeys(fileContent);
    if (!keys.primary) {
      new Notice("Primary encryption key not found in file.");
      return;
    }

    // Regex to capture the full block.
    const regex = /<!-- Encrypted Prompt Entry -->\s*\n\*\*ID:\*\*\s*(.+)\n\*\*Primary Encrypted Content:\*\*\s*ENC:(.+)\n\*\*Primary Encrypted Metadata:\*\*\s*ENC:(.+)\n\*\*Secondary Encrypted Reference:\*\*\s*ENC:(.+)\n<!-- End Encrypted Prompt Entry -->/g;
    const matches = [...fileContent.matchAll(regex)];

    if (matches.length === 0) {
      new Notice("No encrypted prompts found in this file.");
      return;
    }

    const decryptedEntries = matches.map(match => ({
      id: match[1].trim(),
      content: EncryptionService.decrypt(match[2].trim(), keys.primary),
      metadata: EncryptionService.decrypt(match[3].trim(), keys.primary)
    }));

    new DecryptionModal(this.app, decryptedEntries).open();
  }

  /**
   * Opens the reference lookup modal.
   * This uses the secondary key to decrypt the reference block (timestamp, notes, tags)
   * for each entry. A search input lets the user filter entries by tag.
   */
  private openReferenceLookupModal() {
    const editor = this.getActiveEditor();
    if (!editor) return;

    const fileContent = editor.getValue();
    const keys = EncryptionService.extractKeys(fileContent);
    if (!keys.secondary) {
      new Notice("Secondary encryption key not found in file.");
      return;
    }

    // Use the same regex as above.
    const regex = /<!-- Encrypted Prompt Entry -->\s*\n\*\*ID:\*\*\s*(.+)\n\*\*Primary Encrypted Content:\*\*\s*ENC:(.+)\n\*\*Primary Encrypted Metadata:\*\*\s*ENC:(.+)\n\*\*Secondary Encrypted Reference:\*\*\s*ENC:(.+)\n<!-- End Encrypted Prompt Entry -->/g;
    const matches = [...fileContent.matchAll(regex)];

    if (matches.length === 0) {
      new Notice("No prompt entries found for lookup.");
      return;
    }

    // For each entry, capture the ID, primary fields (for later detail view),
    // and the secondary reference block.
    const entries = matches.map(match => ({
      id: match[1].trim(),
      primaryContent: match[2].trim(),
      primaryMetadata: match[3].trim(),
      encryptedReference: match[4].trim()
    }));

    new ReferenceLookupModal(this.app, entries, keys.secondary).open();
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

    // Input for reference notes.
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
 * DecryptionModal displays the decrypted prompt entries.
 * (This modal shows the decrypted content and metadata using the primary key.)
 */
class DecryptionModal extends Modal {
  private entries: { id: string, content: string, metadata: string }[];

  constructor(app: App, entries: { id: string, content: string, metadata: string }[]) {
    super(app);
    this.entries = entries;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Decrypted Prompts" });
    this.entries.forEach(entry => {
      const entryEl = contentEl.createEl("div", { cls: "decrypted-entry" });
      entryEl.createEl("p", { text: `ID: ${entry.id}` });
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
 * ReferenceLookupModal allows the user to view the reference information for each prompt entry.
 * The secondary key is used to decrypt the reference block (which is a JSON object containing timestamp, notes, and tags).
 * A search input lets the user filter entries by tag.
 */
class ReferenceLookupModal extends Modal {
  private entries: Array<{
    id: string;
    primaryContent: string;
    primaryMetadata: string;
    encryptedReference: string;
  }>;
  private secondaryKey: string;
  private searchQuery: string = "";

  constructor(app: App, entries: Array<{ id: string; primaryContent: string; primaryMetadata: string; encryptedReference: string; }>, secondaryKey: string) {
    super(app);
    this.entries = entries;
    this.secondaryKey = secondaryKey;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Reference Lookup" });

    // Search input for filtering by tag.
    const searchInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "Search by tag...",
      cls: "lookup-search"
    });
    searchInput.addEventListener("input", (evt: Event) => {
      this.searchQuery = (evt.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderEntries();
    });

    // Container for lookup results.
    const resultsContainer = contentEl.createEl("div", { cls: "lookup-results" });
    resultsContainer.id = "lookup-results";

    this.renderEntries();
  }

  private renderEntries() {
    const resultsContainer = this.contentEl.querySelector("#lookup-results");
    if (!resultsContainer) return;
    resultsContainer.innerHTML = "";

    // Process each entry: decrypt its secondary reference block.
    const processed = this.entries.map(entry => {
      const decryptedRef = EncryptionService.decrypt(entry.encryptedReference, this.secondaryKey);
      let refObj: { timestamp: string, notes: string, tags: string };
      try {
        refObj = JSON.parse(decryptedRef);
      } catch (err) {
        refObj = { timestamp: "[Error]", notes: "[Error]", tags: "" };
      }
      return {
        id: entry.id,
        timestamp: refObj.timestamp,
        notes: refObj.notes,
        tags: refObj.tags,
        primaryContent: entry.primaryContent,
        primaryMetadata: entry.primaryMetadata
      };
    });

    // Filter by tag (if search query is provided).
    const filtered = processed.filter(entry => entry.tags.toLowerCase().includes(this.searchQuery));

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

      // "View Details" button: opens a modal that uses the primary key to decrypt full details.
      const detailsBtn = entryDiv.createEl("button", { text: "View Details" });
      detailsBtn.addEventListener("click", () => {
        new EntryDetailsModal(this.app, entry).open();
      });
      entryDiv.createEl("hr");
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * EntryDetailsModal decrypts and displays the full prompt entry details using the primary key.
 * (It expects that the entry object already contains the primary encrypted content and metadata.)
 */
class EntryDetailsModal extends Modal {
  private entry: {
    id: string;
    primaryContent: string;
    primaryMetadata: string;
    // We already showed reference info in the lookup modal.
  };

  constructor(app: App, entry: { id: string; primaryContent: string; primaryMetadata: string; }) {
    super(app);
    this.entry = entry;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Entry Details" });
    contentEl.createEl("p", { text: `ID: ${this.entry.id}` });

    // To decrypt, we need to extract the primary key from the active file.
    const editor = (this.app.workspace.getActiveViewOfType(MarkdownView))?.editor;
    if (!editor) {
      contentEl.createEl("p", { text: "No active markdown file." });
      return;
    }
    const fileContent = editor.getValue();
    const keys = EncryptionService.extractKeys(fileContent);
    if (!keys.primary) {
      contentEl.createEl("p", { text: "Primary key not found." });
      return;
    }

    const decryptedContent = EncryptionService.decrypt(this.entry.primaryContent, keys.primary);
    const decryptedMetadata = EncryptionService.decrypt(this.entry.primaryMetadata, keys.primary);

    contentEl.createEl("p", { text: `Content: ${decryptedContent}` });
    contentEl.createEl("p", { text: `Metadata: ${decryptedMetadata}` });
  }

  onClose() {
    this.contentEl.empty();
  }
}
