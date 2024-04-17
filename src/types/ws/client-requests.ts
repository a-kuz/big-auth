import { ClientEventType } from ".";
import { DeleteMessage, EditMessage, MarkDelivered, MarkRead, NewMessage } from "./event-literals";

import { Attachment } from './attachments';


export interface WebsocketClientRequest<Event extends ClientEventType> {
	type: 'request';
	timestamp: number;
	id: string;
	payloadType: Event;
	payload: Event extends NewMessage ? NewMessageRequest
				 : Event extends EditMessage ? EditMessageRequest
				 : Event extends DeleteMessage ? DeleteMessageRequest
				 : Event extends MarkDelivered ? MarkDeliveredRequest
				 : Event extends MarkRead ? MarkReadRequest
				 : never;
}

export interface NewMessageRequest {
	chatId: string;
	message: string;
	attachments?: Attachment[];
}

export interface TypingRequest {
	chatId: string;
}

export interface EditMessageRequest {
	chatId: string;
	messageId: number;
	message: string;
	attachments?: Attachment[];
}

export interface DeleteMessageRequest {
	chatId: string;
	messageId: number;
}

export interface MarkReadRequest {
	chatId: string;
	messageId: number;
}

export interface MarkDeliveredRequest {
	chatId: string;
	messageId: number;
}
