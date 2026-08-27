hexo.extend.helper.register('custom_theme_colors', function () {
  const cfg = this.theme && this.theme.theme && this.theme.theme.custom_theme_color;
  if (!cfg || !cfg.enable) return '';

  const darkAccent = cfg.dark_accent || '#3d7a5c';
  const lightAccent = cfg.light_accent || '#7eb89a';

  function hexToRgb(hex) {
    const v = parseInt(hex.replace('#', ''), 16);
    return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
  }

  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function fromHsl(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  }

  function lighten(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }

  function darken(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  }

  function desaturate(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const gray = r * 0.299 + g * 0.587 + b * 0.114;
    return rgbToHex(r + (gray - r) * amount, g + (gray - g) * amount, b + (gray - b) * amount);
  }

  function mix(hex1, hex2, t) {
    const a = hexToRgb(hex1), b = hexToRgb(hex2);
    return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }

  function shiftHsl(hex, targetHex, strength) {
    const src = hsl(hexToRgb(hex).r, hexToRgb(hex).g, hexToRgb(hex).b);
    const tgt = hsl(hexToRgb(targetHex).r, hexToRgb(targetHex).g, hexToRgb(targetHex).b);
    const dh = tgt.h - src.h;
    let h = src.h + dh * strength;
    if (h < 0) h += 360;
    if (h >= 360) h -= 360;
    const c = fromHsl(h, src.s, src.l);
    return rgbToHex(Math.round(c.r), Math.round(c.g), Math.round(c.b));
  }

  const da = hexToRgb(darkAccent);
  const la = hexToRgb(lightAccent);

  const darkHsl = hsl(da.r, da.g, da.b);
  const lightHsl = hsl(la.r, la.g, la.b);

  const darkHover = lighten(darkAccent, 0.3);
  const darkMuted = desaturate(darken(darkAccent, 0.25), 0.2);
  const lightHover = darken(lightAccent, 0.2);
  const lightMuted = desaturate(lighten(lightAccent, 0.5), 0.25);

  const allowOverride = cfg.overrides || {};

  function override(key, value) {
    return allowOverride[key] || value;
  }

  function rgbaColor(hex) {
    const c = hexToRgb(hex);
    return `${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}`;
  }

  function genBaseFromAccent(accentHex, isDark) {
    const c = hsl(hexToRgb(accentHex).r, hexToRgb(accentHex).g, hexToRgb(accentHex).b);
    const h = c.h;
    if (isDark) {
      return {
        page:       fromHsl(h, 4, 10),
        surface:    fromHsl(h, 5, 14),
        surfaceEl:  fromHsl(h, 5, 17),
        code:       fromHsl(h, 4, 11),
        inlineCode: fromHsl(h, 5, 15),
        textPri:    fromHsl(h, 6, 79),
        textSec:    fromHsl(h, 4, 55),
        textHead:   fromHsl(h, 5, 84),
        border:     fromHsl(h, 4, 24),
      };
    } else {
      return {
        page:       fromHsl(h, 6, 94),
        surface:    fromHsl(h, 5, 99),
        surfaceEl:  fromHsl(h, 6, 91),
        code:       fromHsl(h, 6, 90),
        inlineCode: fromHsl(h, 6, 88),
        textPri:    fromHsl(h, 8, 18),
        textSec:    fromHsl(h, 6, 37),
        textHead:   fromHsl(h, 8, 13),
        border:     fromHsl(h, 6, 81),
      };
    }
  }

  function objToRgb(obj) {
    return rgbToHex(Math.round(obj.r), Math.round(obj.g), Math.round(obj.b));
  }

  const darkBase = genBaseFromAccent(darkAccent, true);
  const lightBase = genBaseFromAccent(lightAccent, false);

  const darkRgb = rgbaColor(darkAccent);
  const lightRgb = rgbaColor(lightAccent);

  let css = '\n<style>\n:root {\n';

  css += `  --bg-page: ${override('--bg-page', objToRgb(darkBase.page))};\n`;
  css += `  --bg-surface: ${override('--bg-surface', objToRgb(darkBase.surface))};\n`;
  css += `  --bg-surface-elevated: ${override('--bg-surface-elevated', objToRgb(darkBase.surfaceEl))};\n`;
  css += `  --bg-code: ${override('--bg-code', objToRgb(darkBase.code))};\n`;
  css += `  --bg-inline-code: ${override('--bg-inline-code', objToRgb(darkBase.inlineCode))};\n`;
  css += `  --text-primary: ${override('--text-primary', objToRgb(darkBase.textPri))};\n`;
  css += `  --text-secondary: ${override('--text-secondary', objToRgb(darkBase.textSec))};\n`;
  css += `  --text-heading: ${override('--text-heading', objToRgb(darkBase.textHead))};\n`;
  css += `  --accent: ${override('--accent', darkAccent)};\n`;
  css += `  --accent-hover: ${override('--accent-hover', darkHover)};\n`;
  css += `  --accent-muted: ${override('--accent-muted', darkMuted)};\n`;
  css += `  --border: ${override('--border', objToRgb(darkBase.border))};\n`;
  css += `  --shadow: ${override('--shadow', 'rgba(0, 0, 0, 0.25)')};\n`;
  css += `  --danger: ${override('--danger', '#e06c75')};\n`;
  css += `  --success: ${override('--success', '#6bbf8a')};\n`;
  css += `  --shadow-card: 0 4px 24px var(--shadow);\n`;
  css += `  --menu-bg: rgba(${override('--menu-bg-rgb', rgbaColor(objToRgb(darkBase.surface)))}, 0.92);\n`;
  css += `  --menu-bg-scrolled: rgba(${override('--menu-bg-scrolled-rgb', rgbaColor(objToRgb(darkBase.page)))}, 0.55);\n`;
  css += `  --overlay-bg: rgba(${override('--overlay-bg-rgb', rgbaColor(objToRgb(darkBase.page)))}, 0.85);\n`;
  css += `  --home-info-bg: rgba(${override('--home-info-bg-rgb', rgbaColor(objToRgb(darkBase.page)))}, 0.72);\n`;
  css += `  --on-accent: ${override('--on-accent', '#ffffff')};\n`;

  css += `  --accent-rgb: ${override('--accent-rgb', darkRgb)};\n`;
  css += `  --accent-muted-rgb: ${override('--accent-muted-rgb', rgbaColor(darkMuted))};\n`;
  css += `  --danger-rgb: ${override('--danger-rgb', '224, 108, 117')};\n`;
  css += `  --success-rgb: ${override('--success-rgb', '107, 191, 138')};\n`;
  css += `  --shadow-rgb: ${override('--shadow-rgb', '0, 0, 0')};\n`;

  css += `  --shadow-card-hover: 0 8px 20px rgba(0, 0, 0, 0.35);\n`;

  css += `  --loop-bg-1: ${override('--loop-bg-1', desaturate(darken(darkAccent, 0.3), 0.1))};\n`;
  css += `  --loop-bg-2: ${override('--loop-bg-2', desaturate(darkAccent, 0.1))};\n`;
  css += `  --loop-bg-3: ${override('--loop-bg-3', desaturate(darken(darkAccent, 0.4), 0.15))};\n`;
  css += `  --loop-bg-4: ${override('--loop-bg-4', mix(darkAccent, '#6a8fb0', 0.35))};\n`;
  css += `}\n\n`;

  css += `[data-theme="light"] {\n`;
  css += `  --bg-page: ${override('--bg-page-light', objToRgb(lightBase.page))};\n`;
  css += `  --bg-surface: ${override('--bg-surface-light', objToRgb(lightBase.surface))};\n`;
  css += `  --bg-surface-elevated: ${override('--bg-surface-elevated-light', objToRgb(lightBase.surfaceEl))};\n`;
  css += `  --bg-code: ${override('--bg-code-light', objToRgb(lightBase.code))};\n`;
  css += `  --bg-inline-code: ${override('--bg-inline-code-light', objToRgb(lightBase.inlineCode))};\n`;
  css += `  --text-primary: ${override('--text-primary-light', objToRgb(lightBase.textPri))};\n`;
  css += `  --text-secondary: ${override('--text-secondary-light', objToRgb(lightBase.textSec))};\n`;
  css += `  --text-heading: ${override('--text-heading-light', objToRgb(lightBase.textHead))};\n`;
  css += `  --accent: ${override('--accent-light', lightAccent)};\n`;
  css += `  --accent-hover: ${override('--accent-hover-light', lightHover)};\n`;
  css += `  --accent-muted: ${override('--accent-muted-light', lightMuted)};\n`;
  css += `  --border: ${override('--border-light', objToRgb(lightBase.border))};\n`;
  css += `  --shadow: ${override('--shadow-light', 'rgba(40, 36, 28, 0.12)')};\n`;
  css += `  --danger: ${override('--danger-light', '#c94c57')};\n`;
  css += `  --success: ${override('--success-light', '#3d8f5c')};\n`;
  css += `  --shadow-card: 0 4px 24px var(--shadow);\n`;
  css += `  --menu-bg: rgba(${override('--menu-bg-light-rgb', rgbaColor(objToRgb(lightBase.surface)))}, 0.92);\n`;
  css += `  --menu-bg-scrolled: rgba(${override('--menu-bg-scrolled-light-rgb', rgbaColor(objToRgb(lightBase.page)))}, 0.7);\n`;
  css += `  --overlay-bg: rgba(${override('--overlay-bg-light-rgb', rgbaColor(objToRgb(lightBase.page)))}, 0.88);\n`;
  css += `  --home-info-bg: rgba(${override('--home-info-bg-light-rgb', rgbaColor(objToRgb(lightBase.page)))}, 0.82);\n`;
  css += `  --on-accent: ${override('--on-accent-light', '#ffffff')};\n`;

  css += `  --accent-rgb: ${override('--accent-light-rgb', rgbaColor(lightAccent))};\n`;
  css += `  --accent-muted-rgb: ${override('--accent-muted-light-rgb', rgbaColor(lightMuted))};\n`;
  css += `  --danger-rgb: ${override('--danger-light-rgb', '201, 76, 87')};\n`;
  css += `  --success-rgb: ${override('--success-light-rgb', '61, 143, 92')};\n`;
  css += `  --shadow-rgb: ${override('--shadow-light-rgb', '40, 36, 28')};\n`;

  css += `  --shadow-card-hover: 0 8px 20px rgba(0, 0, 0, 0.35);\n`;

  css += `  --loop-bg-1: ${override('--loop-bg-1-light', desaturate(darken(lightAccent, 0.15), 0.2))};\n`;
  css += `  --loop-bg-2: ${override('--loop-bg-2-light', desaturate(lighten(lightAccent, 0.25), 0.15))};\n`;
  css += `  --loop-bg-3: ${override('--loop-bg-3-light', mix(lightAccent, '#c4b8a0', 0.35))};\n`;
  css += `  --loop-bg-4: ${override('--loop-bg-4-light', mix(lightAccent, '#6a8fb0', 0.35))};\n`;
  css += `}\n</style>\n`;

  return css;
});