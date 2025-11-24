const scrapeBtn = document.getElementById("scrape-btn");
const container = document.getElementById("image-container");
const imageCount = document.getElementById("image-count");
const selectAllBox = document.getElementById("select-all");
const formatSelect = document.getElementById("format-select");
const statusEl = document.getElementById("status");
const downloadSelectedBtn = document.getElementById("download-selected");
const downloadSelectedConvertBtn = document.getElementById("download-selected-convert");
const downloadAllBtn = document.getElementById("download-all");
const typeFilter = document.getElementById("type-filter");
const minWidthInput = document.getElementById("min-width");
const minHeightInput = document.getElementById("min-height");
const applyFilterBtn = document.getElementById("apply-filter");
const sortFilenameBtn = document.getElementById("sort-filename");
const exportJsonBtn = document.getElementById("export-json");

let images = [];
let selected = new Set();

function setStatus(text) {
    statusEl.textContent = text;
}

function makeId() {
    return Math.random().toString(36).slice(2, 9);
}

function shortNameFromUrl(url) {
    try {
        const u = new URL(url);
        const seg = u.pathname.split("/").filter(Boolean);
        const last = seg.pop() || "image";
        return decodeURIComponent(last.split("?")[0]);
    } catch {
        return "image";
    }
}

async function scrapeImagesFromActiveTab() {
    setStatus("Scanning page...");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        setStatus("No active tab");
        return;
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const imgTags = [...document.querySelectorAll("img")]
                    .map(img => img.currentSrc || img.src)
                    .filter(Boolean);

                const bgImages = [...document.querySelectorAll("*")]
                    .map(el => {
                        const b = getComputedStyle(el).backgroundImage || "";
                        if (!b || b === "none") return null;
                        const match = b.match(/url\((['"])?(.+?)\1\)/);
                        return match ? match[2] : null;
                    })
                    .filter(Boolean);

                return Array.from(new Set([...imgTags, ...bgImages]));
            }
        });

        const found = (results && results[0] && results[0].result) || [];
        images = found.map(url => ({
            url,
            id: makeId(),
            filename: shortNameFromUrl(url),
            loaded: false,
            error: false
        }));

        renderImages();
        setStatus(`Found ${images.length} images`);
    } catch (err) {
        console.error(err);
        setStatus("Error scanning page");
    }
}

function renderImages() {
    container.innerHTML = "";
    imageCount.textContent = `Images: ${images.length}`;
    selectAllBox.checked = false;
    selected.clear();

    if (images.length === 0) {
        container.innerHTML = `<div style="padding:12px;color:var(--muted)">No images found. Try clicking "Scan Images".</div>`;
        return;
    }

    images.forEach(item => {
        const div = document.createElement("div");
        div.className = "item";
        div.dataset.id = item.id;

        div.innerHTML = `
            <div class="thumb-wrap" aria-busy="true" id="wrap-${item.id}">
                <div class="skeleton" id="skeleton-${item.id}"><div class="spinner"></div></div>
                <img id="img-${item.id}" alt="${item.filename}" style="display:none" crossorigin="anonymous"/>
            </div>
            <div class="meta">
                <label class="checkbox">
                    <input type="checkbox" class="chk" data-id="${item.id}" />
                    <span title="${item.filename}">${truncateName(item.filename, 18)}</span>
                </label>
                <div class="controls-right">
                    <button class="small-btn convert-btn" data-id="${item.id}">Convert</button>
                    <button class="small-btn download-btn" data-id="${item.id}">Download</button>
                </div>
            </div>
        `;

        container.appendChild(div);

        const imgEl = document.getElementById(`img-${item.id}`);
        imgEl.src = item.url;
        imgEl.onload = () => {
            item.loaded = true;
            const skeleton = document.getElementById(`skeleton-${item.id}`);
            if (skeleton) skeleton.remove();
            imgEl.style.display = "block";
            document.getElementById(`wrap-${item.id}`).setAttribute("aria-busy", "false");
        };
        imgEl.onerror = () => {
            item.error = true;
            const skeleton = document.getElementById(`skeleton-${item.id}`);
            if (skeleton) skeleton.remove();
            const wrap = document.getElementById(`wrap-${item.id}`);
            wrap.innerHTML = `<div style="font-size:12px;color:${getComputedStyle(document.documentElement).getPropertyValue('--muted')};text-align:center;padding:8px">Preview not available</div>`;
            wrap.setAttribute("aria-busy", "false");
        };
    });

    attachImageEventListeners();
}

