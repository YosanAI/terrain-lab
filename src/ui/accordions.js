/** Only the settings region collapses; each section's quick actions stay visible. */
export function initializeAccordions(root = document) {
  for (const toggle of root.querySelectorAll('[data-settings-toggle]')) {
    toggle.addEventListener('click', () => {
      const panel = document.getElementById(toggle.getAttribute('aria-controls'));
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.querySelector('.settings-label').textContent = expanded ? 'Hide settings' : 'More settings';
      panel.hidden = !expanded;
    });
  }
}
