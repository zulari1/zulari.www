// utils/computeKpisRobust.ts
import { isSameDay as fnsIsSameDay } from 'date-fns';
import { SalesRow, SalesKpis } from '../types';

export function parseSheetDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const s = String(value).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  d = new Date(s.replace(' ', 'T'));
  if (!isNaN(d.getTime())) return d;
  if (s.includes('/')) {
    const parts = s.split(' ')[0].split('/');
    if (parts.length === 3) {
      // Assuming MM/DD/YYYY or DD/MM/YYYY
      const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
      // Try MM/DD/YYYY first
      let d2 = new Date(`${year}-${parts[0]}-${parts[1]}`);
      if (!isNaN(d2.getTime())) return d2;
      // Try DD/MM/YYYY
      let d3 = new Date(`${year}-${parts[1]}-${parts[0]}`);
      if (!isNaN(d3.getTime())) return d3;
    }
  }
  return null;
}

export function computeKpis(rows: SalesRow[]): SalesKpis {
  const today = new Date();

  const leadsConverted = rows.filter(r => r.isApproved).length;
  const meetingsBooked = rows.filter(r => r.meetingBooked).length;

  // Placeholder for revenue calculation, as it requires external data
  const closedRevenue = meetingsBooked * 1200; // Mock value based on blueprint suggestion

  return {
    closedRevenue,
    meetingsBooked,
    leadsConverted,
  };
}