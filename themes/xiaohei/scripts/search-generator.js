/* 生成 /search.json：格式与主题 main.js 的搜索逻辑对齐
   每条：{ title, url, date, content, tags, categories } */

const { unescapeHTML } = require('hexo-util');

hexo.extend.generator.register('xiaohei_search', function (locals) {
  const posts = locals.posts.sort('-date').toArray();
  const data = posts.map(function (p) {
    const content = unescapeHTML(String(p.content || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    return {
      title: p.title || '',
      url: '/' + p.path.replace(/index\.html$/, ''),
      date: p.date ? p.date.toISOString() : '',
      content: content,
      tags: p.tags ? p.tags.toArray().map(function (t) { return t.name; }) : [],
      categories: p.categories ? p.categories.toArray().map(function (c) { return c.name; }) : []
    };
  });
  return {
    path: 'search.json',
    data: JSON.stringify(data)
  };
});
