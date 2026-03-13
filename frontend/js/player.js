let playerName = "";
let roomCode = "";

function joinGame() {
    const nameInput = document.getElementById('player-name');
    const codeInput = document.getElementById('join-room-code');

    if (nameInput && codeInput) {
        playerName = nameInput.value;
        roomCode = codeInput.value;

        if (playerName && roomCode) {
            // Сохраняем имя временно, чтобы не потерять при переходе
            sessionStorage.setItem('quiz_player_name', playerName);
            sessionStorage.setItem('quiz_room_code', roomCode);
            window.location.href = "game.html";
        } else {
            alert("Заполни все поля!");
        }
    }
}

// Если мы на странице игры и мы НЕ хост — мы игрок
window.onload = () => {
    if (window.location.pathname.includes('game.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('role') !== 'host') {
            const savedName = sessionStorage.getItem('quiz_player_name');
            if (savedName) {
                document.getElementById('q-text').innerText = `Привет, ${savedName}! Ждем вопроса...`;
            }
        }
    }
};

function sendAnswer(selectedOption = null) {
    const input = document.getElementById('answer-input');
    const answer = selectedOption || (input ? input.value : "");
    
    if (!answer) return;

    document.getElementById('player-answer-zone').innerHTML = `
        <div style="margin-top:20px;">
            <p>✅ Ответ отправлен!</p>
            <p style="font-size:0.8rem; opacity:0.6;">Ждем решения ведущего...</p>
        </div>
    `;
    console.log("Отправка ответа на сервер:", answer);
}