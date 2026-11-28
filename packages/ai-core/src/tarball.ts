import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { normalizeRepoRelativePath } from "./repo-context.js";

export class TarExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TarExtractionError";
  }
}

export interface TarExtractOptions {
  maxExtractedBytes?: number;
  maxEntries?: number;
  stripTopLevel?: boolean;
}

function readAsciiString(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString("utf8").trim();
}

function readOctalNumber(buf: Buffer, start: number, len: number): number {
  const raw = readAsciiString(buf, start, len).replace(/\0/g, "").trim();
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 8);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new TarExtractionError(`Invalid octal header value in archive: ${raw}`);
  }
  return parsed;
}

function stripTopLevelPrefix(rawName: string): string {
  const cleaned = rawName.replace(/^\.\//, "");
  const slashIdx = cleaned.indexOf("/");
  if (slashIdx === -1) return "";
  return cleaned.slice(slashIdx + 1);
}

export async function extractSafeTarGz(
  compressedBuffer: Buffer,
  destDir: string,
  options: TarExtractOptions = {},
): Promise<{ fileCount: number; totalBytes: number }> {
  const maxExtractedBytes = options.maxExtractedBytes ?? 64 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 5000;

  let tarBuf: Buffer;
  try {
    tarBuf = gunzipSync(compressedBuffer, { maxOutputLength: maxExtractedBytes });
  } catch (error) {
    throw new TarExtractionError(
      `Failed to decompress repository archive safely: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await mkdir(destDir, { recursive: true });
  const realRoot = await realpath(destDir);

  let offset = 0;
  let fileCount = 0;
  let totalBytes = 0;
  let entriesSeen = 0;
  let nextLongPath: string | null = null;

  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      break;
    }

    entriesSeen += 1;
    if (entriesSeen > maxEntries) {
      throw new TarExtractionError(`Repository archive exceeds maximum entry count (${maxEntries}).`);
    }

    const namePart = readAsciiString(header, 0, 100);
    const prefixPart = readAsciiString(header, 345, 155);
    const size = readOctalNumber(header, 124, 12);
    const typeFlagByte = header[156] ?? 0;
    const typeFlag = typeFlagByte === 0 ? "0" : String.fromCharCode(typeFlagByte);

    offset += 512;
    if (offset + size > tarBuf.length) {
      throw new TarExtractionError("Truncated archive entry detected.");
    }
    const contentBuf = tarBuf.subarray(offset, offset + size);
    const paddedSize = Math.ceil(size / 512) * 512;
    offset += paddedSize;

    // GNU long path entry
    if (typeFlag === "L") {
      nextLongPath = contentBuf.toString("utf8").replace(/\0+$/, "");
      continue;
    }
    // PAX extended header: check if it sets path=
    if (typeFlag === "x") {
      const paxText = contentBuf.toString("utf8");
      const pathMatch = /\d+ path=([^\n]+)\n/.exec(paxText);
      if (pathMatch?.[1]) {
        nextLongPath = pathMatch[1];
      }
      continue;
    }
    if (typeFlag === "g" || typeFlag === "X") {
      nextLongPath = null;
      continue;
    }

    const rawEntryName = nextLongPath ?? (prefixPart ? `${prefixPart}/${namePart}` : namePart);
    nextLongPath = null;

    if (typeFlag === "1" || typeFlag === "2" || typeFlag === "3" || typeFlag === "4" || typeFlag === "6") {
      throw new TarExtractionError(`Archive contains disallowed link or special entry: ${rawEntryName}`);
    }

    const stripped =
      options.stripTopLevel === false
        ? rawEntryName.replace(/^\.\//, "").replace(/\/+$/, "")
        : stripTopLevelPrefix(rawEntryName).replace(/\/+$/, "");
    if (!stripped) {
      continue;
    }

    const normalized = normalizeRepoRelativePath(stripped);
    if (!normalized) {
      throw new TarExtractionError(`Archive contains unsafe entry path: ${rawEntryName}`);
    }
    if (normalized.split("/")[0] === ".git") {
      continue;
    }

    const targetPath = path.resolve(realRoot, normalized);
    if (targetPath !== realRoot && !targetPath.startsWith(`${realRoot}${path.sep}`)) {
      throw new TarExtractionError(`Archive path traversal rejected: ${rawEntryName}`);
    }

    if (typeFlag === "5") {
      await mkdir(targetPath, { recursive: true });
      continue;
    }

    if (typeFlag === "0") {
      totalBytes += size;
      if (totalBytes > maxExtractedBytes) {
        throw new TarExtractionError(
          `Extracted repository exceeds byte limit (${maxExtractedBytes} bytes).`,
        );
      }
      fileCount += 1;
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, contentBuf);
    }
  }

  return { fileCount, totalBytes };
}

export async function readLocalFileUtf8IfPresent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function buildTarHeader(name: string, size: number, typeFlag = "0"): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, Math.min(Buffer.byteLength(name), 100), "utf8");
  header.write("000644\0", 100, 7, "utf8");
  header.write("000000\0", 108, 7, "utf8");
  header.write("000000\0", 116, 7, "utf8");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
  header.write("00000000000\0", 136, 12, "utf8");
  header.fill(0x20, 148, 156);
  header[156] = typeFlag.charCodeAt(0);
  header.write("ustar\0", 257, 6, "utf8");
  header.write("00", 263, 2, "utf8");

  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += header[i] ?? 0;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
  return header;
}

function appendTarRecord(blocks: Buffer[], name: string, data: Buffer, typeFlag = "0") {
  blocks.push(buildTarHeader(name, data.byteLength, typeFlag));
  if (data.byteLength > 0) {
    blocks.push(data);
    const rem = data.byteLength % 512;
    if (rem !== 0) {
      blocks.push(Buffer.alloc(512 - rem, 0));
    }
  }
}

export function createSafeTarGzFromEntries(
  entries: Array<{ name: string; data: Buffer }>,
): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const clean = normalizeRepoRelativePath(entry.name);
    if (!clean) {
      throw new TarExtractionError(`Cannot archive unsafe relative path: ${entry.name}`);
    }
    const nameBytes = Buffer.byteLength(clean, "utf8");
    if (nameBytes > 98) {
      const longBuf = Buffer.from(`${clean}\0`, "utf8");
      appendTarRecord(blocks, "././@LongLink", longBuf, "L");
      appendTarRecord(blocks, clean.slice(0, 95), entry.data, "0");
    } else {
      appendTarRecord(blocks, clean, entry.data, "0");
    }
  }
  blocks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(blocks));
}
