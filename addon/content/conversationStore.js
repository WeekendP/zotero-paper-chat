/* global Zotero, PaperChat */
/* Conversation Store - Persist chat history */

(function () {
    const MAX_HISTORY_LENGTH = 20;

    /**
     * Conversation Store - manages chat history persistence
     */
    PaperChat.ConversationStore = {
        // In-memory cache of conversations
        conversations: new Map(),

        /**
         * Get conversation history for an item
         * @param {number} itemID - Zotero item ID
         * @returns {Array} - Array of message objects
         */
        getHistory(itemID) {
            if (!itemID) return [];

            // Check cache first
            if (this.conversations.has(itemID)) {
                return this.conversations.get(itemID);
            }

            // Load from storage
            const history = this.loadFromStorage(itemID);
            this.conversations.set(itemID, history);
            return history;
        },

        /**
         * Add a message to conversation history
         * @param {number} itemID - Zotero item ID
         * @param {string} role - 'user' or 'assistant'
         * @param {string} content - Message content
         */
        addMessage(itemID, role, content) {
            if (!itemID) return;

            const history = this.getHistory(itemID);

            history.push({
                role,
                content,
                timestamp: Date.now()
            });

            // Trim to max length
            const maxLength = PaperChat.getMaxHistoryLength();
            while (history.length > maxLength) {
                history.shift();
            }

            this.conversations.set(itemID, history);
            this.saveToStorage(itemID, history);
        },

        /**
         * Clear conversation history for an item
         * @param {number} itemID - Zotero item ID
         */
        clearHistory(itemID) {
            if (!itemID) return;

            this.conversations.delete(itemID);
            this.removeFromStorage(itemID);
        },

        /**
         * Load conversation from Zotero preferences storage
         */
        loadFromStorage(itemID) {
            try {
                const key = `extensions.zotero.paperchat.history.${itemID}`;
                const data = Zotero.Prefs.get(key, true);
                if (data) {
                    return JSON.parse(data);
                }
            } catch (e) {
                Zotero.debug(`Paper Chat: Failed to load history for ${itemID}: ${e}`);
            }
            return [];
        },

        /**
         * Save conversation to Zotero preferences storage
         */
        saveToStorage(itemID, history) {
            try {
                const key = `extensions.zotero.paperchat.history.${itemID}`;
                Zotero.Prefs.set(key, JSON.stringify(history), true);
            } catch (e) {
                Zotero.debug(`Paper Chat: Failed to save history for ${itemID}: ${e}`);
            }
        },

        /**
         * Remove conversation from storage
         */
        removeFromStorage(itemID) {
            try {
                const key = `extensions.zotero.paperchat.history.${itemID}`;
                Zotero.Prefs.clear(key, true);
            } catch (e) {
                Zotero.debug(`Paper Chat: Failed to clear history for ${itemID}: ${e}`);
            }
        },

        /**
         * Export conversation as text
         * @param {number} itemID - Zotero item ID
         * @returns {string} - Formatted conversation text
         */
        exportAsText(itemID) {
            const history = this.getHistory(itemID);
            let text = "Paper Chat Conversation Export\n";
            text += "=".repeat(40) + "\n\n";

            for (const msg of history) {
                const role = msg.role === "user" ? "You" : "Assistant";
                const time = new Date(msg.timestamp).toLocaleString();
                text += `[${role}] (${time})\n`;
                text += msg.content + "\n\n";
            }

            return text;
        },

        /**
         * Get summary statistics
         */
        getStats(itemID) {
            const history = this.getHistory(itemID);
            return {
                messageCount: history.length,
                userMessages: history.filter(m => m.role === "user").length,
                assistantMessages: history.filter(m => m.role === "assistant").length,
                firstMessage: history[0]?.timestamp,
                lastMessage: history[history.length - 1]?.timestamp
            };
        }
    };

    // Add helper to main PaperChat object
    PaperChat.getMaxHistoryLength = function () {
        return Zotero.Prefs.get("extensions.zotero.paperchat.maxHistoryLength", true) || MAX_HISTORY_LENGTH;
    };

    Zotero.debug("Paper Chat: Conversation Store module loaded");
})();
