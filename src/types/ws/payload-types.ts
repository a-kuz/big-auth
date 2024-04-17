import { NewMessageResponse, EditMessageResponse, DeleteMessageResponse } from ".";
import { NewMessageRequest, EditMessageRequest, DeleteMessageRequest, TypingRequest } from "./client-requests";
import { NewMessageEvent, EditMessageEvent, DeleteMessageEvent, OnlineEvent, OfflineEvent, TypingEvent } from "./server-events";


export type ClientRequestPayload = NewMessageRequest | EditMessageRequest | DeleteMessageRequest | TypingRequest;
export type ServerResponsePayload = NewMessageResponse | EditMessageResponse | DeleteMessageResponse;
export type ServerEventPayload = NewMessageEvent |
	EditMessageEvent |
	DeleteMessageEvent |
	OnlineEvent |
	OfflineEvent |
	TypingEvent;

