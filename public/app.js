const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('#primary-nav');
const dialog = document.querySelector('#admin-dialog');
const form = document.querySelector('#profile-form');
const photoInput = document.querySelector('#animal-photo');
const toast = document.querySelector('#toast');

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('open', !open);
});

nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

document.querySelectorAll('[data-open-admin]').forEach((button) => button.addEventListener('click', () => {
  dialog.showModal();
  document.body.classList.add('dialog-open');
  setTimeout(() => document.querySelector('#animal-name').focus(), 50);
}));

document.querySelectorAll('[data-gallery-src]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('#demo-photo').src = button.dataset.gallerySrc;
  document.querySelectorAll('[data-gallery-src]').forEach((thumb) => thumb.classList.remove('active'));
  button.classList.add('active');
}));

document.querySelector('[data-close-admin]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.querySelector('#animal-name').value.trim();
  const description = document.querySelector('#animal-description').value.trim();
  document.querySelector('#demo-name').textContent = name;
  document.querySelector('#demo-description').textContent = description;

  const file = photoInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      document.querySelector('#demo-photo').src = reader.result;
      document.querySelector('#demo-photo').alt = `${name} profile preview`;
    });
    reader.readAsDataURL(file);
  }

  dialog.close();
  document.querySelector('#demo-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
});
