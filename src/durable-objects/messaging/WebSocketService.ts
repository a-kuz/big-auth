import { Env } from '~/types/Env'
import { ClientRequestType, ServerEventType } from '~/types/ws'
import { WebsocketClientEvent, WebsocketClientRequest } from '~/types/ws/client-requests'
import { ClientRequestPayload, ServerEventPayload } from '~/types/ws/payload-types'
import { WebsocketServerResponse } from '~/types/ws/websocket-server-accept'
import { UserMessagingDO } from './UserMessagingDO'
import { OnlineStatusService } from './OnlineStatusService'
import { WebsocketServerEvent } from '~/types/ws/server-events'
const SEVEN_DAYS = 604800000
const PING = String.fromCharCode(0x9)

export class WebSocketGod {
  onlineService!: OnlineStatusService // dp)

  private server: WebSocket | null = null
  private lastPing: number = 0

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.state.setHibernatableWebSocketEventTimeout(SEVEN_DAYS / 7) // :))
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
    this.server = server
    this.refreshPing()

    this.state.storage.setAlarm(Date.now() + 3000)
    return new Response(null, { status: 101, webSocket: client })
  }

  async handlePacket(
    ws: WebSocket,
    message: string | ArrayBuffer,
    doo: UserMessagingDO,
  ): Promise<void> {
    if (this.ping(message)) return

    try {
      const packet = JSON.parse(message as string) as WebsocketClientEvent | WebsocketClientRequest
      const type = packet.type
      switch (type) {
        case 'event':
          await doo.wsEvent(packet.payloadType, packet.payload)
        case 'request':
          const responsePayload = await doo.wsRequest(
            packet.payloadType as ClientRequestType,
            packet.payload as ClientRequestPayload,
          )

          const response: WebsocketServerResponse = {
            type: 'response',
            id: packet.id,
            timestamp: Math.floor(Date.now() / 1000),
            ...(responsePayload ? { payload: responsePayload } : {}),
          }
          ws.send(JSON.stringify(response))
      }
    } catch (e) {
      ws.send(
        JSON.stringify({ error: { incomingMessage: message, exception: (e as Error).message } }),
      )
      console.error(e)
    }
  }

  ping(message: string | ArrayBuffer): boolean {
    this.refreshPing()
    return (
      message === PING ||
      message instanceof ArrayBuffer ||
      // @ts-ignore
      message.maxByteLength === 1 ||
      (message.length ?? 6) <= 5
    )
  }

  async handleClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    console.log({ f: 'webSocketClose', code, reason, wasClean })

    try {
      await this.onlineService.offline()
    } catch (e) {
      console.error(e)
    }
    this.server = null
    ws.close()
  }

  async handleError(ws: WebSocket, error: unknown): Promise<void> {
    console.error(error)

    try {
      await this.onlineService.offline()
    } catch (e) {
      console.error(e)
      return
    }
    try {
      ws.close()
    } catch (e) {
      console.error(e)
      return
    }
  }

  private refreshPing() {
    this.lastPing = Date.now()
  }

  async sendEvent(eventType: ServerEventType, event: ServerEventPayload, id?: number) {
    if (this.server) {
      const packet: WebsocketServerEvent = {
        eventType,
        payload: event,
        timestamp: Math.floor(Date.now() / 1000),
        type: 'event',
        ...(!id ? {} : { id }),
      }
      this.server.send(JSON.stringify(packet))
      return true
    } else {
      console.warn('Attempted to send message on closed WebSocket')
    }
    return false
  }

  async alarm(): Promise<void> {
    if (this.server) {
      if (this.lastPing)
        if (Date.now() - this.lastPing > 20000) {
          //@ts-ignore
          try {
            this.server.close()
            this.lastPing = 0
          } catch (e) {
            console.error(e)
          }
          return
        }

      await this.state.storage.setAlarm(Date.now() + 1000, { allowConcurrency: false })
    }
  }
}
