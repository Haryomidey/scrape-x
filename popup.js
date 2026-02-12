import { scrapeImagesFromActiveTab } from "./scripts/scraper.js";
import { renderImages, attachCheckboxAndButtonEvents } from "./scripts/dom.js";
import { tryDownload } from "./scripts/download.js";
import { safeFilename, extensionFromFilename } from "./scripts/utils.js";

const container = document.getElementById("image-container");
const imageCount = document.getElementById("image-count");
const selectAllBox = document.getElementById("select-all");
const formatSelect = document.getElementById("format-select");
const statusEl = document.getElementById("status");
const downloadSelectedBtn = document.getElementById("download-selected");
const downloadAllBtn = document.getElementById("download-all");
const scrapeImagesBtn = document.getElementById("scrape-images-btn");
const scrapeIconsBtn = document.getElementById("scrape-icons-btn");
const exportJsonBtn = document.getElementById("export-json");
const typeFilter = document.getElementById("type-filter");
const minWidthInput = document.getElementById("min-width");
const minHeightInput = document.getElementById("min-height");
const sortSelect = document.getElementById("sort-select");
const applyFiltersBtn = document.getElementById("apply-filters");
const resetFiltersBtn = document.getElementById("reset-filters");
const dedupeToggle = document.getElementById("dedupe-toggle");
const newOnlyToggle = document.getElementById("new-only-toggle");
const favoritesOnlyToggle = document.getElementById("favorites-only-toggle");
const retryFailedBtn = document.getElementById("retry-failed");
const clearFavoritesBtn = document.getElementById("clear-favorites");
const queueProgress = document.getElementById("queue-progress");
const queueLabel = document.getElementById("queue-label");
const failedCount = document.getElementById("failed-count");
const filenamePrefixInput = document.getElementById("filename-prefix");
const folderByDomainToggle = document.getElementById("folder-by-domain");

const STORAGE_KEY = "scrapex_settings_v2";
const defaultSettings = {
    format: "original",
    typeFilter: "all",
    minWidth: 0,
    minHeight: 0,
    sortBy: "default",
    dedupe: true,
    newOnly: false,
    favoritesOnly: false,
    filenamePrefix: "",
    folderByDomain: false
};

let settings = { ...defaultSettings };
let allItems = [];
let images = [];
let selected = new Set();
let favorites = new Set();
let failedDownloads = [];
let previousScanKeys = new Set();
let currentMode = "images";
let currentDomain = "site";
let queueRunning = false;

function normalizedAssetKey(item) {
    if (!item) return "";

    if (item.isSvg) {
        return String(item.jsx || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    const raw = String(item.url || "").trim();
    if (!raw) return "";

    if (raw.startsWith("data:")) {
        const mime = raw.slice(0, raw.indexOf(",") > -1 ? raw.indexOf(",") : raw.length).toLowerCase();
        const payload = raw.split(",")[1] || "";
        return `${mime},${payload}`;
    }

    try {
        const url = new URL(raw);
        return `${url.origin}${url.pathname}`.toLowerCase();
    } catch {
        return raw.split("#")[0].split("?")[0].toLowerCase();
    }
}

function setStatus(text) {
    statusEl.textContent = text;
}

function setButtonLoading(button, loading, loadingText = "Loading...") {
    if (!button) return;
    if (loading) {
        if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.classList.add("is-loading");
        button.disabled = true;
        return;
    }
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    button.classList.remove("is-loading");
    button.disabled = false;
}

function updateQueueUI(done = 0, total = 0) {
    const pct = total > 0 ? Math.floor((done / total) * 100) : 0;
    queueProgress.value = pct;
    queueLabel.textContent = total > 0 ? `Queue: ${done}/${total}` : "Queue: Idle";
    failedCount.textContent = `Failed: ${failedDownloads.length}`;
}

async function getActiveDomainFolder() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) return "site";
        const hostname = new URL(tab.url).hostname || "site";
        return hostname.replace(/^www\./, "").replace(/[^\w.-]/g, "_");
    } catch {
        return "site";
    }
}

