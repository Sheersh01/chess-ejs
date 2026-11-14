const DAY_MS = 24 * 60 * 60 * 1000;
const COOKIE_NAME = "token";

const baseOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

const userCookieMaxAge = () => (Number(process.env.JWT_COOKIE_EXPIRE) || 7) * DAY_MS;

const setAuthCookie = (res, token, maxAge = userCookieMaxAge()) =>
  res.cookie(COOKIE_NAME, token, { ...baseOptions(), maxAge });

const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, baseOptions());

module.exports = { COOKIE_NAME, DAY_MS, setAuthCookie, clearAuthCookie };
