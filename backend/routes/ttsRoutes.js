const express = require('express');
const { synthesizeSpeech } = require('../controllers/ttsController');

const router = express.Router();

// POST /api/tts  → { text: string, language: 'en' | 'te' }  → returns audio/mpeg
router.post('/', synthesizeSpeech);

module.exports = router;
