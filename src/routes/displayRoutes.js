const express = require('express');
const { pool } = require('../config/db');
const configService = require('../config/configService');

const router = express.Router();

// Bang hien thi LED: STT dang goi / dang xu ly tai tung quay
router.get('/counters', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.id AS counter_id, c.code, c.name, c.status,
      t.ticket_number, t.status AS ticket_status, t.citizen_name
    FROM counters c
    LEFT JOIN tickets t ON t.id = c.active_ticket_id
    ORDER BY c.code ASC
  `);
  res.json(rows);
});

// Cau hinh Loa PA / TTS (giong doc, toc do, am luong, khoang lang)
router.get('/tts-config', async (req, res) => {
  const cfg = await configService.getAll();
  res.json({
    voice: cfg.TTS_VOICE.config_value,
    speed: Number(cfg.TTS_SPEED.config_value),
    volume: Number(cfg.TTS_VOLUME.config_value),
    audioGapSeconds: Number(cfg.AUDIO_GAP_SECONDS.config_value)
  });
});

module.exports = router;
