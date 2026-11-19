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

const distance = document.getElementById('greeny-distance');
const total = document.getElementById('greeny-total');
const driving = document.getElementById('greeny-driving');
const energy = document.getElementById('greeny-energy');
const activity = document.getElementById('greeny-activity');
const estimateFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

// Use the Greeny road transport synthetic fixture's mass and two sample factors.
function updateEstimate() {
  const tonneKm = 1.5 * Number(distance.value);
  const drivingKg = tonneKm * 0.10;
  const energyKg = tonneKm * 0.02;
  total.textContent = `${estimateFormat.format(drivingKg + energyKg)} kg CO₂e`;
  driving.textContent = `${estimateFormat.format(drivingKg)} kg CO₂e`;
  energy.textContent = `${estimateFormat.format(energyKg)} kg CO₂e`;
  activity.textContent = `${estimateFormat.format(tonneKm)} tonne-km`;
}

distance.disabled = false;
distance.addEventListener('change', updateEstimate);
window.addEventListener('pageshow', updateEstimate);
