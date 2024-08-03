import { z } from 'zod'
import { REGEX_URL_FILTER } from '~/constants'

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
    url: z.string().regex(REGEX_URL_FILTER, { message: 'url must be at iambig.ai' }),
    
    meta: AttachmentMetaSchema,
  })
  .optional()
