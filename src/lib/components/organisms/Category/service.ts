export { requestFileThumbnailDownload } from "$lib/services/file";

export interface SelectedFile {
  id: number;
  dataKey: CryptoKey;
  dataKeyVersion: Date;
  name: string;
}
