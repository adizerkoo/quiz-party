/* =========================================
   ФОРМА СОЗДАНИЯ ВОПРОСА
   Переключение типа, динамические варианты ответа,
   добавление/редактирование вопроса и очистка формы.
========================================= */

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const DEFAULT_OPTIONS = 4;

function clearCurrentDraftSourceLink() {
    currentQuestionSourcePublicId = null;
}

function selectType(type, element, options = {}) {
    const typeInput = document.getElementById('q-input-type');
    if (typeInput) {
        typeInput.value = type;
    }

    document.querySelectorAll('.type-option').forEach((option) => option.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }

    const optionFields = document.getElementById('options-fields');
    const correctAnswerZone = document.getElementById('correct-answer-zone');

    if (type === 'options') {
        if (optionFields) optionFields.style.display = 'block';
        if (correctAnswerZone) correctAnswerZone.style.display = 'none';
    } else {
        if (optionFields) optionFields.style.display = 'none';
        if (correctAnswerZone) correctAnswerZone.style.display = 'block';
    }

    if (!options.preserveSourceQuestion) {
        clearCurrentDraftSourceLink();
        saveDraftToLocal();
    }
}

function getOptionCount() {
    return document.querySelectorAll('#options-list .opt-create-row').length;
}

function collectOptionValues() {
    return Array.from(document.querySelectorAll('#options-list .opt-input'))
        .map((input) => input.value);
}

function getSelectedCorrectIndex() {
    const radio = document.querySelector('input[name="correct-opt"]:checked');
    return radio ? parseInt(radio.value, 10) : 0;
}

function renderOptionRows(count, values, correctIndex) {
    const list = document.getElementById('options-list');
    if (!list) {
        return;
    }

    list.innerHTML = '';
    const safeCount = Math.max(MIN_OPTIONS, Math.min(MAX_OPTIONS, count || DEFAULT_OPTIONS));

    for (let index = 0; index < safeCount; index += 1) {
        const row = document.createElement('div');
        row.className = 'opt-create-row';

        const wrapper = document.createElement('div');
        wrapper.className = 'input-with-clear';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `opt-${index + 1}`;
        input.className = 'opt-input';
        input.value = values?.[index] ?? '';

        const clearButton = document.createElement('span');
        clearButton.className = 'clear-input';
        clearButton.textContent = '×';
        clearButton.onclick = function () {
            clearSingleInput(this);
            clearCurrentDraftSourceLink();
            saveDraftToLocal();
        };

        wrapper.appendChild(input);
        wrapper.appendChild(clearButton);

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'correct-opt';
        radio.value = String(index);
        if (index === (correctIndex ?? 0)) {
            radio.checked = true;
        }

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn-remove-option';
        removeButton.title = 'Удалить вариант';
        removeButton.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        removeButton.onclick = () => removeOptionRow(index);

        row.appendChild(wrapper);
        row.appendChild(radio);
        row.appendChild(removeButton);
        list.appendChild(row);
    }

    updateAddOptionButton();
    updateCorrectHighlight();
    updateClearButtons();
}

function updateAddOptionButton() {
    const button = document.getElementById('btn-add-option');
    const count = getOptionCount();
    if (button) {
        button.style.display = count >= MAX_OPTIONS ? 'none' : 'flex';
    }
    document.querySelectorAll('.btn-remove-option').forEach((item) => {
        item.style.display = count <= MIN_OPTIONS ? 'none' : 'inline-flex';
    });
}

function addOptionRow() {
    const count = getOptionCount();
    if (count >= MAX_OPTIONS) {
        return;
    }
    clearCurrentDraftSourceLink();
    const values = collectOptionValues();
    const correctIndex = getSelectedCorrectIndex();
    renderOptionRows(count + 1, values, correctIndex);
    document.getElementById(`opt-${count + 1}`)?.focus();
    saveDraftToLocal();
}

function removeOptionRow(index) {
    const count = getOptionCount();
    if (count <= MIN_OPTIONS) {
        return;
    }
    clearCurrentDraftSourceLink();
    const values = collectOptionValues();
    let correctIndex = getSelectedCorrectIndex();
    values.splice(index, 1);
    if (index === correctIndex) {
        correctIndex = 0;
    } else if (index < correctIndex) {
        correctIndex -= 1;
    }
    renderOptionRows(count - 1, values, correctIndex);
    saveDraftToLocal();
}

