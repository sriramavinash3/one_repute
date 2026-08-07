import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageProvider, UploadFileOptions, UploadResult } from '../interfaces/storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  readonly providerName = 'local';
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly uploadDir: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = path.resolve(this.config.get<string>('STORAGE_LOCAL_PATH') || './uploads');
    this.appUrl = this.config.get<string>('APP_URL') || 'http://localhost:3000';
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(options: UploadFileOptions): Promise<UploadResult> {
    const folder = options.folder ? path.join(this.uploadDir, options.folder) : this.uploadDir;
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    const key = options.folder ? `${options.folder}/${options.filename}` : options.filename;
    const filePath = path.join(this.uploadDir, key);

    await fs.promises.writeFile(filePath, options.buffer);
    const url = `${this.appUrl}/uploads/${key}`;

    this.logger.log(`[LocalStorage] File uploaded: key=${key}, size=${options.buffer.length}b`);
    return {
      url,
      key,
      sizeBytes: options.buffer.length,
      provider: this.providerName,
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    const filePath = path.join(this.uploadDir, key);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch (err: any) {
      this.logger.error(`[LocalStorage] Delete error for key=${key}: ${err.message}`);
      return false;
    }
  }

  async getFileUrl(key: string): Promise<string> {
    return `${this.appUrl}/uploads/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.uploadDir, key);
    return fs.existsSync(filePath);
  }
}
