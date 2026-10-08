export const money = (n: number) => 'LKR ' + Number(n).toLocaleString('en-LK', { maximumFractionDigits: 2 });

export const clock = (iso: string | number | Date) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const dayAndClock = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return (sameDay ? 'Today' : d.toLocaleDateString([], { day: 'numeric', month: 'short' })) + ', ' + clock(d);
};
