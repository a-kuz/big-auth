import {
  dlt,
  edit,
  dlvrd,
  read,
  nw,
  offline,
  online,
  typing,
  chat,
  messages,
  chats,
  newChat,
  newCall,
  closeCall
} from './event-literals'

export type ClientRequestType = nw | edit | read | dlvrd | dlt | chats | chat | messages 
export type ClientEventType = typing | offline
export type ServerEventType = nw | edit | read | dlvrd | typing | online | offline | chats | newChat | newCall | dlt | closeCall
