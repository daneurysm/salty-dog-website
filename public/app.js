const profilesContainer = document.querySelector('#dog-profiles');
let profiles = Array.isArray(window.SALTY_DOG_PROFILES) ? window.SALTY_DOG_PROFILES : [];

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function renderProfile(profile) {
  const cardId = `dog-${profile.slug}`;
  const adopted = String(profile.status).toLowerCase() === 'adopted';
  const facts = [profile.age, profile.sex, profile.breed].filter(Boolean);
  const photos = Array.isArray(profile.photos) ? profile.photos : [];
  const mainPhoto = photos[0] || '';
  const gallery = photos.map((photo, photoIndex) => `
    <button class="gallery-thumb${photoIndex === 0 ? ' active' : ''}" type="button" data-gallery-src="${escapeHtml(photo)}" data-card-id="${escapeHtml(cardId)}" aria-label="View another photo of ${escapeHtml(profile.name)}">
      <img src="${escapeHtml(photo)}" alt="">
    </button>`).join('');
  const health = (profile.health || []).map((note) => `<span>${escapeHtml(note)}</span>`).join('');

  return `
    <article class="pet-card" id="${escapeHtml(cardId)}">
      <div class="pet-photo-wrap">
        <img class="pet-main-photo" src="${escapeHtml(mainPhoto)}" alt="${escapeHtml(profile.name)}, ${escapeHtml(profile.breed)}">
        <span class="status-pill">${escapeHtml(profile.status)}</span>
        ${adopted ? '<span class="adopted-overlay">ADOPTED</span>' : ''}
        ${gallery ? `<div class="pet-gallery" aria-label="More photos of ${escapeHtml(profile.name)}">${gallery}</div>` : ''}
      </div>
      <div class="pet-content">
        <div class="pet-title-row">
          <div>
            <p class="eyebrow">${profile.status.toLowerCase() === 'available' ? 'Available for adoption' : escapeHtml(profile.status)}</p>
            <h3 class="profile-name">${escapeHtml(profile.name)}</h3>
          </div>
          <span class="heart" aria-hidden="true">♡</span>
        </div>
        <ul class="pet-facts" aria-label="Animal details">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>
        <p class="profile-description">${escapeHtml(profile.description)}</p>
        ${health ? `<div class="health-notes">${health}</div>` : ''}
        <a class="text-link" href="#adopt">Learn about adopting <span aria-hidden="true">→</span></a>
      </div>
    </article>`;
}

async function loadProfiles() {
  try {
    const response = await fetch('/api/dogs', { cache: 'no-store' });
    if (!response.ok) throw new Error('Profiles unavailable');
    const data = await response.json();
    if (data.enabled === true && Array.isArray(data.profiles)) profiles = data.profiles;
    else if (data.enabled !== false) throw new Error('Invalid profile response');
    profilesContainer.innerHTML = profiles.length
      ? profiles.map(renderProfile).join('')
      : '<p class="profile-error">No animal profiles are available right now. Please contact the rescue for updates.</p>';
  } catch {
    // Do not resurrect old Available listings when the live database is down.
    profilesContainer.innerHTML = '<p class="profile-error">Dog profiles are temporarily unavailable. Please call the rescue at <a href="tel:+13605809927">(360) 580-9927</a>.</p>';
  }
}
loadProfiles();

profilesContainer.addEventListener('click', (event) => {
  const button = event.target.closest('[data-gallery-src]');
  if (!button) return;
  const card = document.querySelector(`#${CSS.escape(button.dataset.cardId)}`);
  card.querySelector('.pet-main-photo').src = button.dataset.gallerySrc;
  card.querySelectorAll('[data-gallery-src]').forEach((thumb) => thumb.classList.remove('active'));
  button.classList.add('active');
});


// Enhance ordinary section links into accessible tabs. Without JavaScript,
// the links still lead to the original, fully visible sections.
(() => {
  const tablist = document.querySelector('#section-nav');
  const tabs = [...tablist.querySelectorAll('a')];
  const panels = tabs.map(tab => document.querySelector(tab.hash));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  tablist.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
  });

  function selectTab(index, { scroll = false, focus = false } = {}) {
    tabs.forEach((tab, current) => {
      const selected = current === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[current].hidden = !selected;
    });
    document.dispatchEvent(new CustomEvent('rescue:sectionchange', { detail: { id: panels[index].id } }));
    if (focus) tabs[index].focus({ preventScroll: true });
    if (scroll) tablist.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  function tabForHash(hash) {
    return panels.findIndex(panel => hash === `#${panel.id}` || (hash.startsWith('#dog-') && panel.id === 'animals'));
  }

  function navigate(index, focus = false) {
    if (window.location.hash !== tabs[index].hash) {
      history.pushState(null, '', tabs[index].hash);
    }
    selectTab(index, { scroll: true, focus });
  }

  tablist.addEventListener('keydown', event => {
    const current = tabs.indexOf(event.target);
    if (current === -1) return;
    let next;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (current + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    navigate(next, true);
  });

  // Also handles hero buttons, dog adoption links, and contact shortcuts.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const index = tabForHash(link.hash);
    if (index === -1) return;
    event.preventDefault();
    navigate(index, tabs.includes(link));
    if (link.dataset.contactTopic) document.querySelector('#contact-name').focus({ preventScroll: true });
  });

  function restoreTab() {
    const index = tabForHash(window.location.hash);
    selectTab(index === -1 ? 0 : index, { scroll: index !== -1 });
  }
  window.addEventListener('hashchange', restoreTab);
  restoreTab();
})();
