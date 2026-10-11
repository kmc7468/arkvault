export const digestMessage = async (message: BufferSource) => {
  return await crypto.subtle.digest("SHA-256", message);
};

export const generateHmacSecret = async () => {
  return {
    hmacSecret: await crypto.subtle.generateKey(
      {
        name: "HMAC",
        hash: "SHA-256",
      } satisfies HmacKeyGenParams,
      true,
      ["sign", "verify"],
    ),
  };
};
