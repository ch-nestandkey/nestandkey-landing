// Shared Key-chat logic, used by both landlords.html (organic chat) and
// key-intake.html (claimed-lead intake). Kept in one file rather than
// copy-pasted into both pages so a future fix/copy change can't silently
// drift out of sync between the two (this session already hit exactly that
// bug once, in the landlord confirmation email's "prospects"/"renters"
// wording).
//
// Each page is responsible for its own gating logic (deciding whether a
// visitor should see the chat at all, per leads.status) and calls
// bindKeyChatUI() + initKeyChat(leadId) once it's decided the chat should
// actually run.
//
// Security note: every innerHTML write below either (a) escapes untrusted
// text through escapeHtml()/formatKeyText() first, same as the code this was
// extracted from, or (b) interpolates only server-generated values that are
// never raw user input (e.g. applyUrl, built server-side from a UUID).

// TODO: Fill these in from your Cloudinary dashboard before deploying photo upload
const CLOUDINARY_CLOUD_NAME = 'pbmv9wra';
const CLOUDINARY_UPLOAD_PRESET = 'nest-key-listings';

let keyState = {
  name:'', city:'', neighborhood:'', zip:'', propertyType:'', roomDetails:'',
  furnished:'', availability:'', rent:'', utilities:'', minStay:'',
  isOwner:'', household:'', parking:'', photosStatus:'', email:'', phone:'',
  houseRules:'', lifestyle:''
};

let keyHistory = [];
let keyPhotoUrls = [];
let keyListingSubmitted = false;
let keyLeadId = null;

async function fetchLeadPrefill(leadId) {
  try {
    if (!leadId) return null;
    const res = await fetch(`/api/lead-info?lead=${encodeURIComponent(leadId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function keyOpeningMessage(prefill) {
  const generic = "Hi — I'm Key. I'll help you list your place and pre-screen renters who actually fit. First — is this a private room in a home you live in, or a separate property you're renting out?";
  if (!prefill) return generic;
  const place = [prefill.neighborhood, prefill.city].filter(Boolean).join(', ');
  const rentPart = prefill.rent ? ` for $${prefill.rent}/month` : '';
  if (!place && !rentPart) return generic;
  return `Hi — I'm Key. I saw your room listed${place ? ' in ' + place : ''}${rentPart} and wanted to help you get it set up with Nest & Key. Let's fill in a few more details — is this a private room in a home you live in, or a separate property you're renting out?`;
}

// Cold-outreach lead support: if the caller passes a leadId (from a ?lead=
// link that's already been cleared to run the chat -- either 'claimed' or
// no lead at all), fetch the draft facts NK already gathered from the
// landlord's FB/Craigslist post and use them to build a listing-aware
// opener -- same role the property-type question plays as an intent check
// for organic visitors. keyLeadId also gets sent along on final submission
// so the lead can be marked converted.
async function initKeyChat(leadId) {
  keyLeadId = leadId || null;
  setKeyChatEnabled(false);
  const prefill = await fetchLeadPrefill(keyLeadId);
  if (prefill) {
    for (const [k, v] of Object.entries(prefill)) {
      if (v !== '' && v !== null && v !== undefined && k in keyState) keyState[k] = v;
    }
  }
  const opener = keyOpeningMessage(prefill);
  keyHistory = [{ role: 'assistant', content: opener }];
  appendKeyMsg('assistant', opener);
  if (prefill) renderKeyBrief();
  setKeyChatEnabled(true);
}

const KEY_BRIEF_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'propertyType', label: 'Property type', required: true },
  { key: 'isOwner', label: 'Owner-occupied', required: true },
  { key: 'city', label: 'City', required: true },
  { key: 'neighborhood', label: 'Neighborhood', required: true },
  { key: 'zip', label: 'Zip', required: false },
  { key: 'roomDetails', label: 'Room details', required: true },
  { key: 'furnished', label: 'Furnished', required: true },
  { key: 'availability', label: 'Available from', required: true },
  { key: 'rent', label: 'Monthly rent', required: true },
  { key: 'utilities', label: 'Utilities', required: false },
  { key: 'minStay', label: 'Min stay', required: true },
  { key: 'household', label: 'Household', required: false },
  { key: 'parking', label: 'Parking', required: false },
  { key: 'houseRules', label: 'House rules', required: false },
  { key: 'lifestyle', label: 'Lifestyle fit', required: false },
  { key: 'photosStatus', label: 'Photos', required: false },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone', required: true },
];