function updateSelectionUI() {
    const count = selected.size;
    imageCount.textContent = `${images.length} items — Selected: ${count}`;
    selectAllBox.checked = count > 0 && count === images.length;
}

function currentFormat() {
    return formatSelect.value || "original";
}

function saveSettings() {
    chrome.storage.local.set({
        [STORAGE_KEY]: {
            settings,
            favorites: Array.from(favorites)
        }
    });
}

function pullSettingsFromInputs() {
    settings.format = formatSelect.value;
    settings.typeFilter = typeFilter.value;
    settings.minWidth = Math.max(0, Number(minWidthInput.value || 0));
    settings.minHeight = Math.max(0, Number(minHeightInput.value || 0));
    settings.sortBy = sortSelect.value;
    settings.dedupe = dedupeToggle.checked;
    settings.newOnly = newOnlyToggle.checked;
    settings.favoritesOnly = favoritesOnlyToggle.checked;
    settings.filenamePrefix = filenamePrefixInput.value.trim();
    settings.folderByDomain = folderByDomainToggle.checked;
}

function pushSettingsToInputs() {
    formatSelect.value = settings.format;
    typeFilter.value = settings.typeFilter;
    minWidthInput.value = String(settings.minWidth);
    minHeightInput.value = String(settings.minHeight);
    sortSelect.value = settings.sortBy;
    dedupeToggle.checked = settings.dedupe;
    newOnlyToggle.checked = settings.newOnly;
    favoritesOnlyToggle.checked = settings.favoritesOnly;
    filenamePrefixInput.value = settings.filenamePrefix;
    folderByDomainToggle.checked = settings.folderByDomain;
}

async function loadSavedState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const persisted = result?.[STORAGE_KEY];
    if (!persisted) return;

    settings = { ...defaultSettings, ...(persisted.settings || {}) };
    favorites = new Set(persisted.favorites || []);
    pushSettingsToInputs();
}

function sortItems(list) {
    const arr = [...list];
    arr.sort((a, b) => {
        const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
        if (favDiff !== 0) return favDiff;

        switch (settings.sortBy) {
            case "name-asc":
                return a.filename.localeCompare(b.filename);
            case "name-desc":
                return b.filename.localeCompare(a.filename);
            case "width-desc":
                return (b.width || 0) - (a.width || 0);
            case "height-desc":
                return (b.height || 0) - (a.height || 0);
            case "type-asc":
                return (a.type || "").localeCompare(b.type || "");
            default:
                return 0;
        }
    });
    return arr;
}

