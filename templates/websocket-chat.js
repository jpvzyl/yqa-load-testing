// WebSocket Chat Test — connect, send messages, receive responses, measure latency.
// Simulates a real-time chat client maintaining a persistent connection.
//
// Usage: k6 run websocket-chat.js
//        k6 run -e WS_URL=ws://api.example.com/ws websocket-chat.js

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000/ws';

const errorRate = new Rate('ws_errors');
const messageLatency = new Trend('ws_message_latency', true);
const connectDuration = new Trend('ws_connect_duration', true);
const messagesReceived = new Counter('ws_messages_received');
const messagesSent = new Counter('ws_messages_sent');

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    ws_errors: ['rate<0.05'],
    ws_message_latency: ['p(95)<500'],
    ws_connect_duration: ['p(95)<1000'],
  },
};

export default function () {
  const connectStart = Date.now();

  const res = ws.connect(WS_URL, {}, function (socket) {
    const connectElapsed = Date.now() - connectStart;
    connectDuration.add(connectElapsed);

    socket.on('open', () => {
      const joinMsg = JSON.stringify({
        type: 'join',
        room: 'load-test',
        user: `vu-${__VU}`,
      });
      socket.send(joinMsg);
      messagesSent.add(1);

      // Send messages on an interval
      for (let i = 0; i < 5; i++) {
        socket.setTimeout(() => {
          const sendTime = Date.now();
          const msg = JSON.stringify({
            type: 'message',
            room: 'load-test',
            user: `vu-${__VU}`,
            text: `Message ${i + 1} from VU ${__VU} at ${sendTime}`,
            timestamp: sendTime,
          });
          socket.send(msg);
          messagesSent.add(1);
        }, (i + 1) * 2000);
      }

      // Close after all messages are sent
      socket.setTimeout(() => {
        const leaveMsg = JSON.stringify({ type: 'leave', room: 'load-test', user: `vu-${__VU}` });
        socket.send(leaveMsg);
        messagesSent.add(1);
        socket.close();
      }, 12000);
    });

    socket.on('message', (data) => {
      messagesReceived.add(1);

      try {
        const msg = JSON.parse(data);
        if (msg.timestamp) {
          const latency = Date.now() - msg.timestamp;
          messageLatency.add(latency);
        }
      } catch (_) {
        // non-JSON response — still counts as received
      }
    });

    socket.on('error', (e) => {
      errorRate.add(true);
      console.error(`WS error on VU ${__VU}: ${e.error()}`);
    });

    socket.on('close', () => {
      // connection closed
    });
  });

  const connected = check(res, {
    'ws: connected successfully': (r) => r && r.status === 101,
  });

  errorRate.add(!connected);

  sleep(Math.random() * 2 + 1);
}
