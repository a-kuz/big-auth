import { Attachment } from "./attachments";

interface Delivering {
  userId: string;
  dlvrd?: number; // Assuming timestamp is a number
  read?: number; // Assuming timestamp is a number
}

export interface DialogMessage {
  messageId: number;
  message?: string;
  sender: string;
  attachments?: Attachment[];
  read?: number; // Assuming timestamp is a number
  dlvrd?: number; // Assuming timestamp is a number
  createdAt: number; // Assuming timestamp is a number
  updatedAt?: number; // Assuming timestamp is a number
  deletedAt?: number; // Assuming timestamp is a number
}

export interface GroupChatMessage {
  messageId: number;
  message?: string;
  sender: string;
  attachments?: Attachment[];
  delivering: Delivering[];
  createdAt: number; // Assuming timestamp is a number
  updatedAt?: number; // Assuming timestamp is a number
  deletedAt?: number; // Assuming timestamp is a number
}
export type ChatMessage = DialogMessage | GroupChatMessage;
