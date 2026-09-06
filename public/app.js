const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('#primary-nav');
const profilesContainer = document.querySelector('#dog-profiles');
const profiles = Array.isArray(window.SALTY_DOG_PROFILES) ? window.SALTY_DOG_PROFILES : [];

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function renderProfile(profile) {
  const cardId = `dog-${profile.slug}`;
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

if (profiles.length) {
  profilesContainer.innerHTML = profiles.map(renderProfile).join('');
} else {
  profilesContainer.innerHTML = '<p class="profile-error">No animal profiles are available right now.</p>';
}

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('open', !open);
});

nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

profilesContainer.addEventListener('click', (event) => {
  const button = event.target.closest('[data-gallery-src]');
  if (!button) return;
  const card = document.querySelector(`#${CSS.escape(button.dataset.cardId)}`);
  card.querySelector('.pet-main-photo').src = button.dataset.gallerySrc;
  card.querySelectorAll('[data-gallery-src]').forEach((thumb) => thumb.classList.remove('active'));
  button.classList.add('active');
});

