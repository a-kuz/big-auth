export class CustomError extends Error {
	constructor(
		readonly message = 'Unauthorized',
		readonly httpCode = 500
	) {
		super(message);
	}
}
