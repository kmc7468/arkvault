const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const encodeString = (data: string) => {
  return textEncoder.encode(data);
};

export const decodeString = (data: ArrayBuffer) => {
  return textDecoder.decode(data);
};

export const encodeToBase64 = (data: ArrayBuffer | Uint8Array) => {
  return (data instanceof ArrayBuffer ? new Uint8Array(data) : data).toBase64();
};

export const decodeFromBase64 = (data: string) => {
  return Uint8Array.fromBase64(data).buffer;
};

export const concatenateBuffers = (...buffers: ArrayBuffer[]) => {
  const arrays = buffers.map((buffer) => new Uint8Array(buffer));
  const totalLength = arrays.reduce((acc, array) => acc + array.length, 0);
  const result = new Uint8Array(totalLength);

  arrays.reduce((offset, array) => {
    result.set(array, offset);
    return offset + array.length;
  }, 0);
  return result;
};
