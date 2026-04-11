const jwt = require("jsonwebtoken");
const User = require("../models/User");

const getTokenFromCookieHeader = (cookieHeader) => {
  if (!cookieHeader) return null;

  const cookieMap = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) return acc;

      const key = pair.slice(0, separatorIndex);
      const value = pair.slice(separatorIndex + 1);
      acc[key] = value;
      return acc;
    }, {});

  const rawToken = cookieMap.token;
  if (!rawToken) return null;

  // Remove optional quotes and decode URL-encoded cookie values.
  let decodedToken = rawToken;
  try {
    decodedToken = decodeURIComponent(rawToken);
  } catch (error) {
    decodedToken = rawToken;
  }

  const normalized = decodedToken.replace(/^"|"$/g, "").trim();
  if (!normalized || normalized === "none") return null;

  return normalized.startsWith("Bearer ")
    ? normalized.slice("Bearer ".length).trim()
    : normalized;
};

const normalizeToken = (rawToken) => {
  if (!rawToken || typeof rawToken !== "string") return null;

  const trimmed = rawToken.replace(/^"|"$/g, "").trim();
  if (!trimmed || trimmed === "none") return null;

  return trimmed.startsWith("Bearer ")
    ? trimmed.slice("Bearer ".length).trim()
    : trimmed;
};

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie;
      const authToken = normalizeToken(socket.handshake.auth?.token);
      const headerToken = normalizeToken(
        socket.handshake.headers.authorization,
      );

      const token =
        getTokenFromCookieHeader(cookie) || authToken || headerToken;

      if (!token) {
        console.log("No valid token found");
        throw new Error("No token");
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if this is a guest user
      if (decoded.isGuest) {
        socket.user = {
          _id: decoded.id,
          id: decoded.id,
          username: decoded.username,
          displayName: decoded.username,
          rating: decoded.rating,
          gamesPlayed: decoded.gamesPlayed || 0,
          wins: decoded.wins || 0,
          losses: decoded.losses || 0,
          draws: decoded.draws || 0,
          settings: {
            boardLight: "#f0d9b5",
            boardDark: "#b58863",
            hintColor: "#14551e",
          },
          isGuest: true,
        };
        console.log(`Guest user authenticated: ${socket.user.username}`);
        next();
      } else {
        // Regular user - fetch from database
        try {
          socket.user = await User.findById(decoded.id).select("-password");
          if (!socket.user) {
            console.log("User not found in database");
            throw new Error("Invalid user");
          }
          console.log(`Regular user authenticated: ${socket.user.username}`);
          next();
        } catch (dbError) {
          console.log("Database error during user lookup:", dbError.message);
          throw new Error("Database authentication error");
        }
      }
    } catch (error) {
      console.log("Socket auth error:", error.message);
      next(new Error("Authentication error"));
    }
  });
};
