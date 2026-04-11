const User = require("../models/User");

const isGuestUser = (playerId) =>
  typeof playerId === "string" && playerId.startsWith("guest_");

const isBotUser = (playerId) =>
  typeof playerId === "string" &&
  (playerId === "bot_engine" || playerId.startsWith("bot_"));

const getPlayerMeta = (game, color) => game.playerMeta?.[color] || {};

const getOutcomeForColor = (result, color) => {
  if (result === "draw") {
    return "draw";
  }

  if (result === color) {
    return "win";
  }

  return "loss";
};

module.exports = async function saveGameHistory(game, result, reason = "") {
  const whiteId = game.userIds.white;
  const blackId = game.userIds.black;
  const whiteMeta = getPlayerMeta(game, "white");
  const blackMeta = getPlayerMeta(game, "black");
  const playersToUpdate = [];

  if (!isGuestUser(whiteId) && !isBotUser(whiteId)) {
    playersToUpdate.push({
      id: whiteId,
      color: "white",
      playerMeta: whiteMeta,
      opponentMeta: blackMeta,
      opponentId: blackId,
    });
  }

  if (!isGuestUser(blackId) && !isBotUser(blackId)) {
    playersToUpdate.push({
      id: blackId,
      color: "black",
      playerMeta: blackMeta,
      opponentMeta: whiteMeta,
      opponentId: whiteId,
    });
  }

  if (playersToUpdate.length === 0) {
    return;
  }

  const users = await User.find({
    _id: { $in: playersToUpdate.map((player) => player.id) },
  });
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  for (const player of playersToUpdate) {
    const user = usersById.get(String(player.id));
    if (!user) {
      continue;
    }

    const opponentName =
      player.opponentMeta?.displayName ||
      player.opponentMeta?.username ||
      (isBotUser(player.opponentId) ? "Chess Bot" : "Opponent");

    user.addGameHistoryEntry({
      opponent: opponentName,
      mode: game.isBotGame ? "bot" : "online",
      color: player.color,
      result: getOutcomeForColor(result, player.color),
      reason: reason || "",
      moves: game.moveHistory?.length || 0,
      ratingBefore: game.initialRatings?.[player.color],
      ratingAfter: user.rating,
      playedAt: new Date(),
    });

    await user.save();
  }
};
