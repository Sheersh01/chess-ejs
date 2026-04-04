# Chess.com Clone Backend

A real-time chess application built with Node.js, Express, Socket.IO, EJS, MongoDB, and Chess.js.  
It supports online matchmaking, bot games, guest sessions, profile customization, ratings, timers, and live game updates.

## Features

- Real-time multiplayer chess over Socket.IO
- Bot matches with selectable difficulty and personality
- Preferred starting color for online and bot games: `White`, `Black`, or `Random`
- Rating-based matchmaking with a +/- 200 rating search window
- 10-minute game clock with low-time warnings
- Move validation and game-state detection powered by Chess.js
- Captured-piece tracking and material score display
- Move history, check indicators, promotion flow, and special-move highlighting
- Registered users with persistent ratings and stats
- Guest sessions for quick play without registration
- Profile page for display name and board-color customization
- Handling for resignation, draw offers, timeout, and disconnects

## Tech Stack

- Node.js
- Express
- Socket.IO
- MongoDB + Mongoose
- EJS
- Vanilla JavaScript
- Chess.js
- bcrypt
- JWT stored in cookies

## Project Structure

```text
Chess.com/
|-- app.js
|-- server.js
|-- config/
|   `-- database.js
|-- controllers/
|   |-- authController.js
|   `-- profileController.js
|-- game/
|   |-- botManager.js
|   |-- constants.js
|   |-- gameManager.js
|   |-- ratingManager.js
|   `-- timerManager.js
|-- middleware/
|   `-- auth.js
|-- models/
|   `-- User.js
|-- public/
|   |-- images/
|   |-- javascripts/
|   |   `-- script.js
|   |-- sounds/
|   `-- stylesheets/
|       `-- style.css
|-- routes/
|   |-- auth.js
|   `-- viewRoutes.js
|-- socket/
|   |-- auth.socket.js
|   |-- game.socket.js
|   |-- index.js
|   `-- matchmaking.socket.js
|-- stats/
|   `-- gameStats.js
`-- views/
    |-- index.ejs
    |-- login.ejs
    |-- profile.ejs
    `-- register.ejs
```

## Installation

### Prerequisites

- Node.js 18+ recommended
- MongoDB running locally or remotely

### Setup

1. Clone the repository

```bash
git clone <repository-url>
cd Chess.com
```

2. Install dependencies

```bash
npm install
```

3. Create a `.env` file in the project root

```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/chess
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d
JWT_COOKIE_EXPIRE=7
SESSION_SECRET=your_session_secret
NODE_ENV=development
```

4. Start the app

```bash
npm start
```

5. Open the app

```text
http://localhost:3000
```

## Scripts

- `npm start` - starts the server with `node server.js`

There is currently no dedicated dev script in `package.json`.

## Authentication Flow

- `GET /auth/login` renders the login page
- `GET /auth/register` renders the register page
- `POST /auth/register` creates a user
- `POST /auth/login` logs in a user
- `POST /auth/guest` creates a guest session
- `GET /auth/logout` clears the auth cookie
- `GET /auth/me` returns the authenticated user

Authentication is cookie-based using JWT.

## Main Routes

- `GET /` - main game page, protected
- `GET /profile` - profile settings page, protected
- `POST /profile` - update profile settings, protected
- `GET /stats` - returns global game stats as JSON

## Gameplay Notes

### Online matchmaking

- Players enter a queue through Socket.IO
- Matchmaking uses rating proximity and color preference compatibility
- Colors are assigned from player preference when possible
- If both players choose `Random`, colors are randomized

### Bot games

- Difficulty and personality are chosen before the game starts
- Player can choose to start as White, Black, or Random
- If the bot starts as White, it now makes the opening move automatically

### Ratings and stats

- Registered users start at `1200`
- Ratings are updated with an ELO-style calculation
- Guest users can play, but their stats are not persisted

## Profile Customization

Registered users can update:

- Username
- Display name
- Light square color
- Dark square color
- Move-hint color

Guest users can open the profile page, but they cannot save changes.

## Socket Events

### Client -> Server

- `findMatch`
- `playBot`
- `move`
- `resign`
- `offerDraw`
- `acceptDraw`
- `declineDraw`

### Server -> Client

- `playerRole`
- `waitingForMatch`
- `waitingForBotMatch`
- `waitingForOpponent`
- `startCountdown`
- `countdownTick`
- `gameStart`
- `boardstate`
- `turnChange`
- `move`
- `moveHistory`
- `scoreUpdate`
- `capturedPiecesUpdate`
- `timerUpdate`
- `lowTime`
- `gameOver`
- `gameResigned`
- `drawOffered`
- `drawAccepted`
- `drawDeclined`
- `opponentDisconnected`
- `opponentReconnected`
- `ratingUpdate`
- `gameMessage`

## Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | Port used by the HTTP server |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRE` | JWT lifetime |
| `JWT_COOKIE_EXPIRE` | Auth cookie lifetime in days |
| `SESSION_SECRET` | Session secret |
| `NODE_ENV` | Environment mode |

## Current Limitations

- The UI is intentionally desktop-first; small screens show a larger-screen prompt
- `package.json` only includes a production start script
- No automated test suite is configured yet

## License

ISC
