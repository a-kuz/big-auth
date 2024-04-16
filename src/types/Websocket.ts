export interface WebsocketClientRequest<Event = ClientEventType> {
  type: 'request'
  timestamp: number
  id: string
  payloadType: Event
  payload: ClientReqestPayload
}

export interface WebsocketServerAccept {
  type: 'accept'
  timestamp: number
  id: string
  payload: ServerResponsePayload
}

export interface WebsocketServerEvent<Event = ServerEventType> {
  type: 'event'
  timestamp: number
  id: number
  eventType: Event
  payload: ServerEventPayload
}

export type NewMessage = 'newMessage'
export type EditMessage = 'edit'
export type ReadMessage = 'read'
export type Online = 'online'
export type Offline = 'offline'
export type TypingOn = 'typing'

export interface EditMessageEvent {
  chatId: string
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

export interface NewMessageRequest {
  chatId: string
  message: string
  attachments?: Attachment[]
}

export interface EditMessageRequest {
  chatId: string
  messageId: number
  message: string
}

export interface DeleteMessageRequest {
  chatId: string
  messageId: number
}

export interface NewMessageResponse {
  messageId: number
}

export interface EditMessageResponse {}

export interface DeleteMessageResponse {}

export type ClientReqestPayload = NewMessageRequest | EditMessageRequest | DeleteMessageRequest
export type ServerResponsePayload = NewMessageResponse | EditMessageResponse | DeleteMessageResponse
export type ServerEventPayload =
  | NewMessageEvent
  | EditMessageEvent
  | DeleteMessageEvent
  | OnlineEvent
  | OfflineEvent
  | TypingEvent

export type ClientEventType = NewMessage | EditMessage | ReadMessage
export type ServerEventType = NewMessage | EditMessage | ReadMessage

export type FileAttachmentPayload = {
  extension:
    | 'pdf'
    | 'txt'
    | 'docx'
    | 'xlsx'
    | 'pptx'
    | 'zip'
    | 'rar'
    | '7z'
    | 'jpg'
    | 'png'
    | 'gif'
    | 'mp4'
    | 'mp3'
    | 'wav'
    | 'tar'
    | 'gz'
    | 'exe'
		| 
}
export type AttachmentType = 'file' | 'image' | 'video'

export type ImageAttachmentPayload = {
  mimetype: `image/${'jpeg' | 'png' | 'gif' | 'webp'}`
  width: number
  height: number
}

export type VideoAttachmentPayload = {
  mimetype: `video/${'mp4' | 'gif' | 'webm' | 'ogg'}`
  width: number
  height: number
  duration: number
}
export interface NewMessageEvent<A extends AttachmentType | never = never> {
  chatId: string
  senderId: string
  userId: string
  messageId: number
  message: string
  attachments?: Attachment<A>[]
}
export interface Attachment<T extends AttachmentType> {
  type: T extends 'video' ? 'video' : T extends 'image' ? 'image' : 'file'
  id: string
  filename: string
  url: string
  size: number
  payload: FileAttachmentPayload | ImageAttachmentPayload | VideoAttachmentPayload
}
