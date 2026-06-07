export function safeParseDate(dateInput: any): Date | null {
  if (!dateInput) return null;
  
  // If it is a Firestore timestamp or has seconds/nanoseconds
  if (typeof dateInput === 'object' && dateInput !== null) {
    if (typeof dateInput.toDate === 'function') {
      return dateInput.toDate();
    }
    if (typeof dateInput.seconds === 'number') {
      return new Date(dateInput.seconds * 1000);
    }
    if (dateInput instanceof Date) {
      return dateInput;
    }
    // Fallback for pending serverTimestamp FieldValue or other Firestore metadata objects
    return new Date();
  }

  if (typeof dateInput !== 'string') return null;
  
  const trimmed = dateInput.trim();
  if (!trimmed) return null;

  // Regex to match YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return new Date(y, m - 1, d);
  }

  // Regex to match MM/DD/YYYY or MM/DD/YY or DD/MM/YYYY or DD/MM/YY
  const slashMatch = trimmed.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    let year = parseInt(slashMatch[3], 10);
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    if (p1 > 12) {
      // Must be DD/MM/YYYY
      return new Date(year, p2 - 1, p1);
    } else {
      // Assume MM/DD/YYYY
      return new Date(year, p1 - 1, p2);
    }
  }

  // Try standard parsing as fallback
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d;
  }

  return null;
}

export function formatForInput(dateInput: any): string {
  const d = safeParseDate(dateInput);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${r}`;
}
