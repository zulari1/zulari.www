import React, { useState, useEffect, useCallback, useRef, useMemo, ReactNode, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, animate } from 'framer-motion';
import * as supportService from '../../services/supportService';
import { calculateDashboardMetrics, timeAgo } from '../../utils/supportUtils';
import ActionNotification from '../../components/ActionNotification';
import { SupportTicket, DashboardMetrics, AIChatPayload, AIChatResponse, FeedbackPayload, GoogleSheetsValuesResponse } from '../../types';
import IntegrationBanner from '../../components/IntegrationBanner';
import { ICONS } from '../../constants';
import SupportSettingsModal from '../../components/support/SupportSettingsModal';

// --- STYLES FOR NEW COMPONENTS ---
const NewStyles: React.FC = () => (
  <style>{`
    /* Feedback Section */
    .feedback-section { margin-top: 15px; padding-top: 15px; border-top: 1px solid #374151; }
    .btn-feedback-toggle { background: #1F2937; border: 1px solid #374151; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.2s; color: #F9FAFB; }
    .btn-feedback-toggle:hover { background: #374151; }
    .feedback-form { margin-top: 15px; padding: 20px; background: #4B5563; border-radius: 12px; border: 1px solid #6B7280; }
    .feedback-form.hidden { display: none; }
    .feedback-header h4 { margin: 0 0 5px 0; font-size: 16px; color: #F9FAFB; }
    .feedback-header p { margin: 0 0 15px 0; font-size: 13px; color: #D1D5DB; }
    .star-rating { display: flex; gap: 8px; margin-bottom: 15px; font-size: 24px; }
    .star { cursor: pointer; transition: transform 0.2s; color: #6B7280; }
    .star:hover, .star.active { transform: scale(1.2); color: #FBBF24; }
    .feedback-type { width: 100%; padding: 10px; border: 1px solid #6B7280; background: #1F2937; color: #F9FAFB; border-radius: 8px; margin-bottom: 15px; font-size: 14px; }
    .feedback-form textarea { width: 100%; padding: 12px; border: 1px solid #6B7280; background: #1F2937; color: #F9FAFB; border-radius: 8px; margin-bottom: 15px; font-size: 14px; resize: vertical; }
    .feedback-actions { display: flex; gap: 10px; }
    .btn-submit { flex: 1; padding: 10px; background: #10B981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
    .btn-submit:hover { background: #059669; }
    .btn-cancel { padding: 10px 20px; background: transparent; border: 1px solid #6B7280; color: #F9FAFB; border-radius: 8px; cursor: pointer; }
    .feedback-status { margin-top: 15px; padding: 12px; background: #10B98130; border-radius: 8px; color: #A7F3D0; text-align: center; font-weight: 500; }
    .feedback-status.hidden { display: none; }

    /* AI Assistant Section */
    .ai-assistant-section { background: #1F2937; padding: 25px; border-radius: 15px; margin-bottom: 25px; color: white; border: 1px solid #374151; }
    .assistant-header h3 { margin: 0 0 5px 0; font-size: 20px; font-weight: 700; }
    .assistant-header p { margin: 0; font-size: 14px; opacity: 0.9; }
    .assistant-input-container { display: flex; gap: 10px; margin: 20px 0; }
    .assistant-input { flex: 1; padding: 14px 18px; border: 1px solid #374151; border-radius: 10px; font-size: 15px; background: #111827; color: #F9FAFB; }
    .assistant-input:focus { outline: 2px solid #4F46E5; }
    .btn-ask-ai { padding: 14px 30px; background: #4F46E5; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-ask-ai:hover { background: #4338CA; }
    .quick-queries { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .quick-queries-label { font-size: 14px; font-weight: 500; }
    .quick-query-btn { padding: 8px 16px; background: #374151; border: 1px solid #4B5563; color: white; border-radius: 20px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .quick-query-btn:hover { background: #4B5563; }
    .assistant-response { margin-top: 20px; background: #111827; color: #F9FAFB; padding: 20px; border-radius: 12px; }
    .response-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #374151; }
    .response-header strong { font-size: 16px; color: #4F46E5; }
    .btn-close-response { background: transparent; border: none; font-size: 20px; cursor: pointer; color: #9CA3AF; }
    .loading-state, .error-state { text-align: center; padding: 30px; }
    .spinner { border: 3px solid #374151; border-top: 3px solid #4F46E5; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 10px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .conversation-card.highlighted { animation: highlightPulse 2s ease; }
    @keyframes highlightPulse { 0%, 100% { background: #1F2937; } 50% { background: #4F46E530; } }
    .details-arrow { transition: transform 0.2s; }
    details[open] .details-arrow { transform: rotate(180deg); }
  `}</style>
);

