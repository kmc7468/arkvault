import { error, type RequestEvent } from "@sveltejs/kit";
import { AppError } from "#lib/server/errors.js";

// Converts `AppError`s thrown by services into HTTP errors
export const handleAppErrors = <Event extends RequestEvent>(
  handler: (event: Event) => Promise<Response>,
): ((event: Event) => Promise<Response>) => {
  return async (event) => {
    try {
      return await handler(event);
    } catch (e) {
      if (e instanceof AppError) {
        error(e.httpStatus, e.message);
      }
      throw e;
    }
  };
};
