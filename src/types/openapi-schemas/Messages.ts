import { z } from 'zod'
import { AttachmentSchema } from './attachments'

const DeliveringSchema = z.object({
  userId: z.string(),
  dlvrd: z.number().optional(),
  read: z.number().optional(),
})

export const DialogMessageSchema = z.object(
  {
    messageId: z.number(),
    message: z.string().optional(),
    sender: z.string(),
    attachments: z.array(AttachmentSchema).optional(),
    read: z.number().optional(),
    dlvrd: z.number().optional(),
    createdAt: z.number(),
    updatedAt: z.number().optional(),
    deletedAt: z.number().optional(),
  },
  { description: 'DialogMessageSchema' },
)

export const GroupChatMessageSchema = z.object(
  {
    messageId: z.number(),
    message: z.string().optional(),
    sender: z.string(),
    attachments: z.array(AttachmentSchema).optional(),
    delivering: z.array(DeliveringSchema).optional(),
    createdAt: z.number(),
    updatedAt: z.number().optional(),
    deletedAt: z.number().optional(),
  },
  { description: 'GroupChatMessageSchema' },
)

export const ChatMessageSchema = z.union([
  z.array(DialogMessageSchema),
  z.array(GroupChatMessageSchema),
])
