// Node.js 22 doesn't support base64 conversion of Uint8Array yet (latest Chromium does)

if (!Uint8Array.prototype.toBase64) {
  Uint8Array.prototype.toBase64 = function () {
    return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("base64");
  };
}

if (!Uint8Array.fromBase64) {
  Uint8Array.fromBase64 = (data: string) => {
    return new Uint8Array(Buffer.from(data, "base64"));
  };
}
