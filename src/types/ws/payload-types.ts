import { NewMessageResponse, EditMessageResponse, DeleteMessageResponse } from '.'
import {
  NewMessageRequest,
  EditMessageRequest,
  DeleteMessageRequest,
  MarkDeliveredRequest,
  MarkReadRequest,
} from './client-requests'
import {
  NewMessageEvent,
  EditMessageEvent,
  DeleteMessageEvent,
  OnlineEvent,
  OfflineEvent,
  TypingEvent,
  MarkDeliveredEvent,
  MarkReadEvent,
} from './server-events'

export type ClientRequestPayload =
  | NewMessageRequest
  | EditMessageRequest
  | DeleteMessageRequest
  | MarkDeliveredRequest
  | MarkReadRequest
export type ServerResponsePayload = NewMessageResponse | EditMessageResponse | DeleteMessageResponse
export type ServerEventPayload =
  | NewMessageEvent
  | EditMessageEvent
  | DeleteMessageEvent
  | OnlineEvent
  | OfflineEvent
  | TypingEvent
  | MarkDeliveredEvent
  | MarkReadEvent
