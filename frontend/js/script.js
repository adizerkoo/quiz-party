// Эта функция скрывает все экраны и показывает только тот, который нам нужен
function showScreen(screenId) {
    // 1. Находим все элементы с классом 'screen' и прячем их
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.style.display = 'none';
    });

    // 2. Находим нужный нам экран по его ID и показываем его
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.style.display = 'flex'; // Используем flex, чтобы карточка была по центру
    }
}

// Эта функция сработает, когда кто-то захочет создать игру
function finishCreate() {
    alert("Игра создана! (Пока что это имитация)");
    showScreen('screen-host'); // Переключаем на экран ведущего
}

// Функция для входа в игру
function joinGame() {
    const code = document.getElementById('join-room-code').value;
    if (code !== "") {
        showScreen('screen-player'); // Переключаем на экран игрока
    } else {
        alert("Введите код комнаты!");
    }
}

let quizQuestions = []; // Массив, где будем хранить наши вопросы

// Функция для добавления готового вопроса
function addPreset(text) {
    const question = {
        text: text,
        type: 'text' // По умолчанию текстовый ответ
    };
    quizQuestions.push(question);
    renderQuestions();
}

