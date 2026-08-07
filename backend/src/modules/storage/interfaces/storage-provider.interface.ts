export interface UploadFileOptions {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
  folder?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  sizeBytes: number;
  provider: string;
}

export interface IStorageProvider {
  readonly providerName: string;
  uploadFile(options: UploadFileOptions): Promise<UploadResult>;
  deleteFile(key: string): Promise<boolean>;
  getFileUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
}
