import { MessageId, Timestamp, UserId } from '~/types/ws/internal'

export type Mark = [MessageId, Timestamp]
export type Marks = {
  [key: UserId]: Mark[]
}

export type MarkPointer = {
	index: number
	messageId: number
	timestamp: number
}
