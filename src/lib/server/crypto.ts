import {
  constants,
  randomBytes,
  createPublicKey,
  publicEncrypt,
  verify,
  createHmac,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";

const makePubKeyToPem = (pubKey: string) =>
  `-----BEGIN PUBLIC KEY-----\n${pubKey}\n-----END PUBLIC KEY-----`;

export const verifyPubKey = (pubKey: string) => {
  const pubKeyPem = makePubKeyToPem(pubKey);
  const pubKeyObject = createPublicKey(pubKeyPem);
  return (
    pubKeyObject.asymmetricKeyType === "rsa" &&
    pubKeyObject.asymmetricKeyDetails?.modulusLength === 4096
  );
};

export const encryptAsymmetric = (data: Buffer, encPubKey: string) => {
  return publicEncrypt({ key: makePubKeyToPem(encPubKey), oaepHash: "sha256" }, data);
};

export const verifySignature = (data: Buffer, signature: string, sigPubKey: string) => {
  return verify(
    "rsa-sha256",
    data,
    {
      key: makePubKeyToPem(sigPubKey),
      padding: constants.RSA_PKCS1_PSS_PADDING,
    },
    Buffer.from(signature, "base64"),
  );
};

export const generateChallenge = async (length: number, encPubKey: string) => {
  const answer = await promisify(randomBytes)(length);
  const challenge = encryptAsymmetric(answer, encPubKey);
  return { answer, challenge };
};

export const issueSessionId = async (length: number, secret: string) => {
  const sessionId = await promisify(randomBytes)(length);
  const sessionIdHex = sessionId.toString("hex");
  const sessionIdHmac = createHmac("sha256", secret).update(sessionId).digest("hex");
  return {
    sessionId: sessionIdHex,
    sessionIdSigned: `${sessionIdHex}.${sessionIdHmac}`,
  };
};

export const verifySessionId = (sessionIdSigned: string, secret: string) => {
  const [sessionIdHex, sessionIdHmac] = sessionIdSigned.split(".");
  if (!sessionIdHex || !sessionIdHmac) return;
  if (
    timingSafeEqual(
      Buffer.from(sessionIdHmac, "hex"),
      createHmac("sha256", secret).update(Buffer.from(sessionIdHex, "hex")).digest(),
    )
  ) {
    return sessionIdHex;
  }
};
