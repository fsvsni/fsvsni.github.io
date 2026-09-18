/* xiaohei 主题辅助函数：字数/阅读时长、摘要、分类树、相关文章 */

const { unescapeHTML } = require('hexo-util');

// HTML 转纯文本：去标签 + 解码实体（避免 &#x2F; 等实体在页面上原样显示）
hexo.extend.helper.register('plain_text', function (html) {
  return unescapeHTML(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
});

// 中文字符按字计，英文/数字按单词计
hexo.extend.helper.register('word_count', function (content) {
  const text = String(content || '').replace(/<[^>]+>/g, ' ');
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const enWords = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return cn + enWords;
});

// 阅读时长（约 400 字/分钟，与参考博客口径一致）
hexo.extend.helper.register('read_time', function (content) {
  return Math.max(1, Math.round(this.word_count(content) / 400));
});

// 卡片/文章摘要：优先 front-matter 的 description，否则取正文前 120 字
hexo.extend.helper.register('post_summary', function (post) {
  let text = '';
  if (post.description) text = String(post.description);
  if (!text && post.excerpt) text = post.excerpt;
  if (!text && post.content) text = post.content;
  return this.plain_text(text).slice(0, 120);
});

// 从全部文章构建两级分类树：[{ name, path, children: [{name, path}] }]
hexo.extend.helper.register('category_tree', function () {
  const map = new Map();
  const order = [];
  this.site.posts.each(function (post) {
    const cats = post.categories.toArray();
    if (!cats.length) return;
    const top = cats[0];
    if (!map.has(top.name)) {
      map.set(top.name, { name: top.name, path: top.path, children: new Map() });
      order.push(top.name);
    }
    if (cats[1]) {
      const sub = cats[1];
      if (!map.get(top.name).children.has(sub.name)) {
        map.get(top.name).children.set(sub.name, { name: sub.name, path: sub.path });
      }
    }
  });
  return order.map(function (name) {
    const node = map.get(name);
    return { name: node.name, path: node.path, children: Array.from(node.children.values()) };
  });
});

// 相关文章：按共同标签数量打分，取前 n 篇
hexo.extend.helper.register('related_posts', function (current, n) {
  n = n || 3;
  const tagNames = new Set(current.tags.toArray().map(function (t) { return t.name; }));
  const scored = [];
  this.site.posts.each(function (p) {
    if (p.path === current.path) return;
    let score = 0;
    p.tags.each(function (t) { if (tagNames.has(t.name)) score++; });
    if (score > 0) scored.push({ p: p, score: score, date: p.date ? p.date.valueOf() : 0 });
  });
  scored.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return b.date - a.date;
  });
  return scored.slice(0, n).map(function (x) { return x.p; });
});
