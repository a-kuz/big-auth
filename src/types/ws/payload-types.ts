import {
  NewMessageResponse,
  EditMessageResponse,
  DeleteMessageResponse,
  MarkReadResponse,
  MarkDlvrdResponse,
} from './responses'
import { ChatList } from '../ChatList'
import {
  NewMessageRequest,
  EditMessageRequest,
  DeleteMessageRequest,
  MarkDeliveredRequest,
  MarkReadRequest,
  TypingClientEvent,
} from './client-requests'
import {
  NewMessageEvent,
  EditMessageEvent,
  DeleteMessageEvent,
  OnlineEvent,
  OfflineEvent,
  TypingServerEvent,
  MarkDeliveredEvent,
  MarkReadEvent,
} from './server-events'

export type ClientRequestPayload =
  | NewMessageRequest
  | EditMessageRequest
  | DeleteMessageRequest
  | MarkDeliveredRequest
  | MarkReadRequest
export type ServerResponsePayload =
  | NewMessageResponse
  | EditMessageResponse
  | DeleteMessageResponse
  | MarkReadResponse
  | MarkDlvrdResponse
export type ServerEventPayload =
  | NewMessageEvent
  | EditMessageEvent
  | DeleteMessageEvent
  | OnlineEvent
  | OfflineEvent
  | TypingServerEvent
  | MarkDeliveredEvent
  | MarkReadEvent
  | ChatList
export type ClientEventPayload = TypingClientEvent | OfflineEvent
