const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

let socket = null;
let reconnectTimer = null;
const listeners = new Map();
const subscriptions = new Set();

export function connect() {
  if (socket?.readyState === WebSocket.OPEN) return;

  try {
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log('[WS] Connected');
      for (const runId of subscriptions) {
        socket.send(JSON.stringify({ type: 'subscribe', run_id: runId }));
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        for (const [, callback] of listeners) {
          callback(data);
        }
      } catch (_e) { /* ignore */ }
    };

    socket.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...');
      reconnectTimer = setTimeout(connect, 3000);
    };

    socket.onerror = () => {
      socket?.close();
    };
  } catch (_e) {
    reconnectTimer = setTimeout(connect, 5000);
  }
}

export function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
}

export function subscribe(runId) {
  subscriptions.add(runId);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', run_id: runId }));
  }
}

export function unsubscribe(runId) {
  subscriptions.delete(runId);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'unsubscribe', run_id: runId }));
  }
}

export function addListener(id, callback) {
  listeners.set(id, callback);
}

export function removeListener(id) {
  listeners.delete(id);
}

export function isConnected() {
  return socket?.readyState === WebSocket.OPEN;
}
