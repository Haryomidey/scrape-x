import { tryDownload } from "./download.js";
import { truncateName, safeFilename } from "./utils.js";

export function renderImages(container, imageCount, images, selected, formatSelect, attachImageEventListeners, options = {}) {
    const { hideImageControls = false } = options;

    container.innerHTML = "";
    imageCount.textContent = `${images.length} items`;
    selected.clear();

    if (images.length === 0) {
        container.innerHTML = `<div style="padding:12px;color:var(--muted)">No images/icons found. Try clicking "Scan".</div>`;
        return;
    }

    images.forEach(item => {
        const div = document.createElement("div");
        div.className = "item";
        div.dataset.id = item.id;

        let thumbHTML = '';
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
                    ${item.isSvg ? `<button class="small-btn copy-svg-btn" data-id="${item.id}">Copy SVG</button>
                                    <button class="small-btn copy-jsx-btn" data-id="${item.id}">Copy JSX</button>` : ''}
                    ${!hideImageControls && !item.isSvg ? `<button class="small-btn convert-btn" data-id="${item.id}">Convert</button>
                    <button class="small-btn download-btn" data-id="${item.id}">Download</button>` : ''}
                </div>
            </div>
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
                if (wrap) wrap.innerHTML = `<div style="font-size:12px;color:${getComputedStyle(document.documentElement).getPropertyValue('--muted')};text-align:center;padding:8px">Preview not available</div>`;
                if (wrap) wrap.setAttribute("aria-busy", "false");
            };
        }

    });

    attachImageEventListeners();
}

export function attachCheckboxAndButtonEvents(container, images, selected, formatSelect, updateSelectionUI) {
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
            await tryDownload(item.url, safeFilename(item.filename), "original");
        });
    });

    container.querySelectorAll(".convert-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item || item.isSvg) return;
            const chosen = formatSelect.value;
            await tryDownload(item.url, safeFilename(item.filename), chosen);
        });
    });

    container.querySelectorAll(".copy-svg-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item || !item.isSvg) return;
            navigator.clipboard.writeText(item.jsx).then(() => alert("SVG copied to clipboard!"));
        });
    });

    container.querySelectorAll(".copy-jsx-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const item = images.find(i => i.id === id);
            if (!item || !item.isSvg) return;
            navigator.clipboard.writeText(item.jsx).then(() => alert("JSX copied to clipboard!"));
        });
    });
}