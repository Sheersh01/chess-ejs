# 2. Real-Time Multiplayer Chess

This project can generate many backend questions.

## Basics

**Explain your chess project.**
It's a real-time multiplayer chess application built using Node.js for the backend and Socket.IO for real-time bidirectional communication. It uses the `chess.js` library on the server side to handle game logic, move validation, and state management. Players can join rooms, play against each other, and their moves are instantly broadcasted to the opponent.

**Why Socket.IO?**
Socket.IO abstracts the complexity of WebSockets and provides built-in features like automatic reconnection, rooms (channels), and broadcast capabilities, which are essential for a multiplayer game where state needs to be synced instantly.

**Why not polling?**
Polling introduces latency because the client has to repeatedly ask the server for updates at fixed intervals. In a real-time game like chess, this delay is noticeable and degrades the user experience. Polling also wastes server resources with constant HTTP requests, whereas WebSockets maintain a persistent, low-latency connection.

**Why Node.js?**
Node.js is highly suited for I/O-heavy, real-time applications because of its non-blocking, event-driven architecture. It can handle thousands of concurrent WebSocket connections efficiently on a single thread.

**How does a player join a room?**
When a client connects, they emit a "join" event. The Socket.IO server receives this event and uses the `socket.join(room_id)` method to place the socket into a specific room. If the room is empty, they wait. If someone is already there, the game starts.

**How do two users connect?**
Users connect by visiting the application, which establishes a WebSocket connection to the Node.js server. The server then pairs them up by either creating a new room or adding them to an existing room waiting for a second player.

## Socket.IO

