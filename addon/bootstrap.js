/* global Zotero, ChromeUtils, Services */
/* eslint-disable no-unused-vars */

var chromeHandle;

// Plugin lifecycle hooks
function install(data, reason) {
    // Called when the plugin is installed
}

function uninstall(data, reason) {
    // Called when the plugin is uninstalled
}

async function startup({ id, version, rootURI }, reason) {
    // Wait for Zotero to be ready
    await Zotero.initializationPromise;

    // Register chrome resources
    var aomStartup = Components.classes[
        "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Components.interfaces.amIAddonManagerStartup);

    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
        ["content", "paper-chat", rootURI + "content/"],
    ]);

    // Load the main plugin script
    Services.scriptloader.loadSubScript(rootURI + "content/main.js", {
        Zotero,
        rootURI,
    });

    // Initialize the plugin
    Zotero.PaperChat.init({ id, version, rootURI });
    Zotero.PaperChat.addToAllWindows();

    // Register for window events
    await Zotero.PaperChat.registerNotifyListeners();
}

function shutdown({ id, version, rootURI }, reason) {
    if (reason === APP_SHUTDOWN) {
        return;
    }

    // Remove from all windows and cleanup
    Zotero.PaperChat?.removeFromAllWindows();
    Zotero.PaperChat?.unregisterNotifyListeners();

    // Unregister chrome
    chromeHandle?.destruct();
    chromeHandle = null;

    // Clear the plugin object
    delete Zotero.PaperChat;
}
