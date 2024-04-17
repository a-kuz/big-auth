import {
	EditMessage,
	MarkDelivered,
	MarkRead,
	NewMessage,
	Offline,
	Online,
	Typing
} from './event-literals'

export type ClientEventType = NewMessage | EditMessage | MarkRead | MarkDelivered | Typing | Offline
export type ServerEventType =
  | NewMessage
  | EditMessage
  | MarkRead
  | MarkDelivered
  | Typing
  | Online
  | Offline

export interface NewMessageResponse {
  messageId: number
}

export interface EditMessageResponse {}

export interface DeleteMessageResponse {}

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
    | string
}