function filterItems(list) {
    let out = [...list];

    if (settings.dedupe) {
        const seen = new Set();
        out = out.filter(item => {
            const key = normalizedAssetKey(item);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    if (settings.typeFilter !== "all") {
        out = out.filter(item => {
            const ext = item.type || extensionFromFilename(item.filename);
            return ext === settings.typeFilter;
        });
    }

    if (settings.minWidth > 0) {
        out = out.filter(item => (item.width || 0) >= settings.minWidth);
    }

    if (settings.minHeight > 0) {
        out = out.filter(item => (item.height || 0) >= settings.minHeight);
    }

    if (settings.newOnly) {
        out = out.filter(item => item.isNew);
    }

    if (settings.favoritesOnly) {
        out = out.filter(item => item.isFavorite);
    }

    return sortItems(out);
}

function pruneSelected() {
    const visibleIds = new Set(images.map(i => i.id));
    selected = new Set([...selected].filter(id => visibleIds.has(id)));
}

function attachEvents() {
    attachCheckboxAndButtonEvents(container, images, selected, formatSelect, updateSelectionUI, {
        onToggleFavorite: id => {
            const item = images.find(i => i.id === id);
            if (!item) return;
            if (favorites.has(item.favoriteKey)) favorites.delete(item.favoriteKey);
            else favorites.add(item.favoriteKey);
            saveSettings();
            applyView();
        },
        onNotify: msg => setStatus(msg)
    });
}

function applyView() {
    allItems.forEach(item => {
        item.isFavorite = favorites.has(item.favoriteKey);
    });
    images = filterItems(allItems);
    pruneSelected();
    renderImages(container, imageCount, images, selected, formatSelect, attachEvents, {
        hideImageControls: currentMode !== "images"
    });
    updateSelectionUI();
}

function toggleImageControls(show) {
    document.querySelectorAll(".images-only").forEach(el => {
        el.style.display = show ? "grid" : "none";
    });
    selectAllBox.style.display = show ? "inline-flex" : "none";
}

function activateTab(mode) {
    currentMode = mode;
    const imageMode = mode === "images";
    toggleImageControls(imageMode);
    scrapeImagesBtn.classList.toggle("active", imageMode);
    scrapeIconsBtn.classList.toggle("active", !imageMode);
}

async function scan(mode) {
    const btn = mode === "images" ? scrapeImagesBtn : scrapeIconsBtn;
    setButtonLoading(btn, true, "Scanning...");
    activateTab(mode);
    try {
        setStatus(mode === "images" ? "Scanning page for images..." : "Scanning page for icons...");
        currentDomain = await getActiveDomainFolder();

        const items = await scrapeImagesFromActiveTab();
        const modeItems = items.filter(item => mode === "images" ? !item.isSvg : item.isSvg);
        const currentKeys = new Set(modeItems.map(i => normalizedAssetKey(i)));
        modeItems.forEach(item => {
            const key = normalizedAssetKey(item);
            item.favoriteKey = key || item.filename;
            item.isNew = !previousScanKeys.has(key);
        });
        previousScanKeys = currentKeys;

        allItems = modeItems;
        selected.clear();
        applyView();
        setStatus(`Found ${modeItems.length} ${mode === "images" ? "images" : "icons"}`);
    } finally {
        setButtonLoading(btn, false);
    }
}

function buildOutputName(item, format) {
    const parts = [];
    if (settings.folderByDomain) parts.push(currentDomain);
    const prefix = settings.filenamePrefix ? `${settings.filenamePrefix}_` : "";
    parts.push(`${prefix}${safeFilename(item.filename)}`);
    return parts.join("/");
}

async function queueDownloads(items) {
    if (!items.length) {
        setStatus("No items to download");
        return;
    }
    if (queueRunning) {
        setStatus("Queue already running");
        return;
    }

    queueRunning = true;
    failedDownloads = [];
    const format = currentFormat();
    const uniqueItems = [];
    const seen = new Set();
    for (const item of items) {
        const key = normalizedAssetKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        uniqueItems.push(item);
    }

    let done = 0;
    updateQueueUI(done, uniqueItems.length);

    for (const item of uniqueItems) {
        const ok = await tryDownload(item.url, buildOutputName(item, format), format);
        if (!ok) failedDownloads.push(item);
        done += 1;
        updateQueueUI(done, uniqueItems.length);
    }

    queueRunning = false;
    const skipped = items.length - uniqueItems.length;
    if (failedDownloads.length) {
        setStatus(`Done with ${failedDownloads.length} failures${skipped > 0 ? `, skipped ${skipped} duplicates` : ""}`);
    } else {
        setStatus(`All downloads started${skipped > 0 ? `, skipped ${skipped} duplicates` : ""}`);
    }
}

function resetFilters() {
    settings = {
        ...settings,
        typeFilter: "all",
        minWidth: 0,
        minHeight: 0,
        sortBy: "default",
        newOnly: false,
        favoritesOnly: false
    };
    pushSettingsToInputs();
    saveSettings();
    applyView();
}

function exportJson() {
    if (!images.length) {
        setStatus("No items to export");
        return;
    }
    const data = images.map(i => ({
        id: i.id,
        filename: i.filename,
        url: i.url,
        isSvg: i.isSvg,
        isGif: i.isGif,
        type: i.type,
        source: i.source,
        width: i.width,
        height: i.height,
        isNew: i.isNew,
        favorite: Boolean(i.isFavorite),
        jsx: i.jsx
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scrapex_assets.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Exported ${images.length} items`);
}

selectAllBox.addEventListener("change", () => {
    const checkboxes = container.querySelectorAll(".chk");
    if (selectAllBox.checked) {
        checkboxes.forEach(cb => {
            cb.checked = true;
            selected.add(cb.dataset.id);
            const card = cb.closest(".item");
            if (card) card.classList.add("selected");
        });
    } else {
        checkboxes.forEach(cb => {
            cb.checked = false;
            const card = cb.closest(".item");
            if (card) card.classList.remove("selected");
        });
        selected.clear();
    }
    updateSelectionUI();
});

scrapeImagesBtn.addEventListener("click", () => {
    scan("images").catch(err => setStatus(err.message));
});

scrapeIconsBtn.addEventListener("click", () => {
    scan("icons").catch(err => setStatus(err.message));
});

downloadAllBtn.addEventListener("click", async () => {
    setButtonLoading(downloadAllBtn, true, "Downloading...");
    try {
        await queueDownloads(images.filter(item => !item.isSvg));
    } finally {
        setButtonLoading(downloadAllBtn, false);
    }
});

downloadSelectedBtn.addEventListener("click", async () => {
    if (!selected.size) {
        setStatus("No items selected");
        return;
    }
    setButtonLoading(downloadSelectedBtn, true, "Downloading...");
    try {
        const selectedItems = images.filter(i => selected.has(i.id) && !i.isSvg);
        await queueDownloads(selectedItems);
    } finally {
        setButtonLoading(downloadSelectedBtn, false);
    }
});

retryFailedBtn.addEventListener("click", async () => {
    setButtonLoading(retryFailedBtn, true, "Retrying...");
    try {
        await queueDownloads([...failedDownloads]);
    } finally {
        setButtonLoading(retryFailedBtn, false);
    }
});

clearFavoritesBtn.addEventListener("click", () => {
    favorites.clear();
    saveSettings();
    applyView();
    setStatus("Favorites cleared");
});

exportJsonBtn.addEventListener("click", () => {
    setButtonLoading(exportJsonBtn, true, "Exporting...");
    try {
        exportJson();
    } finally {
        setButtonLoading(exportJsonBtn, false);
    }
});

[formatSelect, typeFilter, sortSelect].forEach(el => {
    el.addEventListener("change", () => {
        pullSettingsFromInputs();
        saveSettings();
        applyView();
    });
});

[minWidthInput, minHeightInput, filenamePrefixInput].forEach(el => {
    el.addEventListener("input", () => {
        pullSettingsFromInputs();
        saveSettings();
    });
});

[dedupeToggle, newOnlyToggle, favoritesOnlyToggle, folderByDomainToggle].forEach(el => {
    el.addEventListener("change", () => {
        pullSettingsFromInputs();
        saveSettings();
        applyView();
    });
});

applyFiltersBtn.addEventListener("click", () => {
    pullSettingsFromInputs();
    saveSettings();
    applyView();
});

resetFiltersBtn.addEventListener("click", resetFilters);

document.addEventListener("keydown", async e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && currentMode === "images") {
        e.preventDefault();
        selectAllBox.checked = true;
        selectAllBox.dispatchEvent(new Event("change"));
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && currentMode === "images") {
        e.preventDefault();
        downloadSelectedBtn.click();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        await scan(currentMode);
    }
});

async function init() {
    await loadSavedState();
    pullSettingsFromInputs();
    activateTab("images");
    updateQueueUI();
    await scan("images");
}

init().catch(err => setStatus(err.message));