// Every value rendered here is passed through escapeHtml() first -- see
// security note at the top of this file.
function renderKeyBrief() {
  const fieldsEl = document.getElementById('key-brief-fields');
  const statusEl = document.getElementById('key-brief-status');
  if (!fieldsEl) return;

  const filled = KEY_BRIEF_FIELDS.filter(f => (keyState[f.key] || '').trim() !== '');
  fieldsEl.innerHTML = filled.length === 0
    ? '<div class="key-brief-empty">Keep chatting — your brief will appear here.</div>'
    : filled.map(f => `<div class="key-brief-row"><span class="key-brief-check">✓</span><div class="key-brief-row-text"><span class="key-brief-label">${f.label}</span><span class="key-brief-value">${escapeHtml(keyState[f.key])}</span></div></div>`).join('');

  if (statusEl && !document.getElementById('key-brief-submit')) {
    const allReq = KEY_BRIEF_FIELDS.filter(f => f.required).every(f => (keyState[f.key] || '').trim() !== '');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(keyState.email || '');
    if (allReq && emailOk) {
      const btn = document.createElement('button');
      btn.id = 'key-brief-submit';
      btn.className = 'key-brief-status ready';
      btn.textContent = 'Submit my rental profile →';
      btn.addEventListener('click', submitKeyListing);
      statusEl.replaceWith(btn);
    }
  }
  syncIntakeHeights();
}

async function sendKeyChat() {
  const input = document.getElementById('key-chat-input');
  const text = input.value.trim();
  if (!text) {
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    input.addEventListener('animationend', () => input.classList.remove('shake'), { once: true });
    return;
  }

  appendKeyMsg('user', text);
  keyHistory.push({ role: 'user', content: text });
  input.value = '';
  setKeyChatEnabled(false);

  const box = document.getElementById('key-chat-messages');
  const typing = document.createElement('div');
  typing.className = 'msg key typing-indicator';
  typing.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  box.appendChild(typing);
  box.scrollTop = box.scrollHeight;

  try {
    const res = await fetch('/api/key-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: keyHistory, state: keyState })
    });
    typing.remove();
    if (!res.ok) throw new Error();
    const data = await res.json();
    // Merge API state: prefer non-empty values, never overwrite filled fields with empty
    if (data.state && typeof data.state === 'object') {
      for (const [k, v] of Object.entries(data.state)) {
        if (v !== '' && v !== null && v !== undefined) keyState[k] = v;
      }
    }
    keyHistory.push({ role: 'assistant', content: data.reply });
    appendKeyMsg('assistant', data.reply);
    renderKeyBrief();
    if (data.ready) showKeyReady(); else setKeyChatEnabled(true);
  } catch (_) {
    typing.remove();
    appendKeyError();
    setKeyChatEnabled(true);
  }
}

