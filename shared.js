const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyDWXPn0gIKiQNHkxmnU5LW60dmsq3_ivudS1qR-OrFSilQQawqxOQmeE2hozDRvB6h/exec';

function toggleMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('open');
}

function closeMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
}

function initChatKeyboardFix(inputId, messagesId, inputRowId) {
  if (!window.visualViewport) return;

  const input = document.getElementById(inputId);
  const messages = document.getElementById(messagesId);
  const inputRow = document.getElementById(inputRowId);
  if (!input || !messages || !inputRow) return;

  let keyboardOpen = false;

  function adjust() {
    if (!keyboardOpen) return;
    const vv = window.visualViewport;
    const visibleBottom = vv.offsetTop + vv.height;

    // Scroll page so input row bottom sits flush with keyboard top
    const rowBottom = inputRow.getBoundingClientRect().bottom + window.scrollY;
    const gap = rowBottom - visibleBottom;
    if (gap > 0) window.scrollBy({ top: gap, behavior: 'instant' });

    // Shrink messages pane to fill exactly the space above the input row
    const messagesTop = messages.getBoundingClientRect().top;
    const inputRowH = inputRow.offsetHeight;
    const available = visibleBottom - messagesTop - inputRowH;
    if (available > 80) {
      messages.style.maxHeight = Math.min(available, 500) + 'px';
      messages.scrollTop = messages.scrollHeight;
    }
  }

  // resize fires when the keyboard opens/closes — scroll intentionally omitted
  // to avoid a scrollBy → scroll event → scrollBy feedback loop
  window.visualViewport.addEventListener('resize', adjust);

  input.addEventListener('focus', () => {
    keyboardOpen = true;
    setTimeout(adjust, 350);
  });
  input.addEventListener('blur', () => {
    keyboardOpen = false;
    messages.style.maxHeight = '';
  });
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
