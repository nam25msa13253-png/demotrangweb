const WebSocket = require('ws');

// WebSocket Hub dung chung 1 port voi HTTP server (theo yeu cau cau hinh WEBSOCKET_PORT tich hop).
// Broadcast cac su kien realtime toi tat ca module: Kiosk, Counter, Display/TTS, Admin.
let wss = null;

const EVENTS = {
  TICKET_CREATED: 'TICKET_CREATED',
  CALL_NEXT: 'CALL_NEXT',
  TIMEOUT_NO_SHOW: 'TIMEOUT_NO_SHOW',
  TICKET_PROCESSING: 'TICKET_PROCESSING',
  TICKET_SUPP_PENDING: 'TICKET_SUPP_PENDING',
  TICKET_COMPLETED: 'TICKET_COMPLETED',
  TICKET_CANCELLED: 'TICKET_CANCELLED',
  COUNTER_STATUS_CHANGED: 'COUNTER_STATUS_CHANGED',
  QUEUE_REBALANCED: 'QUEUE_REBALANCED',
  TICKET_REENTRY: 'TICKET_REENTRY',
  PRIORITY_INJECTED: 'PRIORITY_INJECTED',
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  EOD_PURGE: 'EOD_PURGE',
  DEVICE_HEALTH_CHANGED: 'DEVICE_HEALTH_CHANGED'
};

function init(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.send(JSON.stringify({ type: 'HELLO', payload: { message: 'Ket noi WebSocket thanh cong' } }));
  });

  // Heartbeat: don dep ket noi chet moi 30s
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  return wss;
}

function broadcast(type, payload) {
  if (!wss) return;
  const message = JSON.stringify({ type, payload, ts: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

module.exports = { init, broadcast, EVENTS };