function appendKeyError() {
  const box = document.getElementById('key-chat-messages');
  const div = document.createElement('div');
  div.className = 'msg error';
  div.innerHTML = '<div class="msg-label">Key</div><div class="msg-text">Something went wrong. <button class="msg-retry-btn" onclick="retryLastKeyMessage()">Retry</button></div>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function retryLastKeyMessage() {
  const box = document.getElementById('key-chat-messages');
  const err = box.querySelector('.msg.error');
  if (err) err.remove();

  setKeyChatEnabled(false);
  const typing = document.createElement('div');
  typing.className = 'msg key typing-indicator';
  typing.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  box.appendChild(typing);
  box.scrollTop = box.scrollHeight;

  fetch('/api/key-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: keyHistory, state: keyState })
  })
    .then(res => { typing.remove(); if (!res.ok) throw new Error(); return res.json(); })
    .then(data => {
      if (data.state && typeof data.state === 'object') {
        for (const [k, v] of Object.entries(data.state)) {
          if (v !== '' && v !== null && v !== undefined) keyState[k] = v;
        }
      }
      keyHistory.push({ role: 'assistant', content: data.reply });
      appendKeyMsg('assistant', data.reply);
      renderKeyBrief();
      if (data.ready) showKeyReady(); else setKeyChatEnabled(true);
    })
    .catch(() => { typing.remove(); appendKeyError(); setKeyChatEnabled(true); });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Escape first, always -- never trust raw text (landlord input or model
// output) as HTML. Only after escaping do we re-enable a narrow,
// controlled **bold**/*italic* markdown conversion for Key's own replies,
// so styling works without ever allowing arbitrary HTML injection. This
// matters beyond just this page: unescaped input here was a stored-XSS
// risk against whoever later views a saved transcript (e.g. NK's admin
// portal), not just the person typing.
function formatKeyText(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// text is always run through escapeHtml()/formatKeyText() above before
// reaching innerHTML -- see security note at the top of this file.
function appendKeyMsg(role, text) {
  const box = document.getElementById('key-chat-messages');
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'assistant' ? 'key' : 'user');
  div.innerHTML = role === 'assistant'
    ? `<div class="msg-label">Key</div><div class="msg-text">${formatKeyText(text)}</div>`
    : `<div class="msg-text">${escapeHtml(text)}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  syncIntakeHeights();
}

// Chat card and brief panel height are handled entirely by CSS now
// (.chat-card min-height/max-height + .chat-messages flex:1, brief panel
// matched via the .key-intake-wrap grid's align-items: stretch) -- no JS
// sizing needed. This used to compute an explicit px height from the
// card's viewport position, but that only reflected the card's position
// at the moment it last ran (page load, or a message arriving), not
// wherever the viewer had actually scrolled to -- producing a too-short
// card on pages like landlords.html where the card sits far below the
// initial fold. Kept as a no-op so existing call sites don't need to be
// touched.
function syncIntakeHeights() {}

function setKeyChatEnabled(on) {
  const input = document.getElementById('key-chat-input');
  const btn = document.getElementById('key-chat-send');
  if (input) input.disabled = !on;
  if (btn) btn.disabled = !on;
}

function showKeyReady() {
  renderKeyBrief();
  setKeyChatEnabled(true);
  const box = document.getElementById('key-chat-messages');
  const existing = box.querySelector('.chat-ready-cta');
  if (existing) existing.remove();
  const cta = document.createElement('div');
  cta.className = 'chat-ready-cta';
  cta.innerHTML = `<button id="key-chat-submit-btn" onclick="submitKeyListing()">Submit my rental profile →</button>`;
  box.appendChild(cta);
  box.scrollTop = box.scrollHeight;
  syncIntakeHeights();
}

// applyUrl is server-generated (built in submit-listing.js from a UUID),
// never raw user input -- see security note at the top of this file.
async function submitKeyListing() {
  if (keyListingSubmitted) return;
  const btn = document.getElementById('key-brief-submit') || document.getElementById('key-start-btn');
  const chatBtn = document.getElementById('key-chat-submit-btn');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }
  if (chatBtn) { chatBtn.textContent = 'Submitting…'; chatBtn.disabled = true; }

  let applyUrl;
  try {
    const res = await fetch('/api/submit-listing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...keyState, photoUrls: keyPhotoUrls, leadId: keyLeadId || undefined })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    applyUrl = data.applyUrl;
  } catch (_) {
    if (btn) { btn.textContent = 'Submit my rental profile →'; btn.disabled = false; }
    if (chatBtn) { chatBtn.textContent = 'Submit my rental profile →'; chatBtn.disabled = false; }
    alert('Something went wrong submitting your rental profile. Please try again.');
    return;
  }

  keyListingSubmitted = true;
  const box = document.getElementById('key-chat-messages');
  const cta = box.querySelector('.chat-ready-cta');
  if (cta) cta.remove();
  const confirm = document.createElement('div');
  confirm.className = 'confirm confirm--panel';
  confirm.innerHTML = `<span class="confirm__medallion">✓</span>
    <div class="confirm__title">Your AI agent is now ready</div>
    <div class="confirm__steps">
      <div class="confirm__step">
        <div class="confirm__step-label">Try now, Say hello to Key</div>
        <p class="confirm__step-body">Check your email! Ensure Key's first email arrived your inbox well.</p>
      </div>
      <div class="confirm__step">
        <div class="confirm__step-label">How to use your AI agent for screening</div>
        <p class="confirm__step-body">Copy this link and paste it into your post on Craigslist, Facebook, or anywhere else. It's Key — your own AI agent, already trained on your screening criteria.</p>
        <div class="confirm__link-row">
          <input type="text" readonly value="${applyUrl}" onclick="this.select()" class="confirm__link-input" />
          <button type="button" class="confirm__copy-btn" onclick="copyApplyLink(this, '${applyUrl}')">Copy</button>
        </div>
      </div>
    </div>
    <p class="confirm__meta">You always make the final call on who you meet.</p>`;
  box.appendChild(confirm);
  box.scrollTop = box.scrollHeight;
  const inputRow = document.getElementById('key-chat-input-row');
  if (inputRow) inputRow.style.display = 'none';
  if (btn) { btn.textContent = '✓ Submitted'; btn.style.background = '#4A6B52'; }
  syncIntakeHeights();
}

function copyApplyLink(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

async function uploadKeyPhoto(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) return null;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  return data.secure_url || null;
}

// Wires up all Key-chat DOM listeners. Call once, after the page has decided
// the chat should actually run (i.e. after gating logic clears an organic
// visitor or a claimed/no-lead visit) and the chat-card markup exists in the DOM.
function bindKeyChatUI() {
  const photoInput = document.getElementById('key-photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', async function(e) {
      const files = Array.from(e.target.files).slice(0, 10 - keyPhotoUrls.length);
      const grid = document.getElementById('key-photo-grid');
      const drop = document.querySelector('.key-photo-drop');
      let addedCount = 0;

      for (const file of files) {
        const localUrl = URL.createObjectURL(file);

        const wrap = document.createElement('div');
        wrap.className = 'key-photo-wrap';

        const thumb = document.createElement('img');
        thumb.className = 'key-photo-thumb';
        thumb.src = localUrl;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'key-photo-remove';
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          const cloudUrl = wrap.dataset.url;
          if (cloudUrl) keyPhotoUrls = keyPhotoUrls.filter(u => u !== cloudUrl);
          wrap.remove();
          if (keyPhotoUrls.length === 0) {
            keyState.photosStatus = '';
            document.getElementById('key-photo-hint').textContent = 'JPG, PNG, HEIC · up to 10 photos';
            drop.style.borderColor = '';
          } else {
            document.getElementById('key-photo-hint').textContent = `${keyPhotoUrls.length} of 10 added ✓`;
          }
          renderKeyBrief();
        });

        wrap.appendChild(thumb);
        wrap.appendChild(removeBtn);
        grid.appendChild(wrap);

        const url = await uploadKeyPhoto(file);
        if (url) {
          wrap.dataset.url = url;
          keyPhotoUrls.push(url);
          keyState.photosStatus = 'provided';
          addedCount++;
          renderKeyBrief();
        }
      }

      if (addedCount > 0) {
        document.getElementById('key-photo-hint').textContent = `${keyPhotoUrls.length} of 10 added ✓`;
        drop.style.borderColor = 'rgba(45,90,61,0.5)';
        appendKeyMsg('assistant', `Got it — I've noted ${keyPhotoUrls.length} photo${keyPhotoUrls.length > 1 ? 's' : ''} for this rental profile. You can add more or keep chatting.`);
      }
    });
  }

  document.getElementById('key-chat-send').addEventListener('click', sendKeyChat);
  document.getElementById('key-chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendKeyChat(); }
  });
  initChatKeyboardFix('key-chat-input', 'key-chat-messages', 'key-chat-input-row');
}
