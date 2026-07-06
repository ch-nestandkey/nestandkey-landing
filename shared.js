const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyDWXPn0gIKiQNHkxmnU5LW60dmsq3_ivudS1qR-OrFSilQQawqxOQmeE2hozDRvB6h/exec';

function toggleMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('open');
}

function closeMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
}

async function handleWaitlist(e, sheetName) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('input').value;
  const btn = form.querySelector('button');
  btn.textContent = 'Submitting...';
  btn.disabled = true;
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, sheet: sheetName }),
    });
    form.outerHTML = `<p class="waitlist-success">✓ You're on the list! We'll be in touch soon.</p>`;
  } catch (err) {
    btn.textContent = 'Join Waitlist';
    btn.disabled = false;
    alert('Something went wrong. Please try again.');
  }
}
