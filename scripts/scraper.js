import { makeId, shortNameFromUrl } from "./utils.js";

export async function scrapeImagesFromActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found");

    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            const imgs = Array.from(document.querySelectorAll("img"))
                .map(img => img.currentSrc || img.src)
                .filter(Boolean);
            const bgImages = Array.from(document.querySelectorAll("*"))
                .map(el => {
                    const style = getComputedStyle(el).backgroundImage || "";
                    if (!style || style === "none") return null;
                    const match = style.match(/url\((['"])?(.+?)\1\)/);
                    return match ? match[2] : null;
                })
                .filter(Boolean);
            const svgEls = Array.from(document.querySelectorAll("svg"));
            const svgStrings = svgEls.map(svg => {
                const clone = svg.cloneNode(true);
                clone.querySelectorAll("*").forEach(el => {
                    if (el.hasAttribute("class")) {
                        el.setAttribute("className", el.getAttribute("class"));
                        el.removeAttribute("class");
                    }
                });
                return clone.outerHTML;
            });
            return Array.from(new Set([...imgs, ...bgImages, ...svgStrings]));
        }
    });

    const found = results?.[0]?.result || [];

    return found.map(urlOrSvg => {
        const isSvg = typeof urlOrSvg === "string" && urlOrSvg.trim().startsWith("<svg");
        const isGif = !isSvg && typeof urlOrSvg === "string" && urlOrSvg.toLowerCase().endsWith(".gif");
        return {
            id: makeId(),
            filename: isSvg ? `icon-${makeId()}.svg` : shortNameFromUrl(urlOrSvg),
            url: isSvg ? null : urlOrSvg,
            isSvg,
            isGif,
            jsx: isSvg ? urlOrSvg : null,
            loaded: false,
            error: false
        };
    });
}