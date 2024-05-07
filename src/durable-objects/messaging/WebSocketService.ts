import { Env } from '~/types/Env'
import { ClientRequestType, ServerEventType } from '~/types/ws'
import { ClientEvent, ClientRequest } from '~/types/ws/client-requests'
import { ClientRequestPayload, ServerEventPayload } from '~/types/ws/payload-types'
import { WebsocketServerResponse } from '~/types/ws/websocket-server-response'
import { UserMessagingDO } from './MessagingDO'
import { OnlineStatusService } from './OnlineStatusService'
import { ServerEvent } from '~/types/ws/server-events'
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
		this.refreshPing()
    if (this.ping(message)) return


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
      (message.maxByteLength ?? 6) <= 5 ||
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

    // try {
    //   await this.onlineService.offline()
    // } catch (e) {
    //   console.error(e)
    //   return
    // }
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
      const packet: ServerEvent = {
        eventType,
        payload: event,
        timestamp: Math.floor(Date.now()),
        type: 'event',
        ...(!id ? {} : { id }),
      }
      this.server.send(JSON.stringify(packet))
      this.refreshPing()
      return true
    } else {
      console.warn('Attempted to send message on closed WebSocket')
    }
    return false
  }

  async alarm(): Promise<void> {
    if (this.server) {
      if (this.lastPing)
        if (Date.now() - this.lastPing > 200000) {
          //@ts-ignore
          try {
						if (this.server.readyState === 1)
						this.server
            this.server.close()
            this.lastPing = 0

          } catch (e) {
            console.error(e)
          }
          await this.state.storage.deleteAlarm()
          return
        }

      await this.state.storage.setAlarm(Date.now() + 5000, { allowConcurrency: false })
    }
  }
  #clientRequestsIds: string[] = []
}
