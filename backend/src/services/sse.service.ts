import type { Response } from 'express';

interface SSEClient {
  id: string;
  res: Response;
}

class SSEService {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // Send initial ping
    res.write('event: connected\ndata: {"status":"ok"}\n\n');
    this.clients.set(id, { id, res });
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: string, data: object): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients.values()) {
      try { client.res.write(payload); } catch { this.clients.delete(client.id); }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const sseService = new SSEService();