# Chess Special Rules Testing Guide

## Quick Start

1. Start your server: `node app.js`
2. Open two browser windows at `http://localhost:3000`
3. Click "Play" on both windows to start a game

## Test Scenarios

### 🔹 Test 1: Pawn Promotion (Basic)

**Setup:**

1. Play moves to get a white pawn to the 7th rank
2. Quick test sequence:
   - e2-e4, e7-e5
   - d2-d4, d7-d6
   - d4xe5, d6xe5
   - Qd1-d8+ (check), Ke8-d7
   - Qd8xa8 (capture rook)
   - Move pawns forward until one reaches 8th rank

**Test:**

1. Move white pawn from 7th rank to 8th rank
2. Dialog should appear with 4 piece choices
3. Click on Queen (or any other piece)
4. Verify the promoted piece appears on the board
5. Check console logs for "Pawn promotion" message

**Expected Result:**

- Modal dialog shows 4 pieces with hover effects
- Selected piece appears on board
- Game continues normally

---

### 🔹 Test 2: Castling (Kingside)

**White Kingside Castling:**

```
Starting position:
♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜
♟ ♟ ♟ ♟ ♟ ♟ ♟ ♟
. . . . . . . .
. . . . . . . .
. . . . . . . .
. . . . . . . .
♙ ♙ ♙ ♙ ♙ ♙ ♙ ♙
♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖

Moves to clear path:
1. e2-e4, e7-e5
2. Nf3, Nc6
3. Bc4, Bc5
4. Now castle: drag King e1 → g1
```

**Test:**

1. Move King from e1 to g1 (2 squares toward rook)
2. Rook should automatically move from h1 to f1
3. Green animation should briefly highlight
4. Console should log "Castling: Kingside"

**Expected Result:**

- King ends on g1
- Rook ends on f1
- Both pieces moved in one turn
- Visual feedback shows

---

### 🔹 Test 3: Castling (Queenside)

**White Queenside Castling:**

```
Moves:
1. d2-d4, d7-d5
2. Nc3, Nc6
3. Bf4, Bf5
4. Qd2, Qd7
5. Now castle: drag King e1 → c1
```

**Test:**

1. Move King from e1 to c1 (2 squares toward queenside rook)
2. Rook should automatically move from a1 to d1
3. Console should log "Castling: Queenside"

**Expected Result:**

- King ends on c1
- Rook ends on d1
- Visual feedback shows

---

### 🔹 Test 4: En Passant

**Setup:**

```
Get to this position:
♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜
♟ ♟ ♟ . ♟ ♟ ♟ ♟
. . . . . . . .
. . . ♟ ♙ . . .  ← White pawn on e5, black pawn on d5
. . . . . . . .
. . . . . . . .
♙ ♙ ♙ ♙ . ♙ ♙ ♙
♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖

Moves:
1. e2-e4, d7-d6
2. e4-e5, f7-f5
3. Black plays d6-d5 (NOT d7-d5) - won't work for en passant
   OR restart and play:
1. e2-e4, a7-a6
2. e4-e5, d7-d5  ← Black pawn moves 2 squares
```

**Test:**

1. Get white pawn to e5
2. Black moves pawn from d7 to d5 (2 squares, landing next to white pawn)
3. **Immediately** drag white pawn from e5 to d6 (diagonal)
4. Black pawn on d5 should disappear
5. White pawn should be on d6
6. Console logs "En passant capture"

**Expected Result:**

- Hint dot appears on d6 after black's pawn move
- Diagonal capture works
- Black pawn disappears from d5
- White pawn appears on d6
- Score updates (+1 for capturing pawn)

**Important:** En passant must be done immediately after opponent's 2-square pawn move!

---

### 🔹 Test 5: Invalid Castling (Should Fail)

**Test castling when it's illegal:**

1. **After King moved:**

   - Move King (e1-e2)
   - Move it back (e2-e1)
   - Try to castle → Should fail (no hint dots appear)

2. **While in check:**

   - Let opponent check your king
   - Try to castle → Should fail

3. **Through check:**
   - Position opponent piece attacking f1
   - Try to castle kingside → Should fail

**Expected Result:**

- No hint dots show for illegal castling
- Move is rejected if attempted

---

### 🔹 Test 6: Multiple Promotions

**Test:**

1. Promote one pawn to Queen
2. Play until another pawn reaches end
3. Promote second pawn to Rook (different piece)
4. Promote third pawn to Knight

**Expected Result:**

- Each promotion shows dialog
- Different pieces can be chosen
- All promoted pieces function correctly

---

## Console Logs to Watch

Open browser DevTools (F12) and check console for:

```
✓ "Pawn promotion: e7 to e8, promoted to q"
✓ "Castling: Kingside"
✓ "Castling: Queenside"
✓ "En passant capture: e5 to d6"
```

## Visual Indicators

- **Promotion**: Modal dialog with 4 large piece buttons
- **Special Moves**: Green pulse animation on target square
- **Check**: Red pulsing on King square
- **Hints**: Dots show legal moves
- **Captures**: Hollow circle hints for capture moves

## Common Issues & Solutions

### Castling not working?

- ✓ Both King and Rook must not have moved
- ✓ No pieces between them
- ✓ King not in check
- ✓ King doesn't move through attacked squares

### En Passant not showing?

- ✓ Must be done IMMEDIATELY after opponent's 2-square pawn move
- ✓ Your pawn must be on 5th rank (white) or 4th rank (black)
- ✓ Enemy pawn must have moved 2 squares from starting position

### Promotion dialog not appearing?

- ✓ Check browser console for errors
- ✓ Ensure pawn reaches opposite end (rank 1 for black, rank 8 for white)
- ✓ Refresh page if needed

## Success Criteria

All features working correctly if:

- ✅ Pawn promotion dialog appears and works
- ✅ All 4 promotion pieces selectable
- ✅ Castling (both kingside and queenside) works
- ✅ En passant capture works and removes opponent pawn
- ✅ Invalid special moves are rejected
- ✅ Visual feedback shows for all special moves
- ✅ Game continues normally after special moves
- ✅ Scores update correctly
- ✅ No console errors

Happy testing! 🎉
