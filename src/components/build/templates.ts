// Starting points for a new project.
//
// Each one is small enough to read in a sitting, runs the moment it is
// created, and is commented the way a student would want it explained — what
// each part is FOR, not what each keyword means. They are plain HTML, CSS and
// JavaScript with no libraries, so nothing in them is magic: every effect on
// screen is caused by a line the student can find.
//
// "Blank" stays a single file on purpose. A blank project used to arrive with
// index.html, style.css and script.js already made, and that empty layout
// decided how every project was split up before the student had written a
// line. One page that runs is a better blank.

import type { Project } from "@/types";
import { createEmptyProject, createFile } from "@/lib/fileSystem";

export type TemplateIcon = "file" | "game" | "quiz" | "user" | "pages" | "brush";

export interface ProjectTemplate {
  id: string;
  title: string;
  description: string;
  icon: TemplateIcon;
  /** What the project is called if the student does not rename it. */
  defaultName: string;
  files: Record<string, string>;
}

const BLANK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Project</title>
  <style>
    /* The whole page: centred, with a calm background. */
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, sans-serif;
      background: #f4f1ff;
      color: #1d1b2f;
      text-align: center;
    }
    h1 { font-size: 2.2rem; margin-bottom: 0.4rem; }
    button {
      font: inherit;
      padding: 0.6rem 1.2rem;
      border: 0;
      border-radius: 999px;
      background: #6c5ce7;
      color: white;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main>
    <h1>Hello!</h1>
    <p>This page is yours. Change the words, then change the colours.</p>
    <button id="wave">Click me</button>
  </main>

  <script>
    // Find the button on the page, and say hello in the console when it is
    // clicked. Open the Console tab under the preview to see it.
    const button = document.querySelector("#wave");
    button.addEventListener("click", () => {
      console.log("Hi there! The button works.");
    });
  </script>
</body>
</html>
`;

const GAME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Space Dodge</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Space Dodge</h1>
  <p class="help">Move with ← → (or tap the sides). Dodge the rocks!</p>
  <!-- Everything in the game is drawn on this canvas by game.js. -->
  <canvas id="game" width="480" height="320"></canvas>
  <p class="score">Score: <span id="score">0</span></p>
  <script src="game.js"></script>
</body>
</html>
`;

const GAME_CSS = `body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0b0d1f;
  color: #e8e9ff;
  font-family: system-ui, sans-serif;
}

h1 { margin: 0 0 4px; letter-spacing: 1px; }
.help { margin: 0 0 12px; opacity: 0.7; font-size: 14px; }
.score { font-size: 18px; }

/* The canvas keeps its shape on small screens. */
canvas {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  background: #13163a;
  box-shadow: 0 0 0 2px #2b2f6b;
}
`;

const GAME_JS = `// SPACE DODGE
// A ship at the bottom, rocks falling from the top. Every frame we:
//   1. move things,  2. check for crashes,  3. draw everything again.

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreText = document.querySelector("#score");

// The player's ship. x is its centre.
const ship = { x: canvas.width / 2, y: canvas.height - 30, size: 18, speed: 5 };

let rocks = [];      // every falling rock
let score = 0;
let gameOver = false;
const keys = {};     // which arrow keys are held down right now

// Remember which keys are pressed, so movement is smooth.
document.addEventListener("keydown", (event) => { keys[event.key] = true; });
document.addEventListener("keyup", (event) => { keys[event.key] = false; });

// On a touch screen, holding the left or right half of the canvas steers.
canvas.addEventListener("pointerdown", (event) => {
  const left = event.offsetX < canvas.clientWidth / 2;
  keys[left ? "ArrowLeft" : "ArrowRight"] = true;
});
canvas.addEventListener("pointerup", () => { keys.ArrowLeft = keys.ArrowRight = false; });

// Click (or press Space) to play again after a crash.
canvas.addEventListener("click", () => { if (gameOver) restart(); });
document.addEventListener("keydown", (event) => { if (event.key === " " && gameOver) restart(); });

function addRock() {
  rocks.push({
    x: Math.random() * canvas.width,
    y: -20,
    size: 10 + Math.random() * 14,
    speed: 2 + Math.random() * 2 + score / 300, // rocks get faster as you score
  });
}

function update() {
  if (keys.ArrowLeft) ship.x -= ship.speed;
  if (keys.ArrowRight) ship.x += ship.speed;
  // Keep the ship on the screen.
  ship.x = Math.max(ship.size, Math.min(canvas.width - ship.size, ship.x));

  if (Math.random() < 0.04) addRock();

  for (const rock of rocks) {
    rock.y += rock.speed;
    // A crash: the rock's centre is closer to the ship than both sizes together.
    const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y);
    if (distance < rock.size + ship.size * 0.7) gameOver = true;
  }
  // Rocks that fell off the bottom are gone, and each one is a point.
  const before = rocks.length;
  rocks = rocks.filter((rock) => rock.y < canvas.height + 30);
  score += before - rocks.length;
  scoreText.textContent = score;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // The ship: a triangle pointing up.
  ctx.fillStyle = "#8b7bff";
  ctx.beginPath();
  ctx.moveTo(ship.x, ship.y - ship.size);
  ctx.lineTo(ship.x - ship.size, ship.y + ship.size);
  ctx.lineTo(ship.x + ship.size, ship.y + ship.size);
  ctx.closePath();
  ctx.fill();

  // The rocks: grey circles.
  ctx.fillStyle = "#9aa0c7";
  for (const rock of rocks) {
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, rock.size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.font = "bold 28px system-ui";
    ctx.fillText("Crash! Score: " + score, canvas.width / 2, canvas.height / 2);
    ctx.font = "16px system-ui";
    ctx.fillText("Click or press Space to play again", canvas.width / 2, canvas.height / 2 + 30);
  }
}

function restart() {
  rocks = [];
  score = 0;
  gameOver = false;
}

// The game loop: runs about 60 times a second.
function frame() {
  if (!gameOver) update();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
`;

const QUIZ_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Planet Quiz</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="card">
    <p class="progress" id="progress"></p>
    <h1 id="question">Loading…</h1>
    <!-- quiz.js puts one button per answer in here. -->
    <div class="answers" id="answers"></div>
    <p class="feedback" id="feedback"></p>
    <button class="next" id="next" hidden>Next question</button>
  </main>
  <script src="quiz.js"></script>
</body>
</html>
`;

const QUIZ_CSS = `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 16px;
  box-sizing: border-box;
  font-family: system-ui, sans-serif;
  background: linear-gradient(135deg, #1e3a8a, #6d28d9);
}

.card {
  width: min(460px, 100%);
  padding: 28px;
  border-radius: 20px;
  background: white;
  color: #1f2340;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.progress { margin: 0; color: #6b7280; font-size: 14px; }
h1 { font-size: 1.5rem; margin: 6px 0 18px; }

.answers { display: grid; gap: 10px; }
.answers button {
  font: inherit;
  text-align: left;
  padding: 12px 14px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  cursor: pointer;
}
.answers button:hover { border-color: #6d28d9; }
.answers button.right { border-color: #16a34a; background: #dcfce7; }
.answers button.wrong { border-color: #dc2626; background: #fee2e2; }

.feedback { min-height: 1.4em; font-weight: 600; }
.next {
  font: inherit;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  background: #6d28d9;
  color: white;
  cursor: pointer;
}
`;

const QUIZ_JS = `// PLANET QUIZ
// The questions live in this list. Add your own: each needs the question,
// the possible answers, and the number of the right one (counting from 0).
const questions = [
  { question: "Which planet is closest to the Sun?", answers: ["Venus", "Mercury", "Mars"], correct: 1 },
  { question: "Which planet has the biggest rings?", answers: ["Saturn", "Jupiter", "Neptune"], correct: 0 },
  { question: "What is the largest planet?", answers: ["Earth", "Saturn", "Jupiter"], correct: 2 },
  { question: "Which planet is known as the Red Planet?", answers: ["Mars", "Venus", "Uranus"], correct: 0 },
];

let current = 0; // which question we are on
let score = 0;

const progress = document.querySelector("#progress");
const questionText = document.querySelector("#question");
const answersBox = document.querySelector("#answers");
const feedback = document.querySelector("#feedback");
const nextButton = document.querySelector("#next");

function showQuestion() {
  const q = questions[current];
  progress.textContent = "Question " + (current + 1) + " of " + questions.length;
  questionText.textContent = q.question;
  feedback.textContent = "";
  nextButton.hidden = true;

  // Make one button per answer.
  answersBox.innerHTML = "";
  q.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.textContent = answer;
    button.addEventListener("click", () => choose(index, button));
    answersBox.appendChild(button);
  });
}

function choose(index, button) {
  const q = questions[current];
  const buttons = answersBox.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true)); // one answer per question

  if (index === q.correct) {
    score++;
    button.classList.add("right");
    feedback.textContent = "Correct!";
  } else {
    button.classList.add("wrong");
    buttons[q.correct].classList.add("right");
    feedback.textContent = "Not quite — the right answer is shown in green.";
  }
  nextButton.hidden = false;
}

nextButton.addEventListener("click", () => {
  // After the last question the same button starts the quiz again.
  if (current >= questions.length) {
    current = 0;
    score = 0;
    nextButton.textContent = "Next question";
    showQuestion();
    return;
  }
  current++;
  if (current < questions.length) {
    showQuestion();
  } else {
    showResult();
  }
});

function showResult() {
  progress.textContent = "All done!";
  questionText.textContent = "You scored " + score + " out of " + questions.length;
  answersBox.innerHTML = "";
  feedback.textContent = score === questions.length ? "Perfect score!" : "Try again to beat it.";
  nextButton.textContent = "Play again";
  nextButton.hidden = false;
}

showQuestion();
`;

const PORTFOLIO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alex — Portfolio</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- The top of the page: who you are, in one line. -->
  <header class="hero">
    <p class="hello">Hi, I'm</p>
    <h1>Alex Rivera</h1>
    <p class="tagline">I make games, websites and the occasional robot.</p>
    <a class="button" href="#projects">See my projects</a>
  </header>

  <section class="about">
    <h2>About me</h2>
    <p>I'm a student who loves building things. Change this paragraph to tell people what you like, what you're learning, and what you want to make next.</p>
  </section>

  <section id="projects">
    <h2>Projects</h2>
    <!-- One .card per project. Copy one to add another. -->
    <div class="grid">
      <article class="card">
        <h3>Space Dodge</h3>
        <p>A browser game where you steer a ship through falling rocks.</p>
      </article>
      <article class="card">
        <h3>Planet Quiz</h3>
        <p>A quiz about the solar system, with a score at the end.</p>
      </article>
      <article class="card">
        <h3>Weather Watch</h3>
        <p>A page that shows the weather with friendly icons.</p>
      </article>
    </div>
  </section>

  <footer>
    <p>Made by me · <span id="year"></span></p>
  </footer>

  <script>
    // Always the current year, so the footer never goes out of date.
    document.querySelector("#year").textContent = new Date().getFullYear();
  </script>
</body>
</html>
`;

const PORTFOLIO_CSS = `/* Colours used across the page, in one place, so changing the whole look
   is a matter of changing these lines. */
:root {
  --ink: #1b1b2f;
  --paper: #fffaf3;
  --accent: #ff6b6b;
  --soft: #ffe8e1;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--paper);
  color: var(--ink);
  line-height: 1.6;
}

section, .hero, footer {
  max-width: 820px;
  margin: 0 auto;
  padding: 48px 20px;
}

.hero { padding-top: 80px; }
.hello { margin: 0; color: var(--accent); font-weight: 700; }
h1 { font-size: clamp(2.4rem, 7vw, 4rem); margin: 0; line-height: 1.1; }
.tagline { font-size: 1.2rem; opacity: 0.8; }

.button {
  display: inline-block;
  margin-top: 12px;
  padding: 12px 22px;
  border-radius: 999px;
  background: var(--accent);
  color: white;
  text-decoration: none;
  font-weight: 600;
}

/* Cards that wrap to fit any screen: as many columns as will fit. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.card {
  padding: 18px;
  border-radius: 16px;
  background: white;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s ease;
}
.card:hover { transform: translateY(-4px); }
.card h3 { margin-top: 0; }

footer { text-align: center; opacity: 0.6; font-size: 14px; }
`;

const NAV = (active: string) => `  <nav class="nav">
    <a href="index.html"${active === "index" ? ' class="active"' : ""}>Home</a>
    <a href="about.html"${active === "about" ? ' class="active"' : ""}>About</a>
    <a href="contact.html"${active === "contact" ? ' class="active"' : ""}>Contact</a>
  </nav>`;

const page = (title: string, active: string, body: string, script = "") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Bake Club</title>
  <!-- Every page shares one stylesheet, so the site looks the same everywhere. -->
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- The same menu on every page. Each link opens another file in this project. -->
${NAV(active)}
  <main>
${body}
  </main>${script}
</body>
</html>
`;

const SITE_CSS = `body {
  margin: 0;
  font-family: Georgia, serif;
  background: #fdf6ec;
  color: #3b2a1a;
}

.nav {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 14px;
  background: #3b2a1a;
}
.nav a {
  color: #fdf6ec;
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 999px;
  font-family: system-ui, sans-serif;
}
/* The page you are on is highlighted. */
.nav a.active { background: #e0a458; color: #3b2a1a; }

main { max-width: 680px; margin: 0 auto; padding: 32px 20px; line-height: 1.7; }
h1 { font-size: 2.4rem; margin-bottom: 0; }

form { display: grid; gap: 10px; max-width: 360px; }
input, textarea, button { font: inherit; padding: 10px; border-radius: 10px; border: 1px solid #d6c3a8; }
button { background: #e0a458; border: 0; cursor: pointer; }
`;

const DRAW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sketch Pad</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="tools">
    <!-- draw.js turns each colour into a swatch button. -->
    <div id="colours" class="colours"></div>
    <label>Size <input id="size" type="range" min="2" max="40" value="8"></label>
    <button id="clear">Clear</button>
  </header>
  <canvas id="pad"></canvas>
  <script src="draw.js"></script>
</body>
</html>
`;

const DRAW_CSS = `body {
  margin: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: system-ui, sans-serif;
  background: #f1f5f9;
}

.tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: white;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.colours { display: flex; gap: 6px; }
.colours button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid white;
  box-shadow: 0 0 0 1px #cbd5e1;
  cursor: pointer;
}
/* The colour you are drawing with gets a dark ring. */
.colours button.picked { box-shadow: 0 0 0 2px #0f172a; }

#clear { font: inherit; padding: 6px 14px; border-radius: 999px; border: 1px solid #cbd5e1; background: white; cursor: pointer; }

/* The canvas fills the rest of the page. */
canvas { flex: 1; width: 100%; background: white; touch-action: none; cursor: crosshair; }
`;

const DRAW_JS = `// SKETCH PAD
// Press and drag to draw. Pointer events work for a mouse, a finger and a pen.

const canvas = document.querySelector("#pad");
const ctx = canvas.getContext("2d");
const sizeSlider = document.querySelector("#size");
const colourBox = document.querySelector("#colours");

const colours = ["#0f172a", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];
let colour = colours[0];
let drawing = false;

// The canvas has to know its real size in pixels, or lines come out blurry.
function fitCanvas() {
  if (!canvas.clientWidth || !canvas.clientHeight) return; // not on screen yet
  // Resizing a canvas wipes it, so the drawing is copied out and put back.
  const saved = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  ctx.putImageData(saved, 0, 0);
}
window.addEventListener("resize", fitCanvas);
fitCanvas();

// One swatch button per colour.
for (const c of colours) {
  const swatch = document.createElement("button");
  swatch.style.background = c;
  swatch.title = c;
  if (c === colour) swatch.classList.add("picked");
  swatch.addEventListener("click", () => {
    colour = c;
    colourBox.querySelectorAll("button").forEach((b) => b.classList.remove("picked"));
    swatch.classList.add("picked");
  });
  colourBox.appendChild(swatch);
}

canvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  ctx.beginPath();
  ctx.moveTo(event.offsetX, event.offsetY);
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  ctx.lineTo(event.offsetX, event.offsetY);
  ctx.strokeStyle = colour;
  ctx.lineWidth = sizeSlider.value;
  ctx.lineCap = "round";   // round ends make smooth lines
  ctx.lineJoin = "round";
  ctx.stroke();
});

// Stop drawing when the button is let go, or the pointer leaves the canvas.
canvas.addEventListener("pointerup", () => (drawing = false));
canvas.addEventListener("pointerleave", () => (drawing = false));

document.querySelector("#clear").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
`;

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    title: "Blank web page",
    description: "One page that runs. Start from nothing, or tell Panda what to build.",
    icon: "file",
    defaultName: "My Project",
    files: { "index.html": BLANK_HTML },
  },
  {
    id: "canvas",
    title: "Canvas game",
    description: "Steer a ship through falling rocks. A game loop, keys and collisions.",
    icon: "game",
    defaultName: "Space Dodge",
    files: { "index.html": GAME_HTML, "style.css": GAME_CSS, "game.js": GAME_JS },
  },
  {
    id: "quiz",
    title: "Quiz app",
    description: "Questions, answers and a score. Swap in your own questions.",
    icon: "quiz",
    defaultName: "Planet Quiz",
    files: { "index.html": QUIZ_HTML, "style.css": QUIZ_CSS, "quiz.js": QUIZ_JS },
  },
  {
    id: "portfolio",
    title: "Portfolio",
    description: "A one-page site about you and the things you have made.",
    icon: "user",
    defaultName: "My Portfolio",
    files: { "index.html": PORTFOLIO_HTML, "style.css": PORTFOLIO_CSS },
  },
  {
    id: "multipage",
    title: "Multi-page site",
    description: "Three pages with a shared menu and one stylesheet. Links just work.",
    icon: "pages",
    defaultName: "Bake Club",
    files: {
      "index.html": page(
        "Home",
        "index",
        `    <h1>Bake Club</h1>
    <p>We meet every Friday to bake something new and eat it straight away.</p>
    <p>Use the menu above to visit the other pages. Each one is its own .html file.</p>`,
      ),
      "about.html": page(
        "About",
        "about",
        `    <h1>About us</h1>
    <p>Bake Club started with one batch of very flat cookies. We've got better since.</p>
    <ul>
      <li>Friday after school, room 12</li>
      <li>Everyone welcome, no experience needed</li>
    </ul>`,
      ),
      "contact.html": page(
        "Contact",
        "contact",
        `    <h1>Say hello</h1>
    <form id="hello">
      <input name="name" placeholder="Your name" required>
      <textarea name="message" placeholder="Your message" rows="4"></textarea>
      <button>Send</button>
    </form>
    <p id="thanks"></p>`,
        `
  <script>
    // There is no server to send to, so the form just says thank you.
    document.querySelector("#hello").addEventListener("submit", (event) => {
      event.preventDefault();
      const name = event.target.elements.name.value;
      document.querySelector("#thanks").textContent = "Thanks, " + name + "! See you on Friday.";
    });
  </script>`,
      ),
      "style.css": SITE_CSS,
    },
  },
  {
    id: "drawing",
    title: "Drawing app",
    description: "A sketch pad with colours and brush sizes. Works with a mouse or a finger.",
    icon: "brush",
    defaultName: "Sketch Pad",
    files: { "index.html": DRAW_HTML, "style.css": DRAW_CSS, "draw.js": DRAW_JS },
  },
];

export function findTemplate(id: string): ProjectTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** A brand-new project made from a template, ready to save. */
export function projectFromTemplate(id: string, name: string): Project {
  const template = findTemplate(id);
  const project = createEmptyProject(name.trim() || template.defaultName);
  for (const [path, content] of Object.entries(template.files)) createFile(project, path, content);
  return project;
}
