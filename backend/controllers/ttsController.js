const axios = require('axios');

/**
 * ElevenLabs TTS Controller
 * Supports English and Telugu via eleven_multilingual_v2 model.
 * The audio is streamed back as mp3 to the frontend.
 *
 * Voice selected: "Aria" (9BWtsMINqrJLrRacOk9x) - female, warm, multilingual.
 * eleven_multilingual_v2 natively supports Telugu (తెలుగు).
 */

const VOICE_ID = '9BWtsMINqrJLrRacOk9x'; // Aria – works great for Telugu & English
const MODEL_ID = 'eleven_multilingual_v2';

const synthesizeSpeech = async (req, res) => {
  const { text, language } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided for synthesis.' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured.' });
  }

  try {
    // ElevenLabs eleven_multilingual_v2 auto-detects script,
    // but we cap Telugu text at ~800 chars to stay within free-tier limits.
    const safeText = text.slice(0, 900);

    const elevenRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        text: safeText,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.1,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': elevenRes.data.byteLength,
      'Cache-Control': 'no-cache'
    });

    res.send(Buffer.from(elevenRes.data));
  } catch (error) {
    const msg = error.response?.data
      ? Buffer.from(error.response.data).toString('utf-8')
      : error.message;
    console.error('ElevenLabs TTS Error:', msg);
    res.status(500).json({ error: 'Speech synthesis failed. Check ElevenLabs API key and quota.' });
  }
};

module.exports = { synthesizeSpeech };
