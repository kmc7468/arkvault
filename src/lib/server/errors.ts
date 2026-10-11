export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RANGE_NOT_SATISFIABLE"
  | "INTERNAL_SERVER_ERROR";

const httpStatuses = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RANGE_NOT_SATISFIABLE: 416,
  INTERNAL_SERVER_ERROR: 500,
} as const satisfies Record<ErrorCode, number>;

// Expected errors that are safe to expose to clients
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  get httpStatus() {
    return httpStatuses[this.code];
  }
}

// The user or the client of an authenticated session doesn't exist, which shouldn't happen
export const invalidSessionError = () =>
  new AppError("INTERNAL_SERVER_ERROR", "Invalid session id");
