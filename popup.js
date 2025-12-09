import { scrapeImagesFromActiveTab } from "./scripts/scraper.js";
import { renderImages, attachCheckboxAndButtonEvents } from "./scripts/dom.js";
import { tryDownload } from "./scripts/download.js";

const container = document.getElementById("image-container");
const imageCount = document.getElementById("image-count");
const selectAllBox = document.getElementById("select-all");
const formatSelect = document.getElementById("format-select");
const statusEl = document.getElementById("status");
const downloadSelectedBtn = document.getElementById("download-selected");
const downloadSelectedConvertBtn = document.getElementById("download-selected-convert");
const downloadAllBtn = document.getElementById("download-all");
const scrapeImagesBtn = document.getElementById("scrape-images-btn");
const scrapeIconsBtn = document.getElementById("scrape-icons-btn");
const exportJsonBtn = document.getElementById("export-json");

let images = [];
let selected = new Set();

function setStatus(text) {
    statusEl.textContent = text;
}

function updateSelectionUI() {
    const count = selected.size;
    imageCount.textContent = `${images.length} items — Selected: ${count}`;
    selectAllBox.checked = count === images.length && images.length > 0;
}

function attachEvents() {
    attachCheckboxAndButtonEvents(container, images, selected, formatSelect, updateSelectionUI);
}

function toggleImageControls(show) {
    document.querySelectorAll(".images-only").forEach(el => {
        el.style.display = show ? "flex" : "none";
    });
    selectAllBox.style.display = show ? "inline-flex" : "none";
}

function showImagesTab() {
    toggleImageControls(true);
    scrapeImagesBtn.classList.add("active");
    scrapeIconsBtn.classList.remove("active");
}

function showIconsTab() {
    toggleImageControls(false);
    scrapeImagesBtn.classList.remove("active");
    scrapeIconsBtn.classList.add("active");
}

selectAllBox.addEventListener("change", () => {
    const checkboxes = container.querySelectorAll(".chk");
    if (selectAllBox.checked) {
        checkboxes.forEach(cb => {
            cb.checked = true;
            selected.add(cb.dataset.id);
        });
    } else {
        checkboxes.forEach(cb => cb.checked = false);
        selected.clear();
    }
    updateSelectionUI();
});

scrapeImagesBtn.addEventListener("click", () => {
    setStatus("Scanning page for images...");
    scrapeImagesFromActiveTab().then(items => {
        images = items.filter(item => !item.isSvg);
        selected.clear();
        renderImages(container, imageCount, images, selected, formatSelect, attachEvents);
        showImagesTab();
        setStatus(`Found ${images.length} images/GIFs`);
    }).catch(err => setStatus(err.message));
});

scrapeIconsBtn.addEventListener("click", () => {
    setStatus("Scanning page for icons...");
    scrapeImagesFromActiveTab().then(items => {
        images = items.filter(item => item.isSvg);
        selected.clear();
        renderImages(container, imageCount, images, selected, formatSelect, attachEvents, { hideImageControls: true });
        showIconsTab();
        setStatus(`Found ${images.length} icons`);
    }).catch(err => setStatus(err.message));
});

downloadAllBtn.addEventListener("click", async () => {
    setStatus("Downloading all images...");
    for (const item of images) {
        if (!item.isSvg) await tryDownload(item.url, item.filename, "original");
    }
    setStatus("All downloads started");
});

downloadSelectedBtn.addEventListener("click", async () => {
    if (selected.size === 0) return setStatus("No items selected");
    setStatus("Downloading selected...");
    for (const id of selected) {
        const item = images.find(i => i.id === id);
        if (!item || item.isSvg) continue;
        await tryDownload(item.url, item.filename, "original");
    }
    setStatus("Selected downloads started");
});

downloadSelectedConvertBtn.addEventListener("click", async () => {
    if (selected.size === 0) return setStatus("No items selected");
    const chosen = formatSelect.value;
    if (chosen === "original") return setStatus("Choose a format to convert");
    setStatus("Converting & downloading selected...");
    for (const id of selected) {
        const item = images.find(i => i.id === id);
        if (!item || item.isSvg) continue;
        await tryDownload(item.url, item.filename, chosen);
    }
    setStatus("Selected conversions started");
});

exportJsonBtn.addEventListener("click", () => {
    if (images.length === 0) return setStatus("No items to export");
    const data = images.map(i => ({
        id: i.id,
        filename: i.filename,
        url: i.url,
        isSvg: i.isSvg,
        isGif: i.isGif,
        jsx: i.jsx
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scrapex_images.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Exported ${images.length} items to JSON`);
});

showImagesTab();