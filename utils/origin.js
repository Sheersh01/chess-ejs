const { getAllowedOrigins } = require("../config/env");

const toOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

/** Same host as the request, or explicitly listed in CLIENT_URL. */
const isOriginAllowed = (origin, host) => {
  const normalized = toOrigin(origin);
  if (!normalized) return false;
  if (host && new URL(normalized).host === host) return true;
  return getAllowedOrigins().includes(normalized);
};

module.exports = { toOrigin, isOriginAllowed };
