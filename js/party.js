// ============================================================================
// party.js — who a quote/invoice is addressed to. Since clients now live on
// projects, a document's recipient is either a project's client or a vendor.
// ============================================================================

import { indexById } from './util.js';

// Resolve the recipient contact for a document from projects/vendors.
// doc: { partyType:'client'|'vendor', projectId?, vendorId?, partyName? }
export function recipientOf(doc, projects, vendors) {
  const pmap = projects instanceof Map ? projects : indexById(projects || []);
  const vmap = vendors instanceof Map ? vendors : indexById(vendors || []);
  if (doc.partyType === 'vendor' || (!doc.projectId && doc.vendorId)) {
    const v = vmap.get(doc.vendorId);
    if (v) return { name: v.name, company: v.company, phone: v.phone, email: v.email, address: v.address };
    return { name: doc.partyName || 'Vendor' };
  }
  const p = pmap.get(doc.projectId);
  if (p) {
    return {
      name: p.clientName || '', company: p.clientCompany || '', phone: p.clientPhone || '',
      email: p.clientEmail || '', address: p.clientAddress || '', projectTitle: p.title,
    };
  }
  return { name: doc.partyName || '' };
}

// Short label for lists.
export function recipientName(doc, projects, vendors) {
  const r = recipientOf(doc, projects, vendors);
  return r.name || (doc.partyType === 'vendor' ? 'Vendor' : 'No recipient');
}

import { field, select } from './form.js';

// A reusable "who is this for" picker: Client (via project) or Vendor,
// optionally with a direction (for invoices: they owe me / I owe them).
export function recipientFields(doc, projects, vendors, { withDirection = false } = {}) {
  const pType = doc.partyType || 'client';
  const projOpts = projects.map((p) => ({ value: p.id, label: `${p.title}${p.clientName ? ' — ' + p.clientName : ''}` }));
  const vendOpts = vendors.map((v) => ({ value: v.id, label: `${v.name}${v.trade ? ' (' + v.trade + ')' : ''}` }));
  return `
    <div class="field">
      <span class="field__label">Bill to</span>
      <div class="seg" id="partySeg">
        <button type="button" class="seg__btn ${pType === 'client' ? 'seg__btn--on' : ''}" data-party="client">Client</button>
        <button type="button" class="seg__btn ${pType === 'vendor' ? 'seg__btn--on' : ''}" data-party="vendor">Vendor</button>
      </div>
      <input type="hidden" name="partyType" value="${pType}">
    </div>
    <div class="party-client" ${pType !== 'client' ? 'hidden' : ''}>
      ${field('Project (its client is billed)', select('projectId', doc.projectId, projOpts, { placeholder: 'Select a project' }))}
    </div>
    <div class="party-vendor" ${pType !== 'vendor' ? 'hidden' : ''}>
      ${field('Vendor', select('vendorId', doc.vendorId, vendOpts, { placeholder: 'Select a vendor' }))}
      ${withDirection ? field('Direction', select('direction', doc.direction || 'out', [
        { value: 'out', label: 'I am billing them (they owe me)' },
        { value: 'in', label: 'They billed me (I owe them)' },
      ])) : ''}
    </div>`;
}

export function initRecipient(form) {
  const hidden = form.querySelector('input[name="partyType"]');
  form.querySelectorAll('#partySeg [data-party]').forEach((btn) => btn.addEventListener('click', () => {
    const v = btn.getAttribute('data-party');
    hidden.value = v;
    form.querySelectorAll('#partySeg .seg__btn').forEach((b) => b.classList.toggle('seg__btn--on', b === btn));
    form.querySelector('.party-client').hidden = v !== 'client';
    form.querySelector('.party-vendor').hidden = v !== 'vendor';
  }));
}

export function readRecipient(form, projects, vendors) {
  const partyType = (form.querySelector('input[name="partyType"]') || {}).value || 'client';
  const out = { partyType };
  if (partyType === 'vendor') {
    out.vendorId = form.vendorId ? form.vendorId.value : '';
    out.projectId = '';
    out.direction = form.direction ? form.direction.value : 'out';
  } else {
    out.projectId = form.projectId ? form.projectId.value : '';
    out.vendorId = '';
    out.direction = 'out';
  }
  out.partyName = recipientName(out, projects, vendors);
  return out;
}
