export class CustomError extends Error {
	httpCode: number = 500
}
export class UnauthorizedError extends CustomError {

	constructor(message = 'Unauthorized') {
		super(message);
		this.name = 'UnauthorizedError';
		this.message = 'Unauthorized';
		this.httpCode = 401
	}
}


