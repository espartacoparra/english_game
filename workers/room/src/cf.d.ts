/**
 * Minimal Cloudflare Workers declarations for the room Worker.
 *
 * They cover only what this Worker uses, so the project does not need
 * `@cloudflare/workers-types` just to typecheck a single Durable Object.
 */

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface WebSocket {
  accept(): void
  send(message: string | ArrayBuffer): void
  close(code?: number, reason?: string): void
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

interface DurableObjectId {
  toString(): string
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}

/** The shape Cloudflare expects from a Durable Object class. */
interface DurableObject {
  fetch(request: Request): Promise<Response>
  webSocketMessage?(ws: WebSocket, message: string | ArrayBuffer): void | Promise<void>
  webSocketClose?(ws: WebSocket, code: number, reason: string): void | Promise<void>
  webSocketError?(ws: WebSocket, error: unknown): void | Promise<void>
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

interface DurableObjectState {
  storage: DurableObjectStorage
  acceptWebSocket(ws: WebSocket): void
  getWebSockets(): WebSocket[]
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>
}
