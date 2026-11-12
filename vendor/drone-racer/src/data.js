// SPDX-License-Identifier: Apache-2.0
// Reject capabilities, accessors, unknown fields and sparse arrays before reading.
export function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError('plain data record required');
  const d = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(d);
  if (own.length !== keys.length || own.some(k => !keys.includes(k)) ||
      keys.some(k => !Object.hasOwn(d, k) || !Object.hasOwn(d[k], 'value')))
    throw new TypeError('unexpected, missing or accessor property');
  return Object.fromEntries(keys.map(k => [k, d[k].value]));
}
export function list(value, min, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < min || value.length > max || Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError('bounded dense data array required');
  const d = Object.getOwnPropertyDescriptors(value);
  return Array.from({length:value.length}, (_, i) => {
    if (!Object.hasOwn(d, i) || !Object.hasOwn(d[i], 'value')) throw new TypeError('data array required');
    return d[i].value;
  });
}
export function bounded(n, min, max) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
    throw new RangeError('number outside permitted range');
  return n;
}
export function label(s, max = 64) {
  if (typeof s !== 'string' || !s.trim() || s.length > max || /[\u0000-\u001f]/.test(s))
    throw new TypeError('bounded text required');
  return s;
}
export function identifier(s) {
  if (typeof s !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(s)) throw new TypeError('invalid ID');
  return s;
}
export function color(s) {
  if (typeof s !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s)) throw new TypeError('six-digit hex colour required');
  return s;
}
export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
