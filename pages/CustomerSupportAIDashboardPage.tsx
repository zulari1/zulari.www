import React, { useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import * as supportService from '../services/supportService';
import { calculateDashboardMetrics, timeAgo } from '../utils/supportUtils';
import ActionNotification from '../components/ActionNotification';
import { SupportTicket, DashboardMetrics, SupportFilter, UnifiedTrainingDoc, AddTrainingDocResponse, SupportChaosMetrics, EscalationRules, WebAITrainingDoc, GoogleSheetsValuesResponse, SupportKpis, SupportPerformanceMetrics } from '../types';
import IntegrationBanner from '../components/IntegrationBanner';
import { ICONS } from '../constants';
import * as n8n from '../services/n8nService';
import { calculateSupportAI_IQ } from '../utils/trainingUtils';
import SupportSettingsModal from '../components/support/SupportSettingsModal';
import SupportFeedbackModal from '../components/support/SupportFeedbackModal';
import SupportAIChat from '../components/support/SupportAIChat';


// --- Blueprint-specified Helper Functions ---
const parseSupportTickets = (apiResponse: GoogleSheetsValuesResponse): SupportTicket[] => {
  if (!apiResponse || !apiResponse.values) return [];
  const rows = apiResponse.values;
  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  return dataRows.map(row => {
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header.trim()] = row[index] || '';
    });
    obj._messageId = obj['Message ID'];
    obj._timestamp = new Date(obj['Timestamp']);
    obj._isEscalated = obj['Escalation Flag'] === 'TRUE';
    obj._needsAction = ['Pending', 'Needs Iteration'].includes(obj['Approval Status']);
    
    // Add mock sentiment/confidence for UI
    obj._sentiment = 'Frustrated';
    obj._confidence = 92;

    return obj as SupportTicket;
  });
};

const getPriority = (conversation: SupportTicket): number => {
  if (conversation._isEscalated) return 3;
  if (conversation['Approval Status'] === 'Pending') return 2;
  if (conversation['Approval Status'] === 'Needs Iteration') return 2;
  return 1;
};

// --- Sub-components for the new Dashboard ---
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
    const valueClass = value > 90 ? 'from-green-500/30 to-dark-bg' : value > 70 ? 'from-amber-500/30 to-dark-bg' : 'from-red-500/30 to-dark-bg';
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

