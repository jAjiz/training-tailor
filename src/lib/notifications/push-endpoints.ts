// The push services browsers hand out endpoints for. The server POSTs every push to the stored endpoint,
// so anything else (an internal address, someone's own server) is refused when the subscription is saved.
const EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
// Chrome may hand out Google hosts other than fcm.googleapis.com (an Android phone was refused in the beta),
// so any Google host is accepted: still Google's own servers, never an address someone else controls.
const HOST_SUFFIXES = [".googleapis.com", ".google.com", ".push.apple.com", ".notify.windows.com"];

/** The endpoint's host, for logging a refusal without the subscription token in the path. */
export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "(not a url)";
  }
}

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
