# Draw Offer Feature Documentation

## Overview

The draw offer feature allows players to propose a draw during an active game. The opponent can then accept or decline the offer.

## Features Implemented

### 1. UI Components

- **Draw Offer Button**: Blue button (🤝 Offer Draw) located next to the resign button
- **Draw Offer Dialog**: Modal dialog that appears when receiving a draw offer
  - Accept button (green): Accepts the draw and ends the game
  - Decline button (red): Declines the offer and continues the game

### 2. Client-Side (script.js)

- **Button Handler**: Shows confirmation dialog before sending offer
- **Draw Offer Dialog**: Beautiful animated modal with accept/decline options
- **Socket Events**:
  - `offerDraw`: Sends draw offer to server
  - `acceptDraw`: Accepts opponent's draw offer
  - `declineDraw`: Declines opponent's draw offer
- **Socket Listeners**:
  - `drawOffered`: Receives draw offer from opponent
  - `drawAccepted`: Game ends in a draw
  - `drawDeclined`: Notifies that opponent declined

### 3. Server-Side (app.js)

- **Socket Event Handlers**:
  - `offerDraw`: Validates and forwards offer to opponent
  - `acceptDraw`: Ends game in a draw, updates statistics
  - `declineDraw`: Notifies offering player of decline

### 4. Features

- ✅ Confirmation dialog before offering draw
- ✅ Temporary button disable after offering (10 seconds cooldown)
- ✅ Beautiful animated modal for receiving offers
- ✅ Sound notification when receiving offer
- ✅ Toast notifications for all draw actions
- ✅ Automatic game reset after draw acceptance
- ✅ Statistics tracking (draws counter)
- ✅ Validation to prevent invalid offers

## User Flow

### Offering a Draw

1. Player clicks "🤝 Offer Draw" button
2. Confirmation dialog appears
3. If confirmed:
   - Draw offer sent to opponent
   - Button temporarily disabled (10 seconds)
   - Button text changes to "🤝 Draw Offered"
   - Toast notification: "Draw offer sent to opponent"

### Receiving a Draw Offer

1. Modal dialog appears with offer details
2. Notification sound plays
3. Player can:
   - **Accept**: Game ends in a draw, both players see "Draw agreed"
   - **Decline**: Dialog closes, offering player notified

### After Draw Acceptance

- Game timer stops
- Both buttons hidden
- "Game Over! Draw agreed by both players." message displayed
- Game statistics updated (draws counter incremented)
- Game resets after 5 seconds

## Technical Details

### Socket Events

```javascript
// Client → Server
socket.emit("offerDraw", { color: playerRole });
socket.emit("acceptDraw", { color: playerRole });
socket.emit("declineDraw", { color: playerRole });

// Server → Client
socket.on("drawOffered", (data) => {
  color, message;
});
socket.on("drawAccepted", (data) => {
  message;
});
socket.on("drawDeclined", (data) => {
  color, message;
});
```

### Statistics

- `gameStats.draws`: Incremented when draw is accepted
- `gameStats.completedGames`: Incremented when draw is accepted

### Security/Validation

- Only active players can offer/accept/decline draws
- Socket ID validation ensures only legitimate players can trigger events
- 10-second cooldown prevents spam

## Styling

- Draw offer dialog uses fade-in and scale-in animations
- Responsive button styling with hover effects
- Blue theme for draw offers (distinguishes from red resign button)
- Smooth transitions and accessibility features

## Testing Checklist

- [ ] Draw offer button appears when game starts
- [ ] Confirmation dialog works correctly
- [ ] Opponent receives draw offer notification
- [ ] Accept button ends game in draw
- [ ] Decline button continues game
- [ ] Draw statistics are updated correctly
- [ ] Cooldown prevents spam
- [ ] Works for both white and black players
- [ ] Proper cleanup after game ends
