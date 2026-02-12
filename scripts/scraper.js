import { makeId, shortNameFromUrl } from "./utils.js";

export async function scrapeImagesFromActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found");

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            const imgAssets = Array.from(document.querySelectorAll("img"))
                .map(img => {
                    const url = img.currentSrc || img.src;
                    if (!url) return null;
                    return {
                        key: `img:${url}`,
                        kind: "img",
                        payload: url,
                        width: img.naturalWidth || img.width || 0,
                        height: img.naturalHeight || img.height || 0
                    };
                })
                .filter(Boolean);

            const bgAssets = Array.from(document.querySelectorAll("*"))
                .map(el => {
                    const style = getComputedStyle(el).backgroundImage || "";
                    if (!style || style === "none") return null;
                    const match = style.match(/url\((['"])?(.+?)\1\)/);
                    if (!match) return null;
                    return {
                        key: `bg:${match[2]}`,
                        kind: "background",
                        payload: match[2],
                        width: el.clientWidth || 0,
                        height: el.clientHeight || 0
                    };
                })
                .filter(Boolean);

            const svgEls = Array.from(document.querySelectorAll("svg"));
            const svgAssets = svgEls.map((svg, idx) => {
                const clone = svg.cloneNode(true);
                const rect = svg.getBoundingClientRect();
                return {
                    key: `svg:${idx}:${clone.outerHTML.length}`,
                    kind: "svg",
                    payload: clone.outerHTML,
                    width: Math.round(rect.width || 0),
                    height: Math.round(rect.height || 0)
                };
            });

            const seen = new Set();
            return [...imgAssets, ...bgAssets, ...svgAssets].filter(asset => {
                if (seen.has(asset.key)) return false;
                seen.add(asset.key);
                return true;
            });
        }
    });

    const found = results?.[0]?.result || [];

    return found.map(raw => {
        const payload = raw?.payload || "";
        const isSvg = raw?.kind === "svg";
        const lower = isSvg ? "" : String(payload).toLowerCase();
        const dataMime = lower.startsWith("data:image/") ? lower.slice(11).split(";")[0] : "";
        const typeFromName = dataMime || lower.split("?")[0].split("#")[0].split(".").pop() || "";
        const normalizedType = typeFromName === "jpg" ? "jpeg" : typeFromName;
        const isGif = !isSvg && normalizedType === "gif";

        return {
            id: makeId(),
            filename: isSvg ? `icon-${makeId()}.svg` : shortNameFromUrl(payload),
            url: isSvg ? null : payload,
            isSvg,
            isGif,
            jsx: isSvg ? payload : null,
            type: isSvg ? "svg" : normalizedType,
            source: raw?.kind || "img",
            width: Number(raw?.width || 0),
            height: Number(raw?.height || 0),
            loaded: false,
            error: false
        };
    });
}