export class CustomError extends Error {
  constructor(
    readonly message = 'Unauthorized',
    readonly httpCode = 500,
  ) {
    super(message)
  }
}
export class UnauthorizedError extends CustomError {
  constructor(
    readonly message = 'Unauthorized',
    readonly httpCode = 401,
  ) {
    super(message)
  }
}

export class NotFoundError extends CustomError {
  constructor(
    readonly message = 'Not found',
    readonly httpCode = 404,
  ) {
    super(message)
  }
}
