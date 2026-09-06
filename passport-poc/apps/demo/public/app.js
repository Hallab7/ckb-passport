document.addEventListener("DOMContentLoaded", () => {
  const link = document.getElementById("demoLink");
  if (link instanceof HTMLAnchorElement) {
    link.href = window.location.origin;
  }
});
