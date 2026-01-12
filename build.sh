#!/bin/bash
# Build script for Zotero Paper Chat plugin

set -e

PLUGIN_NAME="zotero-paper-chat"
BUILD_DIR="build"
ADDON_DIR="addon"

echo "Building ${PLUGIN_NAME}..."

# Create build directory
mkdir -p "${BUILD_DIR}"

# Remove old build
rm -f "${BUILD_DIR}/${PLUGIN_NAME}.xpi"

# Create XPI (which is just a ZIP file)
cd "${ADDON_DIR}"
zip -r "../${BUILD_DIR}/${PLUGIN_NAME}.xpi" . -x "*.DS_Store" -x "*.git*"
cd ..

echo "Build complete: ${BUILD_DIR}/${PLUGIN_NAME}.xpi"
echo ""
echo "To install:"
echo "1. Open Zotero"
echo "2. Go to Tools → Add-ons"
echo "3. Click the gear icon → Install Add-on From File..."
echo "4. Select ${BUILD_DIR}/${PLUGIN_NAME}.xpi"
