const copyButtons = document.querySelectorAll(".copy-contact");
const status = document.querySelector("#copy-status");
const feedbackButton = document.querySelector("#feedback-contact");
const feedbackDialog = document.querySelector("#feedback-dialog");
const feedbackDialogClose = document.querySelector("#feedback-dialog-close");

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const originalKey = "copyContact";
    try {
      await copyText(button.dataset.copy);
      button.textContent = window.LLMStormI18n.t("copiedContact");
      status.textContent = `${window.LLMStormI18n.t("copiedContact")}: ${button.dataset.copy}`;
      window.setTimeout(() => {
        button.textContent = window.LLMStormI18n.t(originalKey);
      }, 1600);
    } catch {
      status.textContent = button.dataset.copy;
    }
  });
});

feedbackButton.addEventListener("click", () => feedbackDialog.showModal());
feedbackDialogClose.addEventListener("click", () => feedbackDialog.close());
feedbackDialog.addEventListener("click", (event) => {
  if (event.target === feedbackDialog) feedbackDialog.close();
});
