const DEFAULT_REDIRECT_PATH = "/home";

// Returns the path to return to after the flow at the URL (e.g. logging in) is done. Only
// same-origin paths are allowed to prevent open redirects.
export const getRedirectPath = (url: URL) => {
  const path = url.searchParams.get("redirect");
  return path && /^\/(?![/\\])/.test(path) ? path : DEFAULT_REDIRECT_PATH;
};

export const withRedirectPath = (path: string, redirectPath: string) => {
  return `${path}?redirect=${encodeURIComponent(redirectPath)}`;
};
