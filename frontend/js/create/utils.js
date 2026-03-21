/* =========================================
   УТИЛИТЫ
   Тост-уведомления, подсветка правильного
   варианта, кнопки очистки инпутов.
========================================= */


// --- Всплывающее уведомление (toast) ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}


// --- Подсветка правильного варианта (зелёная рамка) ---
function updateCorrectHighlight() {
    document.querySelectorAll('.opt-create-row').forEach((row) => {
        const radio = row.querySelector('input[name="correct-opt"]');
        if (radio && radio.checked) {
            row.classList.add('correct-selected');
        } else {
            row.classList.remove('correct-selected');
        }
    });
}


// --- Показ/скрытие крестиков очистки во всех инпутах ---
function updateClearButtons() {
    document.querySelectorAll(".opt-input, .text-correct-input").forEach(input => {
        const wrapper = input.closest(".input-with-clear");
        const clearBtn = wrapper?.querySelector(".clear-input");
        if (clearBtn) {
            clearBtn.style.display = input.value ? "block" : "none";
        }
    });
}


// --- Очистка одного инпута по крестику ---
function clearSingleInput(el) {
    const input = el.previousElementSibling;
    input.value = "";
    el.style.display = "none";
}
