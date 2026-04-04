const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie;
      if (!cookie) {
        console.log("No cookie found");
        throw new Error("No auth");
      }

      const token = cookie.split("token=")[1]?.split(";")[0];
      if (!token || token === "none") {
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
