// engine.js — Core pronunciation engine for HowDoISay
var Engine = {

  // ── Tone Detection ──────────────────────────────────────────

  detectViTone(text) {
    for (const ch of text) {
      if (/[ạặậẹịọộụựỵ]/.test(ch)) return 'heavy';
      if (/[ãẵẫẽĩõỗũữỹ]/.test(ch)) return 'broken';
      if (/[ảẳẩẻỉỏổủửỷ]/.test(ch)) return 'dipping';
      if (/[áắấéíóốúứý]/.test(ch)) return 'rising';
      if (/[àằầèìòồùừỳ]/.test(ch)) return 'falling';
    }
    return 'flat';
  },

  detectZhTone(text) {
    for (const ch of text) {
      if (/[āēīōūǖ]/.test(ch)) return 'flat';
      if (/[áéíóúǘ]/.test(ch)) return 'rising';
      if (/[ǎěǐǒǔǚ]/.test(ch)) return 'dipping';
      if (/[àèìòùǜ]/.test(ch)) return 'falling';
    }
    return 'neutral';
  },

  // ── Tone Metadata ───────────────────────────────────────────

  toneColor(tone) {
    return {
      flat:'#16a34a', rising:'#2563eb', falling:'#dc2626',
      dipping:'#ea580c', heavy:'#7f1d1d', broken:'#7c3aed', neutral:'#6b7280'
    }[tone] || '#333';
  },

  toneLabel(tone) {
    return {
      flat:'→ Flat', rising:'↗ Rising', falling:'↘ Falling',
      dipping:'↘↗ Dip-rise', heavy:'↓ Heavy drop', broken:'↗↘↗ Broken rise', neutral:'— Light'
    }[tone] || tone;
  },

  toneEmoji(tone) {
    return {
      flat:'➡️', rising:'⬆️', falling:'⬇️',
      dipping:'↩️', heavy:'⏬', broken:'🔀', neutral:'⚪'
    }[tone] || '';
  },

  // ── Staircase Curve ─────────────────────────────────────────
  // Returns array of Y-offsets (px). 0 = highest pitch.

  getToneCurve(len, tone) {
    if (len < 1) return [];
    const n = len;
    const step = 4; // px per step
    const curves = {
      flat:    () => Array(n).fill(0),
      rising:  () => Array.from({length:n}, (_,i) => (n-1-i) * step),
      falling: () => Array.from({length:n}, (_,i) => i * step),
      dipping: () => {
        const mid = Math.floor(n/2);
        return Array.from({length:n}, (_,i) => {
          if (i <= mid) return i * step;
          return (n-1-i) * step;
        });
      },
      heavy:   () => Array.from({length:n}, (_,i) => i * step),
      broken:  () => {
        const t = Math.floor(n/3) || 1;
        return Array.from({length:n}, (_,i) => {
          if (i < t) return (t-i) * step;
          if (i < t*2) return (i-t) * step;
          return (n-1-i) * step;
        });
      },
      neutral: () => Array(n).fill(0)
    };
    return (curves[tone] || curves.flat)();
  },

  // ── Rendering ───────────────────────────────────────────────

  renderSyllableHTML(syl, tone) {
    const word = syl.m;
    const color = this.toneColor(tone);
    const curve = this.getToneCurve(word.length, tone);
    const label = this.toneLabel(tone);

    let letters = '';
    for (let i = 0; i < word.length; i++) {
      const ch = word[i] === ' ' ? '&nbsp;' : word[i];
      letters += `<span class="stair-ch" style="transform:translateY(${curve[i]}px)">${ch}</span>`;
    }

    return `
      <div class="syl-block">
        <div class="staircase" style="color:${color}">${letters}</div>
        <div class="syl-hint">${syl.h}</div>
        <div class="syl-tone" style="color:${color}">${label}</div>
        <div class="syl-target">${syl.t}</div>
      </div>`;
  },

  renderResult(entry, lang) {
    const detect = lang === 'vi' ? this.detectViTone.bind(this) : this.detectZhTone.bind(this);

    // Quick mnemonic line (top)
    const quick = entry.s.map(s => s.m).join(' · ');
    let html = `<div class="res-quick">Say: <strong>${quick}</strong></div>`;

    // Staircase blocks
    html += `<div class="staircase-row">`;
    for (const syl of entry.s) {
      const tone = detect(syl.t);
      html += this.renderSyllableHTML(syl, tone);
    }
    html += `</div>`;

    return html;
  },

  // ── Dictionary Lookup ───────────────────────────────────────

  _dict(lang) {
    return lang === 'vi' ? (window.DICT_VI || {}) : (window.DICT_ZH || {});
  },

  lookup(phrase, lang) {
    const dict = this._dict(lang);
    const key = phrase.toLowerCase().trim().replace(/[?.!,'"]/g, '');
    if (dict[key]) return dict[key];

    // Try with/without "please", "the", "a"
    const stripped = key.replace(/\b(please|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
    if (dict[stripped]) return dict[stripped];

    return null;
  },

  fuzzyMatch(phrase, lang) {
    const dict = this._dict(lang);
    const key = phrase.toLowerCase().trim();
    const keys = Object.keys(dict);
    let best = null, bestScore = 0;

    const inputWords = key.split(/\s+/);

    for (const k of keys) {
      // Substring containment
      if (k.includes(key) || key.includes(k)) {
        const score = Math.min(k.length, key.length) / Math.max(k.length, key.length);
        if (score > bestScore) { bestScore = score; best = {key:k, entry:dict[k]}; }
      }
      // Word overlap
      const entryWords = k.split(/\s+/);
      const common = inputWords.filter(w => entryWords.includes(w)).length;
      if (common > 0) {
        const score = common / Math.max(inputWords.length, entryWords.length);
        if (score > bestScore) { bestScore = score; best = {key:k, entry:dict[k]}; }
      }
    }

    return bestScore > 0.3 ? best : null;
  },

  // Get all keys for suggestion filtering
  allKeys(lang) { return Object.keys(this._dict(lang)); },

  // ── OpenRouter API Fallback ─────────────────────────────────

  async apiTranslate(phrase, lang, apiKey, modelId) {
    const langName = lang === 'vi' ? 'Vietnamese' : 'Chinese Mandarin';

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://howdoisay.app'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{
          role: 'system',
          content: `You translate English to ${langName} and provide dead-simple pronunciation help using English words or syllables — NOT IPA. Return ONLY valid JSON (no markdown fences).
Format: {"t":"${lang === 'zh' ? 'Chinese characters' : 'Vietnamese text with diacritics'}"${lang === 'zh' ? ',"p":"pinyin with tone marks"' : ''},"s":[{"t":"syllable with tone marks","m":"SIMPLE English mnemonic","h":"like [English word]"}]}
Examples of good mnemonics:
- nǐ → m:"Knee", h:"like knee"
- hǎo → m:"How", h:"like how"
- xin → m:"Sin", h:"like sin"
- chào → m:"Chow", h:"like chow mein"
Keep mnemonics to real English words or obvious parts of words. One entry per syllable.`
        }, {
          role: 'user',
          content: `Translate: "${phrase}"`
        }],
        temperature: 0.2,
        max_tokens: 600
      })
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse API response');
    return JSON.parse(jsonMatch[0]);
  },

  // ── Main Entry Point ────────────────────────────────────────

  async process(phrase, lang, apiKey, modelId) {
    if (!phrase.trim()) return null;

    // 1. Exact lookup
    const exact = this.lookup(phrase, lang);
    if (exact) return { entry: exact, source: 'local' };

    // 2. Fuzzy match
    const fuzzy = this.fuzzyMatch(phrase, lang);
    if (fuzzy) return { entry: fuzzy.entry, source: 'local', matchedKey: fuzzy.key };

    // 3. API fallback
    if (apiKey && modelId) {
      const entry = await this.apiTranslate(phrase, lang, apiKey, modelId);
      return { entry, source: 'api' };
    }

    return null;
  }
};
