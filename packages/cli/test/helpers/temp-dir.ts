import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface TempDir {
  path: string;
  write(relativePath: string, content: string): Promise<void>;
  cleanup(): Promise<void>;
}

/** A scratch directory for fixture files, deleted by `cleanup()`. */
export async function createTempDir(prefix: string): Promise<TempDir> {
  const path = await mkdtemp(join(tmpdir(), `${prefix}-`));

  return {
    path,
    async write(relativePath, content) {
      const filePath = join(path, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
    },
    async cleanup() {
      await rm(path, { recursive: true, force: true });
    },
  };
}
