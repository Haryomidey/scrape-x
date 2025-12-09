import { ensureExt, safeFilename, delay, convertBlobWithCanvas } from "./utils.js";

export async function tryDownload(url, filename, format = "original", wait = 0) {
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
    } catch {
        try {
            chrome.downloads.download({ url, filename: safeFilename(filename) }, () => {});
        } catch {}
    }
}