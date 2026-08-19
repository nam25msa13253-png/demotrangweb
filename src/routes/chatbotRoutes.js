const express = require('express');
const chatbotService = require('../services/chatbotService');

const router = express.Router();

// Rate limit don gian theo IP (trong bo nho) - chan lam dung spam lam ton chi phi API,
// vi day la endpoint cong khai khong yeu cau dang nhap (dung tren ca Kiosk cong khai).
// San xuat that: thay bang middleware rate-limit chuan (vd express-rate-limit + Redis).
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const requestLog = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

router.post('/ask', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'Ban dang hoi qua nhanh. Vui long thu lai sau it phut.' });
  }

  try {
    const { message, history } = req.body;
    const reply = await chatbotService.askAssistant(message, history);
    res.json({ reply });
  } catch (err) {
    if (err instanceof chatbotService.ChatbotConfigError) {
      console.error('[chatbot]', err.message);
      return res.status(503).json({ error: 'Tro ly AI chua duoc cau hinh (thieu GEMINI_API_KEY trong .env). Vui long lien he quan tri vien.' });
    }
    // Loi tu Gemini API duoc SDK @google/genai tra ve dang { name, message, status }
    // (khong co lop exception rieng cho tung loai nhu Anthropic), nen phan loai theo status.
    if (err.status === 401 || err.status === 403) {
      console.error('[chatbot] GEMINI_API_KEY khong hop le hoac khong co quyen truy cap.');
      return res.status(503).json({ error: 'Tro ly AI chua duoc cau hinh dung (API key khong hop le). Vui long lien he quan tri vien.' });
    }
    if (err.status === 429) {
      return res.status(503).json({ error: 'He thong AI dang qua tai, vui long thu lai sau.' });
    }
    if (typeof err.status === 'number' && err.status >= 500) {
      console.error('[chatbot] Gemini API error:', err.status, err.message);
      return res.status(502).json({ error: 'Tro ly AI hien khong phan hoi duoc. Vui long thu lai.' });
    }
    console.error('[chatbot] Loi khong xac dinh:', err);
    res.status(400).json({ error: err.message || 'Da xay ra loi, vui long thu lai.' });
  }
});

module.exports = router;
