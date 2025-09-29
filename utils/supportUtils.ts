// utils/supportUtils.ts
import { SupportTicket, DashboardMetrics } from '../types';
import { isSameDay as fnsIsSameDay, formatDistanceToNowStrict } from 'date-fns';


export function parseTimestamp(ts: string | null | undefined): Date | null {
    if (!ts) return null;
    let date = new Date(ts);
    if (!isNaN(date.getTime())) return date;
    date = new Date(ts.replace(' ', 'T'));
    if (!isNaN(date.getTime())) return date;
    return null;
}

export function timeAgo(ts: Date | string) {
    if (!ts) return '';
    const date = typeof ts === 'string' ? new Date(ts) : ts;
    if (isNaN(date.getTime())) return '';
    return formatDistanceToNowStrict(date, { addSuffix: true });
}


export function parseProcessing(s: string = ''): number {
    if (!s) return 0;
    const minMatch = s.match(/(\d+)m/);
    const secMatch = s.match(/(\d+)s/);
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    const seconds = secMatch ? parseInt(secMatch[1], 10) : 0;
    return minutes * 60 + seconds;
}


export function calculateDashboardMetrics(conversations: SupportTicket[]): DashboardMetrics {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const isSameDay = (date1: Date, date2: Date) => {
    if (!date1 || !date2) return false;
    return fnsIsSameDay(date1, date2);
  }

  return {
    conversationsToday: conversations.filter(c => 
      isSameDay(c._timestamp, today)
    ).length,
    
    openTickets: conversations.filter(c => 
      ['Pending', 'In Progress', 'Waiting on Review'].includes(c.Status)
    ).length,
    
    escalations: conversations.filter(c => 
      c._isEscalated
    ).length,
    
    avgResponseTime: (() => {
      const processed = conversations.filter(c => c['Processed At']);
      if (processed.length === 0) return 0;
      
      const totalMs = processed.reduce((sum, c) => {
        const start = new Date(c.Timestamp);
        const end = new Date(c['Processed At']);
        return sum + (end.getTime() - start.getTime());
      }, 0);
      
      return Math.round(totalMs / processed.length / 60000);
    })(),
    
    approvalRate: (() => {
      const withDecisions = conversations.filter(c => 
        ['Approved', 'Declined', 'Needs Iteration'].includes(c['Approval Status'])
      );
      if (withDecisions.length === 0) return 0;
      
      const approved = withDecisions.filter(c => c['Approval Status'] === 'Approved');
      return Math.round((approved.length / withDecisions.length) * 100);
    })(),
    
    emailsSentToday: conversations.filter(c => 
      c.Outcome === 'Email Sent' && c['Processed At'] &&
      isSameDay(new Date(c['Processed At']), today)
    ).length
  };
}