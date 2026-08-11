export const BROWSER_ISOLATION_ARGUMENTS = Object.freeze([
  "--disable-gpu-shader-disk-cache",
]);

export function createCaptureUrl(host, profile, runId) {
  const url = new URL(host);
  url.pathname = "/";
  url.searchParams.set("profile", profile);
  url.searchParams.set("benchmarkRun", runId);
  return url.toString();
}
