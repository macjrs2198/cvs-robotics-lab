export const MM_PER_INCH = 25.4;
export const MIN_PROFILE_BIT_MM = 0.5;

export function normalizeBitDiameter(value, unit) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter the diameter printed on the installed bit.');
  }
  if (!['mm', 'in'].includes(unit)) {
    throw new Error('Choose whether the bit diameter is in millimeters or inches.');
  }
  const mm = unit === 'in' ? amount * MM_PER_INCH : amount;
  if (mm < MIN_PROFILE_BIT_MM) {
    const hint = unit === 'mm' && Math.abs(amount - 0.125) < 0.000001
      ? ' If the bit is marked 1/8 in, choose Inches; 0.125 in equals 3.175 mm.'
      : '';
    throw new Error(`This profile cutter requires a bit at least ${MIN_PROFILE_BIT_MM} mm in diameter.${hint}`);
  }
  if (mm > 100) throw new Error('Bit diameter must be 100 mm or less.');
  return { mm, inches: mm / MM_PER_INCH };
}

