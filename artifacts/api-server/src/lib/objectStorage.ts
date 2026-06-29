import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

const UPLOADS_DIR = process.env.LOCAL_UPLOADS_DIR || "./uploads";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const uploadPath = path.join(UPLOADS_DIR, "private", objectId);
    await this.ensureDir(path.dirname(uploadPath));
    return `/api/storage/upload/${objectId}`;
  }

  /**
   * احفظ الصورة مباشرة بدون HTTP - الحل الصحيح
   */
  async saveUploadedFile(objectId: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(UPLOADS_DIR, "private", objectId);
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, buffer);
    return `/api/storage/objects/private/${objectId}`;
  }

  /**
   * الـ objectPath يأتي كـ "/objects/private/uuid"
   * نحذف "/objects/" لأن الملفات مخزنة في UPLOADS_DIR/private/uuid مباشرة
   */
  async getObjectEntityFile(objectPath: string): Promise<string> {
    const cleanPath = objectPath.replace(/^\/objects\//, "");
    const filePath = path.join(UPLOADS_DIR, cleanPath);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  normalizeObjectEntityPath(rawPath: string): string {
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, _aclPolicy: any): Promise<string> {
    return rawPath;
  }

  async canAccessObjectEntity(_opts: any): Promise<boolean> {
    return true;
  }

  async searchPublicObject(filePath: string): Promise<string | null> {
    const fullPath = path.join(UPLOADS_DIR, "public", filePath);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      return null;
    }
  }

  async downloadObject(filePath: string): Promise<Response> {
    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
      };
      const contentType = contentTypeMap[ext] ?? "image/jpeg";
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(data.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }
}
