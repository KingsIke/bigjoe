/**
 * Shared page components
 * Loads navbar and footer into pages that reference the respective placeholders
 */
(async function () {
  // Load navbar
  const navbarPlaceholder = document.getElementById("navbar-placeholder");
  if (navbarPlaceholder) {
    try {
      const res = await fetch("/components/navbar.html");
      if (res.ok) {
        const html = await res.text();
        navbarPlaceholder.outerHTML = html;
      }
    } catch (_) {}
  }

  // Load footer
  const footerPlaceholder = document.getElementById("site-footer");
  if (footerPlaceholder) {
    try {
      const res = await fetch("/components/footer.html");
      if (res.ok) {
        const html = await res.text();
        footerPlaceholder.outerHTML = html;
      }
    } catch (_) {}
  }
})();

// Global menu toggle (used by all pages)
function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('active');
}
