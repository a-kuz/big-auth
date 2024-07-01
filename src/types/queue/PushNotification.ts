import { NewMessageEvent } from '../ws/server-events'

export interface PushNotification {
  event: NewMessageEvent
  title: string
  body: string
  deviceToken: string
  badge?: number
  subtitle?: string
  sound?: string
  category?: 'message'
  threadId?: string
	lastMessageId? :number
	imgUrl?: string
}
