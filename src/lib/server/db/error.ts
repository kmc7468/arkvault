type IntegrityErrorMessages =
  // Category
  | "Category not found"
  // Challenge
  | "Challenge already registered"
  // Client
  | "Public key(s) already registered"
  | "User client already exists"
  // File
  | "Directory not found"
  | "Directory already favorited"
  | "Directory not favorited"
  | "File not found"
  | "File is not legacy"
  | "File not found in category"
  | "File already added to category"
  | "File already favorited"
  | "File not favorited"
  | "Invalid DEK version"
  // HSK
  | "HSK already registered"
  | "Inactive HSK version"
  // MEK
  | "MEK already registered"
  | "Inactive MEK version"
  // Session
  | "Session not found"
  | "Session already exists";

export class IntegrityError extends Error {
  constructor(public message: IntegrityErrorMessages) {
    super(message);
    this.name = "IntegrityError";
  }
}
