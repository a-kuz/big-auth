import { Env } from '~/types/Env'
import { ClientRequestType, ServerEventType } from '~/types/ws'
import { ClientEvent, ClientRequest } from '~/types/ws/client-requests'
import { ClientRequestPayload, ServerEventPayload } from '~/types/ws/payload-types'
import { WebsocketServerResponse } from '~/types/ws/websocket-server-response'
import { UserMessagingDO } from './MessagingDO'
import { OnlineStatusService } from './OnlineStatusService'
import { ServerEvent } from '~/types/ws/server-events'
import { errorResponse } from '~/utils/error-response'
import { serializeError } from 'serialize-error'
const SEVEN_DAYS = 604800000
const PING = String.fromCharCode(0x9)

export class WebSocketGod {
  onlineService!: OnlineStatusService // dp)

  private server: WebSocket | null = null
  private client: WebSocket | null = null

  private lastPing: number = 0

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
    this.server = server
    this.client = client
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
    console.error(JSON.stringify(message))
    if (this.ping(message)) {
      ws.send(`{"event": "pong"}`)
      return
    }

    try {
      const packet = JSON.parse(message as string) as ClientEvent | ClientRequest
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

  ping(message: string | ArrayBuffer): boolean {
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

    // try {
    //   await this.onlineService.offline()
    // } catch (e) {

    //   return
    // }
    try {
      ws.close(2004, 'handled error')
    } catch (e) {
      console.error(serializeError(e))
      return
    }
  }

  private refreshPing() {
    this.lastPing = Date.now()
  }

  async sendEvent(eventType: ServerEventType, event: ServerEventPayload, id?: number) {
    let wasSent = false
    const sockets = this.state.getWebSockets()
    for (const ws of sockets.filter(ws => ws.readyState === WebSocket.OPEN)) {
      const packet: ServerEvent = {
        eventType,
        payload: event,
        timestamp: Date.now(),
        type: 'event',
        ...(!id ? {} : { id }),
      }
      ws.send(JSON.stringify(packet))
      wasSent = true
    }

    return wasSent
  }

  async alarm(): Promise<void> {
    console.log('USER ALARM')
    const sockets = this.state.getWebSockets()
    if (sockets.length > 1) {
      console.log('sockets.length = ' + sockets.length.toString())
    }
    for (const socket of sockets) {
      console.log(
        JSON.stringify({ userId: this.onlineService.userId, readystate: socket.readyState }),
      )
      if (this.lastPing) {
        if (Date.now() - this.lastPing > 20000) {
          try {
            if (socket.readyState != WebSocket.CLOSING) {
              await socket.close(1011, `last ping: ${this.lastPing}, now: ${Date.now()}`)
              this.lastPing = 0
            }
            return
          } catch (e) {
            console.error(serializeError(e))
          }
        } else if (Date.now() - this.lastPing > 10000) {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(`{"event": "pong"}`)
          }
        }
        await this.state.storage.setAlarm(Date.now() + 5000, {
          allowConcurrency: true,
          allowUnconfirmed: true,
        })
      }
    }
  }
  #clientRequestsIds: string[] = []
}
