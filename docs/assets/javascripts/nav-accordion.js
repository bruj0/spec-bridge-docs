/**
 * Accordion navigation: when a top-level nav section is expanded,
 * collapse all other top-level sections.
 *
 * MkDocs Material uses hidden <input type="checkbox"> elements with the
 * class "md-nav__toggle" to control section expand/collapse state.
 * We listen for changes on those checkboxes and uncheck siblings.
 */
(function () {
  function initAccordion() {
    // Only target the top-level sidebar nav toggles (depth 1).
    // The primary sidebar nav is inside [data-md-type="navigation"].
    const sidebar = document.querySelector(
      '.md-sidebar--primary .md-nav[data-md-level="0"]'
    );
    if (!sidebar) return;

    const topLevelItems = sidebar.querySelectorAll(
      ':scope > .md-nav__list > .md-nav__item--nested'
    );

    topLevelItems.forEach((item) => {
      const toggle = item.querySelector(':scope > .md-nav__toggle');
      if (!toggle) return;

      toggle.addEventListener('change', function () {
        if (!this.checked) return;
        // Close every other top-level nested item.
        topLevelItems.forEach((sibling) => {
          if (sibling === item) return;
          const siblingToggle = sibling.querySelector(':scope > .md-nav__toggle');
          if (siblingToggle) siblingToggle.checked = false;
        });
      });
    });
  }

  // Run after the DOM is ready, and re-run on instant navigation (MkDocs Material
  // uses a custom router that swaps content without full page reloads).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccordion);
  } else {
    initAccordion();
  }

  // Re-attach on MkDocs Material instant navigation page transitions.
  document.addEventListener('DOMContentSwitch', initAccordion);
})();
