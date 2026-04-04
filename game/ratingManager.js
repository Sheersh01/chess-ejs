const User = require("../models/User");

module.exports = async function updateRatings(game, result, io) {
  // Skip rating updates for guest users
  const whitePlayer = game.userIds.white;
  const blackPlayer = game.userIds.black;

  // Check if either player is a guest (guest IDs start with 'guest_')
  const isWhiteGuest =
    typeof whitePlayer === "string" && whitePlayer.startsWith("guest_");
  const isBlackGuest =
    typeof blackPlayer === "string" && blackPlayer.startsWith("guest_");
  const isWhiteBot =
    typeof whitePlayer === "string" && whitePlayer.startsWith("bot_");
  const isBlackBot =
    typeof blackPlayer === "string" && blackPlayer.startsWith("bot_");

  if (isWhiteGuest || isBlackGuest || isWhiteBot || isBlackBot) {
    console.log("Skipping rating update for guest/bot players");
    return;
  }

  const white = await User.findById(whitePlayer);
  const black = await User.findById(blackPlayer);

  if (!white || !black) return;

  if (result === "white") {
    white.updateRating(black.rating, "win");
    black.updateRating(white.rating, "loss");
  } else if (result === "black") {
    black.updateRating(white.rating, "win");
    white.updateRating(black.rating, "loss");
  } else {
    white.updateRating(black.rating, "draw");
    black.updateRating(white.rating, "draw");
  }

  await white.save();
  await black.save();

  io.to(game.players.white).emit("ratingUpdate", white);
  io.to(game.players.black).emit("ratingUpdate", black);
};
