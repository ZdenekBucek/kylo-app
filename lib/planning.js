'use strict';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
function settings(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const dose = typeof body.dose === 'string' ? body.dose.trim() : '';
  const interval = body.intervalDays;
  const reminders = body.reminderOffsets;
  if (!name || name.length > 200 || dose.length > 200) throw Error('Vyplň název (do 200 znaků) a dávku do 200 znaků.');
  if (!Number.isInteger(interval) || interval < 0 || interval > 3650) throw Error('Opakování musí být 0 až 3650 dní.');
  if (!Array.isArray(reminders) || reminders.length > 12 || reminders.some(x => !Number.isInteger(x) || x < 0 || x > 365)) throw Error('Připomínky musí být 0 až 365 dní před termínem.');
  return {name, dose, interval, reminders:[...new Set(reminders)].sort((a,b)=>b-a)};
}
module.exports = {uuid, date, settings};
