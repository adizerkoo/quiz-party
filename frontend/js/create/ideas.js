/* =========================================
   ИДЕИ ВОПРОСОВ
   Смена рандомной идеи под инпутом,
   вставка идеи в форму по клику.
========================================= */


// --- Показать следующую случайную идею ---
function changeIdea() {
    if (!questionsLibrary.length) return;

    const ideaText = document.getElementById("random-idea-text");

    ideaText.style.opacity = 0;
    ideaText.style.transform = "translateY(5px)";

    setTimeout(() => {
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * questionsLibrary.length);
        } while (questionsLibrary.length > 1 && questionsLibrary[randomIndex] === currentIdea);

        currentIdea = questionsLibrary[randomIndex];
        ideaText.textContent = currentIdea.text;
        ideaText.style.opacity = 1;
        ideaText.style.transform = "translateY(0)";
    }, 200);
}


// --- Вставить текущую идею в форму ---
function insertIdea() {
    if (!currentIdea) return;

    const questionInput = document.getElementById("q-input-text");
    const typeOptions = document.querySelectorAll(".type-option");

    if (questionInput) {
        questionInput.value = currentIdea.text;

        // Эффект вспышки при вставке
        questionInput.classList.add("idea-inserted");
        setTimeout(() => questionInput.classList.remove("idea-inserted"), 800);
    }

    if (currentIdea.type === "text") {
        selectType("text", typeOptions[0]);
        const correctInput = document.getElementById("q-input-correct");
        if (correctInput) correctInput.value = currentIdea.correct || "";
    } else if (currentIdea.type === "options") {
        selectType("options", typeOptions[1]);
        currentIdea.options.forEach((opt, i) => {
            const input = document.getElementById(`opt-${i + 1}`);
            if (input) input.value = opt;

            const radios = document.querySelectorAll('input[name="correct-opt"]');
            if (radios[i] && opt === currentIdea.correct) {
                radios[i].checked = true;
            }
        });
        updateCorrectHighlight();
    }

    updateClearButtons();
    saveDraftToLocal();
}
