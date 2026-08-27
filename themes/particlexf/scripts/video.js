"use strict";

/**
 * Video embed tag (ParticleXF theme).
 *
 * Usage:
 *   {% video https://www.youtube.com/watch?v=VIDEO_ID %}
 *   {% video https://www.bilibili.com/video/BVxxxxxxxx %}
 *   {% video https://player.youku.com/embed/VIDEO_ID %}
 *   {% video DIRECT_URL 16:9 %}
 *
 * Supports YouTube, Bilibili, Youku, and direct video URLs.
 * Appends "16:9" to force standard aspect ratio.
 */

hexo.extend.tag.register("video", function (args) {
  const url = args[0];
  if (!url) return "";

  let type = "iframe";
  let src = url; 
  let extra = "";

  const bilibiliMatch = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
  if (bilibiliMatch) {
    type = "bilibili";
    src = `//player.bilibili.com/player.html?bvid=${bilibiliMatch[1]}&autoplay=0`;
    extra = 'scrolling="no" border="0" frameborder="no" framespacing="0"';
  }

  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (youtubeMatch) {
    type = "youtube";
    src = `//www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  const youkuMatch = url.match(/youku\.com\/embed\/([\w]+)/i);
  if (youkuMatch) {
    type = "youku";
    src = `//player.youku.com/embed/${youkuMatch[1]}`;
  }

  const autoAspect = args.includes("16:9") ? "" : " style=\"aspect-ratio: 16 / 9;\"";

  return `<div class="video-container"${autoAspect}>
  <iframe src="${src}" ${extra} loading="lazy" allowfullscreen></iframe>
</div>`;
});