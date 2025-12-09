export function makeId(length = 6) {
    return Math.random().toString(36).substr(2, length);
}

export function shortNameFromUrl(url) {
    try {
        return url.split("/").pop().split("?")[0];
    } catch {
        return "file";
    }
}

export function safeFilename(name) {
    return name.replace(/[\/\\?%*:|"<>]/g, "_");
}

export function ensureExt(name, ext) {
    return name.replace(/\.\w+$/, "") + "." + ext;
}

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function convertBlobWithCanvas(blob, format) {
    return new Promise(resolve => {
        const img = document.createElement("img");
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(b => resolve(b), `image/${format}`);
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(blob);
    });
}

export function truncateName(name, length = 18) {
    if (name.length <= length) return name;
    const ext = name.includes(".") ? "." + name.split(".").pop() : "";
    return name.slice(0, length) + "…" + ext;
}