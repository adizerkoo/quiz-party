// JS-мост для host game WebView.
// Он перехватывает кнопку "Назад" внутри game.html и отправляет черновик
// обратно в native-экран создания вместо перехода на web create.html.
export function buildHostGameBridgeScript() {
  return `
    (function () {
      function buildNativeDraft() {
        var questions = Array.isArray(window.currentQuestions) ? window.currentQuestions : [];
        var title = typeof window.quizTitle === 'string' ? window.quizTitle : '';

        return {
          title: title,
          questions: questions,
          questionDraft: {
            questionText: '',
            questionType: 'text',
            correctText: '',
            options: ['', '', '', ''],
            selectedCorrectIndex: 0
          }
        };
      }

      window.goBackToEditor = function () {
        var payload = {
          type: 'back_to_native_create',
          draft: buildNativeDraft()
        };

        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      };
    })();
    true;
  `;
}
