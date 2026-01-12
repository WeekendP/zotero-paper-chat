/* global Zotero, PaperChat, Components */
/* PDF Extractor - Extract text and images from PDFs */

(function () {
    /**
     * PDF Extractor Service
     */
    PaperChat.PDFExtractor = {
        /**
         * Get full text content from a PDF attachment
         * @param {number} attachmentID - Zotero attachment item ID
         * @returns {Promise<Object>} - Object with text, pages, and metadata
         */
        async extractContent(attachmentID) {
            const attachment = await Zotero.Items.getAsync(attachmentID);
            if (!attachment || !attachment.isPDFAttachment()) {
                throw new Error("Invalid PDF attachment");
            }

            Zotero.debug(`Paper Chat: Extracting content from attachment ${attachmentID}`);

            // Try to get cached full-text first
            let fullText = await this.getCachedFullText(attachmentID);

            if (!fullText) {
                // Extract directly using PDF.js
                fullText = await this.extractWithPDFJS(attachment);
            }

            return {
                text: fullText.text,
                pages: fullText.pages || [],
                pageCount: fullText.pageCount || 0,
                title: attachment.parentItem?.getField("title") || attachment.getField("title") || "Untitled",
                attachmentID
            };
        },

        /**
         * Get cached full-text from Zotero's index
         */
        async getCachedFullText(attachmentID) {
            try {
                // Try to get the indexed content
                const content = await Zotero.Fulltext.getItemContent(attachmentID);
                if (content && content.content) {
                    return {
                        text: content.content,
                        pageCount: content.pageCount || 0,
                        pages: [] // Cached version doesn't have per-page breakdown
                    };
                }
            } catch (e) {
                Zotero.debug(`Paper Chat: No cached full-text for ${attachmentID}: ${e}`);
            }
            return null;
        },

        /**
         * Extract text using Zotero's built-in full-text indexer
         * (Replaces direct PDF.js extraction which is unstable in Z7)
         */
        async extractWithPDFJS(attachment) {
            Zotero.debug("Paper Chat: Attempting extraction via Fulltext Indexer");
            return await this.extractWithZoteroFulltext(attachment);
        },

        /**
         * Extract text string from an open Zotero Reader
         */
        async extractFromOpenReader(attachmentID) {
            try {
                let reader = null;

                // Attempt 1: Zotero 7 API - getByItemID
                if (typeof Zotero.Reader.getByItemID === 'function') {
                    reader = Zotero.Reader.getByItemID(attachmentID);
                }

                // Attempt 2: Internal _readers list
                if (!reader && Zotero.Reader._readers) {
                    const readers = Zotero.Reader._readers;
                    const list = Array.isArray(readers) ? readers : Object.values(readers);
                    reader = list.find(r => r.itemID == attachmentID);
                    if (reader) {
                        Zotero.debug("Paper Chat: Found reader via Zotero.Reader._readers");
                    }
                }

                if (!reader) {
                    return null;
                }

                // Get text from the reader internal state
                const pdfDoc = reader._iframeWindow?.PDFViewerApplication?.pdfDocument ||
                    reader._internalReader?._iframeWindow?.PDFViewerApplication?.pdfDocument ||
                    reader.pdfDocument ||
                    (reader.internalInstance && reader.internalInstance.pdfDocument);

                if (pdfDoc) {
                    Zotero.debug(`Paper Chat: Found PDF Doc, pages: ${pdfDoc.numPages}`);
                    let fullText = "";

                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        try {
                            const page = await pdfDoc.getPage(i);
                            const content = await page.getTextContent();
                            const strings = content.items.map(item => item.str);
                            fullText += strings.join(" ") + "\n\n";
                        } catch (e) {
                            Zotero.debug(`Paper Chat: Page ${i} extraction error: ${e}`);
                        }
                    }

                    if (fullText.trim().length > 0) {
                        return {
                            text: fullText,
                            pageCount: pdfDoc.numPages
                        };
                    }
                } else {
                    Zotero.debug("Paper Chat: Reader found but PDF doc access failed. Keys: " + Object.keys(reader));
                }
            } catch (e) {
                Zotero.debug(`Paper Chat: Reader extraction failed: ${e}`);
            }
            return null;
        },

        /**
         * Extract text (Main Strategy)
         */
        async extractWithZoteroFulltext(attachment) {
            // STRATEGY 1: Check Open Reader (Fastest)
            const readerContent = await this.extractFromOpenReader(attachment.id);
            if (readerContent && readerContent.text.length > 50) {
                Zotero.debug("Paper Chat: Extracted text from Open Reader (Strategy 1)");
                return {
                    text: readerContent.text,
                    pages: [],
                    pageCount: readerContent.pageCount
                };
            }

            // STRATEGY 2: Fulltext Index Cache File (Robust Fallback)
            try {
                Zotero.debug("Paper Chat: Checking Fulltext Index...");

                // Ensure it's indexed (takes ID)
                await Zotero.Fulltext.indexItems([attachment.id], { force: false });

                // Zotero 7 workaround: Read the cache file directly
                if (typeof Zotero.Fulltext.getItemCacheFile === 'function') {
                    // FIX: getItemCacheFile requires Item Object, not ID!
                    // 'attachment' is a plain object in some contexts but usually a Zotero Item in this flow.
                    // To be safe, look it up real quick if needed, but 'attachment' usually works if it's the item.

                    let item = attachment;
                    if (typeof attachment.isRegularItem !== 'function') {
                        // If it's a serialized object, fetch the real item
                        item = Zotero.Items.get(attachment.id);
                    }

                    const cacheFile = Zotero.Fulltext.getItemCacheFile(item);
                    if (cacheFile && cacheFile.exists()) {
                        const content = Zotero.File.getContents(cacheFile);
                        if (content && content.length > 50) {
                            Zotero.debug("Paper Chat: Extracted text from Fulltext Cache File");
                            return { text: content, pageCount: 0 };
                        }
                    } else {
                        Zotero.debug("Paper Chat: No cache file found.");
                    }
                }
            } catch (e) {
                Zotero.logError(`Paper Chat: Fulltext extraction failed: ${e}`);
            }

            throw new Error("Could not extract text. Please OPEN the PDF in a tab and try again.");
        },

        /**
         * Extract content from multiple PDFs
         * @param {Array<number>} attachmentIDs - Array of attachment IDs
         * @returns {Promise<Object>} - Combined content from all PDFs
         */
        async extractMultipleContent(attachmentIDs) {
            const results = [];
            let combinedText = "";

            for (const attachmentID of attachmentIDs) {
                try {
                    const content = await this.extractContent(attachmentID);
                    results.push(content);

                    combinedText += `\n\n${"=".repeat(60)}\n`;
                    combinedText += `PAPER: ${content.title}\n`;
                    combinedText += `${"=".repeat(60)}\n`;
                    combinedText += content.text;
                } catch (e) {
                    Zotero.logError(`Paper Chat: Failed to extract attachment ${attachmentID}: ${e}`);
                }
            }

            return {
                papers: results,
                combinedText: combinedText.trim(),
                count: results.length
            };
        },

        /**
         * Get all PDF attachments from selected items
         * @returns {Promise<Array>} - Array of attachment objects
         */
        async getSelectedPDFAttachments() {
            const selectedItems = Zotero.getActiveZoteroPane()?.getSelectedItems() || [];
            const attachments = [];

            for (const item of selectedItems) {
                if (item.isPDFAttachment()) {
                    attachments.push(item);
                } else if (item.isRegularItem()) {
                    const itemAttachments = await item.getAttachments();
                    for (const attachID of itemAttachments) {
                        const attach = await Zotero.Items.getAsync(attachID);
                        if (attach?.isPDFAttachment()) {
                            attachments.push(attach);
                        }
                    }
                } else if (item.isCollection?.()) {
                    // Handle collection selection
                    const collectionItems = item.getChildItems();
                    for (const collItem of collectionItems) {
                        if (collItem.isPDFAttachment()) {
                            attachments.push(collItem);
                        } else if (collItem.isRegularItem()) {
                            const itemAttachments = await collItem.getAttachments();
                            for (const attachID of itemAttachments) {
                                const attach = await Zotero.Items.getAsync(attachID);
                                if (attach?.isPDFAttachment()) {
                                    attachments.push(attach);
                                }
                            }
                        }
                    }
                }
            }

            return attachments;
        },

        /**
         * Estimate token count (rough approximation)
         * @param {string} text - Text to estimate
         * @returns {number} - Approximate token count
         */
        estimateTokens(text) {
            // Rough estimate: ~4 characters per token
            return Math.ceil(text.length / 4);
        },

        /**
         * Truncate content to fit within token limit
         * @param {string} text - Full text
         * @param {number} maxTokens - Maximum tokens (default 100k for Gemini)
         * @returns {string} - Truncated text
         */
        truncateToTokenLimit(text, maxTokens = 100000) {
            const currentTokens = this.estimateTokens(text);
            if (currentTokens <= maxTokens) {
                return text;
            }

            // Keep approximately maxTokens worth of characters
            const maxChars = maxTokens * 4;
            const truncated = text.substring(0, maxChars);

            return truncated + "\n\n[Content truncated due to length...]";
        }
    };

    Zotero.debug("Paper Chat: PDF Extractor module loaded");
})();
