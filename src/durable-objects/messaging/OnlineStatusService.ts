import { Env } from '~/types/Env'
import { ClientRequestType } from '~/types/ws'
import { WebsocketClientEvent, WebsocketClientRequest } from '~/types/ws/client-requests'
import { ClientRequestPayload } from '~/types/ws/payload-types'
import { WebsocketServerResponse } from '~/types/ws/websocket-server-accept'
import { UserMessagingDO } from './UserMessagingDO'
import { ChatList } from '~/types/ChatList'
import { WebSocketGod } from './WebSocketService'

export class OnlineStatusService {
	constructor(
		private state: DurableObjectState,
    private env: Env,
		private ws: WebSocketGod

  ) {}

	isOnline() {
		return this.#isOnline
	}

  async online() {
		const chatList = await this.state.storage.get<ChatList>('chatList')

    if (!chatList) {
			return
    }

    for (const chat of chatList) {
			if (chat.type !== 'dialog') {
				continue
      }

      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      const chatStatus = await (
				await receiverDO.fetch(
					new Request(`${this.env.ORIGIN}/${chat.id}/online`, {
						method: 'POST',
            body: JSON.stringify({ type: 'online', userId: this.#userId }),
          }),
        )
      ).text()

      if (chatStatus === 'online') {
				for (const ws of this.state.getWebSockets())
					ws.send(JSON.stringify({ type: 'online', userId: chat.id }))

      }
    }
		this.#isOnline = true;
  }

  async offline() {
		this.#isOnline = false;
		const chatList = await this.state.storage.get<ChatList>('chatList')
    for (const chat of chatList!) {
			if (chat.type !== 'dialog') {
				continue
      }
      const receiverDOId = this.env.USER_MESSAGING_DO.idFromName(chat.id)
      const receiverDO = this.env.USER_MESSAGING_DO.get(receiverDOId)

      await receiverDO.fetch(
				new Request(`${this.env.ORIGIN}/${chat.id}/offline`, {
					method: 'POST',
          body: JSON.stringify({ type: 'offline', userId: this.#userId }),
        }),
      )
    }
  }

	setUserId(id: string) {
		this.#userId = id;
	}
	#userId = ''
	#isOnline = false
}
