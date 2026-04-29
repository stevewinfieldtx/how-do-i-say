import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ── /api/translate endpoint ──────────────────────────────────
app.post('/api/translate', async (req, res) => {
  const apiKey = process.env.CEREBRAS_API_KEY;
  const modelId = process.env.CEREBRAS_MODEL_ID;

  if (!apiKey || !modelId) {
    return res.status(500).json({ error: 'Server missing CEREBRAS_API_KEY or CEREBRAS_MODEL_ID env vars' });
  }

  const { phrase, lang, direction } = req.body;
  if (!phrase || !lang) {
    return res.status(400).json({ error: 'Missing phrase or lang in request body' });
  }

  const langName = lang === 'vi' ? 'Vietnamese' : 'Chinese Mandarin';
  const isReverse = direction === 'reverse';

  let systemPrompt, userPrompt;

  if (isReverse) {
    const mnemonicLang = lang === 'vi'
      ? 'Vietnamese phonetic approximations'
      : 'Chinese characters that approximate the English sounds (like 三克油 for "thank you")';

    systemPrompt = `A ${langName} speaker wants to say something in English. Translate their input to English, then provide ${mnemonicLang} so they know how to PRONOUNCE the English words.
Return ONLY valid JSON (no markdown fences).
Format: {"e":"English translation","s":[{"word":"English word","m":"${lang === 'zh' ? 'Chinese characters' : 'Vietnamese'} mnemonic","h":"${lang === 'zh' ? 'pinyin' : 'pronunciation note'}"}]}
${lang === 'zh' ? 'Example: "thank you" → word:"Thank you", m:"三克油", h:"sān kè yóu"' : 'Example: "thank you" → word:"Thank you", m:"then-kiu", h:"đen-kiu"'}
Keep it natural — use ${lang === 'zh' ? 'characters' : 'Vietnamese syllables'} that a native speaker would actually recognize and use.`;
    userPrompt = phrase;
  } else {
    systemPrompt = `You translate English to ${langName} and provide dead-simple pronunciation help using English words or syllables — NOT IPA. Return ONLY valid JSON (no markdown fences).
Format: {"t":"${lang === 'zh' ? 'Chinese characters' : 'Vietnamese text with diacritics'}"${lang === 'zh' ? ',"p":"pinyin with tone marks"' : ''},"s":[{"t":"syllable with tone marks","m":"SIMPLE English mnemonic","h":"like [English word]"}]}
Rules for mnemonics:
- Use REAL English words or obvious parts of words — the reader must already know how to say it
- Pattern A (best): m is a real word — "Knee", "How", "Boo", "Joe", "Kong"
- Pattern B: a known word with modification — "'fun' without the N", "'shed' without the D"
- Pattern C: two known things — "'gee' then 'N'", "'she' + 'way'"
- NEVER use made-up syllables like "Bahn", "Hwey", "Tahng"
- One entry per syllable.`;
    userPrompt = `Translate: "${phrase}"`;
  }

  try {
    const resp = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 600
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `Cerebras error: ${resp.status}`, details: errText });
    }

    const data = await resp.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse AI response' });
    }

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`how-do-i-say running on port ${PORT}`);
});
