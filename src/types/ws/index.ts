import {
	dlt,
	edit,
	dlvrd,
	read,
	nw,
	offline,
	online,
	typing,
	getChat,
	getChats,
	getMessages
} from './event-literals'

export type ClientRequestType = nw | edit | read | dlvrd | dlt | getChat | getChats | getMessages
export type ClientEventType = typing | offline
export type ServerEventType =
  | nw
  | edit
  | read
  | dlvrd
  | typing
  | online
  | offline


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
