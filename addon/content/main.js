/* global Zotero, Components, Services */
/* Zotero Paper Chat - Main Plugin Module */

Zotero.PaperChat = {
    id: null,
    version: null,
    rootURI: null,
    initialized: false,
    notifierID: null,

    // Conversation state per item
    conversations: new Map(),

    // Current active chat context
    currentItemID: null,
    currentAttachmentID: null,

    /**
     * Initialize the plugin
     */
    init({ id, version, rootURI }) {
        if (this.initialized) return;

        this.id = id;
        this.version = version;
        this.rootURI = rootURI;
        this.initialized = true;

        Zotero.debug("Paper Chat: Initializing plugin v" + version);

        // Load sub-modules
        this.loadModules();
    },

    /**
     * Load all sub-modules
     */
    loadModules() {
        const modules = [
            "geminiService.js",
            "pdfExtractor.js",
            "pdfNavigator.js",
            "chatPanel.js",
            "conversationStore.js"
        ];

        for (const module of modules) {
            try {
                Services.scriptloader.loadSubScript(
                    this.rootURI + "content/" + module,
                    { Zotero, PaperChat: this }
                );
                Zotero.debug(`Paper Chat: Loaded module ${module}`);
            } catch (e) {
                Zotero.logError(`Paper Chat: Failed to load module ${module}: ${e}`);
            }
        }
    },

    /**
     * Register notify listeners for item selection changes
     */
    async registerNotifyListeners() {
        this.notifierID = Zotero.Notifier.registerObserver(
            {
                notify: async (event, type, ids, extraData) => {
                    if (type === "item" && event === "select") {
                        await this.onItemSelect(ids);
                    }
                },
            },
            ["item"],
            "paperChat"
        );

    },

    /**
     * Unregister notify listeners
     */
    unregisterNotifyListeners() {
        if (this.notifierID) {
            Zotero.Notifier.unregisterObserver(this.notifierID);
        }
    },

    /**
     * Called when an item is selected
     */
    async onItemSelect(ids) {
        // Always get the authoritative selection from the UI
        const pane = Zotero.getActiveZoteroPane();
        if (!pane) return;

        const items = pane.getSelectedItems();
        if (!items || items.length === 0) return;

        Zotero.debug(`Paper Chat: Handling selection of ${items.length} items`);

        // Filter for valid items with PDFs
        const validItems = [];

        for (const item of items) {
            if (item.isPDFAttachment()) {
                validItems.push({ item: item.parentItem || item, attachment: item });
            } else if (item.isRegularItem()) {
                const attachments = await item.getAttachments();
                for (const attachId of attachments) {
                    const attach = await Zotero.Items.getAsync(attachId);
                    if (attach && attach.isPDFAttachment()) {
                        validItems.push({ item: item, attachment: attach });
                        break; // Take first PDF
                    }
                }
            }
        }

        // If we have items (single or multiple), update the panel
        if (validItems.length > 0) {
            // Create a composite ID for stability
            this.currentItemID = validItems.map(x => x.item.id).sort().join('_');
            // If single valid item, we also set these for backward compatibility
            if (validItems.length === 1) {
                // FIX: ensure we set the legacy expected properties
                this.currentAttachmentID = validItems[0].attachment.id;
                this.currentItemID = validItems[0].item.id;
            }

            this.ChatPanel?.updateForItems(validItems);

            // For single selection, also trigger the legacy update if needed, 
            // but updateForItems handles it now.
        } else {
            // Selection cleared or no PDFs - might want to clear chat or show "Select PDF"
            // For now, checks inside ChatPanel will handle "No PDF identified"
        }
    },

    /**
     * Open the chat panel for a reader
     */
    openChatPanel(reader) {
        const itemID = reader?._item?.id;
        if (itemID) {
            this.currentAttachmentID = itemID;
            this.currentItemID = reader._item.parentItemID || itemID;
        }
        this.ChatPanel?.show();
    },

    /**
     * Add to all windows
     */
    addToAllWindows() {
        const windows = Zotero.getMainWindows();
        for (const win of windows) {
            if (!win.ZoteroPane) continue;
            this.addToWindow(win);
        }
    },

    /**
     * Remove from all windows
     */
    removeFromAllWindows() {
        const windows = Zotero.getMainWindows();
        for (const win of windows) {
            if (!win.ZoteroPane) continue;
            this.removeFromWindow(win);
        }
    },

    /**
     * Add plugin UI to a window
     */
    addToWindow(win) {
        const doc = win.document;

        // Register custom item pane section for chat
        this.registerItemPaneSection();

        // Load CSS
        const link = doc.createElement("link");
        link.id = "paper-chat-styles";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = this.rootURI + "content/chatPanel.css";
        doc.documentElement.appendChild(link);
    },

    /**
     * Remove plugin UI from a window
     */
    removeFromWindow(win) {
        const doc = win.document;

        // Remove CSS
        const style = doc.getElementById("paper-chat-styles");
        style?.remove();
    },

    /**
     * Register item pane section
     */
    registerItemPaneSection() {
        try {
            Zotero.ItemPaneManager.registerSection({
                paneID: "paper-chat-section",
                pluginID: this.id,
                header: {
                    l10nID: "paper-chat-header",
                    icon: this.rootURI + "content/icons/chat.svg",
                },
                sidenav: {
                    l10nID: "paper-chat-sidenav",
                    icon: this.rootURI + "content/icons/chat.svg",
                },
                bodyXHTML: `
            <div id="paper-chat-container" xmlns="http://www.w3.org/1999/xhtml">
            <div id="paper-chat-messages"></div>
            <div id="paper-chat-quick-actions">
              <button data-action="summarize">📝 Summarize</button>
              <button data-action="findings">🔍 Key Findings</button>
              <button data-action="methodology">🔬 Methodology</button>
              <button data-action="add-paper">➕ Add Paper</button>
              <button data-action="model">🤖 Model</button>
              <button data-action="clear" style="color: #d9534f; border-color: #d9534f;">🗑️ Clear Chat</button>
            </div>
            <div id="paper-chat-search-container" style="display: none; padding: 10px; border-bottom: 1px solid #ddd; background: #f9f9f9;">
                <input type="text" id="paper-chat-search-input" placeholder="Search for papers..." style="width: 100%; margin-bottom: 5px;" />
                <div id="paper-chat-search-results" style="max-height: 150px; overflow-y: auto;"></div>
            </div>
            <div id="paper-chat-model-container" style="display: none; padding: 10px; border-bottom: 1px solid #ddd; background: #f9f9f9;">
                <div style="font-weight: bold; margin-bottom: 5px;">Select AI Model:</div>
                <div id="paper-chat-model-list" style="display: flex; flex-direction: column; gap: 5px;"></div>
            </div>
            <div id="paper-chat-input-container">
              <textarea id="paper-chat-input" placeholder="Ask about this paper..."></textarea>
              <button id="paper-chat-send">Send</button>
            </div>
            <div id="paper-chat-status"></div>
          </div>
        `,
                onRender: ({ body, item, editable, tabType }) => {
                    this.ChatPanel?.initializeInPane(body, item);
                },
                onItemChange: async ({ body, item, setEnabled, tabType }) => {
                    // Update the chat panel with the new selection logic
                    // We check the UI selection directly for multi-select support
                    const pane = Zotero.getActiveZoteroPane();
                    const selectedItems = pane ? pane.getSelectedItems() : (item ? [item] : []);

                    if (selectedItems.length > 0 && this.ChatPanel) {
                        this.ChatPanel.initializeInPane(body, item);

                        // FIX: Transform items to expected structure { item, attachment }
                        // This mirrors the logic in onItemSelect
                        const validItems = [];
                        for (const sItem of selectedItems) {
                            if (sItem.isPDFAttachment()) {
                                validItems.push({ item: sItem.parentItem || sItem, attachment: sItem });
                            } else if (sItem.isRegularItem()) {
                                const attachments = await sItem.getAttachments();
                                for (const attachId of attachments) {
                                    const attach = await Zotero.Items.getAsync(attachId);
                                    if (attach && attach.isPDFAttachment()) {
                                        validItems.push({ item: sItem, attachment: attach });
                                        break;
                                    }
                                }
                            }
                        }

                        if (validItems.length > 0) {
                            this.ChatPanel.updateForItems(validItems);
                        }
                    }

                    // Enable logic: Show if ANY of the selected items is a PDF or has a PDF
                    let hasPDF = false;
                    for (const selItem of selectedItems) {
                        if (await this.checkHasPDF(selItem)) {
                            hasPDF = true;
                            break;
                        }
                    }

                    setEnabled(hasPDF);
                },
            });
            Zotero.debug("Paper Chat: Registered item pane section");
        } catch (e) {
            Zotero.logError("Paper Chat: Failed to register item pane section: " + e);
        }
    },

    /**
     * Check if item has PDF attachment
     */
    async checkHasPDF(item) {
        if (item.isPDFAttachment()) return true;
        if (!item.isRegularItem()) return false;

        const attachments = await item.getAttachments();
        for (const attachId of attachments) {
            const attach = await Zotero.Items.getAsync(attachId);
            if (attach?.isPDFAttachment()) return true;
        }
        return false;
    },

    /**
        link.type = "text/css";
        link.href = this.rootURI + "content/chatPanel.css";
        doc.documentElement.appendChild(link);
    },
 
    /**
     * Open preferences dialog
     */
    openPreferences() {
        Zotero.debug("Paper Chat: Opening preferences");

        const win = Zotero.getMainWindow();
        if (!win) return;

        // Use non-modal to prevent freezing
        win.openDialog(
            this.rootURI + "content/preferences.xhtml",
            "paper-chat-preferences",
            "chrome,titlebar,toolbar,centerscreen,resizable",
            { Zotero }
        );
    },

    /**
     * Get API key from preferences
     */
    getAPIKey() {
        return Zotero.Prefs.get("extensions.zotero.paperchat.apiKey", true);
    },

    /**
     * Set API key in preferences
     */
    setAPIKey(key) {
        Zotero.Prefs.set("extensions.zotero.paperchat.apiKey", key, true);
    },

    /**
     * Get model name
     */
    getModel() {
        return Zotero.Prefs.get("extensions.zotero.paperchat.model", true) || "gemini-2.0-flash";
    },

    /**
     * Get system prompt
     */
    getSystemPrompt() {
        return Zotero.Prefs.get("extensions.zotero.paperchat.systemPrompt", true) ||
            "You are a helpful research assistant analyzing academic papers. When referencing specific content, always mention the page number. Be concise but thorough.";
    },
};
