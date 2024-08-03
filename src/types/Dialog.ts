import { Attachment } from "./Attachment";

export type GroupChat = {
  id: string;
  name: string;
  imgUrl: string;
  participants: string[];
  createdAt: number;
};

// Define types for the 'type' field which can only be one of these specific strings
type ChatType = "dialog" | "group" | "channel";

// Define interfaces for Meta, DialogMeta, and GroupMeta
interface DialogMeta {
  firstName?: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
}

interface EditMessageRequest {
  chatId: string;
  originalMessageId: number;
  clientMessageId: string;
  message: string;
  attachments?: Attachment[];
}

interface EditMessageResponse {
  messageId: number;
  timestamp: number;
}

interface GroupMeta {
  name: string;
  owner: string;
  participants: string[];
  createdAt: number;
}

// Meta can be either DialogMeta or GroupMeta
type Meta = DialogMeta | GroupMeta;

// Define the main Chat interface
interface Chat {
  chatId: string;
  photoUrl: string;
  type: ChatType;
  lastMessageId?: number;
  meta: Meta;
}
