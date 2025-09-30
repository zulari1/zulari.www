import { SupportTicket, ConversationThread, ConversationAnalytics, GoogleSheetsValuesResponse } from '../types';
import { isSameDay as fnsIsSameDay } from 'date-fns';

function parseDate(dateStr: any): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) return date;
  
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const parts = dateStr.split('/');
    // Assuming DD/MM/YYYY
    const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    if(!isNaN(d.getTime())) return d;
  }

  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
     const d = new Date(dateStr.replace(' ', 'T'));
     if(!isNaN(d.getTime())) return d;
  }
  
  return null;
}

export function processConversationData(sheetsData: GoogleSheetsValuesResponse): ConversationThread[] {
  if (!sheetsData.values || sheetsData.values.length < 2) return [];
  const headers = sheetsData.values[0];
  const rows = sheetsData.values.slice(1);

  const threads: { [key: string]: ConversationThread } = {};
  
  rows.forEach(row => {
    const conversation: { [key: string]: any } = {};
    headers.forEach((h, i) => (conversation[h] = row[i]));

    const threadId = conversation['Thread ID'];
    if (!threadId) return;

    if (!threads[threadId]) {
      threads[threadId] = {
        threadId: threadId,
        customerName: conversation['Customer Name'],
        customerEmail: conversation['Customer Email Address'],
        topic: conversation['Inquiry Topic'],
        status: conversation['Status'],
        escalated: conversation['Escalation Flag'] === 'TRUE',
        startTime: parseDate(conversation['Timestamp']),
        messages: [],
        totalMessages: 0,
        duration: 0
      };
    }
    
    threads[threadId].messages.push(conversation as SupportTicket);
    threads[threadId].totalMessages++;
    
    const processedAt = parseDate(conversation['Processed At']);
    const startTime = parseDate(conversation['Timestamp']);
    if (processedAt && startTime) {
      const duration = processedAt.getTime() - startTime.getTime();
      threads[threadId].duration = Math.max(threads[threadId].duration, duration); // take the longest duration if multiple messages
    }
  });
  
  return Object.values(threads).sort((a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0));
}

export function calculateConversationAnalytics(threads: ConversationThread[]): ConversationAnalytics {
  const now = new Date();
  
  const todaysConversations = threads.filter(t => t.startTime && fnsIsSameDay(t.startTime, now)).length;
  const avgMessagesPerThread = threads.length > 0
      ? (threads.reduce((sum, t) => sum + t.totalMessages, 0) / threads.length).toFixed(1)
      : '0.0';
  const resolved = threads.filter(t => t.status === 'Completed' && !t.escalated).length;
  const aiResolutionRate = threads.length > 0 ? Math.round((resolved / threads.length) * 100) : 0;
  
  const threadsWithDuration = threads.filter(t => t.duration > 0);
  const avgResponseTime = threadsWithDuration.length > 0
      ? Math.round(threadsWithDuration.reduce((sum, t) => sum + t.duration, 0) / threadsWithDuration.length / 1000)
      : 0;
  
  const escalated = threads.filter(t => t.escalated).length;
  const escalationRate = threads.length > 0 ? Math.round((escalated / threads.length) * 100) : 0;

  return {
    totalConversations: threads.length,
    todaysConversations,
    avgMessagesPerThread,
    aiResolutionRate,
    avgResponseTime,
    escalationRate,
  };
}
