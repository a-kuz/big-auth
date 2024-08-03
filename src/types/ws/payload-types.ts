import {
  NewMessageResponse,
  EditMessageResponse,
  DeleteResponse,
  MarkReadResponse,
  MarkDlvrdResponse,
} from './responses'
import { ChatList } from '../ChatList'
import {
  NewMessageRequest,
  EditMessageRequest,
  DeleteRequest,
  MarkDeliveredRequest,
  MarkReadRequest,
  TypingClientEvent,
} from './client-requests'
import {
  NewMessageEvent,
  EditEvent,
  DeleteEvent,
  OnlineEvent,
  OfflineEvent,
  TypingServerEvent,
  MarkDeliveredEvent,
  MarkReadEvent,
} from './server-events'

export type ClientRequestPayload =
  | NewMessageRequest
  | EditMessageRequest
  | DeleteRequest
  | MarkDeliveredRequest
  | MarkReadRequest
export type ServerResponsePayload =
  | NewMessageResponse
  | EditMessageResponse
  | DeleteResponse
  | MarkReadResponse
  | MarkDlvrdResponse
  | {}
export type ServerEventPayload =
  | NewMessageEvent
  | EditEvent
  | DeleteEvent
  | OnlineEvent
  | OfflineEvent
  | TypingServerEvent
  | MarkDeliveredEvent
  | MarkReadEvent
  | ChatList
  
export type ClientEventPayload = TypingClientEvent | OfflineEvent
