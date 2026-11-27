// Login: "Show password" checkbox (progressive enhancement; paste stays allowed).
const box = document.getElementById('show-password') as HTMLInputElement | null;
const field = document.getElementById('password') as HTMLInputElement | null;
if (box && field) {
  box.closest('[data-requires-js]')?.removeAttribute('hidden');
  box.addEventListener('change', () => { field.type = box.checked ? 'text' : 'password'; });
}
