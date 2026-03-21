/* =========================================
   ШАРИНГ И КОПИРОВАНИЕ КОДА КОМНАТЫ
   Копирование ссылки, нативный Share API,
   обработка кликов по коду комнаты.
========================================= */


// Поделиться ссылкой на комнату (нативный Share API или копирование)
function shareRoomLink() {
    const currentRoomCode = window.roomCode || document.getElementById('display-room-code').innerText;

    if (!currentRoomCode || currentRoomCode === "123456") {
        console.error("Код комнаты еще не готов");
        return;
    }

    const shareUrl = `${window.location.origin}/index.html?room=${currentRoomCode}`;

    if (navigator.share) {
        navigator.share({
            title: 'Quiz Party 🎉',
            text: `Заходи в мою игру! Код: ${currentRoomCode}`,
            url: shareUrl
        }).catch(() => {
            handleCopySequence();
        });
    } else {
        handleCopySequence();
    }
}


// Копирование ссылки комнаты в буфер + анимация
function handleCopySequence() {
    const container = document.querySelector('.code-inner-container');
    const codeElement = document.getElementById('display-room-code');
    const codeText = codeElement.innerText;

    const shareUrl = `${window.location.origin}/index.html?room=${codeText}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
        container.classList.add('is-copied');
        setTimeout(() => {
            container.classList.remove('is-copied');
        }, 1500);
    });
}


// Делегирование кликов по кнопкам копирования и шаринга
document.addEventListener('click', (e) => {
    if (e.target.closest('#copy-room-btn') || e.target.closest('#display-room-code')) {
        e.preventDefault();
        handleCopySequence();
    }

    if (e.target.closest('#share-room-btn')) {
        e.preventDefault();
        if (navigator.share) {
            shareRoomLink();
        } else {
            handleCopySequence();
        }
    }
});
