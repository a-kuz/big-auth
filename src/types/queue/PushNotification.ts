import { NewMessageEvent, NewVOIPEvent } from '../ws/server-events'

export interface PushNotification {
  event: NewMessageEvent & {userId: string, confirmationUrl:string}
  title: string
  body: string
  deviceToken: string
  badge?: number
  subtitle?: string
  sound?: string
  category?: 'message'
  threadId?: string
  lastMessageId?: number
  imgUrl?: string
  
}
export interface VoipPushNotification {
  voip: boolean,
  event:  NewVOIPEvent
  title: string
  deviceToken: string

} 