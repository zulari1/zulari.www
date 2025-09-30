import React, { useState, useEffect, useCallback, FormEvent, ReactNode, useRef, useMemo } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import DOMPurify from 'dompurify';
import { ICONS } from '../constants';
import * as webAIService from '../services/n8nService';
import { WebAIConversationLog, WebAIEmbedData, WebAISettingsPayload, UnifiedTrainingDoc, AddTrainingDocResponse, WebAIBotConfig, WebAIDeployment } from '../types';
import { formatDistanceToNow, parseISO, isToday, subDays, eachDayOfInterval, format } from 'date-fns';

import ActionNotification from '../components/ActionNotification';

type TabName = 'Dashboard' | 'Conversations' | 'Deploy' | 'Training' | 'Settings';

// --- Reusable Components ---
const Card: React.FC<{ children: ReactNode; className?: string, element?: 'div' | 'form' } & React.AllHTMLAttributes<HTMLElement>> = ({ children, className = '', element = 'div', ...props }) => {
    const Component = element as any;
    return (
        <Component className={`bg-dark-card border border-dark-border rounded-xl p-6 ${className}`} {...props}>
            {children}
        </Component>
    );
};
const Spinner: React.FC<{ message?: string }> = ({ message }) => (
    <div className="flex items-center justify-center gap-2">
        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {message && <span>{message}</span>}
    </div>
);

const AnimatedCounter: React.FC<{ value: number, prefix?: string, suffix?: string, decimals?: number }> = ({ value, prefix = "", suffix = "", decimals = 0 }) => {
    const nodeRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const node = nodeRef.current;
        if (!node) return;
        
        const initialValueText = node.textContent?.replace(/[^0-9.-]+/g, '') || '0';
        const initialValue = parseFloat(initialValueText);
        
        const controls = animate(initialValue, value, {
            duration: 1.2,
            ease: "easeOut",
            onUpdate(latest) {
                if (node) {
                    node.textContent = `${prefix}${latest.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}${suffix}`;
                }
            }
        });

        return () => controls.stop();
    }, [value, prefix, suffix, decimals]);

    return <span ref={nodeRef}>{prefix}{value.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}${suffix}</span>;
};


// --- NEW STUNNING DASHBOARD COMPONENTS ---

const Trend: React.FC<{ value: number }> = ({ value }) => {
    const isPositive = value >= 0;
    const color = isPositive ? 'text-brand-secondary' : 'text-red-400';
    const icon = isPositive ? '▲' : '▼';
    return (
        <span className={`text-xs font-bold flex items-center ${color}`}>
            {icon} {Math.abs(value)}%
        </span>
    );
};

const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
    if (data.length < 2) return <div className="h-8 w-full" />;
    const width = 100;
    const height = 30;
    const maxVal = Math.max(...data, 0);
    const minVal = Math.min(...data, 0);
    const range = maxVal - minVal || 1;
    const points = data.map((d, i) => `${(i / (data.length - 1)) * width},${height - ((d - minVal) / range) * (height-4) + 2}`).join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8">
            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
        </svg>
    );
};

const EnhancedKpiCard: React.FC<{ title: string, value: number, icon: ReactNode, trend: number, sparklineData: number[], prefix?: string, suffix?: string }> = ({ title, value, icon, trend, sparklineData, prefix, suffix }) => (
    <Card className="flex flex-col justify-between">
        <div>
            <div className="flex justify-between items-start">
                <p className="text-sm font-medium text-dark-text-secondary">{title}</p>
                <span className="text-dark-text-secondary p-2 bg-dark-bg rounded-lg">{icon}</span>
            </div>
            <p className="text-4xl font-bold text-white mt-2 flex items-baseline gap-2">
                <AnimatedCounter value={value} prefix={prefix} suffix={suffix} />
                <Trend value={trend} />
            </p>
        </div>
        <div className="mt-2 text-brand-secondary">
            <Sparkline data={sparklineData} />
        </div>
    </Card>
);

