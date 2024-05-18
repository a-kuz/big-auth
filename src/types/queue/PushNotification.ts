import { NewMessageEvent } from '../ws/server-events'

export interface PushNotification {
  event: NewMessageEvent
  title: string
  body: string
  deviceToken: string
}
