import { tryDownload } from "./download.js";
import { truncateName, safeFilename, toJsxSvg } from "./utils.js";

function metadataText(item) {
    const bits = [];
    if (item.type) bits.push(item.type.toUpperCase());
    if (item.width && item.height) bits.push(`${item.width}x${item.height}`);
    if (item.source) bits.push(item.source);
    return bits.join(" • ");
}

function flashButtonState(btn, text, cls = "copied", delay = 1400) {
    if (!btn) return;
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    btn.textContent = text;
    btn.classList.add(cls);
    btn.disabled = true;
    window.setTimeout(() => {
        btn.textContent = btn.dataset.originalText || btn.textContent;
        btn.classList.remove(cls);
        btn.disabled = false;
    }, delay);
}

export function renderImages(container, imageCount, images, selected, formatSelect, attachImageEventListeners, options = {}) {
    const {
        hideImageControls = false
    } = options;

    container.innerHTML = "";
    imageCount.textContent = `${images.length} items`;
    selected.clear();

    if (images.length === 0) {
        container.innerHTML = `<div class="empty-state">No items found for current filters.</div>`;
        return;
    }

    images.forEach(item => {
        const div = document.createElement("div");
        div.className = `item ${item.isSvg ? "icon-item" : ""} ${item.isFavorite ? "favorite" : ""}`.trim();
        div.dataset.id = item.id;

        let thumbHTML = "";
        if (item.isSvg && item.jsx) {
            thumbHTML = `<div class="svg-wrap" id="wrap-${item.id}" aria-busy="false">${item.jsx}</div>`;
        } else {
            thumbHTML = `
                <div class="thumb-wrap" aria-busy="true" id="wrap-${item.id}">
                    <div class="skeleton" id="skeleton-${item.id}"><div class="spinner"></div></div>
                    <img id="img-${item.id}" alt="${item.filename}" style="display:none" crossorigin="anonymous"/>
                </div>
            `;
        }

        div.innerHTML = `
            ${thumbHTML}
            <div class="meta">
                <label class="checkbox">
                    <input type="checkbox" class="chk" data-id="${item.id}" />
                    <span title="${item.filename}">${truncateName(item.filename, 18)}</span>
                </label>
                <div class="controls-right">
                    <button class="small-btn favorite-btn ${item.isFavorite ? "on" : ""}" data-id="${item.id}">★</button>
                    ${item.isSvg ? `<button class="small-btn copy-svg-btn" data-id="${item.id}">Copy SVG</button>
                                    <button class="small-btn copy-jsx-btn" data-id="${item.id}">Copy JSX</button>` : ""}
                    ${!hideImageControls && !item.isSvg ? `<button class="small-btn download-btn" data-id="${item.id}">Download</button>` : ""}
                </div>
            </div>
            <div class="meta-line">${metadataText(item)}</div>
            ${item.isNew ? `<div class="pill new-pill">New</div>` : ""}
        `;

        container.appendChild(div);

        if (!item.isSvg) {
            const imgEl = document.getElementById(`img-${item.id}`);
            imgEl.src = item.url;
            imgEl.onload = () => {
                item.loaded = true;
                const skeleton = document.getElementById(`skeleton-${item.id}`);
                if (skeleton) skeleton.remove();
                imgEl.style.display = "block";
                const wrapEl = document.getElementById(`wrap-${item.id}`);
                if (wrapEl) wrapEl.setAttribute("aria-busy", "false");
            };
            imgEl.onerror = () => {
                item.error = true;
                const skeleton = document.getElementById(`skeleton-${item.id}`);
                if (skeleton) skeleton.remove();
                const wrap = document.getElementById(`wrap-${item.id}`);
                if (wrap) wrap.innerHTML = `<div class="preview-error">Preview not available</div>`;
                if (wrap) wrap.setAttribute("aria-busy", "false");
            };
        }
    });

    attachImageEventListeners();
}

export function attachCheckboxAndButtonEvents(container, images, selected, formatSelect, updateSelectionUI, options = {}) {
    const {
        onToggleFavorite,
        onNotify
    } = options;

    container.querySelectorAll(".chk").forEach(cb => {
        cb.addEventListener("change", () => {
            const id = cb.dataset.id;
            if (cb.checked) selected.add(id);
            else selected.delete(id);
            const card = cb.closest(".item");
            if (card) card.classList.toggle("selected", cb.checked);
            updateSelectionUI();
        });
    });

    container.querySelectorAll(".download-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item) return;
            const chosen = formatSelect.value || "original";
            await tryDownload(item.url, safeFilename(item.filename), chosen);
            onNotify?.(`Downloaded ${item.filename}`);
        });
    });

    container.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            if (!id) return;
            onToggleFavorite?.(id);
        });
    });

    container.querySelectorAll(".copy-svg-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item || !item.isSvg) return;
            navigator.clipboard.writeText(item.jsx).then(() => {
                flashButtonState(btn, "Copied");
                onNotify?.("SVG copied");
            }).catch(() => {
                flashButtonState(btn, "Failed", "copy-failed");
                onNotify?.("Copy failed");
            });
        });
    });

    container.querySelectorAll(".copy-jsx-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item || !item.isSvg) return;
            navigator.clipboard.writeText(toJsxSvg(item.jsx)).then(() => {
                flashButtonState(btn, "Copied");
                onNotify?.("JSX copied");
            }).catch(() => {
                flashButtonState(btn, "Failed", "copy-failed");
                onNotify?.("Copy failed");
            });
        });
    });
}
