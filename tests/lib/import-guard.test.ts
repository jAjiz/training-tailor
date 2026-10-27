import { describe, it, expect } from "vitest";
import { assertImportAllowed } from "../../scripts/lib/import-guard";

const URL_DEV = "postgresql://user:pass@ep-dev.eu-west-2.aws.neon.tech/neondb";

describe("assertImportAllowed", () => {
  it("refuses when either value is unset", () => {
    expect(() => assertImportAllowed(undefined, "ep-dev.eu-west-2.aws.neon.tech")).toThrow(/DATABASE_URL/);
    expect(() => assertImportAllowed(URL_DEV, undefined)).toThrow(/DOMAIN_IMPORT_HOST/);
    expect(() => assertImportAllowed(URL_DEV, "")).toThrow(/DOMAIN_IMPORT_HOST/);
  });

  it("refuses a different host", () => {
    expect(() => assertImportAllowed(URL_DEV, "ep-prod.eu-west-2.aws.neon.tech")).toThrow(/Refusing/);
  });

  it("refuses a malformed URL with a clear message", () => {
    expect(() => assertImportAllowed("not a url", "host")).toThrow(/not a valid URL/);
  });

  it("accepts the same host", () => {
    expect(() => assertImportAllowed(URL_DEV, "ep-dev.eu-west-2.aws.neon.tech")).not.toThrow();
  });

  it("accepts a port in the URL for the right host", () => {
    const url = "postgresql://user:pass@ep-dev.eu-west-2.aws.neon.tech:6543/neondb";
    expect(() => assertImportAllowed(url, "ep-dev.eu-west-2.aws.neon.tech")).not.toThrow();
  });

  it("matches the host case-insensitively", () => {
    const url = "postgresql://user:pass@EP-Dev.eu-west-2.aws.neon.tech/neondb";
    expect(() => assertImportAllowed(url, "ep-dev.eu-west-2.aws.neon.tech")).not.toThrow();
    expect(() => assertImportAllowed(URL_DEV, "EP-DEV.eu-west-2.aws.neon.tech")).not.toThrow();
  });

  it("refuses a host query parameter that overrides the URL host", () => {
    const url = "postgresql://user:pass@ep-dev.eu-west-2.aws.neon.tech/neondb?host=ep-prod.eu-west-2.aws.neon.tech";
    expect(() => assertImportAllowed(url, "ep-dev.eu-west-2.aws.neon.tech")).toThrow(/"host" parameter/);
  });

  it("refuses hostaddr and service parameters", () => {
    expect(() => assertImportAllowed(`${URL_DEV}?hostaddr=10.0.0.1`, "ep-dev.eu-west-2.aws.neon.tech"))
      .toThrow(/"hostaddr" parameter/);
    expect(() => assertImportAllowed(`${URL_DEV}?service=prod`, "ep-dev.eu-west-2.aws.neon.tech"))
      .toThrow(/"service" parameter/);
  });

  it("refuses an options parameter that names an endpoint", () => {
    const url = `${URL_DEV}?options=endpoint%3Dep-prod`;
    expect(() => assertImportAllowed(url, "ep-dev.eu-west-2.aws.neon.tech")).toThrow(/endpoint/);
    expect(() => assertImportAllowed(`${URL_DEV}?options=-c%20search_path%3Dpublic`, "ep-dev.eu-west-2.aws.neon.tech"))
      .not.toThrow();
  });
});
