import { CustomError } from "./CustomError";


export class NotFoundError extends CustomError {
	constructor(
		readonly message = 'Not found',
		readonly httpCode = 404
	) {
		super(message);
	}
}
