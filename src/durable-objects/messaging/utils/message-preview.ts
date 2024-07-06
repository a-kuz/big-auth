export function messagePreview(message?: string): string {
	return message ? (message.length > 133 ? message.slice(0, 130) + '...' : message) : '';
}
