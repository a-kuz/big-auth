
export interface MarkDeliveredInternalEvent {
  chatId: string
	userId?: string
  messageTimestamp: number
	timestamp: number
}
export interface MarkReadInternalEvent {
  chatId: string
	userId?: string
  messageTimestamp: number
	timestamp: number
}
