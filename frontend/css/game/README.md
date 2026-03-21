```
css/game/
├── index.css                  ← точка входа (только @import)
├── common/
│   ├── variables.css          ← :root, шрифты, body reset
│   ├── animations.css         ← все @keyframes
│   ├── base.css               ← .party-card, #host-screen, #player-screen
│   ├── buttons.css            ← btn-party-main, btn-answer, btn-mini, btn-send
│   ├── lobby.css              ← код комнаты, аватары, карточки игроков, lobby-main-card
│   ├── modal.css              ← .modern-confirm-overlay
│   └── utilities.css          ← .mini-label, .shiny-waiting, .shake-anim
├── host/
│   ├── question.css           ← #quiz-title, #host-question-text, #correct-answer
│   ├── progress.css           ← .q-step, .pulse-dot, #questions-progress
│   ├── scoreboard.css         ← #scoreboard, .scoreboard-card, ранги
│   └── answer-cards.css       ← .answer-card, .player-answer-bubble, .card-header
├── player/
│   ├── header.css             ← .player-header, .player-info-badge, .question-counter
│   ├── question.css           ← навигация, .question-container, .input-wrapper, .answers-grid
│   └── confirmation.css       ← .sent-confirmation, .your-answer-preview
└── results/
    ├── winner.css             ← .winner-card-epic, .crown-appear, .shiny-text-name
    ├── rating.css             ← .rating-label, .rank-number, .player-score-lobby
    └── review.css             ← аккордеон, .review-card, .answer-box, .other-player-card
```    