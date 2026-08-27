"use strict";

/**
 * Tabs tag (ParticleXF theme).
 *
 * Usage:
 *   {% tabs Label1 @icon1 Label2 @icon2 default:1 %}
 *   Content for tab 1
 *   <!-- tabs -->
 *   Content for tab 2
 *   {% endtabs %}
 *
 * Labels and optional @icon are space-separated.
 * Append `default:N` to set the initially active tab (0-based).
 * Tabs are separated by `<!-- tabs -->` comment lines.
 */

const ID_COUNTER = { v: 0 };

hexo.extend.tag.register(
  "tabs",
  function (args, content) {
    const blocks = content.split(/\n?<!--\s*tabs\s*-->\n?/);
    const id = `tabs-${++ID_COUNTER.v}`;
    let defaultTab = 0;
    const labelArgs = args.filter(a => {
      if (/^default:\d+$/i.test(a)) { defaultTab = parseInt(a.split(":")[1], 10); return false; }
      return true;
    });
    const labels = [];
    for (let i = 0; i < labelArgs.length;) {
      if (labelArgs[i].startsWith("@")) { labels.push({ text: "", icon: labelArgs[i].slice(1) }); i++; continue; }
      const label = labelArgs[i];
      const next = i + 1 < labelArgs.length && labelArgs[i + 1].startsWith("@") ? labelArgs[i + 1] : null;
      const icon = next ? next.slice(1) : null;
      labels.push({ text: label.replace(/,/g, ""), icon: icon });
      i += next ? 2 : 1;
    }
    if (!labels.length) {
      blocks.forEach((_, i) => labels.push({ text: "Tab " + (i + 1), icon: null }));
    }

    let html = `<div class="tabs" id="${id}">\n  <div class="tabs-nav" role="tablist">\n`;

    labels.forEach((label, i) => {
      const iconHtml = label.icon ? `<i class="fa-solid fa-${label.icon}"></i>` : "";
      const txtHtml = label.text ? `<span>${label.text}</span>` : "";
      const cls = label.text ? "" : " tab-icon-only";
      const active = i === defaultTab ? " active" : "";
      html += `    <button class="tabs-tab${cls}${active}" role="tab" data-tab="${i}" data-tabs-id="${id}">${iconHtml}${txtHtml}</button>\n`;
    });

    html += `  </div>\n  <div class="tabs-content">\n`;

    blocks.forEach((block, i) => {
      const rendered = hexo.render.renderSync({ text: block, engine: "markdown" });
      const active = i === defaultTab ? " active" : "";
      html += `    <div class="tabs-pane${active}" role="tabpanel" data-tab="${i}" data-tabs-id="${id}">${rendered}</div>\n`;
    });

    html += `  </div>\n</div>\n`;
    return html;
  },
  { ends: true }
);