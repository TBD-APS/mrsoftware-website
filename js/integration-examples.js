'use strict';

const contacts = Array.from(document.querySelectorAll('#excel-example input[type="checkbox"]'));
const selection = document.getElementById('sample-contact-selection');

function updateSelection() {
  const count = contacts.filter(contact => contact.checked).length;
  selection.textContent = `${count} ${count === 1 ? 'contact' : 'contacts'} selected for import.`;
}

for (const contact of contacts) {
  contact.disabled = false;
  contact.addEventListener('change', updateSelection);
}
window.addEventListener('pageshow', updateSelection);

const approveReply = document.getElementById('approve-sample-reply');
const replyStatus = document.getElementById('sample-reply-status');

approveReply.hidden = false;
approveReply.addEventListener('click', () => {
  replyStatus.textContent = 'Sample reply approved. No email was sent.';
  approveReply.disabled = true;
});
