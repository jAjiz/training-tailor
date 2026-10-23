import { describe, expect, it } from "vitest";
import { isPushServiceEndpoint } from "@/lib/notifications/push-endpoints";

describe("isPushServiceEndpoint", () => {
  it("accepts the browsers' push services over https", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://jmt17.google.com/fcm/send/abc",
      "https://android.googleapis.com/gcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) expect(isPushServiceEndpoint(url), url).toBe(true);
  });

  it("refuses any other host, http, and look-alike hosts", () => {
    for (const url of [
      "https://interno.ejemplo:9000/hook",
      "https://10.0.0.5:8443/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.apple.com/x",
      "https://evilgoogle.com/x",
      "https://google.com.evil.example/x",
      "https://push.apple.com.evil.example/x",
      "https://user@evil.example/fcm.googleapis.com",
      "not a url",
    ]) expect(isPushServiceEndpoint(url), url).toBe(false);
  });
});