const ConversationTrendChart: React.FC<{ data: { date: string, count: number }[] }> = ({ data }) => {
    const maxCount = Math.max(...data.map(d => d.count), 1);
    return (
        <Card>
            <h3 className="font-bold text-white text-lg mb-4">Conversation Trends</h3>
            <div className="flex justify-between items-end h-48 gap-2">
                {data.map((day, i) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group">
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${(day.count / maxCount) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                            className="w-full bg-brand-primary rounded-t-md hover:bg-brand-accent transition-colors"
                        >
                            <div className="opacity-0 group-hover:opacity-100 text-center text-xs font-bold text-white bg-dark-bg rounded px-1 -mt-6">{day.count}</div>
                        </motion.div>
                        <span className="text-xs text-dark-text-secondary">{format(parseISO(day.date), 'EEE')}</span>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const IntentBreakdownChart: React.FC<{ data: { intent: string, count: number }[] }> = ({ data }) => {
    const total = data.reduce((sum, item) => sum + item.count, 0) || 1;
    const colors = ['bg-brand-primary', 'bg-brand-secondary', 'bg-brand-accent', 'bg-purple-500', 'bg-sky-500'];
    return (
        <Card>
            <h3 className="font-bold text-white text-lg mb-4">Intent Breakdown</h3>
            <div className="space-y-3">
                {data.map((item, i) => (
                    <div key={item.intent}>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="font-semibold text-dark-text">{item.intent}</span>
                            <span className="text-dark-text-secondary">{item.count} ({Math.round((item.count / total) * 100)}%)</span>
                        </div>
                        <div className="w-full bg-dark-bg h-2 rounded-full"><motion.div initial={{width:0}} animate={{width: `${(item.count/total)*100}%`}} className={`h-full rounded-full ${colors[i % colors.length]}`} /></div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const RecentConversations: React.FC<{ logs: WebAIConversationLog[] }> = ({ logs }) => (
    <Card>
        <h3 className="font-bold text-white text-lg mb-4">Recent Activity</h3>
        <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
            {logs.slice(0, 5).map((log, i) => (
                <div key={i} className="text-sm border-b border-dark-border pb-2 last:border-0">
                    <p><span className="font-semibold text-dark-text">{log.customer_name || 'Visitor'}</span> asked about <span className="font-semibold text-brand-accent">{log.intent}</span></p>
                    <p className="text-xs text-dark-text-secondary mt-1">"{log.user_message}"</p>
                </div>
            ))}
        </div>
    </Card>
);

const DashboardTab: React.FC<{ kpis: any, logs: WebAIConversationLog[] }> = ({ kpis, logs }) => {
    const last7Days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
    const convsByDay = last7Days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        return {
            date: dateStr,
            count: logs.filter(log => log.Timestamp.startsWith(dateStr)).length,
        };
    });
    
    const intentCounts = useMemo(() => {
        const counts = logs.reduce((acc, log) => {
            const intent = log.intent || 'Unknown';
            acc[intent] = (acc[intent] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(counts).map(([intent, count]) => ({ intent, count })).sort((a,b) => b.count - a.count);
    }, [logs]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };
    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
            <motion.div variants={itemVariants}><EnhancedKpiCard title="Conversations (Today)" value={kpis.convsToday} icon={ICONS.chat} trend={20} sparklineData={convsByDay.map(d => d.count)} /></motion.div>
            <motion.div variants={itemVariants}><EnhancedKpiCard title="Avg. Response (ms)" value={kpis.avgLatency} icon={ICONS.zap} trend={-5} sparklineData={[320, 310, 290, 300, 280, 250, 240]} suffix="ms" /></motion.div>
            <motion.div variants={itemVariants}><EnhancedKpiCard title="Open Escalations" value={kpis.openTickets} icon={ICONS.warning} trend={10} sparklineData={[2, 3, 3, 2, 4, 5, 4]} /></motion.div>
            <motion.div variants={itemVariants}><EnhancedKpiCard title="Bookings (7d)" value={kpis.bookingsLast7Days} icon={ICONS.calendar} trend={15} sparklineData={[0, 1, 0, 2, 1, 3, 2]} /></motion.div>

            <motion.div variants={itemVariants} className="lg:col-span-2"><ConversationTrendChart data={convsByDay} /></motion.div>
            <motion.div variants={itemVariants} className="lg:col-span-2"><IntentBreakdownChart data={intentCounts} /></motion.div>
            <motion.div variants={itemVariants} className="lg:col-span-4"><RecentConversations logs={logs} /></motion.div>
        </motion.div>
    );
};

// --- END NEW DASHBOARD COMPONENTS ---

const ConversationsTab: React.FC<{ logs: WebAIConversationLog[] }> = ({ logs }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLog, setSelectedLog] = useState<WebAIConversationLog | null>(null);

    const filteredLogs = useMemo(() => logs.filter(log =>
        (log.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.customer_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.user_message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.bot_reply_text || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.intent || '').toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()), [logs, searchTerm]);

    const ConversationViewer: React.FC<{ log: WebAIConversationLog, onClose: () => void }> = ({ log, onClose }) => {
        const sanitizedHtml = log.bot_reply_html ? DOMPurify.sanitize(log.bot_reply_html) : null;
        const metadata = log.metadata_json ? JSON.parse(log.metadata_json) : {};
        return (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
                <motion.div initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e=>e.stopPropagation()}>
                    <h3 className="font-bold text-white text-lg mb-4">Conversation with {log.customer_name}</h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        <div className="flex justify-end"><div className="p-3 bg-brand-primary text-white rounded-lg max-w-[80%]"><b>You:</b> {log.user_message}</div></div>
                        <div className="flex justify-start"><div className="p-3 bg-dark-bg rounded-lg max-w-[80%]"><b>Bot:</b> {sanitizedHtml ? <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} /> : log.bot_reply_text}</div></div>
                    </div>
                    <div className="text-xs text-dark-text-secondary mt-4 border-t border-dark-border pt-2 space-y-1">
                        <p><b>Session:</b> {log.session_id}</p>
                        <p><b>Intent:</b> {log.intent}</p>
                        <p><b>Latency:</b> {log.bot_latency_ms}ms</p>
                        {metadata.page_url && <p><b>Source:</b> {metadata.page_url}</p>}
                    </div>
                    <button onClick={onClose} className="mt-4 bg-dark-bg hover:bg-dark-border px-4 py-2 text-sm rounded-lg self-end">Close</button>
                </motion.div>
            </motion.div>
        );
    };

    return (
        <Card>
            <input type="search" placeholder="Search by customer, email, message, or intent..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-dark-bg p-2 rounded-lg border border-dark-border mb-4" />
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {filteredLogs.map((log, index) => (
                    <div key={log.session_id + log.Timestamp + index} className="bg-dark-bg p-3 rounded-lg cursor-pointer hover:bg-dark-border" onClick={() => setSelectedLog(log)}>
                        <div className="flex justify-between items-center text-xs">
                            <p className="font-bold text-white">{log.customer_name || 'Unknown User'}</p>
                            <p className="text-dark-text-secondary">{formatDistanceToNow(parseISO(log.Timestamp), { addSuffix: true })}</p>
                        </div>
                        <p className="text-sm text-dark-text-secondary mt-1 line-clamp-1"><strong>You:</strong> {log.user_message}</p>
                        <p className="text-sm text-dark-text-secondary mt-1 line-clamp-1"><strong>Bot:</strong> {log.bot_reply_text}</p>
                        <div className="flex gap-2 mt-1 text-xs">
                            <span className="bg-dark-border px-2 py-0.5 rounded-full">Intent: {log.intent}</span>
                            <span className={`bg-dark-border px-2 py-0.5 rounded-full ${log.ticket_status?.toLowerCase() === 'open' ? 'text-red-400' : ''}`}>Status: {log.ticket_status || '-'}</span>
                        </div>
                    </div>
                ))}
            </div>

            <AnimatePresence>{selectedLog && <ConversationViewer log={selectedLog} onClose={() => setSelectedLog(null)} />}</AnimatePresence>
        </Card>
    );
};

const DeployTab: React.FC<{ deployments: WebAIDeployment[], botName: string, refreshData: () => void }> = ({ deployments, botName, refreshData }) => {
    const [domain, setDomain] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [embedData, setEmbedData] = useState<WebAIEmbedData | null>(null);
    const [copied, setCopied] = useState(false);
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

    const activeDeployment = useMemo(() => deployments.find(d => d.status === 'Active' || d.status === 'Pending'), [deployments]);

    const handleGenerate = async (e: FormEvent) => {
        e.preventDefault();
        setIsGenerating(true);
        setEmbedData(null);
        setNotification(null);
        try {
            const data = await webAIService.generateEmbedCode({ requested_by: 'demo@zulari.app', bot_name: botName, domain_allowed: domain });
            setEmbedData(data);
            setNotification({message: "Embed code generated!", type: 'success'});
            refreshData(); // Refresh to show the new deployment
        } catch (err: any) {
            setNotification({message: `Error: ${err.message}`, type: 'error'});
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleCopy = (textToCopy: string) => {
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const DeployForm = () => (
         <Card element="form" onSubmit={handleGenerate}>
            <h3 className="font-bold text-white text-lg">Generate Embed</h3>
            <p className="text-sm text-dark-text-secondary mt-1">Enter the domain where you'll deploy the chatbot. Only one active embed is allowed at a time.</p>
            <input type="text" placeholder="yourwebsite.com" value={domain} onChange={e => setDomain(e.target.value)} required className="w-full bg-dark-bg p-2 rounded-lg border border-dark-border mt-4" />
            <button type="submit" disabled={isGenerating} className="w-full mt-3 bg-brand-primary hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg disabled:bg-slate-600 flex items-center justify-center">
                {isGenerating ? <Spinner /> : '🚀 Generate'}
            </button>
            <AnimatePresence>
                {embedData && (
                    <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="mt-4 space-y-2">
                        <h4 className="font-semibold text-white">Your Embed Snippet</h4>
                        <pre className="text-xs bg-dark-bg p-3 rounded-lg overflow-x-auto"><code>{embedData.embed_snippet}</code></pre>
                        <button type="button" onClick={() => handleCopy(embedData.embed_snippet)} className="w-full bg-dark-border hover:bg-dark-bg font-semibold py-2 rounded-lg text-sm">{copied ? '✅ Copied!' : 'Copy to Clipboard'}</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );

    const ExistingDeployment = () => (
        <Card>
             <h3 className="font-bold text-white text-lg">Active Deployment</h3>
             <div className="bg-dark-bg p-3 rounded-lg mt-4">
                <p className="font-semibold text-white">{activeDeployment!.domain_allowed}</p>
                <div className="flex justify-between items-center text-xs mt-1">
                    <span className={`font-bold px-2 py-0.5 rounded-full ${activeDeployment!.status === 'Active' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>{activeDeployment!.status}</span>
                    <span className="text-dark-text-secondary">Issued: {new Date(activeDeployment!.issued_at).toLocaleDateString()}</span>
                </div>
            </div>
            <pre className="text-xs bg-dark-bg p-3 rounded-lg overflow-x-auto mt-3"><code>{activeDeployment!.embed_snippet}</code></pre>
            <button type="button" onClick={() => handleCopy(activeDeployment!.embed_snippet)} className="w-full mt-2 bg-dark-border hover:bg-dark-bg font-semibold py-2 rounded-lg text-sm">{copied ? '✅ Copied!' : 'Copy Snippet'}</button>
            <div className="flex gap-2 mt-2">
                <button className="flex-1 bg-red-500/20 text-red-300 hover:bg-red-500/40 font-semibold py-2 rounded-lg text-sm">Revoke</button>
                <button className="flex-1 bg-dark-border hover:bg-dark-bg font-semibold py-2 rounded-lg text-sm">Re-issue</button>
            </div>
        </Card>
    );

    return (
        <div>
             {notification && <ActionNotification message={notification.message} type={notification.type} />}
             {activeDeployment ? <ExistingDeployment /> : <DeployForm />}
        </div>
    );
};

const AddDocumentModal: React.FC<{ onClose: () => void, onSuccess: () => void }> = ({ onClose, onSuccess }) => {
    const [docName, setDocName] = useState('');
    const [docType, setDocType] = useState<UnifiedTrainingDoc['doc_type']>('Product Data');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!docName.trim() || !content.trim()) { setError('Name and content are required.'); return; }
        setIsSubmitting(true);
        setError(null);
        try {
            const payload = {
                user_email: "demo@zulari.app", agent_name: 'Web AI',
                doc_id: `doc_${Date.now()}`, doc_name: docName, doc_type: docType,
                doc_status: "Complete", uploaded_date: new Date().toISOString().split('T')[0],
                last_updated: new Date().toISOString().split('T')[0], content
            };
            const response: AddTrainingDocResponse = await webAIService.addUnifiedTrainingDoc(payload);
            if (Array.isArray(response) && response[0]?.status === 'Successfull') {
                onSuccess();
            } else { throw new Error('Webhook returned an unexpected response.'); }
        } catch (err: any) { setError(err.message || 'Submission failed.');
        } finally { setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-white text-lg">Add Training Document</h3>
                {error && <p className="text-red-400 text-sm bg-red-900/50 p-2 rounded-md">{error}</p>}
                <select value={docType} onChange={e=>setDocType(e.target.value as any)} className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border"><option>Product Data</option><option>FAQ</option><option>Company DNA</option><option>Personality</option></select>
                <input value={docName} onChange={e=>setDocName(e.target.value)} placeholder="Document Title (e.g., Return Policy)" className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border" />
                <textarea rows={8} value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste content or a public URL here..." className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border font-mono" />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} disabled={isSubmitting} className="bg-dark-bg hover:bg-dark-border px-4 py-2 text-sm rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="bg-brand-primary hover:bg-indigo-500 text-white font-semibold px-4 py-2 text-sm rounded-lg disabled:bg-slate-600">{isSubmitting ? 'Adding...' : 'Add & Train'}</button>
                </div>
            </div>
        </div>
    );
};

const TrainingTab: React.FC<{ docs: UnifiedTrainingDoc[], refreshData: () => void }> = ({ docs, refreshData }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    return (
        <Card>
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-white text-lg">Training Hub</h3>
                <button onClick={() => setIsModalOpen(true)} className="bg-brand-primary hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 text-sm rounded-lg">+ Add Document</button>
            </div>
            <div className="space-y-2 mt-4 max-h-[60vh] overflow-y-auto">
                {docs.map(doc => (
                    <div key={doc.doc_id} className="bg-dark-bg p-3 rounded-lg">
                        <p className="font-semibold text-white">{doc.doc_name}</p>
                        <p className="text-xs text-dark-text-secondary">{doc.doc_type} • Status: {doc.doc_status}</p>
                    </div>
                ))}
            </div>
            <AnimatePresence>
                {isModalOpen && <AddDocumentModal onClose={() => setIsModalOpen(false)} onSuccess={() => { setIsModalOpen(false); refreshData(); }} />}
            </AnimatePresence>
        </Card>
    );
}

const SettingsTab: React.FC<{ config: WebAIBotConfig | null, onSave: (settings: WebAISettingsPayload) => Promise<void> }> = ({ config, onSave }) => {
    const [settings, setSettings] = useState<WebAISettingsPayload>({
        tone: 'professional', escalation_rules: '', greeting: '', fallback: '', booking_enabled: false, user_email: 'demo@zulari.app'
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (config) {
            setSettings(s => ({
                ...s,
                tone: config.default_response_style,
                escalation_rules: config.escalation_rules_json,
                booking_enabled: config.calendar_connected === 'TRUE'
            }));
        }
    }, [config]);

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        await onSave(settings);
        setIsSaving(false);
    }
    
    return (
        <Card element="form" onSubmit={handleSave}>
            <h3 className="font-bold text-white text-lg mb-4">Bot Settings</h3>
            <div className="space-y-4">
                <div><label className="text-sm font-semibold">Greeting Message</label><input type="text" value={settings.greeting} onChange={e => setSettings({...settings, greeting: e.target.value})} placeholder="Hello! How can I assist you?" className="w-full bg-dark-bg p-2 rounded mt-1 border border-dark-border" /></div>
                <div><label className="text-sm font-semibold">Fallback Message</label><input type="text" value={settings.fallback} onChange={e => setSettings({...settings, fallback: e.target.value})} placeholder="I’m not sure, but I’ll connect you to support." className="w-full bg-dark-bg p-2 rounded mt-1 border border-dark-border" /></div>
                <div>
                    <label className="text-sm font-semibold">Bot Tone</label>
                    <select value={settings.tone} onChange={e => setSettings({...settings, tone: e.target.value as any})} className="w-full bg-dark-bg p-2 rounded mt-1 border border-dark-border">
                        <option value="professional">Professional</option> <option value="casual">Casual</option> <option value="empathetic">Empathetic</option>
                        <option value="formal">Formal</option> <option value="concise">Concise</option> <option value="sales">Sales</option> <option value="friendly">Friendly</option>
                    </select>
                </div>
                <div><label className="text-sm font-semibold">Escalation Rules (JSON)</label><textarea rows={5} value={settings.escalation_rules} onChange={e => setSettings({...settings, escalation_rules: e.target.value})} placeholder='{ "keywords": ["human", "agent"], "threshold": 3 }' className="w-full bg-dark-bg p-2 rounded mt-1 border border-dark-border font-mono" /></div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={settings.booking_enabled} onChange={e => setSettings({...settings, booking_enabled: e.target.checked})} /> Enable Calendar Booking</label>
            </div>
            <div className="mt-6 text-right">
                <button type="submit" disabled={isSaving} className="bg-brand-primary hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg disabled:bg-slate-600">{isSaving ? 'Saving...' : 'Save Settings'}</button>
            </div>
        </Card>
    );
}

// --- Main Page Component ---
const WebAssistantServicePage: React.FC = () => {
    const userEmail = 'demo@zulari.app'; // Hardcoded for demo
    const botName = 'KiaBot'; // Hardcoded for demo
    const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
    const [config, setConfig] = useState<WebAIBotConfig | null>(null);
    const [deployments, setDeployments] = useState<WebAIDeployment[]>([]);
    const [logs, setLogs] = useState<WebAIConversationLog[]>([]);
    const [trainingDocs, setTrainingDocs] = useState<UnifiedTrainingDoc[]>([]);

    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [botConfigData, deploymentsData, logsData, trainingData] = await Promise.all([
                webAIService.fetchBotConfig(userEmail),
                webAIService.fetchDeployments(userEmail),
                webAIService.fetchWebAILogs(userEmail, botName),
                webAIService.fetchUnifiedTrainingData(userEmail)
            ]);
            setConfig(botConfigData);
            setDeployments(deploymentsData);
            setLogs(logsData);
            setTrainingDocs(trainingData.filter(d => d.agent_name === 'Web AI'));
        } catch(err: any) {
            setNotification({message: `Failed to load assistant data: ${err.message}`, type: 'error'});
        } finally {
            setLoading(false);
        }
    }, [userEmail, botName]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const kpis = useMemo(() => {
        const todayLogs = logs.filter(r => isToday(parseISO(r.Timestamp)));
        const last7Days = subDays(new Date(), 7);
        const last7DaysLogs = logs.filter(r => parseISO(r.Timestamp) >= last7Days);

        const convsToday = todayLogs.length;
        const totalConvs = logs.length;
        // FIX: Explicitly specify the generic type for the reduce accumulator to 'number'
        // This resolves an issue where TypeScript couldn't infer the type of `s`, leading to an arithmetic error.
        const avgLatency = Math.round(logs.reduce<number>((s, r) => s + (Number(r.bot_latency_ms) || 0), 0) / Math.max(1, totalConvs));
        const openTickets = logs.filter(r => r.ticket_status && r.ticket_status.toLowerCase() === 'open').length;
        const bookingsLast7Days = last7DaysLogs.filter(r => r.meeting_date && r.meeting_date !== '-').length;
        const conversionRatio = totalConvs > 0 ? Math.round((bookingsLast7Days / last7DaysLogs.length) * 100) : 0;
        
        return { convsToday, totalConvs, avgLatency, openTickets, bookingsLast7Days, conversionRatio };
    }, [logs]);
    
    const saveSettings = async (newSettings: WebAISettingsPayload) => {
        try {
            const response = await webAIService.saveWebAIConfig(newSettings);
            // FIX: n8n webhooks can return an array or a single object. This handles both cases.
            // Also checks for 'ok' status for success. The original code had a potential type error here.
            const result = Array.isArray(response) ? response[0] : response;
            if (result && (result.status === 'success' || result.status === 'ok')) {
                fetchData(); // Refetch to confirm changes
                setNotification({ message: 'Settings saved successfully!', type: 'success' });
                setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2000);
            } else { 
                const errorMessage = (result as any)?.message || 'Webhook did not confirm success.';
                throw new Error(errorMessage); 
            }
        } catch(err: any) { 
            setNotification({ message: `Save failed: ${err.message}`, type: 'error' }); 
        }
    };

    const tabs: { name: TabName, icon: ReactNode }[] = [
        { name: 'Dashboard', icon: ICONS.dashboard }, { name: 'Conversations', icon: ICONS.history },
        { name: 'Deploy', icon: ICONS.rocket }, { name: 'Training', icon: ICONS.training }, { name: 'Settings', icon: ICONS.settings },
    ];
    
    const renderContent = () => {
        if (loading) return <div className="flex items-center justify-center h-64"><Spinner message="Loading your Web AI Assistant..." /></div>
        switch (activeTab) {
            case 'Dashboard': return <DashboardTab kpis={kpis} logs={logs} />;
            case 'Conversations': return <ConversationsTab logs={logs} />;
            case 'Deploy': return <DeployTab deployments={deployments} botName={botName} refreshData={fetchData} />;
            case 'Training': return <TrainingTab docs={trainingDocs} refreshData={fetchData} />;
            case 'Settings': return <SettingsTab config={config} onSave={saveSettings} />;
            default: return null;
        }
    };
    
    return (
        <div className="space-y-6">
            {notification && <ActionNotification message={notification.message} type={notification.type} />}
            {showConfetti && <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl pointer-events-none z-[100]"><div className="animate-confetti-burst">🎉</div></div>}
            
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Web AI Assistant: {botName}</h1>
                    <p className="text-dark-text-secondary mt-1">Manage, deploy, and analyze your automated website assistant.</p>
                </div>
                 <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-dark-card border border-dark-border">
                    Status: <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> <span className="font-semibold text-green-400">Active</span>
                </div>
            </header>

            <div className="border-b border-dark-border">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    {tabs.map(tab => (
                        <button key={tab.name} onClick={() => setActiveTab(tab.name)}
                            className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.name ? 'border-brand-primary text-brand-primary' : 'border-transparent text-dark-text-secondary hover:text-white hover:border-gray-500'}`}>
                            {tab.icon} {tab.name}
                        </button>
                    ))}
                </nav>
            </div>
            
             <div className="mt-6">
                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                        {renderContent()}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default WebAssistantServicePage;