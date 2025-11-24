chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "downloadImage") {
        try {
            const response = await fetch(request.url, { mode: "no-cors" });
            const blob = await response.blob();

            sendResponse({
                ok: true,
                blob: await blobToBase64(blob),
            });
        } catch (e) {
            sendResponse({ ok: false, error: e.toString() });
        }
    }

    return true;
});

function blobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}