/* =========================================
   ФОРМА СОЗДАНИЯ ВОПРОСА
   Переключение типа, добавление/редактирование
   вопроса, очистка формы, удаление вопроса.
   Динамическое управление вариантами ответов.
========================================= */

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const DEFAULT_OPTIONS = 4;


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


/* =========================================
   ДИНАМИЧЕСКИЕ ВАРИАНТЫ ОТВЕТОВ
   Рендер строк, добавление, удаление.
========================================= */

// --- Получить текущее количество вариантов ---
function getOptionCount() {
    return document.querySelectorAll('#options-list .opt-create-row').length;
}

// --- Собрать значения всех вариантов ---
function collectOptionValues() {
    const values = [];
    document.querySelectorAll('#options-list .opt-input').forEach(input => {
        values.push(input.value);
    });
    return values;
}

// --- Получить индекс выбранного правильного варианта ---
function getSelectedCorrectIndex() {
    const radio = document.querySelector('input[name="correct-opt"]:checked');
    return radio ? parseInt(radio.value) : 0;
}

// --- Отрисовать строки вариантов ответов ---
function renderOptionRows(count, values, correctIndex) {
    const list = document.getElementById('options-list');
    if (!list) return;
    list.innerHTML = '';
    count = Math.max(MIN_OPTIONS, Math.min(MAX_OPTIONS, count || DEFAULT_OPTIONS));

    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'opt-create-row';

        const wrapper = document.createElement('div');
        wrapper.className = 'input-with-clear';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `opt-${i + 1}`;
        input.className = 'opt-input';
        if (values && values[i] != null) input.value = values[i];

        const clearSpan = document.createElement('span');
        clearSpan.className = 'clear-input';
        clearSpan.textContent = '×';
        clearSpan.onclick = function() { clearSingleInput(this); };

        wrapper.appendChild(input);
        wrapper.appendChild(clearSpan);

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'correct-opt';
        radio.value = String(i);
        if (i === (correctIndex ?? 0)) radio.checked = true;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-option';
        removeBtn.title = 'Удалить вариант';
        removeBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        removeBtn.onclick = () => removeOptionRow(i);

        row.appendChild(wrapper);
        row.appendChild(radio);
        row.appendChild(removeBtn);
        list.appendChild(row);
    }

    updateAddOptionButton();
    updateCorrectHighlight();
    updateClearButtons();
}

// --- Обновить видимость кнопок добавления/удаления ---
function updateAddOptionButton() {
    const btn = document.getElementById('btn-add-option');
    const count = getOptionCount();
    if (btn) {
        btn.style.display = count >= MAX_OPTIONS ? 'none' : 'flex';
    }
    document.querySelectorAll('.btn-remove-option').forEach(b => {
        b.style.display = count <= MIN_OPTIONS ? 'none' : 'inline-flex';
    });
}

// --- Добавить новый вариант ---
function addOptionRow() {
    const count = getOptionCount();
    if (count >= MAX_OPTIONS) return;
    const values = collectOptionValues();
    const correctIndex = getSelectedCorrectIndex();
    renderOptionRows(count + 1, values, correctIndex);
    const newInput = document.getElementById(`opt-${count + 1}`);
    if (newInput) newInput.focus();
    saveDraftToLocal();
}

// --- Удалить вариант ---
function removeOptionRow(index) {
    const count = getOptionCount();
    if (count <= MIN_OPTIONS) return;
    const values = collectOptionValues();
    let correctIndex = getSelectedCorrectIndex();
    values.splice(index, 1);
    if (index === correctIndex) correctIndex = 0;
    else if (index < correctIndex) correctIndex -= 1;
    renderOptionRows(count - 1, values, correctIndex);
    saveDraftToLocal();
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
        const allOpts = collectOptionValues();
        for (let i = 0; i < allOpts.length; i++) {
            if (!allOpts[i].trim()) {
                showToast(`Заполните вариант ${i + 1}!`);
                return;
            }
            options.push(allOpts[i].trim());
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
        const correctIdx = q.options.indexOf(q.correct);
        renderOptionRows(q.options.length, q.options, correctIdx >= 0 ? correctIdx : 0);
    }

    document.getElementById('add-btn').innerText = "СОХРАНИТЬ ИЗМЕНЕНИЯ";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


// --- Очистить форму ---
function clearForm() {
    document.getElementById('q-input-text').value = "";
    document.getElementById('q-input-correct').value = "";

    renderOptionRows(DEFAULT_OPTIONS);

    const typeOptions = document.querySelectorAll('.type-option');
    if (typeOptions.length > 0) {
        selectType('text', typeOptions[0]);
    }
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
    const count = getOptionCount();
    renderOptionRows(count);
}
