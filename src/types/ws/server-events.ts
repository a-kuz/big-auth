import { ServerEventType } from '.';
import { AttachmentType, Attachment } from './attachments'
import { ServerEventPayload } from './payload-types';


export interface WebsocketServerEvent<Event extends ServerEventType> {
	type: 'event';
	timestamp: number;
	id: number;
	eventType: Event;
	payload: ServerEventPayload;
}

export interface EditMessageEvent {
  chatId: string
  userId?: string
  messageId: number
  message: string
}

export interface DeleteMessageEvent {
  chatId: string
  messageId: number
}

export interface OnlineEvent {
  userId: string
}

export interface OfflineEvent {
  userId: string
}

export interface TypingEvent {
  userId: string
  chatId: string
}

export interface NewMessageEvent<A extends AttachmentType | never = never> {
  chatId: string
  userId?: string
  messageId: number
  message: string
  timestamp: string
  attachments?: Attachment<A>[]
}
