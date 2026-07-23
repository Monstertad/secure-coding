// data-confirm 속성이 붙은 폼 제출 전에 confirm() 확인창을 띄운다.
// CSP(script-src-attr 'none')로 인해 onsubmit="return confirm(...)" 같은
// 인라인 이벤트 핸들러를 쓸 수 없으므로, 외부 스크립트에서 addEventListener로 처리한다.

(function () {
  function attachConfirm(form) {
    form.addEventListener('submit', function (e) {
      var message = form.dataset.confirm;
      if (message && !window.confirm(message)) {
        e.preventDefault();
      }
    });
  }

  document.querySelectorAll('form[data-confirm]').forEach(attachConfirm);
})();
