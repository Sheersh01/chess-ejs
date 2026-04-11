const User = require("../models/User");

module.exports = async function updateRatings(game, result, io) {
  const whitePlayer = game.userIds.white;
  const blackPlayer = game.userIds.black;
  const BOT_RATING = 1200;
  const isBotUser = (playerId) =>
    typeof playerId === "string" &&
    (playerId === "bot_engine" || playerId.startsWith("bot_"));

  const isWhiteGuest =
    typeof whitePlayer === "string" && whitePlayer.startsWith("guest_");
  const isBlackGuest =
    typeof blackPlayer === "string" && blackPlayer.startsWith("guest_");
  const isWhiteBot = isBotUser(whitePlayer);
  const isBlackBot = isBotUser(blackPlayer);

  if (isWhiteGuest || isBlackGuest) {
    console.log("Skipping rating update for guest players");
    return;
  }

  if (isWhiteBot || isBlackBot) {
    const humanPlayerId = isWhiteBot ? blackPlayer : whitePlayer;
    const humanSocketId = isWhiteBot ? game.players.black : game.players.white;
    const humanResult =
      result === "draw"
        ? "draw"
        : (isWhiteBot && result === "black") || (isBlackBot && result === "white")
          ? "win"
          : "loss";

    const human = await User.findById(humanPlayerId);
    if (!human) return;

    human.updateRating(BOT_RATING, humanResult);
    await human.save();

    io.to(humanSocketId).emit("ratingUpdate", human);
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
