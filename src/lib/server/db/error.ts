import { AppError, type ErrorCode } from "#lib/server/errors.js";

const errorCodes = {
  // Category
  "Category not found": "NOT_FOUND",
  // Challenge
  "Challenge already registered": "CONFLICT",
  // Client
  "Public key(s) already registered": "CONFLICT",
  "User client already exists": "CONFLICT",
  // File
  "Directory not found": "NOT_FOUND",
  "Directory already favorited": "BAD_REQUEST",
  "Directory not favorited": "BAD_REQUEST",
  "File not found": "NOT_FOUND",
  "File not found in category": "BAD_REQUEST",
  "File already added to category": "BAD_REQUEST",
  "File already favorited": "BAD_REQUEST",
  "File not favorited": "BAD_REQUEST",
  "Invalid DEK version": "CONFLICT",
  // HSK
  "HSK already registered": "CONFLICT",
  "Inactive HSK version": "BAD_REQUEST",
  // MEK
  "MEK already registered": "CONFLICT",
  "Inactive MEK version": "BAD_REQUEST",
  // Session
  "Session not found": "UNAUTHORIZED",
  "Session already exists": "CONFLICT",
  // Upload
  "Upload session not found": "NOT_FOUND",
} as const satisfies Record<string, ErrorCode>;

type IntegrityErrorMessage = keyof typeof errorCodes;

export class IntegrityError extends AppError {
  constructor(public override readonly message: IntegrityErrorMessage) {
    super(errorCodes[message], message);
    this.name = "IntegrityError";
  }
}
