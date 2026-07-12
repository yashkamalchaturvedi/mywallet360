import assert from "node:assert/strict";
import test from "node:test";
import { getClientKey } from "./rate-limit.middleware.js";

function request({ ip, headers = {}, remoteAddress } = {}) {
  return {
    ip,
    get(name) {
      return headers[name.toLowerCase()];
    },
    socket: { remoteAddress },
  };
}

test("uses Netlify client IP when Express request.ip is unavailable", () => {
  const key = getClientKey(request({
    headers: { "x-nf-client-connection-ip": "203.0.113.10" },
  }));
  assert.equal(key, "203.0.113.10");
});

test("uses the first forwarded IP and always returns a safe fallback", () => {
  assert.equal(getClientKey(request({
    headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.2" },
  })), "198.51.100.1");
  assert.equal(getClientKey(request()), "netlify-anonymous-client");
});
