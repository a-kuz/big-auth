import { Env } from '~/types/Env'
import { ClientRequestType, ServerEventType } from '~/types/ws'
import { ClientAccept, ClientEvent, ClientRequest } from '~/types/ws/client-requests'
import { ClientRequestPayload, ServerEventPayload } from '~/types/ws/payload-types'
import { WebsocketServerResponse } from '~/types/ws/websocket-server-response'
import { UserMessagingDO } from './MessagingDO'
import { OnlineStatusService } from './OnlineStatusService'
import { ServerEvent } from '~/types/ws/server-events'
import { errorResponse } from '~/utils/error-response'
import { serializeError } from 'serialize-error'
import { newId } from '~/utils/new-id'
const SEVEN_DAYS = 604800000
const PING = String.fromCharCode(0x9)

export class WebSocketGod {
  onlineService!: OnlineStatusService // dp)

  #eventBuffer: ServerEvent[] = []
  #eventCounter: number = 0
  #lastPing: number = 0
  #clientRequestsIds: string[] = []
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.state.setHibernatableWebSocketEventTimeout(SEVEN_DAYS)
  }

  async acceptWebSocket(request: Request): Promise<Response> {
    const { headers } = request
    const upgradeHeader = headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket Upgrade', { status: 426 })
    }

    const webSocketPair = new WebSocketPair()

    const [client, server] = Object.values(webSocketPair)

    this.state.acceptWebSocket(server, ['user'])

    this.refreshPing()

    await this.state.storage.setAlarm(Date.now() + 3000)
    return new Response(null, { status: 101, webSocket: client })
  }

  async handlePacket(
    ws: WebSocket,
    message: string | ArrayBuffer,
    doo: UserMessagingDO,
  ): Promise<void> {
    if (this.ping(message)) {
      ws.send(`{"event":"pong"}`)
      return
    }

    try {
      const packet = JSON.parse(message as string) as ClientEvent | ClientRequest | ClientAccept
      const type = packet.type
      switch (type) {
        case 'event':
          await doo.wsEvent(packet.payloadType, packet.payload)
        case 'request':
          if (this.#clientRequestsIds.indexOf(packet.id) !== -1) {
            ws.send(
              JSON.stringify({
                error: { id: packet.id, type: 'warning', exception: 'Duplicate request id' },
              }),
            )
            return
          }
          this.#clientRequestsIds.push(packet.id)
          const responsePayload = await doo.wsRequest(
            packet.payloadType as ClientRequestType,
            packet.payload as ClientRequestPayload,
          )

          const response: WebsocketServerResponse = {
            type: 'response',
            id: packet.id,
            timestamp: Math.floor(Date.now()),
            ...(responsePayload ? { payload: responsePayload } : {}),
          }
          ws.send(JSON.stringify(response))
        case 'ack':
          delete this.#eventBuffer[packet.id as number]
      }
    } catch (e) {
      console.error(serializeError(e))
      try {
        ws.send(
          JSON.stringify({ error: { incomingMessage: message, exception: (e as Error).message } }),
        )
      } catch (e) {
        console.error(serializeError(e))
      }
    }
  }

  private ping(message: string | ArrayBuffer): boolean {
    this.refreshPing()
    return (
      message === PING ||
      message instanceof ArrayBuffer ||
      // @ts-ignore
      (message.maxByteLength ?? message.length ?? 6) <= 5
    )
  }

  async handleClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    console.log(JSON.stringify({ f: 'webSocketClose', code, reason, wasClean }))

    if (
      this.state.getWebSockets().filter(w => w !== ws && w.readyState === WebSocket.OPEN).length ===
      0
    )
      this.state.waitUntil(this.onlineService.offline())
  }

  async handleError(ws: WebSocket, error: unknown): Promise<void> {
    console.error(serializeError(error))

    try {
      ws.close(2004, 'handled error')
    } catch (e) {
      console.error(serializeError(e))
      return
    }
  }

  private refreshPing() {
    this.#lastPing = Date.now()
  }

  private newBufferIndex() {
    return ++this.#eventCounter
  }

  async toBuffer(eventType: ServerEventType, event: ServerEventPayload) {
    const id = this.newBufferIndex()
    const packet: ServerEvent = {
      eventType,
      payload: event,
      timestamp: Date.now(),
      type: 'event',
      id,
    }
    this.#eventBuffer[id] = packet
    const alarm = await this.state.storage.getAlarm()
    if (!alarm || alarm > Date.now() + 100)
      await this.state.storage.setAlarm(Date.now() + 100, {
        allowConcurrency: true,
        allowUnconfirmed: true,
      })
  }
  sendPacket(packet: ServerEvent) {
    let wasSent = false
    const sockets = this.state.getWebSockets()
    for (const ws of sockets.filter(ws => ws.readyState === WebSocket.OPEN)) {
      ws.send(JSON.stringify(packet))
      wasSent = true
    }

    return wasSent
  }

  sendBuffer() {
    for (const event of this.#eventBuffer.filter(e => !!e)) {
      this.sendPacket(event)
    }
  }
  async alarm(): Promise<void> {
    await this.checkStatus()
    const sockets = this.state.getWebSockets()
    if (sockets.length) this.sendBuffer()

    await this.state.storage.setAlarm(Date.now() + 5000, {
      allowConcurrency: true,
      allowUnconfirmed: true,
    })
  }

  async checkStatus(): Promise<void> {
    const sockets = this.state.getWebSockets()
    if (sockets.length > 1) {
      console.log('sockets.length = ' + sockets.length.toString())
    }
    for (const socket of sockets) {
      if (this.#lastPing) {
        if (Date.now() - this.#lastPing > 20000) {
          try {
            if (socket.readyState !== WebSocket.CLOSING) {
              socket.close(1011, `last ping: ${this.#lastPing}, now: ${Date.now()}`)
              this.#lastPing = 0
            }
            return
          } catch (e) {
            console.error(serializeError(e))
          }
        } else if (Date.now() - this.#lastPing > 10000) {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(`{"event":"pong"}`)
          }
        }
      }
    }
  }
}
