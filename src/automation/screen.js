import { flushLibrary } from '../local/store.js';
let snapshot;
const visible = element => !!(element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden') && !element.closest('[hidden], [data-ai-private]');
const describe = element => ({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), type: element.type || '', label: element.getAttribute('aria-label') || [...(element.labels || [])].map(label => label.textContent.trim()).join(' ') || element.title || element.textContent.trim().slice(0, 160), value: element.value ?? '', checked: element.checked ?? null, disabled: !!element.disabled, expanded: element.getAttribute('aria-expanded') });
function elements() { return [...document.querySelectorAll('#root button, #root input:not([type=password]), #root select, #root textarea, #root a, #root [role=button]')].filter(visible); }
const signature = rows => JSON.stringify(rows.map(describe));
const availableOptions = element => [...element.options].filter(option => !option.disabled && !option.closest('[data-ai-private]'));
export function inspectScreen() {
  const rows = elements();
  snapshot = { id: crypto.randomUUID(), rows, signature: signature(rows) };
  const text = [...document.querySelectorAll('#root h1, #root h2, #root h3, #root [role=alert], #root [role=status]')].filter(visible).map(element => element.textContent.trim());
  return { screenId: snapshot.id, messages: text, controls: rows.map((element, index) => ({ control: index, ...describe(element), ...(element.tagName === 'SELECT' ? { options: availableOptions(element).map(option => ({ value: option.value, label: option.text })) } : {}) })) };
}
export async function actOnScreen({ screenId, control, action, value, confirm }) {
  if (!snapshot || snapshot.id !== screenId || snapshot.signature !== signature(elements())) throw Object.assign(new Error('画面が変わりました。ui_inspectで読み直してください。'), { code: 'CONFLICT' });
  const element = snapshot.rows[control];
  if (!element?.isConnected || !visible(element) || element.disabled || element.closest('[data-ai-private]')) throw new Error('この操作はできません。');
  if (element.type === 'file') throw new Error('ファイルはcards_import、decks_import、backup_restoreで渡してください。');
  const alerts = [], confirmations = [];
  const beforeAlert = window.alert, beforeConfirm = window.confirm;
  const root = document.getElementById('root'), inert = root.inert;
  root.inert = true;
  try {
    window.alert = text => { alerts.push(String(text)); };
    window.confirm = text => { confirmations.push(String(text)); return confirm === true; };
    if (action === 'click') element.click();
    else if (action === 'fill') {
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || ['checkbox', 'radio', 'file', 'password'].includes(element.type)) throw new Error('入力できる欄を指定してください。');
      const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      if (element.tagName === 'SELECT' && !availableOptions(element).some(option => option.value === value)) throw new Error('選択できない値です。');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    await flushLibrary();
    return { dispatched: true, alerts, confirmations, confirmationRequired: confirmations.length > 0 && confirm === undefined };
  } finally { window.alert = beforeAlert; window.confirm = beforeConfirm; root.inert = inert; snapshot = null; }
}
