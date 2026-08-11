import type { AuditEvent } from "@/lib/domain/types";

export interface FileUploadDetails {
  fileName: string;
  fileUrl: string;
  stageIndex: number;
}

export function getFileUploadDetails(event: AuditEvent): FileUploadDetails | undefined {
  if (event.action !== "file.uploaded") return undefined;
  const fileName = event.details?.fileName;
  const fileUrl = event.details?.fileUrl;
  const stageIndex = event.details?.stageIndex;
  if (
    typeof fileName !== "string"
    || typeof fileUrl !== "string"
    || typeof stageIndex !== "number"
    || !Number.isInteger(stageIndex)
    || stageIndex < 0
  ) return undefined;
  return { fileName, fileUrl, stageIndex };
}

export function isPrivateVercelBlobUrl(value: string) {
  try {
    const url = new URL(value);
    const suffix = ".private.blob.vercel-storage.com";
    return url.protocol === "https:"
      && url.hostname.endsWith(suffix)
      && url.hostname.length > suffix.length
      && !url.username
      && !url.password
      && !url.port;
  } catch {
    return false;
  }
}
