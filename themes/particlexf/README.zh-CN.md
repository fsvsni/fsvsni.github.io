# ParticleXF

[ParticleX](https://github.com/theme-particlex/hexo-theme-particlex) 的 Hexo 主题分支，基于上游主题做了更偏个人博客的定制：双主题、星空背景、响应式 TOC、代码折叠/换行、数学公式、Mermaid、归档筛选和多种评论方案等。

[English Readme](README.md)

## 特性

- 柔和深色 / 暖浅色双主题，使用 CSS 变量切换
- 顶栏主题切换并记忆用户选择
- 动态星空背景，浅色模式下显示更轻量的背景效果
- 文章 TOC：滚动高亮、平滑跳转、窄屏浮层
- 代码块：Highlight.js 高亮、行号、复制、自动换行、长代码折叠
- 数学公式、Mermaid 图表、图片预览、文章加密、归档标题筛选
- 通过 Front Matter 设置文章置顶权重和首页摘要
- 支持 giscus、Gitalk、Waline、Twikoo
- `{% note %}` 提示框标签

## 安装

### 方式一：直接克隆到主题目录

```bash
cd your-hexo-site
git clone https://github.com/FloranceYeh/hexo-theme-particlexf themes/particlexf
```

然后在站点根目录的 `_config.yml` 中启用主题：

```yaml
theme: particlexf
```

### 方式二：作为子模块（推荐）

```bash
cd your-hexo-site
git submodule add https://github.com/FloranceYeh/hexo-theme-particlexf themes/particlexf
```

也记得在 `_config.yml` 中启用主题。

### 建议的站点依赖

```bash
npm install hexo-server hexo-deployer-git
```

Mermaid、加密和评论客户端由主题从 CDN 加载，不需要额外安装前端包；评论系统仍需各自的仓库凭据或服务端部署。

## Hexo 兼容设置

为了避免 Hexo 自带能力和主题功能冲突，建议顺手检查下面几项：

### 关闭自带代码高亮

如果你在使用主题自带的 Highlight.js，建议关闭 Hexo 自带高亮。

把 `_config.yml` 中的 `syntax_highlighter` 配置改为空值即可。

```yaml
syntax_highlighter:
```

### 禁用自动归档页

如果你不需要 Hexo 自动生成年度 / 月度 / 日度归档，建议关闭它们，避免和主题的归档页体验重复。

```yaml
archive_generator:
  enabled: true
  per_page: 0
  yearly: false
  monthly: false
  daily: false
```

修改后建议执行一次 `hexo clean`。

## 主题配置

主题默认配置位于 [_config.yml](_config.yml)。直接克隆主题时可以修改该文件，但更推荐在站点根目录使用 `_config.particlexf.yml` 覆盖配置，这样更新主题或使用 Git 子模块时不会混入个人配置。修改配置后请执行一次 `hexo clean`。

常用项如下：

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

### 配置项索引

| 配置项 | 实际作用 |
| --- | --- |
| `avatar` | 个人卡片头像，同时作为站点 favicon。 |
| `background` | 首页首屏背景图片列表；每次加载随机选择一张。 |
| `loading` | 首次加载遮罩中显示的图片。 |
| `colors` | 分类和标签的颜色列表。相邻标签会避开上一种颜色，因此至少保留两种颜色。 |
| `menu.<显示名>` | 添加导航项；`name` 和 `theme` 组成 Font Awesome 6 图标类，`link` 会经过 Hexo 的 `url_for`。 |
| `card.enable` | 控制桌面首页侧边个人卡片；窄屏仍会使用紧凑版个人信息块。 |
| `card.description` | 个人简介，支持 Markdown。 |
| `card.iconLinks` | 个人卡片的纯图标链接，使用 Font Awesome 的 `name`、`theme` 和目标 `link`。 |
| `card.friendLinks` | 桌面个人卡片中的文字链接。 |
| `footer.since` | 页脚版权年份范围的起始年份。 |
| `footer.ICP` | 可选备案信息；填写 `link` 时将 `code` 渲染为链接，否则显示纯文本。 |
| `polyfill` | 启用时加载配置的 Polyfill.io 兼容特性列表。 |
| `highlight` | 浏览器端 Highlight.js、行号、复制、软换行和按行数折叠。 |
| `math.enable` | 启用 KaTeX 自动渲染。 |
| `mermaid.enable` / `version` | 加载指定版本的 Mermaid，并使用内置的 `forest` 主题初始化。 |
| `preview.enable` | 点击图片后打开全屏预览层。 |
| `crypto.enable` | 启用带有 `secret` Front Matter 的加密文章。 |
| `search.enable` | 在归档页加入标题筛选框；不是全文站内搜索。 |
| `stellars.enable` | 启用 Canvas 动态星空。 |
| `stellars.seedChanger.enable` | 在空间允许的导航栏中显示星空种子输入框。 |
| `giscus`、`gitalk`、`waline`、`twikoo` | 评论适配器配置，详见下方“评论配置”。 |

当前模板固定使用 Atom One Dark Reasonable / Atom One Light 两套 Highlight.js 样式，Mermaid 固定使用 `forest` 主题。默认配置中遗留的 `highlight.style` 和 `mermaid.options` 目前不会改变这些值。

## 文章 Front Matter

除了 Hexo 标准的 `title`、`date`、`tags`、`categories` 外，ParticleXF 会直接读取以下字段：

```yaml
---
title: 示例文章
date: 2026-07-26 12:00:00
tags:
  - hexo
categories:
  - Tutorial
description: |
  首页显示的摘要，支持 **Markdown**。
pinned: 10
toc: true
comments: true
# secret: "change-me"
---
```

| 字段 | 类型与行为 |
| --- | --- |
| `pinned` | 数值。数值越大，文章在首页越靠前；数值相同时按日期倒序。建议使用正数。只要定义了该字段，首页也会显示置顶标记。 |
| `description` | 首页文章摘要，支持 Markdown。未设置时依次回退到 `<!-- more -->` 摘要和完整正文。 |
| `toc` | 设为 `false` 可关闭当前文章的 TOC；其他情况下，有标题的文章会自动生成 TOC。 |
| `comments` | 设为 `true` 才会在文章或友链页渲染全局已启用的评论系统；只开启全局评论配置并不会自动显示评论。 |
| `secret` | 当 `crypto.enable` 同时为 `true` 时，作为浏览器端 AES 解密密码；若全局加密未开启，文章会正常明文渲染。 |

浏览器端加密只能作为访问门槛，不能视为强安全保护；标题、元数据和 TOC 标题仍然公开。加密文章还应单独设置 `description`，或在受保护内容前放置 `<!-- more -->`，否则首页摘要回退可能直接暴露正文。

## 特殊页面

### 分类页与标签页

分别创建带有 `type` 的索引页：

```yaml
# source/categories/index.md
---
title: 分类
type: categories
---
```

```yaml
# source/tags/index.md
---
title: 标签
type: tags
---
```

`/archives/` 归档页由 Hexo 的归档生成器创建。启用 `search.enable` 后，搜索框只按标准化后的文章标题即时筛选。

### 友链页

主题会为 `/links/` 路由选择专用友链布局。创建 `source/links/index.md`，并在 `source/_data/links.yml` 中按分组维护数据：

```yaml
朋友们:
  Example:
    name: 示例博客
    url: https://example.com
    ava: https://example.com/avatar.png
    des: 一段简短介绍
```

`source/links/index.md` 中的 Markdown 会显示在友链卡片之后。在该页面的 Front Matter 中加入 `comments: true` 可显示已配置的评论系统。

## 功能行为

### 文章目录

宽屏下 TOC 是文章右侧的粘性侧栏；宽度不超过 `1200px` 时变为右下角浮层，通过悬浮目录按钮打开。它会跟踪当前标题、自动滚动活动目录项、平滑跳转，并提供“顶部”和“评论/底部”快捷入口。点击外部、再次点击目录按钮、选择目录项或按 `Escape` 都会关闭浮层。

### 代码块

启用 `highlight.enable` 后，每个 `pre` 代码块都会获得语言高亮、行号和复制按钮。`highlight.wrap` 控制软换行；`highlight.collapse.enable` 开启时，超过 `highlight.collapse.lines` 行的代码默认折叠，并显示展开/收起控件。

### 数学公式与 Mermaid

KaTeX 支持 `$...$`、`$$...$$`、`\(...\)` 和 `\[...\]`。在当前 Markdown 渲染流程中，Mermaid 使用原始 HTML 最稳定：

```html
<div class="mermaid">
graph TD
  A --> B
</div>
```

### 首页与视觉交互

- 点击全屏首页首屏的中央区域，会平滑滚动一个视口高度到文章列表。
- 主题默认使用深色模式，选择会以 `theme` 为键存入 `localStorage`，同时联动代码高亮和星空配色。
- 桌面个人卡片内容超过视口高度的 80% 时，会变成独立滚动区域。
- 原生 `<details>` / `<summary>` 内容带有主题样式。
- 图片预览作用于页面中的全部图片；点击遮罩或调整窗口大小会关闭预览。

### 评论配置

主题内置四种评论适配。配置并开启其中一种后，还要在需要评论的文章或友链页设置 `comments: true`。同时开启多个适配器会全部渲染，因此建议一次只使用一种。

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

- giscus 需要 `repo`、`repoID`、`category`、`categoryID`，其余 data 属性由同名配置传入。
- Gitalk 需要 GitHub OAuth 凭据、仓库、所有者和管理员列表；多个管理员用逗号分隔。
- Waline 至少需要 `serverURL`。主题加载 Waline Client 3.15.2，并传入表情、语言、用户信息字段、登录方式、分页等客户端选项。
- Twikoo 需要 `envID`，并支持 `region`、`path`、`lang`。

只有当前页面设置了 `comments: true` 且至少启用一个评论适配器时，TOC 底部快捷入口才会指向评论区；否则会指向页脚。

## Note 标签

```markdown
{% note tip %}
提示内容，支持 **Markdown**。
{% endnote %}

{% note warning 注意 %}
自定义标题。
{% endnote %}

{% note danger no-icon %}
不显示图标。
{% endnote %}
```

支持的类型包括：`note`、`info`、`tip`、`success`、`warning`、`danger`、`quote`。

## Tabs 标签

创建选项卡内容块：

```markdown
{% tabs Tab1 @code Tab2 @image Tab3 @gear default:1 %}
Tab 1 的内容。
<!-- tabs -->
Tab 2 的内容。
<!-- tabs -->
Tab 3 的内容。
{% endtabs %}
```

- 标签名和可选 `@图标名`（Font Awesome）用空格分隔。
- 添加 `default:N` 指定默认激活的选项卡（从 0 开始）。
- 省略标签名则只显示图标：`{% tabs @house @gear %}`。
- 内容块用 `<!-- tabs -->` 分隔。

## Video 标签

嵌入外部视频：

```markdown
{% video https://www.youtube.com/watch?v=VIDEO_ID %}
{% video https://www.bilibili.com/video/BVxxxxxxxx %}
{% video https://player.youku.com/embed/VIDEO_ID %}
```

自动识别 YouTube、Bilibili、Youku，其他 URL 直接以 iframe 嵌入。

## 目录结构

```text
hexo-theme-particlexf/
├── _config.yml
├── layout/
├── scripts/
├── source/
│   ├── css/main.css
│   └── js/
└── package.json
```

## 开发

在博客站点目录中执行：

```bash
hexo clean && hexo server
```

修改主题文件后刷新页面即可；修改配置后建议先清理缓存再重新生成。

## 许可证

MIT。