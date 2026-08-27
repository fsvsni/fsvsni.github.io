# ParticleXF

A Hexo theme fork of [ParticleX](https://github.com/theme-particlex/hexo-theme-particlex), customized for personal blogs: dual themes, starry background, responsive TOC, code folding/wrapping, math support, Mermaid, archive filtering, and multiple comment options.

[中文 Readme](README.zh-CN.md)

## Features

- Soft dark / warm light dual themes using CSS variables
- Theme toggle in the top bar with user preference persistence
- Dynamic starry background (lighter effect in light mode)
- Article TOC with scroll highlighting, smooth jump, and a narrow-screen popover
- Code blocks: Highlight.js, line numbers, copy button, wrapping, and collapsible long code
- Math formulas, Mermaid diagrams, image preview, encrypted posts, archive title filtering
- Numeric post pinning and custom home-page summaries through Front Matter
- Supports giscus, Gitalk, Waline, Twikoo
- `{% note %}` callout boxes

## Installation

### Option 1 — Clone into your themes directory

```bash
cd your-hexo-site
git clone https://github.com/FloranceYeh/hexo-theme-particlexf themes/particlexf
```

Then enable the theme in your site's `_config.yml`:

```yaml
theme: particlexf
```

### Option 2 — As a submodule (recommended)

```bash
cd your-hexo-site
git submodule add https://github.com/FloranceYeh/hexo-theme-particlexf themes/particlexf
```

Also enable the theme in `_config.yml`.

### Recommended site dependencies

```bash
npm install hexo-server hexo-deployer-git
```

Mermaid, encryption, and comment clients are loaded by the theme from CDNs. Comment systems still require their own repository credentials or server deployments.

## Hexo compatibility tips

To avoid conflicts between Hexo built-in features and the theme, consider these settings.

### Disable Hexo's built-in syntax highlighting

If you use the theme's Highlight.js, disable Hexo's built-in highlighter by clearing `syntax_highlighter` in your site's `_config.yml`:

```yaml
syntax_highlighter:
```

### Disable automatic archive pages

If you don't need Hexo's automatic yearly/monthly/daily archives, disable them to avoid duplicate archive pages:

```yaml
archive_generator:
  enabled: true
  per_page: 0
  yearly: false
  monthly: false
  daily: false
```

After changes, run `hexo clean`.

## Theme configuration

The defaults live in the theme's `_config.yml`. For a cloned theme either edit that file, or preferably put overrides in the site root as `_config.particlexf.yml`. Keeping overrides outside `themes/particlexf` makes theme upgrades and submodule use easier. Run `hexo clean` after changing configuration.

Common options:

```yaml
avatar: /images/avatar.jpg

background:
  - /images/background.jpg

loading: /images/loading.gif

menu:
  Home:
    name: house
    theme: solid
    link: /
  About:
    name: id-card
    theme: solid
    link: /about

card:
  enable: true
  description: |
    Your name here.
    Your blog subtitle.

highlight:
  enable: true
  wrap: true
  collapse:
    enable: true
    lines: 20

math:
  enable: true

mermaid:
  enable: true

preview:
  enable: true

search:
  enable: true

stellars:
  enable: true
  seedChanger:
    enable: false
```

### Configuration reference

| Option | Behavior |
| --- | --- |
| `avatar` | Avatar shown in profile cards; also used as the site favicon. |
| `background` | List of home hero images. One image is selected randomly on each page load. |
| `loading` | Image displayed by the initial loading overlay. |
| `colors` | Palette used for category and tag labels. Keep at least two colors because adjacent labels avoid reusing the previous color. |
| `menu.<label>` | Adds a navigation item. `name` and `theme` form a Font Awesome 6 class, and `link` is passed through Hexo's `url_for`. |
| `card.enable` | Shows or hides the desktop home profile card. The compact profile block is still used at narrower widths. |
| `card.description` | Markdown-enabled profile text. |
| `card.iconLinks` | Icon-only profile links using Font Awesome `name`, `theme`, and `link` values. |
| `card.friendLinks` | Text links shown in the desktop profile card. |
| `footer.since` | First year in the footer copyright range. |
| `footer.ICP` | Optional ICP record; `code` can be plain text or linked with `link`. |
| `polyfill` | Loads the configured Polyfill.io-compatible feature list when enabled. |
| `highlight` | Enables browser-side Highlight.js, line numbers, copying, soft wrapping, and line-count-based collapsing. |
| `math.enable` | Enables KaTeX auto-rendering. |
| `mermaid.enable` / `version` | Loads the requested Mermaid version and initializes the built-in `forest` theme. |
| `preview.enable` | Opens clicked images in a full-screen preview overlay. |
| `crypto.enable` | Enables posts protected by a `secret` Front Matter value. |
| `search.enable` | Adds a title filter to the archive page; it is not a full-text site search. |
| `stellars.enable` | Enables the animated canvas star field. |
| `stellars.seedChanger.enable` | Shows the star-field seed input in navigation where space permits. |
| `giscus`, `gitalk`, `waline`, `twikoo` | Comment adapter settings; see the comments section below. |

The current templates use fixed Atom One Dark Reasonable / Atom One Light Highlight.js styles and a fixed Mermaid `forest` theme. The legacy `highlight.style` and `mermaid.options` keys in the default config do not currently change those values.

## Post Front Matter

Besides standard Hexo fields such as `title`, `date`, `tags`, and `categories`, ParticleXF reads these fields directly:

```yaml
---
title: Example post
date: 2026-07-26 12:00:00
tags:
  - hexo
categories:
  - Tutorial
description: |
  A **Markdown-enabled** summary for the home page.
pinned: 10
toc: true
comments: true
# secret: "change-me"
---
```

| Field | Type and behavior |
| --- | --- |
| `pinned` | Number. Posts with larger values appear first on the home page; equal values are ordered by date descending. Use a positive number. Any defined value also displays the pin marker. |
| `description` | Markdown-enabled home-page summary. If omitted, the theme uses the `<!-- more -->` excerpt, then falls back to the full post content. |
| `toc` | Set to `false` to hide the article TOC. Otherwise a TOC is generated when the rendered article has headings. |
| `comments` | Set to `true` to render the globally enabled comment adapter on a post or the links page. Global adapter configuration alone does not display comments. |
| `secret` | Password used for client-side AES encryption when `crypto.enable` is also `true`. If global encryption is disabled, the post is rendered normally. |

Client-side encryption is an access gate, not strong protection. Titles, metadata, and TOC headings remain public. Also set `description` or place `<!-- more -->` before protected content; otherwise the home-page summary fallback can expose the post body.

## Special pages

### Categories and tags

Create the two index pages with a `type` field:

```yaml
# source/categories/index.md
---
title: Categories
type: categories
---
```

```yaml
# source/tags/index.md
---
title: Tags
type: tags
---
```

The archive page at `/archives/` is produced by Hexo's archive generator. With `search.enable`, its search input filters normalized post titles only.

### Links page

The dedicated links layout is selected for the `/links/` route. Create `source/links/index.md`, then store link groups in `source/_data/links.yml`:

```yaml
Friends:
  Example:
    name: Example Blog
    url: https://example.com
    ava: https://example.com/avatar.png
    des: A short description
```

Markdown written in `source/links/index.md` is rendered after the link cards. Add `comments: true` to that page's Front Matter to show the configured comment system.

## Feature behavior

### Table of contents

On wide screens the TOC is a sticky article sidebar. At widths up to `1200px` it becomes a bottom-right popover opened from the floating TOC button. It tracks the active heading, scrolls the active entry into view, supports smooth heading jumps, and includes top plus comments/bottom shortcuts. Click outside, click the trigger again, choose an entry, or press `Escape` to close it.

### Code blocks

With `highlight.enable`, every `pre` block gets language highlighting, line numbers, and a copy action. `highlight.wrap` controls soft wrapping. When `highlight.collapse.enable` is true, blocks longer than `highlight.collapse.lines` start collapsed and get an expand/collapse control.

### Math and Mermaid

KaTeX recognizes `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`. For Mermaid, raw HTML is the most reliable input form with the current renderer:

```html
<div class="mermaid">
graph TD
  A --> B
</div>
```

### Home page and visual interactions

- Clicking the center of the full-screen home hero scrolls down one viewport to the post list.
- The theme choice defaults to dark, is stored in `localStorage` under `theme`, and also switches the Highlight.js and star-field palettes.
- A tall desktop profile card becomes independently scrollable at 80% of the viewport height.
- Native `<details>` / `<summary>` content has theme styling.
- Image preview applies to all images on the page; click the overlay or resize the window to close it.

### Comments

The theme includes four adapters. Configure and enable one adapter, then set `comments: true` on every post or links page that should show it. Enabling multiple adapters renders all of them, so using one at a time is recommended.

```yaml
giscus:
  enable: false

gitalk:
  enable: false

waline:
  enable: false
  serverURL: https://your-waline-server.example

twikoo:
  enable: false
```

- giscus requires `repo`, `repoID`, `category`, and `categoryID`; its remaining data attributes are passed from the matching config keys.
- Gitalk requires its GitHub OAuth credentials, repository, owner, and admin list. Comma-separate multiple admins.
- Waline requires `serverURL`. The theme loads Waline Client 3.15.2 and also passes emoji, locale, metadata, login, page-size, and related client options.
- Twikoo requires `envID`; `region`, `path`, and `lang` are optional adapter settings.

The TOC's lower shortcut points to comments only when `comments: true` and at least one adapter is enabled; otherwise it points to the footer.

## Note blocks

Use the `{% note %}` tag for callouts:

```markdown
{% note tip %}
Tip content supports **Markdown**.
{% endnote %}

{% note warning Custom title %}
Custom title.
{% endnote %}

{% note danger no-icon %}
No icon.
{% endnote %}
```

Supported types: `note`, `info`, `tip`, `success`, `warning`, `danger`, `quote`.

## Tabs

Create tabbed content blocks:

```markdown
{% tabs Tab1 @code Tab2 @image Tab3 @gear default:1 %}
Content for tab 1.
<!-- tabs -->
Content for tab 2.
<!-- tabs -->
Content for tab 3.
{% endtabs %}
```

- Labels and optional `@icon` (Font Awesome) are space-separated.
- Append `default:N` to set the initially active tab (0-based).
- Omit labels to use only icons: `{% tabs @house @gear %}`.
- Tab content is separated by `<!-- tabs -->`.

## Video

Embed external videos:

```markdown
{% video https://www.youtube.com/watch?v=VIDEO_ID %}
{% video https://www.bilibili.com/video/BVxxxxxxxx %}
{% video https://player.youku.com/embed/VIDEO_ID %}
```

Automatically detects YouTube, Bilibili, and Youku. Falls back to a direct iframe embed for other URLs.

## Layout

```
hexo-theme-particlexf/
├── _config.yml
├── layout/
├── scripts/
├── source/
│   ├── css/main.css
│   └── js/
└── package.json
```

## Development

From your blog site directory run:

```bash
hexo clean && hexo server
```

Edit theme files and refresh the browser. After config changes, run a clean before regenerating.

## License

MIT.