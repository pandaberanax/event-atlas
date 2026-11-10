export const TRIGGERS = ['page_load', 'click', 'impression', 'outbound', 'form_submit', 'authentication'];
export const DEFAULT_TRIGGERS = ['page_load', 'click', 'impression'];

export function auditTriggers(values) {
  if (values === undefined) return [...DEFAULT_TRIGGERS];
  if (!Array.isArray(values) || !values.length || values.some(value => !TRIGGERS.includes(value))) {
    throw Error('Pilih minimal satu pemicu audit yang valid.');
  }
  return [...new Set(values)];
}

export function probeOutcome(probe, count) {
  if (probe.status === 'pending') return 'probePending';
  if (probe.status === 'error') return 'probeFailed';
  if (probe.manual) return 'probeManual';
  if (probe.status === 'skipped') return 'probeSkipped';
  return count ? 'probeObserved' : 'probeNoEvent';
}
