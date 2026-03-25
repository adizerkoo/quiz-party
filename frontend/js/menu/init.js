/* =========================================
   ИНИЦИАЛИЗАЦИЯ МЕНЮ
   Авто-заполнение комнаты из URL,
   запрет зума на мобильных устройствах.
========================================= */


// === Авто-открытие модалки при переходе по ссылке с кодом комнаты ===
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');

    if (roomFromUrl) {
        if (typeof openJoinModal === 'function') {
            openJoinModal();

            const roomInput = document.getElementById('room-code');
            if (roomInput) {
                roomInput.value = roomFromUrl;
                roomInput.parentElement.classList.add('is-active');
            }

            const roomCodeInput = document.getElementById('room-code');
            if (roomCodeInput) {
                setTimeout(() => roomCodeInput.focus(), 400);
            }
        }
    }
});


// === Запрет зума через жесты ===
document.addEventListener('touchmove', function (event) {
    if (event.scale !== 1) {
        event.preventDefault();
    }
}, { passive: false });


// === Запрет зума через двойной тап ===
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
