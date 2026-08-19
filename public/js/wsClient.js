// Client WebSocket dung chung: tu dong ket noi lai, cho phep dang ky handler theo `type` su kien.
function createWsClient() {
  const handlers = new Map();
  let socket = null;
  let reconnectDelay = 1000;

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.addEventListener('open', () => { reconnectDelay = 1000; });
    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      const list = handlers.get(msg.type) || [];
      list.forEach((fn) => fn(msg.payload, msg));
      const wildcard = handlers.get('*') || [];
      wildcard.forEach((fn) => fn(msg.payload, msg));
    });
    socket.addEventListener('close', () => {
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
    });
    socket.addEventListener('error', () => socket.close());
  }

  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
  }

  connect();
  return { on };
}
