/* global Zotero, PaperChat, fetch */
/* Gemini API Service for Paper Chat */

(function () {
    const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

    /**
     * Gemini Service - handles all API interactions
     */
    PaperChat.GeminiService = {
        /**
         * Send a message to Gemini API
         * @param {string} message - User message
         * @param {string} pdfContent - PDF text content for context
         * @param {Array} conversationHistory - Previous messages
         * @param {Array} images - Optional array of base64 images
         * @returns {Promise<Object>} - Response with text and references
         */
        async sendMessage(message, pdfContent, conversationHistory = [], images = []) {
            const apiKey = PaperChat.getAPIKey();
            if (!apiKey) {
                throw new Error("API key not configured. Please set your Gemini API key in preferences.");
            }

            // Use gemini-3-flash-preview as requested (Warning: Strict rate limits apply)
            const model = PaperChat.getModel() || "gemini-3-flash-preview";
            const systemPrompt = PaperChat.getSystemPrompt();

            // Build the contents array
            const contents = this.buildContents(message, pdfContent, conversationHistory, systemPrompt, images);

            const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        contents,
                        generationConfig: {
                            temperature: 0.7,
                            topK: 40,
                            topP: 0.95,
                            maxOutputTokens: 8192,
                        },
                        safetySettings: [
                            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                        ],
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                return this.parseResponse(data);
            } catch (e) {
                Zotero.logError("Paper Chat: Gemini API error: " + e);
                throw e;
            }
        },

        /**
         * Build the contents array for the API request
         */
        buildContents(message, pdfContent, conversationHistory, systemPrompt, images) {
            const contents = [];

            // System context with PDF content (as first user message for Gemini)
            const contextParts = [
                {
                    text: `${systemPrompt}\n\n--- PAPER CONTENT ---\n${pdfContent}\n--- END PAPER CONTENT ---\n\nPlease analyze this paper and respond to user queries. When referencing specific parts, mention page numbers like "On page X..." or "(page X)".`
                }
            ];

            // Add images if provided
            if (images && images.length > 0) {
                for (const img of images) {
                    contextParts.push({
                        inlineData: {
                            mimeType: img.mimeType || "image/png",
                            data: img.data
                        }
                    });
                }
            }

            contents.push({
                role: "user",
                parts: contextParts
            });

            // Add acknowledgment
            contents.push({
                role: "model",
                parts: [{ text: "I have analyzed the paper. I'm ready to help you understand its content. Feel free to ask any questions about it." }]
            });

            // Add conversation history
            for (const msg of conversationHistory) {
                contents.push({
                    role: msg.role === "user" ? "user" : "model",
                    parts: [{ text: msg.content }]
                });
            }

            // Add current message
            contents.push({
                role: "user",
                parts: [{ text: message }]
            });

            return contents;
        },

        /**
         * Parse the API response
         */
        parseResponse(data) {
            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("No response generated");
            }

            const candidate = data.candidates[0];
            if (candidate.finishReason === "SAFETY") {
                throw new Error("Response blocked by safety filters");
            }

            const text = candidate.content?.parts?.[0]?.text || "";

            // Extract page references from the response
            const references = this.extractPageReferences(text);

            return {
                text,
                references,
                usage: data.usageMetadata
            };
        },

        /**
         * Extract page references from response text
         */
        extractPageReferences(text) {
            const references = [];

            // Match patterns like "page 5", "Page 12", "(page 3)", "pages 5-7"
            const pageRegex = /(?:page|Page|PAGE)\s*(\d+)(?:\s*[-–]\s*(\d+))?/g;
            let match;

            while ((match = pageRegex.exec(text)) !== null) {
                const startPage = parseInt(match[1], 10);
                const endPage = match[2] ? parseInt(match[2], 10) : startPage;

                for (let p = startPage; p <= endPage; p++) {
                    if (!references.includes(p)) {
                        references.push(p);
                    }
                }
            }

            return references.sort((a, b) => a - b);
        },

        /**
         * Generate quick action prompts
         */
        getQuickActionPrompt(action) {
            const prompts = {
                summarize: "Please provide a concise summary of this paper, including the main research question, methodology, key findings, and conclusions. Keep it to about 3-4 paragraphs.",
                findings: "What are the key findings and results of this paper? Please list them with their significance and the page numbers where they are discussed.",
                methodology: "Explain the methodology used in this paper. What approach did the researchers take, what data did they use, and how did they analyze it?",
                conclusions: "What are the main conclusions of this paper? What do the authors suggest for future research?",
                contributions: "What are the main contributions of this paper to its field? Why is this research significant?",
                limitations: "What are the limitations of this study as discussed in the paper?",
                related: "What related work and prior research does this paper build upon?"
            };

            return prompts[action] || action;
        },

        /**
         * Test API connection
         */
        async testConnection() {
            const apiKey = PaperChat.getAPIKey();
            if (!apiKey) {
                return { success: false, error: "No API key configured" };
            }

            try {
                const url = `${GEMINI_API_BASE}?key=${apiKey}`;
                const response = await fetch(url);

                if (response.ok) {
                    return { success: true };
                } else {
                    return { success: false, error: `HTTP ${response.status}` };
                }
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
    };

    Zotero.debug("Paper Chat: Gemini Service module loaded");
})();
