export const AWS_ACCESS_KEY_ID = "AKIAABCDEFGHIJKLMNOP";

export function uploadToS3(bucket: string): void {
  console.log(`uploading to ${bucket} as ${AWS_ACCESS_KEY_ID}`);
}