const Filters: React.FC<{ filters: any, setFilters: Function, topics: string[] }> = ({ filters, setFilters, topics }) => {
    const handleFilterChange = (key: string, value: any) => {
        setFilters((prev: any) => ({ ...prev, [key]: value }));
    };

    const statusOptions = ['all', 'pending', 'completed', 'escalated'];

    return (
        <div className="flex flex-col md:flex-row gap-2">
            <input
                type="search"
                value={filters.searchQuery}
                onChange={e => handleFilterChange('searchQuery', e.target.value)}
                placeholder="Search by customer, email, topic..."
                className="flex-grow bg-dark-bg border border-dark-border rounded-lg p-2 text-sm"
            />
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

const ConversationCard: React.FC<{ ticket: SupportTicket; onUpdate: (id: string, updates: Partial<SupportTicket>) => void; onGiveFeedback: (ticket: SupportTicket) => void; }> = ({ ticket, onUpdate, onGiveFeedback }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [editedDraft, setEditedDraft] = useState(ticket['Draft Email Body']);
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeout = useRef<number>();

    useEffect(() => {
        if (editedDraft === ticket['Draft Email Body']) return;
        
        setIsSaving(true);
        clearTimeout(saveTimeout.current);
        saveTimeout.current = window.setTimeout(async () => {
            try {
                await supportService.saveDraft({
                    message_id: ticket._messageId,
                    user_email: 'demo@zulari.app',
                    draft_body: editedDraft
                });
                onUpdate(ticket._messageId, { 'Draft Email Body': editedDraft });
            } catch (err) {
                console.error("Save draft failed", err);
            } finally {
                setIsSaving(false);
            }
        }, 1200);
    }, [editedDraft, ticket]);

    const handleAction = (action: 'approve' | 'decline' | 'escalate') => {
      onUpdate(ticket._messageId, { 'Approval Status': action === 'approve' ? 'Approved' : (action === 'decline' ? 'Declined' : 'Escalated') });
    };

    const isUrgent = ticket._isEscalated || ticket['Inquiry Topic'].toLowerCase().includes('urgent');
    const cardBorder = ticket._needsAction ? 'border-brand-primary' : 'border-dark-border';
    const actionTaken = ['Approved', 'Declined', 'Escalated'].includes(ticket['Approval Status']);

    return (
        <motion.div layout className={`bg-dark-card border rounded-xl overflow-hidden ${cardBorder}`}>
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
                <div className="text-xs text-dark-text-secondary mt-2 pl-4">⚡ Confidence: {ticket._confidence}% • 🎯 Sentiment: {ticket._sentiment}</div>
            </div>
            
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
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
                            <details className="text-sm">
                                <summary className="cursor-pointer font-semibold">🧠 AI Reasoning</summary>
                                <p className="text-xs bg-dark-bg p-2 rounded-md mt-1">{ticket.Reasoning}</p>
                            </details>
                             <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-border">
                                {actionTaken ? (
                                    <>
                                        <div className="flex-1 text-center py-2 text-sm font-bold text-green-400">Action Taken: {ticket['Approval Status']}</div>
                                        {!ticket._feedbackGiven && (
                                            <button onClick={() => onGiveFeedback(ticket)} className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-3 rounded-lg text-sm">⭐ Give Feedback</button>
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
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};


// --- The main page, completely rewritten ---
const CustomerSupportAIDashboardPage: React.FC = () => {
    const [view, setView] = useState<'inbox' | 'training'>('inbox');
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState({ status: 'pending', searchQuery: '', topicFilter: 'all' });
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [feedbackModalState, setFeedbackModalState] = useState<{ isOpen: boolean; ticket: SupportTicket | null }>({ isOpen: false, ticket: null });

    const pollingInterval = useRef<number>();

    const fetchData = useCallback(async () => {
        if (!loading) setLoading(true);
        setError(null);
        try {
            const data = await supportService.fetchSupportTickets();
            const parsedTickets = parseSupportTickets(data);
            setTickets(parsedTickets);
            setMetrics(calculateDashboardMetrics(parsedTickets));
        } catch (e: any) {
            setError(e.message || "Failed to fetch data.");
        } finally {
            setLoading(false);
        }
    }, [loading]);

    useEffect(() => {
        fetchData();
        // FIX: The `hasActivePending` variable was used outside its scope. I have defined it before the `setInterval` call.
        const hasActivePending = tickets.some(t => t._needsAction);
        const intervalId = window.setInterval(() => {
            if (!document.hidden) {
                fetchData();
            }
        }, hasActivePending ? 10000 : 60000);
        pollingInterval.current = intervalId;

        // FIX: Added a non-null assertion `!` as TypeScript cannot guarantee `pollingInterval.current` is not null inside the callback.
        return () => clearInterval(pollingInterval.current!);
    }, [fetchData]);

    const uniqueTopics = useMemo(() => [...new Set(tickets.map(t => t['Inquiry Topic']))], [tickets]);

    const filteredTickets = useMemo(() => {
        return tickets.filter(t => {
            if (filters.status !== 'all') {
                const statusMap = {
                    'pending': ['Pending', 'Needs Iteration', 'In Progress'],
                    'completed': ['Completed', 'Approved', 'Declined'],
                    'escalated': ['Escalated']
                };
                if (!statusMap[filters.status as keyof typeof statusMap]?.includes(t['Approval Status']) && !statusMap[filters.status as keyof typeof statusMap]?.includes(t['Status'])) {
                    return false;
                }
            }
            if (filters.topicFilter !== 'all' && t['Inquiry Topic'] !== filters.topicFilter) {
                return false;
            }
            if (filters.searchQuery) {
                const query = filters.searchQuery.toLowerCase();
                return (
                    t['Customer Name']?.toLowerCase().includes(query) ||
                    t['Customer Email Address']?.toLowerCase().includes(query) ||
                    t['Inquiry Topic']?.toLowerCase().includes(query) ||
                    t['Inquiry Body']?.toLowerCase().includes(query)
                );
            }
            return true;
        }).sort((a, b) => getPriority(b) - getPriority(a) || b._timestamp.getTime() - a._timestamp.getTime());
    }, [tickets, filters]);

    const handleUpdateTicket = (id: string, updates: Partial<SupportTicket>) => {
        setTickets(prev => prev.map(t => t._messageId === id ? { ...t, ...updates } : t));
        setNotification({ message: 'Your decision has been recorded. For your security and final review, an email has been sent to your inbox to confirm this action.', type: 'success' });
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
    };

    const handleGiveFeedback = (ticket: SupportTicket) => {
        setFeedbackModalState({ isOpen: true, ticket });
    };

    const handleFeedbackSent = (ticketId: string) => {
        setTickets(prev => prev.map(t => t._messageId === ticketId ? { ...t, _feedbackGiven: true } : t));
        setNotification({ message: 'Thank you! Your feedback helps the AI improve.', type: 'success' });
    };

    const inboxView = (
      <div className="space-y-6">
          {showConfetti && <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl pointer-events-none z-[100]"><div className="animate-confetti-burst">🎉</div></div>}
          <AnalyticsDashboard metrics={metrics} />
          <Filters filters={filters} setFilters={setFilters} topics={uniqueTopics} />
          {loading && !tickets.length ? <p>Loading...</p> : 
           error ? <p className="text-red-400">{error}</p> :
           <div className="space-y-4">
              {filteredTickets.length > 0 ? filteredTickets.map(ticket => (
                  <ConversationCard key={ticket._messageId} ticket={ticket} onUpdate={handleUpdateTicket} onGiveFeedback={handleGiveFeedback} />
              )) : <p className="text-center py-8 text-dark-text-secondary">No conversations match your filters.</p>}
           </div>
          }
      </div>
    );
    
    return (
        <IntegrationBanner serviceName="Support AI" required={['Gmail']}>
            <div className="space-y-6">
                {notification && <ActionNotification message={notification.message} type={notification.type} />}
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-white">AI Customer Support</h1>
                    <div className="flex items-center gap-1 p-1 bg-dark-card rounded-lg border border-dark-border">
                        <button onClick={() => setView('inbox')} className={`px-3 py-1 text-sm rounded-md ${view === 'inbox' ? 'bg-brand-primary' : ''}`}>Inbox</button>
                        <button onClick={() => setView('training')} className={`px-3 py-1 text-sm rounded-md ${view === 'training' ? 'bg-brand-primary' : ''}`}>Training</button>
                        <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-md hover:bg-dark-border">{ICONS.settings}</button>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {view === 'inbox' ? inboxView : <SupportAITrainingView />}
                    </motion.div>
                </AnimatePresence>
            </div>
            <SupportSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} onSave={() => setNotification({message: 'Settings saved!', type: 'success'})} />
            <SupportFeedbackModal isOpen={feedbackModalState.isOpen} onClose={() => setFeedbackModalState({isOpen: false, ticket: null})} ticket={feedbackModalState.ticket} onFeedbackSent={handleFeedbackSent} />
            <SupportAIChat tickets={filteredTickets} metrics={metrics} />
        </IntegrationBanner>
    );
};


// PRESERVED TRAINING VIEW (as requested)
const ChaosPanel: React.FC<{ metrics: SupportChaosMetrics }> = ({ metrics }) => (
    <div className="bg-dark-card border border-dark-border rounded-xl p-6 h-full">
        <h2 className="text-xl font-bold text-white mb-4 text-center">😰 YOUR SUPPORT CHAOS (Before AI)</h2>
        <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-red-400">{metrics.unread_emails}</p><p className="text-xs">Unread Emails</p></div>
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-red-400">{metrics.avg_response_time}h</p><p className="text-xs">Avg Response Time</p></div>
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-red-400">{metrics.pending_chats}</p><p className="text-xs">Pending Chats</p></div>
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-red-400">{metrics.after_hours_count}</p><p className="text-xs">After-Hours Msgs</p></div>
        </div>
        <div className="mt-4 pt-4 border-t border-dark-border text-center">
             <p className="text-sm text-dark-text-secondary">Latest Complaint: <i className="text-white">"{metrics.latest_complaint_preview}"</i></p>
        </div>
    </div>
);

const PerformancePanel: React.FC<{ metrics: SupportPerformanceMetrics }> = ({ metrics }) => (
    <div className="bg-dark-card border border-dark-border rounded-xl p-6 h-full">
        <h2 className="text-xl font-bold text-white mb-4 text-center">🏆 AI-POWERED PERFORMANCE (After AI)</h2>
        <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-green-400">{metrics.responses_today}</p><p className="text-xs">Responses Today</p></div>
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-green-400">{metrics.avg_response_time}s</p><p className="text-xs">Avg Response Time</p></div>
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-green-400">{metrics.csat_avg}%</p><p className="text-xs">Avg CSAT</p></div>
            <div className="bg-dark-bg p-3 rounded-lg"><p className="text-2xl font-bold text-green-400">{metrics.time_saved_hours}h</p><p className="text-xs">Time Saved / Day</p></div>
        </div>
        <div className="mt-4 pt-4 border-t border-dark-border text-center">
             <p className="text-lg font-bold text-brand-accent">Total Improvement: +{metrics.improvement_pct}%</p>
        </div>
    </div>
);

const SupportDocsTable: React.FC<{ docs: UnifiedTrainingDoc[], onAdd: () => void, iq: number }> = ({ docs, onAdd, iq }) => (
    <div className="bg-dark-card border border-dark-border rounded-xl p-6 h-full flex flex-col">
        <div className="flex justify-between items-start">
            <div>
                <h2 className="text-xl font-bold text-white">🏗️ Build Your Support AI's Brain</h2>
                <p className="text-sm text-dark-text-secondary">The more complete documents you add, the smarter your AI becomes.</p>
            </div>
            <div className="text-center">
                 <p className="font-bold text-2xl text-brand-accent">{iq}%</p>
                 <p className="text-xs text-dark-text-secondary">Agent IQ</p>
            </div>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 mt-4 flex-grow">
            {docs.length > 0 ? docs.map(doc => (
                <div key={doc.doc_id} className="bg-dark-bg p-3 rounded-md">
                    <p className="font-semibold">📄 {doc.doc_name} ({doc.doc_type})</p>
                    <p className="text-xs text-dark-text-secondary">Status: {doc.doc_status} | Last Updated: {doc.last_updated}</p>
                </div>
            )) : <p className="text-sm text-center text-dark-text-secondary py-4">No documents trained yet.</p>}
        </div>
        <button onClick={onAdd} className="w-full mt-4 bg-dark-bg hover:bg-dark-border font-semibold py-2 rounded-lg">+ Add Document</button>
    </div>
);

const EscalationRulesEditor: React.FC<{ rules: EscalationRules, setRules: (rules: EscalationRules) => void, onSave: () => void, isSaving: boolean }> = ({ rules, setRules, onSave, isSaving }) => {
    const handleToggle = (type: 'auto' | 'manual', rule: string) => {
        const currentList = rules[type];
        const newList = currentList.includes(rule) ? currentList.filter(r => r !== rule) : [...currentList, rule];
        setRules({ ...rules, [type]: newList });
    };

    return (
        <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-2">Smart Escalation Rules</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h3 className="font-bold mb-2">🤖 AI Handles:</h3>
                    <div className="space-y-2">{['Business hours & location', 'Shipping & return policy', 'Product availability'].map(rule => <label key={rule} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rules.auto.includes(rule)} onChange={() => handleToggle('auto', rule)} /> {rule}</label>)}</div>
                </div>
                 <div>
                    <h3 className="font-bold mb-2">🙋 Escalates to You:</h3>
                    <div className="space-y-2">{['Refund requests', 'Complaints & angry tone', 'Custom orders'].map(rule => <label key={rule} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rules.manual.includes(rule)} onChange={() => handleToggle('manual', rule)} /> {rule}</label>)}</div>
                </div>
            </div>
            <button onClick={onSave} disabled={isSaving} className="mt-4 bg-dark-bg hover:bg-dark-border text-sm font-semibold py-2 px-4 rounded-lg">{isSaving ? 'Saving...' : '💾 Save Rules'}</button>
        </div>
    );
};

const AddDocumentModal: React.FC<{ agentName: string, onClose: () => void, onSuccess: () => void }> = ({ agentName, onClose, onSuccess }) => {
    const [docName, setDocName] = useState('');
    const [docType, setDocType] = useState<WebAITrainingDoc['doc_type']>('FAQ');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        setError(null);
        if (!docName.trim() || !content.trim()) { setError('Name and content are required.'); return; }
        setIsSubmitting(true);
        try {
            const payload = {
                user_email: "demo@zulari.app", agent_name: agentName,
                doc_id: `doc_${Date.now()}`, doc_name: docName, doc_type: docType,
                doc_status: "Complete", uploaded_date: new Date().toISOString().split('T')[0],
                last_updated: new Date().toISOString().split('T')[0], content
            };
            const response: AddTrainingDocResponse = await n8n.addUnifiedTrainingDoc(payload);
            if (Array.isArray(response) && response[0]?.status === 'Successfull') onSuccess();
            else throw new Error('Webhook returned an unexpected response.');
        } catch (err: any) { setError(err.message || 'Submission failed.');
        } finally { setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-white text-lg">Add Document to {agentName}</h3>
                {error && <p className="text-red-400 text-sm bg-red-900/50 p-2 rounded-md">{error}</p>}
                <select value={docType} onChange={e=>setDocType(e.target.value as any)} className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border">
                    <option>FAQ</option><option>Policy</option><option>SOP</option><option>Company DNA</option>
                </select>
                <input value={docName} onChange={e=>setDocName(e.target.value)} placeholder="Document Title (e.g., Return Policy)" className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border" />
                <textarea rows={8} value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste content here..." className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border font-mono" />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} disabled={isSubmitting} className="bg-dark-bg hover:bg-dark-border px-4 py-2 text-sm rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="bg-brand-primary hover:bg-indigo-500 text-white font-semibold px-4 py-2 text-sm rounded-lg disabled:bg-slate-600">{isSubmitting ? 'Adding...' : '✅ Add & Train'}</button>
                </div>
            </div>
        </div>
    );
};

const SupportAITrainingView: React.FC = () => {
    const [docs, setDocs] = useState<UnifiedTrainingDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSavingRules, setIsSavingRules] = useState(false);
    
    const chaosMetrics: SupportChaosMetrics = { unread_emails: 124, pending_chats: 32, avg_response_time: 4.5, after_hours_count: 56, latest_complaint_preview: "My order still hasn't arrived...", potential_auto_responses: 75 };
    const performanceMetrics: SupportPerformanceMetrics = { responses_today: 312, whatsapp_responses: 45, escalations_today: 4, avg_response_time: 42, csat_avg: 92, time_saved_hours: 8.5, improvement_pct: 78 };
    const [escalationRules, setEscalationRules] = useState<EscalationRules>({ auto: ['Business hours & location', 'Shipping & return policy', 'Product availability'], manual: ['Refund requests', 'Complaints & angry tone', 'Custom orders'] });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const allDocs = await n8n.fetchUnifiedTrainingData('demo@zulari.app');
            setDocs(allDocs.filter(d => d.agent_name === 'Support AI'));
        } catch (e: any) {
            setNotification({ message: `Failed to fetch training data: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const iqData = useMemo(() => calculateSupportAI_IQ(docs, escalationRules), [docs, escalationRules]);
    
    const handleSaveRules = async () => {
        setIsSavingRules(true);
        setNotification(null);
        try {
            const payload = { user_email: "demo@zulari.app", agent_name: "Support AI", doc_id: `escalation_rules_${Date.now()}`, doc_name: "Escalation Rules", doc_type: "Policy", doc_status: "Complete", uploaded_date: new Date().toISOString().split('T')[0], last_updated: new Date().toISOString().split('T')[0], content: JSON.stringify(escalationRules) };
            const response: AddTrainingDocResponse = await n8n.addUnifiedTrainingDoc(payload);
            if (Array.isArray(response) && response[0]?.status === 'Successfull') { setNotification({ message: 'Escalation rules saved successfully!', type: 'success' }); fetchData(); }
            else { throw new Error('Webhook returned an unexpected response for saving rules.'); }
        } catch (err: any) { setNotification({ message: err.message || 'Failed to save rules.', type: 'error' });
        } finally { setIsSavingRules(false); }
    };
    
    const handleSuccess = () => { setIsModalOpen(false); setNotification({message: 'Document added successfully!', type: 'success'}); fetchData(); };

    if (loading) return <div className="text-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto"></div></div>;

    return (
        <div className="space-y-6">
            {notification && <ActionNotification message={notification.message} type={notification.type} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChaosPanel metrics={chaosMetrics} />
                <PerformancePanel metrics={performanceMetrics} />
            </div>
            <SupportDocsTable docs={docs} onAdd={() => setIsModalOpen(true)} iq={iqData.total_iq} />
            <EscalationRulesEditor rules={escalationRules} setRules={setEscalationRules} onSave={handleSaveRules} isSaving={isSavingRules} />
            {isModalOpen && <AddDocumentModal agentName="Support AI" onClose={() => setIsModalOpen(false)} onSuccess={handleSuccess} />}
        </div>
    );
};


export default CustomerSupportAIDashboardPage;