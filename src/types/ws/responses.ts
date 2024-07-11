// Response interfaces for WebSocket communication

export interface NewMessageResponse {
  messageId: number
  timestamp: number
  
  clientMessageId: string
}

export interface EditMessageResponse {
  messageId: number
  timestamp: number
}

export interface DeleteMessageResponse {
  messageId: number
  timestamp: number
}

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
