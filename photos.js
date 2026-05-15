// photos.js — client logic for /photos
// Loads photos.json, renders the bento grid of series, handles series view
// and lightbox. URL state via ?series=<id>.

(function () {
    'use strict';

    const PHOTOS_JSON_URL = '/photos.json';
    const FALLBACK_THUMB = 'https://beyondmebtw.com/assets/images/favicon.ico';

    const state = {
        data: null,                      // { series: [...] }
        currentSeries: null,             // series object or null
        lightboxIndex: -1                // index into currentSeries.images
    };

    // ── Utility ────────────────────────────────────────────────────────────
    function esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function clampSpan(n) {
        const v = parseInt(n, 10);
        if (!Number.isFinite(v)) return 1;
        return Math.max(1, Math.min(4, v));
    }

    function $(id) { return document.getElementById(id); }

    // ── Data ───────────────────────────────────────────────────────────────
    async function loadData() {
        const url = `${PHOTOS_JSON_URL}?t=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load photos.json (${res.status})`);
        const data = await res.json();
        if (!data || !Array.isArray(data.series)) {
            return { series: [] };
        }
        // Sort by `order` then by title for stable display.
        data.series.sort((a, b) => {
            const oa = Number.isFinite(a.order) ? a.order : 999;
            const ob = Number.isFinite(b.order) ? b.order : 999;
            if (oa !== ob) return oa - ob;
            return String(a.title || '').localeCompare(String(b.title || ''));
        });
        return data;
    }

    // ── Bento grid render ──────────────────────────────────────────────────
    function renderBento() {
        const grid = $('bento-grid');
        const empty = $('bento-empty');

        if (!state.data || state.data.series.length === 0) {
            grid.innerHTML = '<p class="empty-msg">No photo series yet. Check back soon.</p>';
            return;
        }

        const html = state.data.series.map(series => {
            const colSpan = clampSpan(series.grid && series.grid.colSpan);
            const rowSpan = clampSpan(series.grid && series.grid.rowSpan);
            const thumb = series.thumbnail
                || (series.images && series.images[0] && series.images[0].url)
                || FALLBACK_THUMB;
            const count = (series.images || []).length;
            const countText = count === 1 ? '1 photo' : `${count} photos`;

            return `
                <button class="bento-card"
                        data-series-id="${esc(series.id)}"
                        data-col-span="${colSpan}"
                        data-row-span="${rowSpan}"
                        style="grid-column: span ${colSpan}; grid-row: span ${rowSpan};"
                        aria-label="Open series ${esc(series.title)}">
                    <div class="bento-card-bg" style="background-image: url('${esc(thumb)}');"></div>
                    <img class="bento-card-img" src="${esc(thumb)}" alt="${esc(series.title)}" loading="lazy"
                         onerror="this.src='${FALLBACK_THUMB}'">
                    <div class="bento-card-overlay"></div>
                    <div class="bento-card-content">
                        <h2 class="bento-card-title">${esc(series.title)}</h2>
                        <span class="bento-card-count">${esc(countText)}</span>
                    </div>
                    <span class="bento-card-cta">click to explore</span>
                </button>
            `;
        }).join('');

        grid.innerHTML = html;

        grid.querySelectorAll('.bento-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.seriesId;
                openSeries(id, true);
            });
        });

        if (empty) empty.remove();
    }

    // ── Series view ────────────────────────────────────────────────────────
    function openSeries(id, pushHistory) {
        if (!state.data) return;
        const series = state.data.series.find(s => s.id === id);
        if (!series) {
            // Unknown id — fall back to bento.
            showBento(pushHistory);
            return;
        }

        state.currentSeries = series;

        $('series-title').textContent = series.title || '';

        const images = series.images || [];
        const countEl = $('series-count');
        if (countEl) {
            const n = images.length;
            countEl.textContent = n === 0 ? '' : (n === 1 ? '1 photo' : `${n} photos`);
            countEl.hidden = n === 0;
        }

        const descEl = $('series-description');
        const descText = (series.description || '').trim();
        if (descText) {
            descEl.textContent = descText;
            descEl.hidden = false;
        } else {
            descEl.textContent = '';
            descEl.hidden = true;
        }

        const rawLink = $('series-raw-link');
        if (series.rawLink && String(series.rawLink).trim()) {
            rawLink.href = series.rawLink;
            rawLink.textContent = series.rawLinkLabel && series.rawLinkLabel.trim()
                ? series.rawLinkLabel
                : 'View raw / non-watermarked images';
            rawLink.hidden = false;
        } else {
            rawLink.hidden = true;
            rawLink.removeAttribute('href');
        }

        const imageGrid = $('series-image-grid');

        if (images.length === 0) {
            imageGrid.innerHTML = '<p class="empty-msg">No images in this series yet.</p>';
        } else {
            imageGrid.innerHTML = images.map((img, i) => {
                const o = (img.orientation || 'landscape').toLowerCase();
                const orientation = (o === 'portrait' || o === 'square') ? o : 'landscape';
                return `
                <div class="series-image-card" data-index="${i}" data-orientation="${orientation}"
                     tabindex="0" role="button" aria-label="Expand image ${i + 1}">
                    <img src="${esc(img.url)}" alt="${esc(img.alt || img.description || series.title)}"
                         loading="lazy" onerror="this.src='${FALLBACK_THUMB}'">
                    <div class="series-image-hover">click to expand</div>
                </div>
            `;
            }).join('');

            imageGrid.querySelectorAll('.series-image-card').forEach(card => {
                const idx = parseInt(card.dataset.index, 10);
                card.addEventListener('click', () => openLightbox(idx));
                card.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openLightbox(idx);
                    }
                });
            });
        }

        $('bento-view').hidden = true;
        $('series-view').hidden = false;
        window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

        document.title = `${series.title} | BeyondMeBtw`;

        if (pushHistory) {
            const url = new URL(window.location.href);
            url.searchParams.set('series', series.id);
            history.pushState({ series: series.id }, '', url.toString());
        }
    }

    function showBento(pushHistory) {
        state.currentSeries = null;
        $('series-view').hidden = true;
        $('bento-view').hidden = false;
        document.title = 'Photos | BeyondMeBtw';

        if (pushHistory) {
            const url = new URL(window.location.href);
            url.searchParams.delete('series');
            history.pushState({}, '', url.toString());
        }
    }

    // ── Lightbox ───────────────────────────────────────────────────────────
    function openLightbox(index) {
        if (!state.currentSeries) return;
        const images = state.currentSeries.images || [];
        if (index < 0 || index >= images.length) return;

        state.lightboxIndex = index;
        const img = images[index];

        $('lightbox-img').src = img.url;
        $('lightbox-img').alt = img.alt || img.description || '';

        const descText = (img.description || '').trim();
        $('lightbox-desc').textContent = descText;

        // Center the image when there is no description (single-column layout).
        const content = document.querySelector('.lightbox-content');
        if (content) content.classList.toggle('no-desc', !descText);

        const lb = $('lightbox');
        lb.hidden = false;
        document.body.style.overflow = 'hidden';

        // Hide prev/next when only one image
        $('lightbox-prev').style.display = images.length > 1 ? '' : 'none';
        $('lightbox-next').style.display = images.length > 1 ? '' : 'none';
    }

    function closeLightbox() {
        $('lightbox').hidden = true;
        document.body.style.overflow = '';
        state.lightboxIndex = -1;
    }

    function lightboxStep(delta) {
        if (!state.currentSeries) return;
        const images = state.currentSeries.images || [];
        if (images.length === 0) return;
        const next = (state.lightboxIndex + delta + images.length) % images.length;
        openLightbox(next);
    }

    function initLightbox() {
        $('lightbox-close').addEventListener('click', closeLightbox);
        $('lightbox-prev').addEventListener('click', () => lightboxStep(-1));
        $('lightbox-next').addEventListener('click', () => lightboxStep(1));

        $('lightbox').addEventListener('click', e => {
            // Close on click of anything except the image itself or the
            // close / prev / next controls (those have their own handlers).
            if (e.target.closest('.lightbox-close, .lightbox-nav')) return;
            if (e.target === $('lightbox-img')) return;
            closeLightbox();
        });

        document.addEventListener('keydown', e => {
            if ($('lightbox').hidden) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') lightboxStep(-1);
            else if (e.key === 'ArrowRight') lightboxStep(1);
        });
    }

    // ── Routing ────────────────────────────────────────────────────────────
    function applyUrl() {
        const params = new URLSearchParams(window.location.search);
        const seriesId = params.get('series');
        if (seriesId) openSeries(seriesId, false);
        else showBento(false);
    }

    function initRouting() {
        $('back-btn').addEventListener('click', () => showBento(true));
        window.addEventListener('popstate', () => applyUrl());
    }

    // ── Boot ───────────────────────────────────────────────────────────────
    async function init() {
        initLightbox();
        initRouting();
        try {
            state.data = await loadData();
        } catch (e) {
            console.error('Photos load error:', e);
            $('bento-grid').innerHTML = '<p class="empty-msg">Could not load photos. Please try again later.</p>';
            return;
        }
        renderBento();
        applyUrl();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
