/* =========================================
   ФОРМА СОЗДАНИЯ ВОПРОСА
   Переключение типа, добавление/редактирование
   вопроса, очистка формы, удаление вопроса.
========================================= */


// --- Переключение типа ответа (текст / выбор) ---
function selectType(type, element) {
    const typeInput = document.getElementById('q-input-type');
    if (typeInput) typeInput.value = type;

    document.querySelectorAll('.type-option').forEach(opt => opt.classList.remove('active'));
    if (element) element.classList.add('active');

    const fields = document.getElementById('options-fields');
    const correctZone = document.getElementById('correct-answer-zone');

    if (type === 'options') {
        if (fields) fields.style.display = 'block';
        if (correctZone) correctZone.style.display = 'none';
    } else {
        if (fields) fields.style.display = 'none';
        if (correctZone) correctZone.style.display = 'block';
    }
}


// --- Добавить / обновить вопрос в списке ---
function addQuestionToList() {
    const textEl = document.getElementById('q-input-text');
    const typeEl = document.getElementById('q-input-type');

    if (!textEl || !typeEl) {
        console.error("Не найдены поля ввода текста или типа вопроса");
        return;
    }

    const type = typeEl.value;
    let correct = "";
    let options = [];

    if (!textEl.value.trim()) {
        showToast("Введите текст вопроса!");
        return;
    }

    if (type === 'text') {
        correct = document.getElementById('q-input-correct').value.trim();
        if (!correct) {
            showToast("Укажите правильный ответ!");
            return;
        }
    } else {
        for (let i = 1; i <= 4; i++) {
            const val = document.getElementById(`opt-${i}`).value.trim();
            if (!val) {
                showToast(`Заполните вариант ${i}!`);
                return;
            }
            options.push(val);
        }

        const selectedRadio = document.querySelector('input[name="correct-opt"]:checked');
        if (!selectedRadio) {
            showToast("Выберите правильный вариант!");
            return;
        }
        correct = options[parseInt(selectedRadio.value)];
    }

    const questionData = {
        text: textEl.value.trim(),
        type: type,
        correct: correct,
        options: type === 'options' ? options : null
    };

    if (editIndex > -1) {
        quizQuestions[editIndex] = questionData;
        editIndex = -1;
        document.getElementById('add-btn').innerText = "ДОБАВИТЬ ВОПРОС";
        showToast("Вопрос обновлен!");
    } else {
        quizQuestions.push(questionData);
        showToast("Вопрос добавлен!");
    }

    renderQuestions();
    clearForm();

    localStorage.setItem('quizQuestions', JSON.stringify(quizQuestions));
    localStorage.setItem('quizTitle', document.getElementById('quiz-title-input').value.trim());
}


// --- Загрузить вопрос в форму для редактирования ---
function editQuestion(index) {
    const q = quizQuestions[index];
    editIndex = index;

    document.getElementById('q-input-text').value = q.text;

    const typeOptions = document.querySelectorAll('.type-option');
    if (q.type === 'text') {
        selectType('text', typeOptions[0]);
        document.getElementById('q-input-correct').value = q.correct;
    } else {
        selectType('options', typeOptions[1]);
        q.options.forEach((opt, i) => {
            document.getElementById(`opt-${i + 1}`).value = opt;
            if (opt === q.correct) {
                document.querySelectorAll('input[name="correct-opt"]')[i].checked = true;
            }
        });
    }

    document.getElementById('add-btn').innerText = "СОХРАНИТЬ ИЗМЕНЕНИЯ";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


// --- Очистить форму ---
function clearForm() {
    document.getElementById('q-input-text').value = "";
    document.getElementById('q-input-correct').value = "";
    document.querySelectorAll('.opt-input').forEach(i => i.value = "");

    const typeOptions = document.querySelectorAll('.type-option');
    if (typeOptions.length > 0) {
        selectType('text', typeOptions[0]);
    }
    updateCorrectHighlight();
    updateClearButtons();
}


// --- Удалить вопрос из списка ---
function removeQuestion(index) {
    quizQuestions.splice(index, 1);
    renderQuestions();
    localStorage.setItem('quizQuestions', JSON.stringify(quizQuestions));
    showToast("Вопрос удален");
}


// --- Очистить все варианты ответов ---
function clearOptions() {
    document.querySelectorAll('.opt-input').forEach(input => input.value = "");

    const radios = document.querySelectorAll('input[name="correct-opt"]');
    if (radios.length) radios[0].checked = true;

    updateCorrectHighlight();
    updateClearButtons();
}
