const video = 'video'
const image = 'image'
const file = 'file'
const voice = 'voice'
const audio = 'audio'

// Payload types for WebSocket communication
export type FileAttachmentPayload = {
  extension:
    | 'pdf'
    | 'txt'
    | 'docx'
    | 'xlsx'
    | 'pptx'
    | 'zip'
    | 'rar'
    | '7z'
    | 'jpg'
    | 'png'
    | 'gif'
    | 'mp4'
    | 'mp3'
    | 'wav'
    | 'tar'
    | 'gz'
    | 'exe'
    | string
}

export type ImageAttachmentPayload = {
  mimetype: `image/${'jpeg' | 'png' | 'gif' | 'webp'}`
  width: number
  height: number
}

export type VideoAttachmentPayload = {
  mimetype: `video/${'mp4' | 'gif' | 'webm' | 'ogg'}`
  width: number
  height: number
  duration: number
}
export type AudioAttachmentPayload = {
  duration: number
}
export type VoiceAttachmentPayload = {
  duration: number
}
interface AttachmentMetas {
  ImageAttachmentPayload: ImageAttachmentPayload
  VideoAttachmentPayload: VideoAttachmentPayload
  AudioAttachmentPayload: AudioAttachmentPayload
  VoiceAttachmentPayload: VoiceAttachmentPayload
  FileAttachmentPayload: FileAttachmentPayload
}

export const ATTACHEMENT_TYPES = { video, image, file, voice, audio }
export type AttachmentType = keyof typeof ATTACHEMENT_TYPES

export interface BaseAttachment {
  id: string
  filename?: string
  url: string
  size: number
}

export interface Attachment<T extends AttachmentType = never> {
  type: T
  id: string
  filename: string
  url: string
  size: number
  meta: AttachmentMetas[`${Capitalize<T>}AttachmentPayload`]
}

