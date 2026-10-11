const PRESS_FEEDBACK_DELAY = 100;

// Delays the handler so that the press animation is visible before the screen changes
export const afterPress = (handler: (() => void) | undefined) => {
  return handler && (() => void setTimeout(handler, PRESS_FEEDBACK_DELAY));
};
