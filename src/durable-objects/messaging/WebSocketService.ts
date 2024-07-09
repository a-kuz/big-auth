import { Env } from '~/types/Env'
import { ClientRequestType, ServerEventType } from '~/types/ws'
import { ClientAccept, ClientEvent, ClientRequest } from '~/types/ws/client-requests'
import { ClientRequestPayload, ServerEventPayload } from '~/types/ws/payload-types'
import { ServerEvent } from '~/types/ws/server-events'
import { WebsocketServerResponse } from '~/types/ws/websocket-server-response'
import { writeErrorLog } from '~/utils/serialize-error'
import { UserMessagingDO } from './MessagingDO'
import { OnlineStatusService } from './OnlineStatusService'
import { nanoid } from 'nanoid'
import { timeStamp } from 'console'
import { newId } from '~/utils/new-id'
const SEVEN_DAYS = 604800000
const PING = String.fromCharCode(0x9)

export class WebSocketGod {
  onlineService!: OnlineStatusService // dp)

  #eventBuffer = new Map<string, ServerEvent>()
  #lastCheck: number = 0
  #lastPing: number = 0
  #clientRequestsIds: string[] = []
  #timestamp: number = 0
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.state.storage.setAlarm(Date.now() + 5000, {
      allowConcurrency: true,
      allowUnconfirmed: true,
    })
  }

  async alarm(): Promise<void> {
    if (this.#lastCheck + 5000 < Date.now()) {
      await this.checkStatus()
    }
    await this.onlineService.alarm()
    const sockets = this.state.getWebSockets()
    if (sockets.length) {
      this.sendBuffer()
      const alarm = await this.state.storage.getAlarm()
      if (!alarm)
        await this.state.storage.setAlarm(Date.now() + 5000, {
          allowConcurrency: true,
          allowUnconfirmed: true,
        })
    }
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
    this.clearBuffer()

    await this.state.storage.setAlarm(Date.now() + 1)
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
            timestamp: this.timestamp(),
            ...(responsePayload ? { payload: responsePayload } : {}),
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response))
          }
        case 'ack':
          try {
            this.#eventBuffer.delete(packet.id)
          } catch (e) {
            await writeErrorLog(e)
          }
      }
    } catch (e) {
      await writeErrorLog(e)
      try {
        ws.send(
          JSON.stringify({ error: { incomingMessage: message, exception: (e as Error).message } }),
        )
      } catch (e) {
        await writeErrorLog(e)
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

    await this.onlineService.offline()
  }

  async handleError(ws: WebSocket, error: unknown): Promise<void> {
    await writeErrorLog(error)

    try {
      ws.close(2004, 'handled error')
    } catch (e) {
      await writeErrorLog(e)
      return
    }
  }

  private refreshPing() {
    this.#lastPing = Date.now()
  }

  clearBuffer() {
    this.#eventBuffer.clear()
  }

  private timestamp() {
    const current = performance.now()
    return (this.#timestamp = current > this.#timestamp ? current : ++this.#timestamp)
  }

  async toBuffer(eventType: ServerEventType, event: ServerEventPayload, after = 100) {
    const id = newId(10)
    const packet: ServerEvent = {
      eventType,
      payload: event,
      timestamp: this.timestamp(),
      type: 'event',
      id,
    }
    this.#eventBuffer.set(id, packet)
    const alarm = await this.state.storage.getAlarm()
    if (!alarm || alarm > Date.now() + after)
      await this.state.storage.setAlarm(Date.now() + after, {
        allowConcurrency: true,
        allowUnconfirmed: true,
      })
  }
  private sendPacket(packet: ServerEvent) {
    const sockets = this.state.getWebSockets()
    for (const ws of sockets.filter(ws => ws.readyState === WebSocket.OPEN)) {
      ws.send(JSON.stringify(packet))
    }
  }

  private sendBuffer() {
    for (const event of this.#eventBuffer.values()) {
      this.sendPacket(event)
    }
  }

  private async checkStatus(): Promise<void> {
    this.#lastCheck = Date.now()
    const sockets = this.state.getWebSockets()
    if (sockets.length > 1) {
      console.log('sockets.length = ' + sockets.length.toString())
    }
    if (this.#lastPing) {
      if (Date.now() - this.#lastPing > 7000) {
        for (const socket of sockets) {
          try {
            if (socket.readyState !== WebSocket.CLOSING) {
              socket.close(1011, `last ping: ${this.#lastPing}, now: ${Date.now()}`)
              this.#lastPing = 0
            }
            return
          } catch (e) {
            await writeErrorLog(e)
          }
        }
      }
    }
  }
}
