// api/translate.js — Vercel serverless function
// Reads OPENROUTER_API_KEY and OPENROUTER_MODEL_ID from Vercel env vars

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL_ID;

  if (!apiKey || !modelId) {
    return res.status(500).json({ error: 'Server missing OPENROUTER_API_KEY or OPENROUTER_MODEL_ID env vars' });
  }

  const { phrase, lang } = req.body;
  if (!phrase || !lang) {
    return res.status(400).json({ error: 'Missing phrase or lang in request body' });
  }

  const langName = lang === 'vi' ? 'Vietnamese' : 'Chinese Mandarin';

  try {
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
Rules for mnemonics:
- Use REAL English words or obvious parts of words — the reader must already know how to say it
- Pattern A (best): m is a real word — "Knee", "How", "Boo", "Joe", "Kong"
- Pattern B: a known word with modification — "'fun' without the N", "'shed' without the D"
- Pattern C: two known things — "'gee' then 'N'", "'she' + 'way'"
- NEVER use made-up syllables like "Bahn", "Hwey", "Tahng"
- One entry per syllable.`
        }, {
          role: 'user',
          content: `Translate: "${phrase}"`
        }],
        temperature: 0.2,
        max_tokens: 600
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `OpenRouter error: ${resp.status}`, details: errText });
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
}
