'use client';

export default function TestWebSocketPage() {
  return (
    <iframe 
      src="/test-websocket.html" 
      style={{ width: '100%', height: '100vh', border: 'none' }}
      title="WebSocket Test"
    />
  );
}