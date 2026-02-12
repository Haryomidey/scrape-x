import { ensureExt, safeFilename, delay, convertBlobWithCanvas } from "./utils.js";

async function downloadViaChrome(url, filename) {
    return new Promise(resolve => {
        chrome.downloads.download({ url, filename: safeFilename(filename) }, downloadId => {
            if (chrome.runtime.lastError || !downloadId) {
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
}

export async function tryDownload(url, filename, format = "original", wait = 0) {
    if (!url) return false;

    try {
        if (format === "original") {
            const ok = await downloadViaChrome(url, filename);
            if (wait) await delay(wait);
            return ok;
        }

        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) throw new Error("Fetch failed");
        const blob = await response.blob();
        const blobConverted = await convertBlobWithCanvas(blob, format);
        if (!blobConverted) throw new Error("Conversion failed");

        const ext = format === "jpeg" ? "jpg" : format;
        const outName = ensureExt(filename, ext);
        const objectUrl = URL.createObjectURL(blobConverted);
        const ok = await downloadViaChrome(objectUrl, outName);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        if (wait) await delay(wait);
        return ok;
    } catch {
        return downloadViaChrome(url, filename);
    }
}