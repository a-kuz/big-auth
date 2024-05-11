import { z } from 'zod'
export const ChatTypeSchema = z.enum(['dialog', 'group', 'channel'])
export const MessageStatusSchema = z.enum(['read', 'unread', 'undelivered', 'deleted'])
export const DialogMetaSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z.string().optional(),
  phoneNumber: z.string().optional(),
})
export const AttachmentTypeSchema = z.enum(['file', 'image', 'video'])

export const GroupMetaSchema = z.object({
  name: z.string(),
  owner: z.string(),
  participants: z.array(z.string()),
  createdAt: z.number(),
})

export const ChatSchema = z.object({
  chatId: z.string(),
  photoUrl: z.string().optional(),
  type: ChatTypeSchema,
  name: z.string(),
  lastMessageId: z.number().optional(),
  lastMessageText: z.string().optional(),
  lastMessageTime: z.number().optional(),
  lastMessageAuthor: z.string().optional(),
  lastMessageStatus: MessageStatusSchema.optional(),
  missed: z.number(),
  verified: z.boolean().optional(),
  isMine: z.boolean().optional(),
  attachmentType: AttachmentTypeSchema.optional(),
  meta: DialogMetaSchema.or(GroupMetaSchema),
})
export const GroupSchema = z.object({
  chatId: z.string(),
  photoUrl: z.string().optional(),
  type: ChatTypeSchema,
  name: z.string(),
  lastMessageId: z.number().optional(),
  lastMessageText: z.string().optional(),
  lastMessageTime: z.number().optional(),
  lastMessageAuthor: z.string().optional(),
  lastMessageStatus: MessageStatusSchema.optional(),
  missed: z.number(),
  verified: z.boolean().optional(),
  isMine: z.boolean().optional(),
  attachmentType: AttachmentTypeSchema.optional(),
  meta: GroupMetaSchema,
})
export const DialogSchema = z.object({
  chatId: z.string(),
  photoUrl: z.string().optional(),
  type: ChatTypeSchema,
  name: z.string(),
  lastMessageId: z.number().optional(),
  lastMessageText: z.string().optional(),
  lastMessageTime: z.number().optional(),
  lastMessageAuthor: z.string().optional(),
  lastMessageStatus: MessageStatusSchema.optional(),
  missed: z.number(),
  verified: z.boolean().optional(),
  isMine: z.boolean().optional(),
  attachmentType: AttachmentTypeSchema.optional(),
  meta: DialogMetaSchema,
})
