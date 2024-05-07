import { CustomError } from "./CustomError"

export class UnauthorizedError extends CustomError {
  constructor(
    readonly message = 'Unauthorized',
    readonly httpCode = 401,
  ) {
    super(message)
  }
}

