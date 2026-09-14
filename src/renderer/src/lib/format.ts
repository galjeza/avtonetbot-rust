/** Dates are shown the same way everywhere: "10. september 2026". */
export const formatDate = (value: Date | number): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || value === 0) return '';
  return date.toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' });
};
