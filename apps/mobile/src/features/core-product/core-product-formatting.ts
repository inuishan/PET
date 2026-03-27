const currencyFormatter = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 0,
  style: 'currency',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

export function formatShortDate(isoDate: string) {
  return shortDateFormatter.format(new Date(isoDate));
}

export function formatRelativeDuration(isoDate: string, asOf: string) {
  const differenceInMinutes = Math.max(
    0,
    Math.floor((new Date(asOf).getTime() - new Date(isoDate).getTime()) / 60000)
  );
  const hours = Math.floor(differenceInMinutes / 60);
  const minutes = differenceInMinutes % 60;

  if (hours === 0) {
    return `${minutes}m ago`;
  }

  if (minutes === 0) {
    return `${hours}h ago`;
  }

  return `${hours}h ${minutes}m ago`;
}
