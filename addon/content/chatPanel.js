/* global Zotero, PaperChat */
/* Chat Panel UI - Chat interface for Paper Chat */

(function () {
    /**
     * Chat Panel - manages the chat UI
     */
    PaperChat.ChatPanel = {
        currentBody: null,
        currentItems: [], // Changed from single currentItem
        currentAttachment: null, // Keep for backward compat/single mode
        isLoading: false,
        pdfContent: null,
        listenersAttached: false,

        /**
         * Initialize chat panel within Item Pane Section
         */
        initializeInPane(body, item) {
            Zotero.debug("Paper Chat: initializeInPane called");
            this.currentBody = body;

            // Setup event listeners with a slight delay to ensure DOM is ready
            setTimeout(() => {
                this.setupEventListeners(body);
            }, 100);

            // Initialize with item
            if (item) {
                this.initializeForItem(item);
            } else {
                this.loadExistingConversation();
            }
        },

        /**
         * Setup event listeners for chat UI
         */
        setupEventListeners(body) {
            if (!body) {
                Zotero.debug("Paper Chat: No body element for event listeners");
                return;
            }

            Zotero.debug("Paper Chat: Setting up event listeners");

            // Find elements
            const sendBtn = body.querySelector("#paper-chat-send");
            const input = body.querySelector("#paper-chat-input");
            const quickActions = body.querySelector("#paper-chat-quick-actions");

            Zotero.debug(`Paper Chat: sendBtn=${!!sendBtn}, input=${!!input}, quickActions=${!!quickActions}`);

            // Send button click
            if (sendBtn) {
                sendBtn.onclick = (e) => {
                    e.stopPropagation();
                    Zotero.debug("Paper Chat: Send button clicked");
                    this.sendMessage();
                };
            }

            // Input handling - Force interactions
            if (input) {
                // Force focus on click
                input.onclick = (e) => {
                    e.stopPropagation();
                    input.focus();
                };

                input.onmousedown = (e) => {
                    e.stopPropagation();
                };

                // Handle keys
                input.onkeydown = (e) => {
                    e.stopPropagation(); // critical for typing
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        this.sendMessage();
                    }
                };

                // Allow normal input events
                input.oninput = (e) => {
                    e.stopPropagation();
                };

                input.onkeypress = (e) => {
                    e.stopPropagation();
                };
            }

            // Quick action buttons
            if (quickActions) {
                const buttons = quickActions.querySelectorAll("button");
                buttons.forEach(btn => {
                    btn.onclick = () => {
                        const action = btn.getAttribute("data-action");
                        Zotero.debug(`Paper Chat: Quick action clicked: ${action}`);
                        this.handleQuickAction(action);
                    };
                });
            }

            // Search input handling
            const searchInput = body.querySelector("#paper-chat-search-input");
            if (searchInput) {
                searchInput.onclick = (e) => { e.stopPropagation(); searchInput.focus(); };
                searchInput.onkeydown = (e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                        this.performSearch(searchInput.value);
                    }
                };
            }

            this.listenersAttached = true;
            Zotero.debug("Paper Chat: Event listeners attached");
        },

        /**
         * Initialize for a specific item
         */
        async initializeForItem(item) {
            this.updateForItems([{ item: item }]);
        },

        /**
         * Update for item selection (Single or Multiple)
         * items: Array of { item: ZoteroItem, attachment: ZoteroItem (optional) }
         */
        async updateForItems(items) {
            if (!items || items.length === 0) return;

            Zotero.debug(`Paper Chat: updateForItems with ${items.length} items`);

            this.currentItems = items;
            // Reset content cache whenever selection changes
            this.pdfContent = null;

            // For single item compatibility
            if (items.length === 1) {
                this.currentItem = items[0].item;
                this.currentAttachment = items[0].attachment;

                // If attachment missing in object, try to find it
                if (!this.currentAttachment) {
                    const item = this.currentItem;
                    // Logic to find attachment...
                    if (item.isPDFAttachment && item.isPDFAttachment()) {
                        this.currentAttachment = item;
                    } else if (item.isRegularItem && item.isRegularItem()) {
                        const attachmentIDs = item.getAttachments();
                        for (const attachId of attachmentIDs) {
                            const attach = await Zotero.Items.getAsync(attachId);
                            if (attach && attach.isPDFAttachment && attach.isPDFAttachment()) {
                                this.currentAttachment = attach;
                                break;
                            }
                        }
                    }
                }
                this.currentItems[0].attachment = this.currentAttachment;
            } else {
                this.currentItem = null;
                this.currentAttachment = null;
            }

            // Generate Composite ID for history
            this.currentID = this.currentItems.map(x => x.item.id).sort().join('_');

            // Update status
            const pdfCount = this.currentItems.filter(x => x.attachment).length;
            this.updateStatus(pdfCount > 0 ? `Chatting with ${pdfCount} paper(s)` : "No PDFs found");

            this.loadExistingConversation();
        },

        /**
         * Update for legacy single item call (compatibility)
         */
        async updateForItem(itemID, attachmentID) {
            const item = itemID ? await Zotero.Items.getAsync(itemID) : null;
            const attachment = attachmentID ? await Zotero.Items.getAsync(attachmentID) : null;
            if (item) {
                this.updateForItems([{ item, attachment }]);
            }
        },

        /**
         * Load existing conversation for current item context
         */
        loadExistingConversation() {
            if (!this.currentBody) return;

            const messagesContainer = this.currentBody.querySelector("#paper-chat-messages");
            if (!messagesContainer) return;

            messagesContainer.innerHTML = "";

            if (this.currentID && PaperChat.ConversationStore) {
                const history = PaperChat.ConversationStore.getHistory(this.currentID);
                if (history && history.length > 0) {
                    for (const msg of history) {
                        this.appendMessage(msg.role, msg.content, false);
                    }
                    return;
                }
            }

            // Show welcome message
            const count = this.currentItems.length;
            const welcomeMsg = count > 1
                ? `👋 Hello! I'm ready to compare ${count} papers. Ask me anything about them!`
                : "👋 Hello! I'm your paper assistant. Select a paper with a PDF attachment, and I'll help you understand it.";

            this.appendMessage("assistant", welcomeMsg, false);
        },

        /**
         * Handle quick action button
         */
        async handleQuickAction(action) {
            Zotero.debug(`Paper Chat: handleQuickAction called with ${action}`);

            if (action === "clear") {
                this.clearConversation();
                this.updateStatus("Conversation cleared");
                return;
            }

            if (action === "add-paper") {
                this.toggleSearchUI();
                return;
            }

            if (action === "model") {
                this.toggleModelUI();
                return;
            }

            if (!PaperChat.GeminiService) {
                Zotero.debug("Paper Chat: GeminiService not available");
                return;
            }

            const prompt = PaperChat.GeminiService.getQuickActionPrompt(action);
            const input = this.currentBody?.querySelector("#paper-chat-input");
            if (input) {
                input.value = prompt;
            }

            await this.sendMessage();
        },

        /**
         * Send a message
         */
        async sendMessage() {
            Zotero.debug("Paper Chat: sendMessage called");

            if (this.isLoading) return;

            const input = this.currentBody?.querySelector("#paper-chat-input");
            const message = input?.value?.trim();

            if (!message) return;

            // ... API Key logic (omitted for brevity, keep existing) ...
            const savedKey = PaperChat.getAPIKey();
            if (!savedKey && message.startsWith("AI") && message.length > 30) {
                PaperChat.setAPIKey(message);
                this.appendMessage("user", "********");
                this.appendMessage("assistant", "✅ API key saved!", false);
                input.value = "";
                this.updateStatus("Ready");
                return;
            }

            // Check API key
            if (!savedKey) {
                this.updateStatus("Please enter API key");
                this.appendMessage("assistant", "⚠️ helper: Please enter your Gemini API key below.", false);
                return;
            }

            // Check for PDFs
            const pdfItems = this.currentItems.filter(x => x.attachment);
            if (pdfItems.length === 0) {
                this.updateStatus("No PDFs to read");
                this.appendMessage("assistant", "⚠️ No PDF attachments found in selection.", false);
                return;
            }

            // Clear input
            input.value = "";

            // Add user message to UI
            this.appendMessage("user", message);

            // Show loading
            this.setLoading(true);
            this.updateStatus(`Reading ${pdfItems.length} paper(s)...`);

            try {
                // Extract PDF content if not already done
                if (!this.pdfContent) {
                    let combinedText = "";

                    for (const itemObj of pdfItems) {
                        const title = itemObj.item.getField("title") || "Untitled";
                        try {
                            this.updateStatus(`Reading: ${title.substring(0, 20)}...`);
                            const content = await PaperChat.PDFExtractor.extractContent(itemObj.attachment.id);
                            const text = PaperChat.PDFExtractor.truncateToTokenLimit(content.text); // Note: might need to adjust limit for multiple

                            combinedText += `\n\n--- Start of Paper: ${title} ---\n${text}\n--- End of Paper ---\n`;
                        } catch (err) {
                            Zotero.debug(`Paper Chat: Failed to read ${title}: ${err}`);
                            combinedText += `\n\n--- Error Reading Paper: ${title} ---\n`;
                        }
                    }
                    this.pdfContent = combinedText;
                }

                // Get conversation history using Composite ID
                const history = PaperChat.ConversationStore?.getHistory(this.currentID) || [];

                // Send to Gemini
                this.updateStatus("Thinking...");
                const response = await PaperChat.GeminiService.sendMessage(
                    message,
                    this.pdfContent,
                    history
                );

                // Add response to UI
                this.appendMessage("assistant", response.text, true, response.references);

                // Save to history
                PaperChat.ConversationStore?.addMessage(this.currentID, "user", message);
                PaperChat.ConversationStore?.addMessage(this.currentID, "assistant", response.text);

                this.updateStatus("Ready");
            } catch (e) {
                Zotero.logError(`Paper Chat: Error sending message: ${e}`);
                if (e.message && (e.message.includes("403") || e.message.includes("API key"))) {
                    this.appendMessage("assistant", `❌ API Key Error.`, false);
                } else {
                    this.appendMessage("assistant", `❌ Error: ${e.message}`, false);
                }
                this.updateStatus("Error occurred");
            } finally {
                this.setLoading(false);
            }
        },

        /**
         * Append a message to the chat
         */
        appendMessage(role, content, parseReferences = false, references = []) {
            const messagesContainer = this.currentBody?.querySelector("#paper-chat-messages");
            if (!messagesContainer) return;

            const doc = messagesContainer.ownerDocument;
            const messageDiv = doc.createElement("div");
            messageDiv.className = `paper-chat-message paper-chat-message-${role}`;

            const contentDiv = doc.createElement("div");
            contentDiv.className = "paper-chat-message-content";

            if (parseReferences && this.currentAttachment && PaperChat.PDFNavigator) {
                // Parse and link page references
                const fragment = PaperChat.PDFNavigator.parseAndLinkReferences(
                    content,
                    this.currentAttachment.id,
                    doc
                );
                contentDiv.appendChild(fragment);
            } else {
                contentDiv.textContent = content;
            }

            messageDiv.appendChild(contentDiv);

            // Add page reference buttons if available
            if (references && references.length > 0 && this.currentAttachment && PaperChat.PDFNavigator) {
                const refsDiv = doc.createElement("div");
                refsDiv.className = "paper-chat-references";
                refsDiv.appendChild(doc.createTextNode("📄 Go to: "));

                for (const pageNum of references.slice(0, 5)) {
                    const refBtn = doc.createElement("button");
                    refBtn.className = "paper-chat-ref-btn";
                    refBtn.textContent = `p.${pageNum}`;
                    refBtn.onclick = () => {
                        PaperChat.PDFNavigator.navigateToPage(this.currentAttachment.id, pageNum);
                    };
                    refsDiv.appendChild(refBtn);
                }

                messageDiv.appendChild(refsDiv);
            }

            messagesContainer.appendChild(messageDiv);

            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        },

        /**
         * Set loading state
         */
        setLoading(loading) {
            this.isLoading = loading;

            const sendBtn = this.currentBody?.querySelector("#paper-chat-send");
            const input = this.currentBody?.querySelector("#paper-chat-input");

            if (sendBtn) {
                sendBtn.disabled = loading;
                sendBtn.textContent = loading ? "..." : "Send";
            }
            if (input) {
                input.disabled = loading;
            }
        },

        /**
         * Update status display
         */
        updateStatus(text) {
            const statusDiv = this.currentBody?.querySelector("#paper-chat-status");
            if (statusDiv) {
                statusDiv.textContent = text;
            }
        },

        /**
         * Show the chat panel
         */
        show() {
            Zotero.debug("Paper Chat: Show chat panel");
        },

        /**
         * Clear conversation for current item
         */
        clearConversation() {
            if (this.currentID) {
                PaperChat.ConversationStore?.clearHistory(this.currentID);
                this.pdfContent = null;
                this.loadExistingConversation();
            } else if (this.currentItem) {
                PaperChat.ConversationStore?.clearHistory(this.currentItem.id);
                this.pdfContent = null;
                this.loadExistingConversation();
            }
        },
        /**
         * Toggle Search UI Visibility
         */
        toggleSearchUI() {
            const container = this.currentBody?.querySelector("#paper-chat-search-container");
            if (container) {
                const isHidden = container.style.display === "none";
                container.style.display = isHidden ? "block" : "none";
                if (isHidden) {
                    const input = container.querySelector("input");
                    if (input) setTimeout(() => input.focus(), 100);
                }
            }
        },

        /**
         * Perform search for papers
         */
        async performSearch(query) {
            if (!query || query.length < 3) return;

            const container = this.currentBody?.querySelector("#paper-chat-search-results");
            if (container) container.innerHTML = "Searching...";

            try {
                var s = new Zotero.Search();
                s.addCondition('quicksearch-titleCreatorYear', 'contains', query);
                s.addCondition('itemType', 'is', 'journalArticle');
                const ids = await s.search();

                const items = await Zotero.Items.getAsync(ids);
                // Filter for PDF availability
                const pdfItems = [];
                for (const item of items) {
                    if (item.isPDFAttachment()) {
                        pdfItems.push({ item: item.parentItem || item, attachment: item });
                    } else {
                        const attachmentIDs = item.getAttachments();
                        for (const id of attachmentIDs) {
                            const attach = await Zotero.Items.getAsync(id);
                            if (attach && attach.isPDFAttachment()) {
                                pdfItems.push({ item: item, attachment: attach });
                                break;
                            }
                        }
                    }
                }

                this.displaySearchResults(pdfItems.slice(0, 10)); // Limit to 10
            } catch (e) {
                Zotero.debug("Search error: " + e);
                if (container) container.textContent = "Error searching.";
            }
        },

        /**
         * Display search results
         */
        displaySearchResults(items) {
            const container = this.currentBody?.querySelector("#paper-chat-search-results");
            if (!container) return;

            container.innerHTML = "";
            if (items.length === 0) {
                container.textContent = "No papers with PDFs found.";
                return;
            }

            const doc = container.ownerDocument;
            const list = doc.createElement("div");
            list.style.display = "flex";
            list.style.flexDirection = "column";
            list.style.gap = "5px";

            for (const obj of items) {
                const item = obj.item;
                const div = doc.createElement("div");
                div.style.padding = "5px";
                div.style.border = "1px solid #ccc";
                div.style.borderRadius = "4px";
                div.style.cursor = "pointer";
                div.style.fontSize = "0.9em";
                div.textContent = (item.getField("title") || "Untitled") + ` (${item.getField("year") || "n.d."})`;

                div.onmouseover = () => { div.style.background = "#eef"; };
                div.onmouseout = () => { div.style.background = "transparent"; };
                div.onclick = (e) => {
                    e.stopPropagation();
                    this.addPaperToContext(obj);
                    this.toggleSearchUI();
                };

                list.appendChild(div);
            }
            container.appendChild(list);
        },

        /**
         * Add a paper to the current context
         */
        addPaperToContext(newItemObj) {
            // Check if already exists
            if (this.currentItems.some(x => x.item.id === newItemObj.item.id)) {
                this.updateStatus("Paper already in chat");
                return;
            }

            this.currentItems.push(newItemObj);

            // Re-run update logic manually to refresh ID and Status
            // We duplicate updateForItems logic partly to avoid full reset
            this.currentID = this.currentItems.map(x => x.item.id).sort().join('_');
            const pdfCount = this.currentItems.filter(x => x.attachment).length;
            this.updateStatus(`Added paper. Now chatting with ${pdfCount} papers.`);

            // Clear content cache to force re-read
            this.pdfContent = null;

            this.appendMessage("assistant", `✅ Added "${newItemObj.item.getField("title")}" to conversation.`, false);
        },
        /**
         * Toggle Model UI Visibility
         */
        toggleModelUI() {
            const container = this.currentBody?.querySelector("#paper-chat-model-container");
            if (container) {
                const isHidden = container.style.display === "none";
                container.style.display = isHidden ? "block" : "none";
                if (isHidden) {
                    this.displayModelOptions();
                }
            }
            // Hide search if open
            const search = this.currentBody?.querySelector("#paper-chat-search-container");
            if (search) search.style.display = "none";
        },

        /**
         * Display Model Options
         */
        displayModelOptions() {
            const container = this.currentBody?.querySelector("#paper-chat-model-list");
            if (!container) return;

            container.innerHTML = "";

            const currentModel = Zotero.Prefs.get("extensions.zotero.paperchat.model", true) || "gemini-3-flash-preview";
            const models = [
                { id: "gemini-3-flash-preview", name: "gemini-3-flash-preview" },
                { id: "gemini-2.5-flash", name: "gemini-2.5-flash" },
                { id: "gemini-2.5-flash-lite", name: "gemini-2.5-flash-lite" }
            ];

            const doc = container.ownerDocument;

            for (const model of models) {
                const div = doc.createElement("div");
                div.style.padding = "8px";
                div.style.border = "1px solid #ddd";
                div.style.borderRadius = "4px";
                div.style.cursor = "pointer";
                div.style.display = "flex";
                div.style.justifyContent = "space-between";
                div.style.alignItems = "center";

                const isSelected = model.id === currentModel;
                div.style.background = isSelected ? "#e6f3ff" : "white";
                div.style.borderColor = isSelected ? "#0066cc" : "#ddd";

                const nameSpan = doc.createElement("span");
                nameSpan.textContent = model.name;
                div.appendChild(nameSpan);

                if (isSelected) {
                    const tick = doc.createElement("span");
                    tick.textContent = "✓";
                    tick.style.color = "#0066cc";
                    tick.style.fontWeight = "bold";
                    div.appendChild(tick);
                }

                div.onmouseover = () => { if (!isSelected) div.style.background = "#f5f5f5"; };
                div.onmouseout = () => { if (!isSelected) div.style.background = "white"; };

                div.onclick = (e) => {
                    e.stopPropagation();
                    this.setModel(model.id, model.name);
                };

                container.appendChild(div);
            }
        },

        /**
         * Set the AI Model
         */
        setModel(modelID, modelName) {
            Zotero.Prefs.set("extensions.zotero.paperchat.model", modelID, true);
            this.updateStatus(`Model switched to ${modelName}`);
            this.appendMessage("system", `⚙️ Active model changed to **${modelName}**.`, false);
            this.toggleModelUI();
        }
    };

    Zotero.debug("Paper Chat: Chat Panel module loaded");
})();
