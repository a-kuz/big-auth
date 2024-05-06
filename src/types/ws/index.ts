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
	messages,
	chats
} from './event-literals'

export type ClientRequestType = nw | edit | read | dlvrd | dlt | getChat | getChats | messages
export type ClientEventType = typing | offline
export type ServerEventType =
  | nw
  | edit
  | read
  | dlvrd
  | typing
  | online
  | offline
	| chats


// Response interfaces for WebSocket communication
export interface NewMessageResponse {
  messageId: number,
	timestamp: number
}

export interface EditMessageResponse {}

export interface DeleteMessageResponse {}