function buildCurrentQuestionPayload() {
    const textElement = document.getElementById('q-input-text');
    const typeElement = document.getElementById('q-input-type');
    if (!textElement || !typeElement) {
        return null;
    }

    const text = textElement.value.trim();
    const type = typeElement.value === 'options' ? 'options' : 'text';
    if (!text) {
        showToast('Введите текст вопроса!');
        return null;
    }

    if (type === 'text') {
        const correct = document.getElementById('q-input-correct')?.value.trim() || '';
        if (!correct) {
            showToast('Укажите правильный ответ!');
            return null;
        }
        return {
            text,
            type,
            correct,
            options: null,
            source_question_public_id: currentQuestionSourcePublicId || null,
        };
    }

    const options = collectOptionValues().map((value) => value.trim());
    const emptyIndex = options.findIndex((value) => !value);
    if (emptyIndex >= 0) {
        showToast(`Заполните вариант ${emptyIndex + 1}!`);
        return null;
    }

    const selectedRadio = document.querySelector('input[name="correct-opt"]:checked');
    if (!selectedRadio) {
        showToast('Выберите правильный вариант!');
        return null;
    }

    const correct = options[parseInt(selectedRadio.value, 10)];
    return {
        text,
        type,
        correct,
        options,
        source_question_public_id: currentQuestionSourcePublicId || null,
    };
}

function addQuestionToList() {
    const questionData = buildCurrentQuestionPayload();
    if (!questionData) {
        return;
    }

    if (editIndex > -1) {
        quizQuestions[editIndex] = questionData;
        editIndex = -1;
        document.getElementById('add-btn').innerText = 'ДОБАВИТЬ ВОПРОС';
        showToast('Вопрос обновлен!');
    } else {
        quizQuestions.push(questionData);
        showToast('Вопрос добавлен!');
    }

    renderQuestions();
    clearForm();
    saveDraftToLocal();
}

function editQuestion(index) {
    const question = quizQuestions[index];
    if (!question) {
        return;
    }

    editIndex = index;
    currentQuestionSourcePublicId = question.source_question_public_id || null;
    document.getElementById('q-input-text').value = question.text || '';

    const typeOptions = document.querySelectorAll('.type-option');
    if (question.type === 'text') {
        selectType('text', typeOptions[0], { preserveSourceQuestion: true });
        document.getElementById('q-input-correct').value = question.correct || '';
    } else {
        selectType('options', typeOptions[1], { preserveSourceQuestion: true });
        const optionValues = Array.isArray(question.options) ? question.options : [];
        const correctIndex = optionValues.indexOf(question.correct);
        renderOptionRows(
            optionValues.length || DEFAULT_OPTIONS,
            optionValues,
            correctIndex >= 0 ? correctIndex : 0,
        );
    }

    document.getElementById('add-btn').innerText = 'СОХРАНИТЬ ИЗМЕНЕНИЯ';
    updateClearButtons();
    saveDraftToLocal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearForm(options = {}) {
    document.getElementById('q-input-text').value = '';
    document.getElementById('q-input-correct').value = '';
    renderOptionRows(DEFAULT_OPTIONS);

    const typeOptions = document.querySelectorAll('.type-option');
    if (typeOptions.length > 0) {
        selectType('text', typeOptions[0], { preserveSourceQuestion: true });
    }

    if (!options.preserveSourceQuestion) {
        clearCurrentDraftSourceLink();
    }

    if (!options.keepEditMode) {
        editIndex = -1;
        document.getElementById('add-btn').innerText = 'ДОБАВИТЬ ВОПРОС';
    }

    updateClearButtons();
}

function removeQuestion(index) {
    quizQuestions.splice(index, 1);
    renderQuestions();
    saveDraftToLocal();
    showToast('Вопрос удален');

    if (editIndex === index) {
        clearForm();
    } else if (editIndex > index) {
        editIndex -= 1;
    }
}

function clearOptions() {
    clearCurrentDraftSourceLink();
    renderOptionRows(getOptionCount());
    saveDraftToLocal();
}
