## Orbit Pong

A fast, arcade-style take on classic Pong set in space. Two players rally a glowing ball while dynamic cosmic wells (black and white holes) bend its path.

### Concept
- **Goal**: Be the first to reach 10 points.
- **Playfield**: A central net, two paddles, and a ball affected by gravity-like wells that periodically appear and fade.
- **Cosmic wells**: 
  - **Black holes** attract the ball (reduced strength to prevent orbit locks).
  - **White holes** repel the ball.
  - 2-4 wells spawn randomly with varied sizes (±25%) and lifetimes (10-20 seconds).
  - New wells regenerate 1 second after the previous set fades.
- **Powerups**: 5 floating powerups constantly move around the arena, affected by wells:
  - **Split** (orange): Creates 2 additional balls when collected by ball
  - **Fast** (amber): Speeds up ball for 15 seconds (ball collection only)
  - **Grow** (teal): Increases paddle size for 20 seconds (ball or paddle collection)
  - **Shrink** (red): Shrinks opponent's paddle for 20 seconds (ball or paddle collection)  
  - **Speed Up** (green): Increases paddle speed by 30% for 10 seconds (ball or paddle collection)
  - **Slow Down** (blue): Decreases opponent's paddle speed by 30% for 10 seconds (ball or paddle collection)
  - **Enhanced collision**: Balls have increased collection range; paddles can directly collect size/speed powerups

### Controls
- **Player 1**: `W` (up), `S` (down)
- **Player 2**: `Arrow Up` (up), `Arrow Down` (down)
- **Serve / Reset**: `Space`

### Rules & Flow
- Press the modal button or `Space` to start a match.
- When a point is scored, fireworks play and the game waits for `Space` to serve the next ball.
- Serving direction alternates based on who scored last to keep rallies fair.

### Ball & Paddles
- Ball speed starts moderate and increases slightly on paddle hits, with sensible minimum/maximum caps to keep play lively and readable.
- Paddles have snappy movement and are clamped to the playfield.

### Wells (Black/White Holes)
- A small set of wells appears at random positions within the arena.
- Each well has an influence radius. Inside it:
  - Black holes pull the ball inward.
  - White holes push the ball outward (stronger near the core).
- Visuals pulse subtly; wells fade in/out to telegraph their lifecycle.

### Tips
- Angle your returns: striking the ball near paddle edges changes its vertical velocity.
- Use wells: bank shots around attractive wells or slingshot from repulsive ones.
- Don't chase blindly—anticipate deflections as the ball enters a well's radius.
- Collect powerups strategically: ball collection affects the last player to hit the ball.
- Direct paddle collection: Move your paddle into size/speed powerups for immediate benefits.
- Watch ball colors: they change when powerups are active and return to white when effects expire.
- Multiple balls from Split powerups can overwhelm opponents—but they can collect powerups too!
- Increased collection range makes it easier to grab powerups with balls.

### How to Run
- Open `orbit-pong.html` in a modern desktop browser.
- Audio beeps require a user interaction (click the modal button or press `Space`).

### Files
- `orbit-pong.html` – markup and UI chrome (scorebar, modal, canvas)
- `orbit-pong.css` – styles, HUD, modal, effects
- `orbit-pong.js` – game loop, physics, wells, input, rendering


