import { supabase } from './supabaseClient.js';

function injectWidget() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button id="marino-fab" class="marino-fab" aria-label="Ask Marino 007">AI</button>
    <div id="marino-panel" class="marino-panel hidden">
      <div class="marino-header">
        <span>MARINO 007</span>
        <button id="marino-close" class="marino-close" aria-label="Close">&times;</button>
      </div>
      <div id="marino-messages" class="marino-messages">
        <div class="marino-msg marino-msg-bot">Hey, I'm Marino 007. Ask me about your current load, HOS, or how to use LoadTrack.</div>
      </div>
      <form id="marino-form" class="marino-form">
        <input id="marino-input" type="text" placeholder="Ask a question..." autocomplete="off">
        <button type="submit" class="marino-send">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);

  const fab = document.getElementById('marino-fab');
  const panel = document.getElementById('marino-panel');
  const closeBtn = document.getElementById('marino-close');
  const form = document.getElementById('marino-form');
  const input = document.getElementById('marino-input');
  const messages = document.getElementById('marino-messages');

  fab.addEventListener('click', () => panel.classList.toggle('hidden'));
  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    input.value = '';
    const thinkingEl = addMessage('Thinking...', 'bot');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { thinkingEl.textContent = 'Please sign in first.'; return; }

    const { data, error } = await supabase.functions.invoke('chat-assistant', {
      body: { message: text },
    });

    if (error) {
      thinkingEl.textContent = "Sorry, I couldn't reach the assistant right now.";
      return;
    }
    thinkingEl.textContent = data?.reply || 'No response.';
  });

  function addMessage(text, who) {
    const el = document.createElement('div');
    el.className = `marino-msg marino-msg-${who}`;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }
}

injectWidget();