// --- QUOTA OPTIMIZATION CLASSES (as per user spec) ---

class SheetsCache {
  cache: Map<string, { data: SupportTicket[], timestamp: number }> = new Map();
  lastFetch: number | null = null;
  quotaExceeded = false;
  backoffMultiplier = 1;
  maxBackoff = 300000; // 5 minutes max
  pendingRequest: Promise<SupportTicket[]> | null = null;

  async getData(forceRefresh = false): Promise<SupportTicket[]> {
    const now = Date.now();
    const cacheKey = 'sheets_data';

    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (now - cached.timestamp < this.getCacheTTL()) {
        return cached.data;
      }
    }

    if (this.pendingRequest) {
      return await this.pendingRequest;
    }

    if (this.quotaExceeded && this.lastFetch && now - this.lastFetch < this.getBackoffDelay()) {
      return this.getStaleData();
    }

    this.pendingRequest = this.fetchFromAPI();

    try {
      const data = await this.pendingRequest;
      this.onSuccessfulFetch(data, now);
      return data;
    } catch (error: any) {
      this.onFailedFetch(error, now);
      return this.getStaleData() || [];
    } finally {
      this.pendingRequest = null;
    }
  }

  async fetchFromAPI(): Promise<SupportTicket[]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/1cYaAG2upk2zp3OKrCQawZJO-L2tcjxGz8Y_LVCJ8lBI/values/Sheet1?key=AIzaSyA4XlhMDF3Ft4eLzIf1K1B_mNB9cxSbpB0`;
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (response.status === 429) throw new Error('QUOTA_EXCEEDED');
    if (!response.ok) throw new Error(`API_ERROR_${response.status}`);
    const data: GoogleSheetsValuesResponse = await response.json();
    return this.parseSheetData(data);
  }

  onSuccessfulFetch(data: SupportTicket[], timestamp: number) {
    this.cache.set('sheets_data', { data, timestamp });
    this.lastFetch = timestamp;
    this.quotaExceeded = false;
    this.backoffMultiplier = 1;
    try {
      localStorage.setItem('sheets_backup', JSON.stringify({ data, timestamp }));
    } catch (e) {
      console.warn('Failed to save backup to localStorage:', e);
    }
  }

  onFailedFetch(error: Error, timestamp: number) {
    this.lastFetch = timestamp;
    if (error.message === 'QUOTA_EXCEEDED') {
      this.quotaExceeded = true;
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 32);
    }
    console.error('Fetch failed:', error.message);
  }

  getCacheTTL(): number {
    if (this.quotaExceeded) return 120000;
    if (this.hasActivePendingItems()) return 15000;
    return 60000;
  }

  getBackoffDelay(): number {
    return Math.min(30000 * this.backoffMultiplier, this.maxBackoff);
  }

  getStaleData(): SupportTicket[] {
    const cached = this.cache.get('sheets_data');
    if (cached) return cached.data;
    try {
      const backup = localStorage.getItem('sheets_backup');
      if (backup) return JSON.parse(backup).data;
    } catch (e) {
      console.warn('Failed to load backup from localStorage:', e);
    }
    return [];
  }

  hasActivePendingItems(): boolean {
    const cached = this.cache.get('sheets_data');
    if (!cached) return false;
    return cached.data.some(item => ['Pending', 'In Progress', 'Needs Iteration'].includes(item['Approval Status']));
  }

  parseSheetData(apiResponse: GoogleSheetsValuesResponse): SupportTicket[] {
    const rows = apiResponse.values || [];
    if (rows.length < 2) return [];
    const headers = rows[0];
    const dataRows = rows.slice(1);
    return dataRows.map(row => {
      const obj: any = {};
      headers.forEach((header, index) => { obj[header.trim()] = row[index] || ''; });
      obj._messageId = obj['Message ID'];
      obj._timestamp = new Date(obj['Timestamp']);
      obj._isEscalated = obj['Escalation Flag'] === 'TRUE';
      obj._needsAction = ['Pending', 'Needs Iteration'].includes(obj['Approval Status']);
      return obj as SupportTicket;
    });
  }

  async forceRefresh(): Promise<SupportTicket[]> {
    return await this.getData(true);
  }
}

class SmartPollingManager {
  private cache: SheetsCache;
  private onDataUpdate: (data: SupportTicket[]) => void;
  private pollInterval: number | null = null;
  private isVisible = !document.hidden;
  private lastActivity = Date.now();
  private debouncedActivityUpdater: number | null = null;

  constructor(cache: SheetsCache, onDataUpdate: (data: SupportTicket[]) => void) {
    this.cache = cache;
    this.onDataUpdate = onDataUpdate;
    this.setupVisibilityHandling();
    this.setupUserActivityTracking();
  }

  start() {
    this.stop();
    this.pollOnce(true); // Initial load
    this.scheduleNextPoll();
  }

  stop() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.debouncedActivityUpdater) clearTimeout(this.debouncedActivityUpdater);
    this.pollInterval = null;
  }
  
  private scheduleNextPoll() {
      if (this.pollInterval) clearInterval(this.pollInterval);
      this.pollInterval = window.setInterval(() => this.pollOnce(), this.getCurrentPollInterval());
  }

  async pollOnce(isInitial = false) {
    if (!isInitial && !this.shouldPoll()) return;
    try {
      const data = await this.cache.getData();
      this.onDataUpdate(data);
    } catch (error) {
      console.error('Polling error:', error);
    } finally {
        this.scheduleNextPoll(); // Reschedule with potentially new interval
    }
  }

  shouldPoll(): boolean {
    if (!this.isVisible) return false;
    if (this.cache.quotaExceeded) return false;
    return (Date.now() - this.lastActivity) < 300000;
  }

  getCurrentPollInterval(): number {
    if (this.cache.hasActivePendingItems()) return 20000;
    if (Date.now() - this.lastActivity < 60000) return 45000;
    return 90000;
  }

  private setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (this.isVisible) {
        this.updateUserActivity();
        this.pollOnce();
      }
    });
  }

  private setupUserActivityTracking() {
    const activityEvents = ['click', 'keydown', 'scroll', 'mousemove'];
    const updateActivity = () => {
      if(this.debouncedActivityUpdater) clearTimeout(this.debouncedActivityUpdater);
      this.debouncedActivityUpdater = window.setTimeout(() => this.updateUserActivity(), 1000);
    };
    activityEvents.forEach(event => document.addEventListener(event, updateActivity, { passive: true }));
  }

  private updateUserActivity() {
    this.lastActivity = Date.now();
    this.scheduleNextPoll(); // Activity might change poll interval
  }

  async forceUpdate() {
    const data = await this.cache.forceRefresh();
    this.onDataUpdate(data);
    return data;
  }
}

class DeltaDetector {
  private lastDataVersion: string | null = null;
  hasChanged(newData: SupportTicket[]): boolean {
    const newVersion = this.calculateDataVersion(newData);
    const changed = newVersion !== this.lastDataVersion;
    if (changed) this.lastDataVersion = newVersion;
    return changed;
  }
  private calculateDataVersion(data: SupportTicket[]): string {
    return data.map(item => `${item._messageId}:${item['Approval Status']}:${item['Processed At']}`).sort().join('|');
  }
}

const getPriority = (conversation: SupportTicket): number => {
  if (conversation._isEscalated) return 3;
  if (conversation['Approval Status'] === 'Pending') return 2;
  if (conversation['Approval Status'] === 'Needs Iteration') return 2;
  return 1;
};

// --- Sub-components ---
const AnimatedCounter: React.FC<{ value: number, prefix?: string, suffix?: string, decimals?: number }> = ({ value, prefix = '', suffix = '', decimals = 0 }) => {
    const [animatedValue, setAnimatedValue] = useState(0);

    useEffect(() => {
        const controls = animate(animatedValue, value, {
            duration: 0.8,
            ease: "easeOut",
            onUpdate: (latest) => setAnimatedValue(latest)
        });
        return () => controls.stop();
    }, [value]);

    return <span>{prefix}{animatedValue.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
};

const AnalyticsCard: React.FC<{ title: string; value: number; icon: ReactNode; prefix?: string; suffix?: string; decimals?: number }> = ({ title, value, icon, prefix, suffix, decimals }) => {
    const valueClass = value > 90 ? 'from-green-500/30 to-dark-card' : value > 70 ? 'from-amber-500/30 to-dark-card' : 'from-red-500/30 to-dark-card';
    return (
        <div className={`bg-gradient-to-br ${valueClass} border border-dark-border rounded-xl p-4 space-y-2`}>
            <div className="flex justify-between items-center text-dark-text-secondary">
                <p className="text-sm font-semibold">{title}</p>
                {icon}
            </div>
            <p className="text-4xl font-bold text-white"><AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} /></p>
        </div>
    );
};

const AnalyticsDashboard: React.FC<{ metrics: DashboardMetrics | null }> = ({ metrics }) => {
    if (!metrics) {
        return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-pulse">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-dark-card rounded-xl"></div>)}
        </div>;
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <AnalyticsCard title="Today's Convos" value={metrics.conversationsToday} icon={ICONS.trendingUp} />
            <AnalyticsCard title="Open Tickets" value={metrics.openTickets} icon={ICONS.clock} />
            <AnalyticsCard title="AI Approval Rate" value={metrics.approvalRate} suffix="%" icon={ICONS.checkCircle} />
            <AnalyticsCard title="Avg Response" value={metrics.avgResponseTime} suffix="m" icon={ICONS.zap} />
            <AnalyticsCard title="Escalations" value={metrics.escalations} icon={ICONS.warning} />
            <AnalyticsCard title="Emails Sent Today" value={metrics.emailsSentToday} icon={ICONS.mail} />
        </div>
    );
};

const SupportAIChatSection: React.FC<{ tickets: SupportTicket[], metrics: DashboardMetrics | null }> = ({ tickets, metrics }) => {
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [response, setResponse] = useState<AIChatResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const askAIAssistant = async (q: string) => {
        if (!q.trim()) return;
        setIsLoading(true);
        setResponse(null);
        setError(null);
        try {
            const payload: AIChatPayload = {
                userId: 'demo@zulari.app',
                query: q,
                context: { currentData: tickets.slice(0, 50), timeRange: 'today', metrics }
            };
            const res = await supportService.chatWithSupportAI(payload);
            setResponse(res);
        } catch (err: any) {
            setError(err.message || 'Failed to get response');
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickQuery = (q: string) => {
        setQuery(q);
        askAIAssistant(q);
    };

    const quickQueries = ["Today's pending tickets", "Escalations this week", "Average response time", "Top issues today"];

    return (
        <div className="ai-assistant-section">
            <div className="assistant-header">
                <h3>🤖 Ask Your AI Assistant</h3>
                <p>Query your support data in natural language</p>
            </div>
            <div className="assistant-input-container">
                <input
                    type="text" value={query} onChange={e => setQuery(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && askAIAssistant(query)}
                    placeholder="e.g., Show me all escalated tickets with API errors"
                    className="assistant-input" disabled={isLoading}
                />
                <button onClick={() => askAIAssistant(query)} disabled={isLoading} className="btn-ask-ai">Ask</button>
            </div>
            <div className="quick-queries">
                <span className="quick-queries-label">💡 Quick queries:</span>
                {quickQueries.map(q => <button key={q} onClick={() => handleQuickQuery(q)} className="quick-query-btn">{q}</button>)}
            </div>
            
            <AnimatePresence>
                {(isLoading || error || response) && (
                    <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="assistant-response">
                        <div className="response-header">
                            <strong>🤖 AI Assistant:</strong>
                            <button className="btn-close-response" onClick={() => setResponse(null)}>✕</button>
                        </div>
                        {isLoading && <div className="loading-state"><div className="spinner"></div><p>Analyzing...</p></div>}
                        {error && <div className="error-state"><p>❌ {error}</p></div>}
                        {response && <div><p>{response.response}</p></div>}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Filters: React.FC<{ filters: any, setFilters: Function, topics: string[] }> = ({ filters, setFilters, topics }) => {
    const handleFilterChange = (key: string, value: any) => setFilters((prev: any) => ({ ...prev, [key]: value }));
    const statusOptions = ['all', 'pending', 'completed', 'escalated'];

    return (
        <div className="flex flex-col md:flex-row gap-2">
            <input type="search" value={filters.searchQuery} onChange={e => handleFilterChange('searchQuery', e.target.value)} placeholder="Search by customer, email, topic..." className="flex-grow bg-dark-bg border border-dark-border rounded-lg p-2 text-sm" />
            <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)} className="bg-dark-bg border border-dark-border rounded-lg p-2 text-sm">
                {statusOptions.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select value={filters.topicFilter} onChange={e => handleFilterChange('topicFilter', e.target.value)} className="bg-dark-bg border border-dark-border rounded-lg p-2 text-sm">
                <option value="all">All Topics</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
        </div>
    );
};

const StarRating: React.FC<{ rating: number, setRating: (r: number) => void }> = ({ rating, setRating }) => (
    <div className="star-rating">
        {[1, 2, 3, 4, 5].map(star => (
            <span key={star} className={`star ${star <= rating ? 'active' : ''}`} onClick={() => setRating(star)}>⭐</span>
        ))}
    </div>
);

const FeedbackForm: React.FC<{ ticket: SupportTicket, onSubmit: () => void, onCancel: () => void }> = ({ ticket, onSubmit, onCancel }) => {
    const [rating, setRating] = useState(0);
    const [message, setMessage] = useState('');
    const [feedbackType, setFeedbackType] = useState<FeedbackPayload['feedbackType']>('improvement');
    const [isSending, setIsSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rating === 0) return;
        setIsSending(true);
        try {
            const payload: FeedbackPayload = {
                userId: 'demo@zulari.app', feedbackType, rating, message,
                context: { threadId: ticket['Thread ID'], aiAction: ticket['Approval Status'].toLowerCase() as any },
                timestamp: new Date().toISOString()
            };
            await supportService.submitSupportFeedback(payload);
            onSubmit();
        } catch (error) { console.error("Failed to send feedback", error); }
        finally { setIsSending(false); }
    };
    
    return (
        <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} className="feedback-section">
            <div className="feedback-form">
                <div className="feedback-header">
                    <h4>💭 How did the AI perform?</h4>
                    <p>Help us improve AI responses for similar situations.</p>
                </div>
                <StarRating rating={rating} setRating={setRating} />
                <select value={feedbackType} onChange={e => setFeedbackType(e.target.value as any)} className="feedback-type">
                    <option value="improvement">💡 Suggestion</option><option value="praise">👏 Praise</option><option value="bug">🐛 Bug</option>
                </select>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Share your thoughts..." />
                <div className="feedback-actions">
                    <button onClick={handleSubmit} disabled={isSending || rating === 0} className="btn-submit">{isSending ? 'Sending...' : '📤 Send Feedback'}</button>
                    <button onClick={onCancel} className="btn-cancel">Cancel</button>
                </div>
            </div>
        </motion.div>
    );
};

const ConversationCard: React.FC<{ ticket: SupportTicket; onUpdate: (id: string, updates: Partial<SupportTicket>) => void; onFeedbackSent: (ticketId: string) => void; }> = ({ ticket, onUpdate, onFeedbackSent }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [editedDraft, setEditedDraft] = useState(ticket['Draft Email Body']);
    const [isSaving, setIsSaving] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const saveTimeout = useRef<number>();

    useEffect(() => {
        if (editedDraft === ticket['Draft Email Body']) return;
        setIsSaving(true);
        clearTimeout(saveTimeout.current);
        saveTimeout.current = window.setTimeout(async () => {
            try {
                await supportService.saveDraft({ message_id: ticket._messageId, user_email: 'demo@zulari.app', draft_body: editedDraft });
                onUpdate(ticket._messageId, { 'Draft Email Body': editedDraft });
            } catch (err) { console.error("Save draft failed", err); }
            finally { setIsSaving(false); }
        }, 1200);
    }, [editedDraft, ticket]);

    const handleAction = (action: 'approve' | 'decline' | 'escalate') => {
      onUpdate(ticket._messageId, { 'Approval Status': action === 'approve' ? 'Approved' : (action === 'decline' ? 'Declined' : 'Escalated') });
    };

    const isUrgent = ticket._isEscalated || ticket['Inquiry Topic'].toLowerCase().includes('urgent');
    const cardBorder = ticket._needsAction ? 'border-brand-primary' : 'border-dark-border';
    const actionTaken = ['Approved', 'Declined', 'Escalated'].includes(ticket['Approval Status']);

    return (
        <motion.div className={`bg-dark-card border rounded-xl overflow-hidden ${cardBorder} conversation-card`} data-message-id={ticket._messageId}>
            <div className="p-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 text-sm">
                        <span className={`w-2 h-2 rounded-full ${ticket._needsAction ? 'bg-brand-primary animate-pulse' : 'bg-green-500'}`}></span>
                        <span className="font-bold text-white">{ticket['Customer Name']}</span>
                        <span className="text-dark-text-secondary hidden sm:inline">{ticket['Customer Email Address']}</span>
                        <span className="text-dark-text-secondary">•</span>
                        <span className="font-semibold text-dark-text-secondary">{ticket['Inquiry Topic']}</span>
                    </div>
                    <span className="text-xs text-dark-text-secondary">{timeAgo(ticket._timestamp)}</span>
                </div>
                <p className="text-sm text-dark-text-secondary mt-2 pl-4 italic">💭 "{ticket['Inquiry Body']}"</p>
                <p className="text-sm text-dark-text mt-2 pl-4">🤖 AI: "{ticket['Draft Email Body']}"</p>
            </div>
            
            <AnimatePresence>
                {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="p-4 border-t border-dark-border space-y-4">
                            <div>
                                <h4 className="font-semibold text-white text-sm mb-1">📝 Thread Summary</h4>
                                <p className="text-xs bg-dark-bg p-2 rounded-md">{ticket['Thread Summary']}</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-white text-sm mb-1">🤖 AI Draft Response</h4>
                                <textarea value={editedDraft} onChange={e => setEditedDraft(e.target.value)} className="w-full bg-dark-bg p-2 rounded-md text-sm font-mono h-32" />
                                <div className="text-right text-xs text-dark-text-secondary h-4">{isSaving ? 'Saving...' : 'Saved'}</div>
                            </div>
                             <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-border">
                                {actionTaken ? (
                                    <>
                                        <div className="flex-1 text-center py-2 text-sm font-bold text-green-400">Action Taken: {ticket['Approval Status']}</div>
                                        {!ticket._feedbackGiven && !feedbackOpen && (
                                            <button onClick={() => setFeedbackOpen(true)} className="btn-feedback-toggle">⭐ Rate this AI response</button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => handleAction('approve')} className="flex-1 bg-brand-secondary hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-sm">✅ Approve</button>
                                        <button className="flex-1 bg-dark-bg hover:bg-dark-border py-2 px-3 rounded-lg text-sm" onClick={() => handleAction('decline')}>❌ Decline</button>
                                        <button className={`flex-1 ${isUrgent ? 'bg-red-600' : 'bg-dark-bg'} hover:bg-red-500 py-2 px-3 rounded-lg text-sm`} onClick={() => handleAction('escalate')}>🚨 Escalate</button>
                                    </>
                                )}
                            </div>
                            {feedbackOpen && <FeedbackForm ticket={ticket} onSubmit={() => { onFeedbackSent(ticket._messageId); setFeedbackOpen(false); }} onCancel={() => setFeedbackOpen(false)} />}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// --- The main page ---
const CustomerSupportAIDashboardPage: React.FC = () => {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState({ status: 'pending', searchQuery: '', topicFilter: 'all' });
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [scrollTop, setScrollTop] = useState(0);
    const listContainerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(0);

    const cacheRef = useRef(new SheetsCache());
    const deltaDetectorRef = useRef(new DeltaDetector());
    const pollingManagerRef = useRef<SmartPollingManager | null>(null);

    const onDataUpdate = useCallback((newData: SupportTicket[]) => {
        if (deltaDetectorRef.current.hasChanged(newData)) {
            setTickets(newData);
            setMetrics(calculateDashboardMetrics(newData));
        }
        if (initialLoading) setInitialLoading(false);
        setError(null);
    }, [initialLoading]);

    useEffect(() => {
        pollingManagerRef.current = new SmartPollingManager(cacheRef.current, onDataUpdate);
        pollingManagerRef.current.start();
        return () => pollingManagerRef.current?.stop();
    }, [onDataUpdate]);
    
    useLayoutEffect(() => {
        if (listContainerRef.current) {
            setContainerHeight(listContainerRef.current.clientHeight);
        }
    }, []);

    const uniqueTopics = useMemo(() => [...new Set(tickets.map(t => t['Inquiry Topic']))], [tickets]);

    const filteredTickets = useMemo(() => {
        return tickets.filter(t => {
            if (filters.status !== 'all') {
                const statusMap = {
                    'pending': ['Pending', 'Needs Iteration', 'In Progress'], 'completed': ['Completed', 'Approved', 'Declined'], 'escalated': ['Escalated']
                };
                if (!statusMap[filters.status as keyof typeof statusMap]?.includes(t['Approval Status']) && !statusMap[filters.status as keyof typeof statusMap]?.includes(t['Status'])) return false;
            }
            if (filters.topicFilter !== 'all' && t['Inquiry Topic'] !== filters.topicFilter) return false;
            if (filters.searchQuery) {
                const query = filters.searchQuery.toLowerCase();
                return (t['Customer Name']?.toLowerCase().includes(query) || t['Customer Email Address']?.toLowerCase().includes(query) || t['Inquiry Topic']?.toLowerCase().includes(query) || t['Inquiry Body']?.toLowerCase().includes(query));
            }
            return true;
        }).sort((a, b) => getPriority(b) - getPriority(a) || b._timestamp.getTime() - a._timestamp.getTime());
    }, [tickets, filters]);

    const { visibleItems, paddingTop, paddingBottom } = useMemo(() => {
        const ITEM_HEIGHT = 180; // Estimated height for a card
        const OVERSCAN = 5;
        const totalItems = filteredTickets.length;
        const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
        const endIndex = Math.min(totalItems - 1, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
        return {
            visibleItems: filteredTickets.slice(startIndex, endIndex + 1),
            paddingTop: startIndex * ITEM_HEIGHT,
            paddingBottom: (totalItems - (endIndex + 1)) * ITEM_HEIGHT,
        };
    }, [filteredTickets, scrollTop, containerHeight]);

    const handleUpdateTicket = (id: string, updates: Partial<SupportTicket>) => {
        setTickets(prev => prev.map(t => t._messageId === id ? { ...t, ...updates } : t));
        setNotification({ message: 'Action recorded.', type: 'success' });
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
        setTimeout(() => pollingManagerRef.current?.forceUpdate(), 2000);
    };

    const handleFeedbackSent = (ticketId: string) => {
        setTickets(prev => prev.map(t => t._messageId === ticketId ? { ...t, _feedbackGiven: true } : t));
        setNotification({ message: 'Thank you! Your feedback helps the AI improve.', type: 'success' });
    };
    
    return (
        <IntegrationBanner serviceName="Support AI" required={['Gmail']}>
            <NewStyles />
            <div className="space-y-6">
                {notification && <ActionNotification message={notification.message} type={notification.type} />}
                {showConfetti && <div className="fixed inset-0 z-[100] pointer-events-none"><div className="animate-confetti-burst">🎉</div></div>}
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-white">AI Customer Support</h1>
                    <div className="flex items-center gap-2">
                        <Link to="/services/support-ai/history" className="p-2 rounded-md hover:bg-dark-border" title="View Full History">
                            {ICONS.history}
                        </Link>
                        <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-md hover:bg-dark-border" title="Settings">
                            {ICONS.settings}
                        </button>
                    </div>
                </div>
                <AnalyticsDashboard metrics={metrics} />
                <SupportAIChatSection tickets={filteredTickets} metrics={metrics} />
                <Filters filters={filters} setFilters={setFilters} topics={uniqueTopics} />
                {initialLoading && !tickets.length ? <p className="text-center py-8">Loading conversations...</p> : 
                 error ? <p className="text-center py-8 text-red-400">{error}</p> :
                 <div ref={listContainerRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)} className="overflow-y-auto" style={{ height: 'calc(100vh - 500px)' }}>
                     <div style={{ height: paddingTop }} />
                     <div className="space-y-4 px-1">
                        {visibleItems.length > 0 ? visibleItems.map(ticket => (
                            <ConversationCard key={ticket._messageId} ticket={ticket} onUpdate={handleUpdateTicket} onFeedbackSent={handleFeedbackSent} />
                        )) : <p className="text-center py-8 text-dark-text-secondary">No conversations match your filters.</p>}
                     </div>
                     <div style={{ height: paddingBottom }} />
                 </div>
                }
            </div>
            {/* FIX: Changed the onSave prop to pass a function that accepts an argument (which is ignored), to satisfy the component's expected prop type. */}
            <SupportSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} onSave={(settings) => setNotification({message: 'Settings saved!', type: 'success'})} />
        </IntegrationBanner>
    );
};

export default CustomerSupportAIDashboardPage;