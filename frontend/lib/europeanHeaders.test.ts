import { expect, it } from "vitest";
import config from "../next.config.mjs";

it("permits the official UEFA crest host in the delivered page image policy", async () => {
  const routes=await config.headers!();
  const csp=routes[0]!.headers.find((h:{key:string;value:string})=>h.key==="Content-Security-Policy")!.value;
  expect(csp.split(";").find((rule:string)=>rule.trim().startsWith("img-src "))?.split(/\s+/)).toContain("https://img.uefa.com");
  expect(csp.split(";").find((rule:string)=>rule.trim().startsWith("img-src "))?.split(/\s+/)).toContain("https://upload.wikimedia.org");
});
