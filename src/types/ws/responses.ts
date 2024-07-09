// Response interfaces for WebSocket communication

export interface NewMessageResponse {
  messageId: number
  timestamp: number
  clientMessageId: string
}

export interface EditMessageResponse {}

export interface DeleteMessageResponse {}

export interface MarkReadResponse {
  chatId: string
  messageId: number
  timestamp: number
  missed: number
  clientMessageId: string
}

export interface MarkDlvrdResponse {
  messageId: number
  timestamp: number
}