**Difference between WebSocket and Socket.IO.**
WebSocket is a standard web protocol providing full-duplex communication channels over a single TCP connection. Socket.IO is a library built on top of WebSockets that provides additional features like fallbacks to long-polling (if WebSockets aren't supported), automatic reconnection, acknowledgments, namespaces, and rooms.

**Why Socket.IO over native WebSocket?**
For the built-in features: rooms (perfect for separating chess games), automatic reconnection logic, broadcasting to specific groups, and a simpler API for event emission. Native WebSockets would require building these features from scratch.

**What are namespaces?**
Namespaces allow you to split the logic of your application over a single shared connection (multiplexing). They are useful for separating different parts of an application (e.g., `/chat` and `/game`) without opening multiple TCP connections.

**What are rooms?**
Rooms are arbitrary channels that sockets can join or leave within a namespace. They are used to broadcast events to a subset of clients. In this project, a room represents a single chess match between two players.

**How do broadcasts work?**
Broadcasting is sending a message to all connected clients except the sender, or to everyone in a specific room. Socket.IO provides methods like `socket.to(room).emit()` to handle this efficiently.

**What events did you create?**
Common events include:
- `join_game`: Emitted by the client to find a match.
- `move`: Emitted by the client when a player makes a move.
- `game_state`: Emitted by the server to send the current board state.
- `game_over`: Emitted by the server when checkmate/draw occurs.
- `disconnect`: A built-in event handled to notify the opponent if someone leaves.

**How do acknowledgements work?**
Socket.IO allows you to pass a callback function as the last argument of an `.emit()`. The receiver can call this callback to acknowledge receipt of the message and send data back (e.g., to confirm a move was valid).

## Game Logic

**Why Chess.js?**
`chess.js` is a robust library that handles all the complex rules of chess, including move generation, move validation, check/checkmate detection, castling, and en passant. It saves from having to write and maintain complex game logic.

**How does Chess.js validate moves?**
It maintains the internal board state (often using FEN or a similar representation) and calculates all legal moves for the current position. When a move is attempted, it checks if it exists in the list of legal moves before updating the state.

**Can users cheat?**
No, because the server acts as the single source of truth. All moves are validated by `chess.js` on the backend. A modified client sending illegal moves will be rejected by the server.

**What if someone sends an illegal move?**
The server validates the move using `chess.js`. If `chess.move(attemptedMove)` returns `null`, the move is invalid. The server rejects it and does not broadcast it to the opponent. It can send an error message back to the client.

**Where is move validation performed?**
Always on the server. The client can also perform optimistic validation for UI responsiveness, but the server has the final say.

**How is game state stored?**
The game state can be stored in memory on the Node.js server (e.g., in a Map mapping room IDs to `chess.js` instances). For persistence across server restarts, it would be serialized to a database (e.g., Redis or MongoDB).

**Who decides whose turn it is?**
The `chess.js` instance on the server keeps track of turns. It strictly enforces that only the player whose turn it is can make a valid move.

## Synchronization

**What happens if both players move simultaneously?**
Because Node.js is single-threaded, events are processed one at a time. The first move event to reach the server will be processed and validated. The second move will then be evaluated against the *new* state and will likely be invalid (since it's not their turn anymore).

**Race condition?**
The Node.js event loop's single-threaded nature prevents typical multithreaded race conditions on the game state. Processing a move is a synchronous operation inside the event loop, ensuring atomic updates to the `chess.js` state.

**Event ordering?**
TCP guarantees ordered delivery of packets. Socket.IO, running over WebSockets (TCP), ensures that events from a single client arrive in the order they were sent.

**Packet loss?**
TCP handles packet retransmission automatically at the protocol level. If the connection drops completely, Socket.IO handles the reconnection.

**Network delay?**
Latency can cause visual delays. The client can use optimistic UI updates (moving the piece immediately on the screen) but must revert it if the server rejects the move.

**Reconnection logic?**
Socket.IO handles reconnection automatically. Upon reconnecting, the client needs to request the current game state from the server to sync their board.

**What happens if someone refreshes?**
The Socket.IO connection is lost, triggering a `disconnect` event on the server. Upon refresh, a new connection is made. The application needs logic (like user sessions or cookies) to re-associate the new socket with the ongoing game and send them the current board state.

## Scaling

**Can one server support 100,000 games?**
It depends on the server specs, but likely not on a single process. Node.js can handle many concurrent connections, but 100,000 active games (200,000 WebSockets) will consume significant memory (for `chess.js` instances) and CPU.

**How would Redis help?**
Redis can be used to store the game state (using FEN strings) instead of keeping it all in Node.js memory. This makes the game stateless from the Node server's perspective, allowing horizontal scaling.

**Would Socket.IO Redis adapter help?**
Yes. If you scale to multiple Node.js instances, clients connected to different servers can't communicate directly. The Redis adapter acts as a message broker (pub/sub), routing Socket.IO messages (like broadcasts to a room) across different server instances.

**How would sticky sessions work?**
Sticky sessions ensure that a client's requests are always routed to the same server instance. This is required if the Socket.IO transport falls back to long-polling, as the server needs the connection state. Load balancers (like Nginx) handle this using IP hashing or cookies.

**How would Kubernetes deploy this?**
You would containerize the Node.js app using Docker. Kubernetes would manage a Deployment with multiple replicas (pods) for scaling. You'd use a LoadBalancer Service to route traffic, and you must configure sticky sessions on your Ingress controller if not using pure WebSockets. A separate Redis deployment or managed Redis service would handle the Socket.IO adapter and game state.

## Performance

**Why event-driven architecture?**
It allows the server to handle many concurrent connections without spawning a new thread for each. It's perfectly suited for I/O bound tasks like waiting for network packets (WebSocket messages), maximizing CPU utilization.

**Explain Node.js event loop.**
It's a loop that continually checks for and executes callbacks associated with asynchronous operations. Phases include timers, pending callbacks, poll (waiting for new I/O events), check (`setImmediate`), and close callbacks. It offloads heavy operations to the system kernel or a thread pool.

**What are microtasks?**
Microtasks (like Promise callbacks and `process.nextTick`) are queued and executed *immediately after* the currently executing script and before the event loop moves to the next phase. They have higher priority than macrotasks (like `setTimeout`).

**Why asynchronous programming?**
To prevent blocking the main thread. If validating a move or saving to a database blocked the thread, no other players could make moves or connect while that operation finished.

**What causes latency?**
Physical distance between the client and server (network latency), server processing time (CPU overload), garbage collection pauses in Node.js, and inefficient database queries or state updates.

**How did you reduce synchronization latency?**
By using WebSockets for a persistent connection (avoiding HTTP handshake overhead), keeping the game state in memory (or a fast in-memory store like Redis) rather than querying a relational DB for every move, and relying on the fast, synchronous move validation of `chess.js`.