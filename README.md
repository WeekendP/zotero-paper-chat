# Zotero Paper Chat

An AI-powered conversational paper analysis plugin for Zotero 7, powered by Google's Gemini Models.

## Features

- 💬 **Chat with your papers** - Ask questions, summarize, and explore any PDF in your library.
- � **Multi-PDF Comparison** - Add multiple papers to the chat to compare methods, results, and theories.
- 🤖 **Model Selector** - Switch between models instantly:
  - `gemini-3-flash-preview`: Smartest reasoning (Note: Strict rate limits).
  - `gemini-2.5-flash`: Balanced performance.
  - `gemini-2.5-flash-lite`: Fast and efficient.
- � **Quick Actions** - One-click Summarize, Methodology, and Key Findings.
- 📄 **Smart Navigation** - Click on page numbers (e.g., "(page 5)") in the chat to jump directly to the source.
- 🔒 **Privacy-First** - Your API Key is stored securely in Zotero.

## Installation

1.  **Download**: Get the latest `.xpi` file from the [Releases](https://github.com/kondoh/zotero-paper-chat/releases) page.
2.  **Install**:
    - Open Zotero.
    - Go to **Tools → Add-ons**.
    - Click the **Gear Icon (⚙️)** → **Install Add-on From File...**.
    - Select the `.xpi` file.
3.  **Restart**: Restart Zotero when prompted.

## Getting Started

1.  **Select a PDF**: Click on any item with a PDF in your Zotero library.
2.  **Open Chat**: The "Paper Chat" panel appears in the right sidebar.
3.  **Set API Key**: Type your Google Gemini API key into the chat box (starting with `AI...`). It will maintain it securely.
    - *Don't have a key?* Get one for free at [Google AI Studio](https://aistudio.google.com/apikey).
4.  **Select Model**: Choose a model (e.g., `gemini-3-flash-preview` or `gemini-2.5-flash`) via the **🤖 Model** button.

## Usage Tips

- **Add a Paper**: Click **➕ Add Paper** to search and add another PDF to the current conversation.
- **Change Model**: Click **🤖 Model** to switch between Gemini versions if you hit rate limits (429 errors).
- **Clear Chat**: Click **🗑️ Clear Chat** to reset the conversation context.
# zotero-paper-chat
