/**
 * Note / callout tag (ParticleXF theme).
 *
 * Usage:
 *   {% note %}Default note{% endnote %}
 *   {% note tip %}Tip body{% endnote %}
 *   {% note warning 注意 %}With custom title{% endnote %}
 *   {% note danger no-icon %}No icon{% endnote %}
 *
 * Types: note | info | tip | success | warning | danger | quote
 */
"use strict";

const TYPES = {
    note: { icon: "fa-solid fa-pen", title: "说明" },
    info: { icon: "fa-solid fa-circle-info", title: "信息" },
    tip: { icon: "fa-solid fa-lightbulb", title: "提示" },
    success: { icon: "fa-solid fa-circle-check", title: "成功" },
    warning: { icon: "fa-solid fa-triangle-exclamation", title: "警告" },
    danger: { icon: "fa-solid fa-circle-xmark", title: "危险" },
    quote: { icon: "fa-solid fa-quote-left", title: "引用" },
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

hexo.extend.tag.register(
    "note",
    function (args, content) {
        const tokens = args.map((a) => String(a).trim()).filter(Boolean);
        let type = "note";
        let showIcon = true;
        const titleParts = [];

        tokens.forEach((t) => {
            const lower = t.toLowerCase();
            if (TYPES[lower]) {
                type = lower;
            } else if (lower === "no-icon" || lower === "noicon") {
                showIcon = false;
            } else {
                titleParts.push(t);
            }
        });

        const meta = TYPES[type] || TYPES.note;
        const title = titleParts.length ? titleParts.join(" ") : meta.title;
        const rendered = hexo.render.renderSync({ text: content, engine: "markdown" });

        const iconHtml = showIcon
            ? `<span class="note-icon" aria-hidden="true"><i class="${meta.icon}"></i></span>`
            : "";

        return [
            `<div class="note note-${type}" role="note">`,
            `  <div class="note-title">`,
            iconHtml,
            `    <span class="note-title-text">${escapeHtml(title)}</span>`,
            `  </div>`,
            `  <div class="note-body">${rendered}</div>`,
            `</div>`,
        ].join("\n");
    },
    { ends: true }
);
