// Response interfaces for WebSocket communication

export interface NewMessageResponse {
  messageId: number
  timestamp: number
  clientMessageId: string
}

export interface EditMessageResponse {}

export interface DeleteMessageResponse {}

export interface MarkReadResponse {
  messageId: number;
  timestamp: number;
	missed: number
}

export interface MarkDlvrdResponse {
  messageId: number;
  timestamp: number;
}
