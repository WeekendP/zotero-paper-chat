/* global Zotero, PaperChat */
/* PDF Navigator - Navigate and highlight content in PDFs */

(function () {
    /**
     * PDF Navigator Service
     */
    PaperChat.PDFNavigator = {
        /**
         * Navigate to a specific page in a PDF
         * @param {number} attachmentID - Attachment ID
         * @param {number} pageNumber - Page number (1-indexed)
         */
        async navigateToPage(attachmentID, pageNumber) {
            try {
                const attachment = await Zotero.Items.getAsync(attachmentID);
                if (!attachment) return;

                // Get the library and key for URI construction
                const libraryID = attachment.libraryID;
                const key = attachment.key;

                // Try to find an open reader for this attachment
                const reader = await this.getReaderForAttachment(attachmentID);

                if (reader) {
                    // Navigate within open reader
                    await this.scrollToPage(reader, pageNumber);
                } else {
                    // Open the PDF at the specified page
                    const uri = `zotero://open-pdf/library/items/${key}?page=${pageNumber}`;
                    Zotero.launchURL(uri);
                }
            } catch (e) {
                Zotero.logError(`Paper Chat: Navigation error: ${e}`);
            }
        },

        /**
         * Get the reader instance for an attachment
         */
        async getReaderForAttachment(attachmentID) {
            const readers = Zotero.Reader?._readers || [];
            for (const reader of readers) {
                if (reader._item?.id === attachmentID) {
                    return reader;
                }
            }
            return null;
        },

        /**
         * Scroll to a specific page in an open reader
         */
        async scrollToPage(reader, pageNumber) {
            try {
                // Use the internal reader API to navigate
                if (reader._iframeWindow) {
                    const pdfViewer = reader._iframeWindow?.PDFViewerApplication?.pdfViewer;
                    if (pdfViewer) {
                        pdfViewer.currentPageNumber = pageNumber;
                        return true;
                    }
                }

                // Alternative: use reader's navigate method if available
                if (reader.navigate) {
                    await reader.navigate({ pageIndex: pageNumber - 1 });
                    return true;
                }

                // Fallback: trigger via internal events
                reader._postMessage?.({
                    action: "navigate",
                    pageNumber: pageNumber - 1
                });

                return true;
            } catch (e) {
                Zotero.debug(`Paper Chat: scrollToPage error: ${e}`);
                return false;
            }
        },

        /**
         * Create a clickable page reference element
         * @param {number} attachmentID - Attachment ID
         * @param {number} pageNumber - Page number
         * @param {Document} doc - Document to create element in
         * @returns {HTMLElement} - Clickable span element
         */
        createPageReference(attachmentID, pageNumber, doc) {
            const span = doc.createElement("span");
            span.className = "paper-chat-page-ref";
            span.textContent = `page ${pageNumber}`;
            span.dataset.page = pageNumber;
            span.dataset.attachmentId = attachmentID;
            span.title = `Click to go to page ${pageNumber}`;

            span.addEventListener("click", (e) => {
                e.preventDefault();
                this.navigateToPage(attachmentID, pageNumber);
            });

            return span;
        },

        /**
         * Parse message text and convert page references to clickable links
         * @param {string} text - Message text
         * @param {number} attachmentID - Attachment ID
         * @param {Document} doc - Document for element creation
         * @returns {DocumentFragment} - Fragment with clickable references
         */
        parseAndLinkReferences(text, attachmentID, doc) {
            const fragment = doc.createDocumentFragment();

            // Pattern to match page references
            const pagePattern = /(?:page|Page|PAGE)\s*(\d+)(?:\s*[-–]\s*(\d+))?/g;

            let lastIndex = 0;
            let match;

            while ((match = pagePattern.exec(text)) !== null) {
                // Add text before the match
                if (match.index > lastIndex) {
                    fragment.appendChild(
                        doc.createTextNode(text.substring(lastIndex, match.index))
                    );
                }

                // Create clickable reference(s)
                const startPage = parseInt(match[1], 10);
                const endPage = match[2] ? parseInt(match[2], 10) : startPage;

                if (startPage === endPage) {
                    fragment.appendChild(this.createPageReference(attachmentID, startPage, doc));
                } else {
                    // Range: "pages 5-7"
                    const rangeSpan = doc.createElement("span");
                    rangeSpan.appendChild(doc.createTextNode("pages "));
                    rangeSpan.appendChild(this.createPageReference(attachmentID, startPage, doc));
                    rangeSpan.appendChild(doc.createTextNode("-"));
                    rangeSpan.appendChild(this.createPageReference(attachmentID, endPage, doc));
                    fragment.appendChild(rangeSpan);
                }

                lastIndex = match.index + match[0].length;
            }

            // Add remaining text
            if (lastIndex < text.length) {
                fragment.appendChild(doc.createTextNode(text.substring(lastIndex)));
            }

            return fragment;
        },

        /**
         * Highlight text on a page (if supported)
         * Note: This is a best-effort feature due to Zotero API limitations
         */
        async highlightTextOnPage(attachmentID, pageNumber, searchText) {
            const reader = await this.getReaderForAttachment(attachmentID);
            if (!reader) {
                // Open the PDF first, then try to highlight
                await this.navigateToPage(attachmentID, pageNumber);
                // Wait for reader to open
                await Zotero.Promise.delay(1000);
            }

            try {
                // Try to use the search feature to highlight
                if (reader?._iframeWindow) {
                    const pdfViewer = reader._iframeWindow?.PDFViewerApplication;
                    if (pdfViewer?.findController) {
                        pdfViewer.findController.executeCommand("find", {
                            query: searchText.substring(0, 50), // Limit search length
                            phraseSearch: true,
                            highlightAll: true
                        });
                    }
                }
            } catch (e) {
                Zotero.debug(`Paper Chat: Text highlight not available: ${e}`);
            }
        },

        /**
         * Get current page from active reader
         */
        getCurrentPage() {
            const readers = Zotero.Reader?._readers || [];
            if (readers.length === 0) return null;

            const activeReader = readers.find(r => r._window?.document?.hasFocus?.()) || readers[0];

            try {
                const pdfViewer = activeReader?._iframeWindow?.PDFViewerApplication?.pdfViewer;
                return pdfViewer?.currentPageNumber || null;
            } catch (e) {
                return null;
            }
        },

        /**
         * Open PDF in reader tab
         */
        async openPDFInReader(attachmentID) {
            try {
                const attachment = await Zotero.Items.getAsync(attachmentID);
                if (!attachment) return;

                await Zotero.Reader.open(attachmentID, null, {
                    openInNewWindow: false
                });
            } catch (e) {
                Zotero.logError(`Paper Chat: Error opening PDF: ${e}`);
            }
        }
    };

    Zotero.debug("Paper Chat: PDF Navigator module loaded");
})();
