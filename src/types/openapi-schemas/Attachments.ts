import { z } from 'zod'

const FileMetaSchema = z.object({
  extension: z.string(),
  size: z.number(),
})

const ImageMetaSchema = z.object({
  mimetype: z.string(),
  width: z.number(),
  height: z.number(),
  size: z.number(),
})

const VideoMetaSchema = z.object({
  mimetype: z.string(),
  width: z.number(),
  height: z.number(),
  size: z.number(),
  duration: z.number(),
})

// Use a union for the meta, since it can be one of several types
export const AttachmentMetaSchema = z.union([FileMetaSchema, ImageMetaSchema, VideoMetaSchema])

export const AttachmentSchema = z
  .object({
    type: z.enum(['file', 'image', 'video']),
    id: z.string(),
    filename: z.string(),
    url: z.string().url(),
    meta: AttachmentMetaSchema,
  })
  .optional()