function attachImageEventListeners() {
    container.querySelectorAll(".chk").forEach(cb => {
        cb.addEventListener("change", () => {
            const id = cb.dataset.id;
            if (cb.checked) selected.add(id);
            else selected.delete(id);
            updateSelectionUI();
        });
    });

    container.querySelectorAll(".download-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item) return;
            await tryDownload(item.url, item.filename, "original");
        });
    });

    container.querySelectorAll(".convert-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item) return;
            const chosen = formatSelect.value;
            if (chosen === "original") {
                await tryDownload(item.url, item.filename, "original");
            } else {
                await tryDownload(item.url, item.filename, chosen);
            }
        });
    });
}

function truncateName(name, len) {
    if (!name) return "";
    return name.length > len ? name.slice(0, len - 1) + "…" : name;
}

function updateSelectionUI() {
    const count = selected.size;
    imageCount.textContent = `Images: ${images.length} — Selected: ${count}`;
    selectAllBox.checked = count === images.length && images.length > 0;
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

scrapeBtn.addEventListener("click", () => scrapeImagesFromActiveTab());

downloadAllBtn.addEventListener("click", async () => {
    setStatus("Downloading all images...");
    for (const item of images) {
        await tryDownload(item.url, item.filename, "original", 150);
    }
    setStatus("All downloads started");
});

downloadSelectedBtn.addEventListener("click", async () => {
    if (selected.size === 0) return setStatus("No images selected");
    setStatus("Downloading selected...");
    for (const id of selected) {
        const item = images.find(i => i.id === id);
        if (item) await tryDownload(item.url, item.filename, "original", 120);
    }
    setStatus("Selected downloads started");
});

downloadSelectedConvertBtn.addEventListener("click", async () => {
    if (selected.size === 0) return setStatus("No images selected");
    const chosen = formatSelect.value;
    if (chosen === "original") return setStatus("Choose a format to convert");
    setStatus("Converting & downloading selected...");
    for (const id of selected) {
        const item = images.find(i => i.id === id);
        if (item) await tryDownload(item.url, item.filename, chosen, 150);
    }
    setStatus("Selected conversions started");
});

applyFilterBtn.addEventListener("click", () => {
    const type = typeFilter.value;
    const minWidth = parseInt(minWidthInput.value) || 0;
    const minHeight = parseInt(minHeightInput.value) || 0;

    const filtered = images.filter(img => {
        const ext = img.filename.split(".").pop().toLowerCase();
        return (type === "all" || type === ext) &&
               (!img.width || img.width >= minWidth) &&
               (!img.height || img.height >= minHeight);
    });

    images = filtered;
    renderImages();
});

sortFilenameBtn.addEventListener("click", () => {
    images.sort((a, b) => a.filename.localeCompare(b.filename));
    renderImages();
});

exportJsonBtn.addEventListener("click", () => {
    const data = images.filter(img => selected.has(img.id)).map(img => ({
        filename: img.filename,
        url: img.url
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: "images.json" });
    setTimeout(() => URL.revokeObjectURL(url), 30000);
});

// Keyboard shortcuts
document.addEventListener("keydown", e => {
    if (e.key === "a" && e.ctrlKey) {
        selectAllBox.checked = true;
        selectAllBox.dispatchEvent(new Event("change"));
        e.preventDefault();
    }
    if (e.key === "s" && e.ctrlKey) {
        scrapeBtn.click();
        e.preventDefault();
    }
});

async function tryDownload(url, filename, format = "original", wait = 0) {
    try {
        if (format === "original") {
            chrome.downloads.download({ url, filename: safeFilename(filename) }, () => {});
            if (wait) await delay(wait);
            return;
        }

        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) throw new Error("Fetch failed");
        const blob = await response.blob();
        const blobConverted = await convertBlobWithCanvas(blob, format);
        if (!blobConverted) throw new Error("Conversion failed");

        const ext = format === "jpeg" ? "jpg" : format;
        const outName = ensureExt(filename, ext);
        const objectUrl = URL.createObjectURL(blobConverted);
        chrome.downloads.download({ url: objectUrl, filename: outName }, () => {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        });
        if (wait) await delay(wait);
    } catch (err) {
        console.warn("convert/download failed for", url, err);
        try {
            chrome.downloads.download({ url, filename: safeFilename(filename) }, () => {});
        } catch (e) {
            console.error("fallback download failed", e);
        }
    }
}

function ensureExt(name, ext) {
    const dot = name.lastIndexOf(".");
    if (dot === -1) return `${name}.${ext}`;
    return `${name.slice(0, dot)}.${ext}`;
}

function safeFilename(name) {
    const clean = name.replace(/[*?"<>|:]/g, "_");
    return clean || `image_${Date.now()}`;
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function convertBlobWithCanvas(blob, format) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(blob);
    } catch (e) {
        console.warn("createImageBitmap failed", e);
        return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
    return new Promise(resolve => {
        canvas.toBlob(b => resolve(b), mime, 0.92);
    });
}