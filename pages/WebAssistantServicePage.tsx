import React, { useState, useEffect, useCallback, FormEvent, ReactNode, useRef, useMemo } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import DOMPurify from 'dompurify';
import { ICONS } from '../constants';
import * as webAIService from '../services/n8nService';
import { WebAIConversationLog, WebAIEmbedData, WebAITrainingRow, ChatMessage, WebAISettingsPayload, WebAITrainingDoc, WebAITrainingAckResponse, WebAIAgentSummary, WebAIBotConfig, WebAIDeployment, UnifiedTrainingDoc } from '../types';
import * as trainingUtils from '../utils/trainingUtils';
import { format, formatDistanceToNow, parseISO, isWithinInterval, subDays } from 'date-fns';

import ActionNotification from '../components/ActionNotification';

type TabName = 'Dashboard' | 'Conversations' | 'Deploy' | 'Training' | 'Settings';

// --- Helper Functions ---
const stripQuotes = (s = '') => (s || '').replace(/^"+|"+$/g, '').trim();
const parseCurrency = (s = ''): number => {
    if (!s) return 0;
    const num = Number(String(s).replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(num) ? num : 0;
};
const parsePercent = (s: any): number => {
  if (!s) return 0;
  const clean = String(s).trim();
  if (clean.includes('%')) return parseFloat(clean.replace('%', '')) || 0;
  const n = parseFloat(clean);
  if (n > 0 && n <= 1) return n * 100;
  return n || 0;
};


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

const TypingIndicator: React.FC = () => (
    <div className="flex items-center gap-1 p-3">
        <span className="h-2 w-2 bg-brand-primary rounded-full animate-pulse" style={{ animationDelay: '0s' }}></span>
        <span className="h-2 w-2 bg-brand-primary rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></span>
        <span className="h-2 w-2 bg-brand-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
    </div>
);

// --- Main Page Component ---
const WebAssistantServicePage: React.FC = () => {
    const userEmail = 'demo@zulari.app'; // Hardcoded for demo
    const botName = 'KiaBot'; // Hardcoded for demo
    const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
    const [config, setConfig] = useState<WebAIBotConfig | null>(null);
    const [deployments, setDeployments] = useState<WebAIDeployment[]>([]);
    const [logs, setLogs] = useState<WebAIConversationLog[]>([]);

    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [botConfigData, deploymentsData, logsData] = await Promise.all([
                webAIService.fetchBotConfig(userEmail),
                webAIService.fetchDeployments(userEmail),
                webAIService.fetchWebAILogs(userEmail, botName)
            ]);
            setConfig(botConfigData);
            setDeployments(deploymentsData);
            setLogs(logsData);
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
        if (!logs) return { convsToday: 0, totalConvs: 0, avgLatency: 0, openTickets: 0, bookingsCount: 0, uniqueCustomers: 0 };
        const today = new Date().toISOString().slice(0, 10);
        const convsToday = logs.filter(r => r.Timestamp.slice(0, 10) === today).length;
        const totalConvs = logs.length;
        const avgLatency = Math.round(logs.reduce((s, r) => s + (Number(r.bot_latency_ms) || 0), 0) / Math.max(1, totalConvs));
        const openTickets = logs.filter(r => r.ticket_status && r.ticket_status.toLowerCase() === 'open').length;
        const bookingsCount = logs.filter(r => r.meeting_date && r.meeting_date !== '-').length;
        const uniqueCustomers = new Set(logs.map(l => l.customer_email)).size;
        return { convsToday, totalConvs, avgLatency, openTickets, bookingsCount, uniqueCustomers };
    }, [logs]);
    
    const saveSettings = async (newSettings: WebAISettingsPayload) => {
        try {
            const response = await webAIService.saveWebAIConfig(newSettings);
            if (response && Array.isArray(response) && response[0]?.status === 'success') {
                fetchData(); // Refetch to confirm changes
                setNotification({ message: 'Settings saved successfully!', type: 'success' });
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 2000);
            } else {
                 throw new Error('Webhook did not confirm success.');
            }
        } catch(err: any) {
            setNotification({ message: `Save failed: ${err.message}`, type: 'error' });
        }
    };

    const tabs: { name: TabName, icon: ReactNode }[] = [
        { name: 'Dashboard', icon: ICONS.dashboard },
        { name: 'Conversations', icon: ICONS.history },
        { name: 'Deploy', icon: ICONS.rocket },
        { name: 'Training', icon: ICONS.training },
        { name: 'Settings', icon: ICONS.settings },
    ];
    
    if (loading) {
        return <div className="flex items-center justify-center h-64"><Spinner message="Loading your Web AI Assistant..." /></div>
    }

    return (
        <div className="space-y-6">
            {notification && <ActionNotification message={notification.message} type={notification.type} />}
            {showConfetti && <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl pointer-events-none z-[100]"><div className="animate-confetti-burst">🎉</div></div>}
            
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <span className="text-brand-accent">{ICONS.web}</span>
                        {config?.bot_name || 'Web AI Assistant'}
                    </h1>
                    <p className="text-dark-text-secondary mt-1">Configure, deploy, and monitor your website's AI chatbot.</p>
                </div>
                <div className="flex items-center gap-2">
                     <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${deployments.length > 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                        {deployments.length > 0 ? 'Deployed' : 'Not Deployed'}
                     </span>
                     <button onClick={() => setActiveTab('Deploy')} className="bg-brand-primary hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg text-sm">
                        Install / Re-issue Embed
                     </button>
                </div>
            </header>
            
            <nav className="flex space-x-1 border-b border-dark-border overflow-x-auto">
                {tabs.map(tab => (
                    <button key={tab.name} onClick={() => setActiveTab(tab.name)} className={`flex items-center gap-2 px-3 py-2 border-b-2 text-sm font-semibold whitespace-nowrap ${activeTab === tab.name ? 'border-brand-primary text-white' : 'border-transparent text-dark-text-secondary hover:text-white'}`}>
                        {tab.icon} {tab.name}
                    </button>
                ))}
            </nav>
            
            <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} transition={{duration: 0.2}}>
                    {activeTab === 'Dashboard' && <DashboardTab kpis={kpis} logs={logs} botName={config?.bot_name || 'Web Assistant'} />}
                    {activeTab === 'Conversations' && <ConversationsTab logs={logs} />}
                    {activeTab === 'Deploy' && <DeployTab botName={config?.bot_name || 'Web Assistant'} userEmail={userEmail} deployments={deployments} onDeploySuccess={fetchData} setNotification={setNotification} />}
                    {activeTab === 'Training' && <TrainingTab userEmail={userEmail} setNotification={setNotification} setShowConfetti={setShowConfetti} />}
                    {activeTab === 'Settings' && <SettingsTab config={config} onSave={saveSettings} userEmail={userEmail} />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

// --- Tab Components ---

const DashboardTab: React.FC<{kpis: any, logs: WebAIConversationLog[], botName: string}> = ({ kpis, logs, botName }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="text-center"><p className="text-3xl font-bold"><AnimatedCounter value={kpis.convsToday} /></p><p className="text-xs text-dark-text-secondary">Convs Today</p></Card>
                    <Card className="text-center"><p className="text-3xl font-bold"><AnimatedCounter value={kpis.avgLatency} suffix="ms" /></p><p className="text-xs text-dark-text-secondary">Avg Latency</p></Card>
                    <Card className="text-center"><p className="text-3xl font-bold"><AnimatedCounter value={kpis.openTickets} /></p><p className="text-xs text-dark-text-secondary">Open Tickets</p></Card>
                    <Card className="text-center"><p className="text-3xl font-bold"><AnimatedCounter value={kpis.bookingsCount} /></p><p className="text-xs text-dark-text-secondary">Bookings</p></Card>
                </div>
                 <Card>
                    <h3 className="font-bold text-white mb-2">Conversation Trends</h3>
                    <div className="h-64 bg-dark-bg rounded-lg flex items-center justify-center text-dark-text-secondary">Chart Placeholder</div>
                </Card>
            </div>
            <div className="lg:col-span-1">
                <LiveChatPreview botName={botName} />
            </div>
        </div>
    );
};

const ConversationsTab: React.FC<{ logs: WebAIConversationLog[] }> = ({ logs }) => {
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('all');

    const sessions = useMemo(() => {
        // FIX: Explicitly typed the accumulator in the reduce function to ensure correct type inference for 'grouped'.
        const grouped = logs.reduce((acc: Record<string, WebAIConversationLog[]>, log) => {
            (acc[log.session_id] = acc[log.session_id] || []).push(log);
            return acc;
        }, {} as Record<string, WebAIConversationLog[]>);
        
        // Sort logs within each session
        Object.values(grouped).forEach(sessionLogs => {
            sessionLogs.sort((a, b) => parseISO(a.Timestamp).getTime() - parseISO(b.Timestamp).getTime());
        });
        return grouped;
    }, [logs]);
    
    const filteredSessionKeys = useMemo(() => {
        return Object.keys(sessions).filter(sessionId => {
            const sessionLogs = sessions[sessionId];
            const firstLog = sessionLogs[0];
            if (!firstLog) return false;

            // Date filter
            if (dateFilter !== 'all') {
                const now = new Date();
                const daysToSub = dateFilter === '7' ? 7 : 30;
                if (!isWithinInterval(parseISO(firstLog.Timestamp), { start: subDays(now, daysToSub), end: now })) {
                    return false;
                }
            }
            
            // Search filter
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                return sessionLogs.some(log => 
                    log.customer_name?.toLowerCase().includes(lowerSearch) ||
                    log.customer_email?.toLowerCase().includes(lowerSearch) ||
                    log.user_message?.toLowerCase().includes(lowerSearch) ||
                    log.bot_reply_text?.toLowerCase().includes(lowerSearch) ||
                    log.intent?.toLowerCase().includes(lowerSearch)
                );
            }
            return true;
        }).sort((a, b) => parseISO(sessions[b][0].Timestamp).getTime() - parseISO(sessions[a][0].Timestamp).getTime());

    }, [sessions, searchTerm, dateFilter]);

    const selectedConversation = selectedSessionId ? sessions[selectedSessionId] : null;
    
    useEffect(() => {
        if (!selectedSessionId && filteredSessionKeys.length > 0) {
            setSelectedSessionId(filteredSessionKeys[0]);
        } else if (selectedSessionId && !filteredSessionKeys.includes(selectedSessionId)) {
            setSelectedSessionId(filteredSessionKeys[0] || null);
        }
    }, [filteredSessionKeys, selectedSessionId]);
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[75vh]">
            <Card className="lg:col-span-1 flex flex-col">
                <h3 className="font-bold text-white mb-2">Conversations</h3>
                 <div className="flex flex-col sm:flex-row gap-2 mb-2">
                    <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border" />
                    <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-dark-bg p-2 rounded text-sm border border-dark-border"><option value="all">All Time</option><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option></select>
                </div>
                <div className="space-y-2 overflow-y-auto flex-grow">
                    {filteredSessionKeys.map(sessionId => {
                        const sessionLogs = sessions[sessionId];
                        const firstLog = sessionLogs[0];
                        return (
                            <button key={sessionId} onClick={() => setSelectedSessionId(sessionId)} className={`w-full text-left p-2 rounded-lg ${selectedSessionId === sessionId ? 'bg-brand-primary/20' : 'bg-dark-bg hover:bg-dark-border'}`}>
                                <p className="font-semibold text-sm truncate">{firstLog.customer_name || 'Anonymous'}</p>
                                <p className="text-xs text-dark-text-secondary truncate">{firstLog.user_message}</p>
                                <p className="text-xs text-dark-text-secondary/60">{formatDistanceToNow(parseISO(firstLog.Timestamp), { addSuffix: true })}</p>
                            </button>
                        );
                    })}
                </div>
            </Card>
            <Card className="lg:col-span-2 flex flex-col">
                <h3 className="font-bold text-white mb-2">Transcript</h3>
                {selectedConversation ? (
                    <div className="space-y-4 bg-dark-bg p-4 rounded-lg overflow-y-auto flex-grow">
                        {selectedConversation.map((log, i) => (
                             <div key={i} className={`flex items-end gap-2 ${log.message_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {log.message_type === 'bot' && <span className="text-xl">🤖</span>}
                                <div className={`p-3 rounded-lg text-sm max-w-[85%] ${log.message_type === 'user' ? 'bg-brand-primary text-white' : 'bg-dark-border'}`}>
                                    {log.message_type === 'user' ? log.user_message : log.bot_reply_text}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-center py-16 text-dark-text-secondary">Select a conversation to view transcript.</p>}
            </Card>
        </div>
    );
};

const DeployTab: React.FC<{ botName: string; userEmail: string; deployments: WebAIDeployment[], onDeploySuccess: () => void, setNotification: (n: any) => void }> = ({ botName, userEmail, deployments, onDeploySuccess, setNotification }) => {
    const [domain, setDomain] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const lastDeployment = deployments[0];

    const handleGenerate = async () => {
        if (!domain.trim()) { setNotification({message: 'Domain is required.', type: 'error'}); return; }
        setIsGenerating(true);
        try {
            await webAIService.generateEmbedCode({
                requested_by: userEmail,
                bot_name: botName,
                domain_allowed: domain
            });
            onDeploySuccess();
            setNotification({message: 'Embed code generated!', type: 'success'});
        } catch (err: any) {
            setNotification({message: err.message, type: 'error'});
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleCopy = () => {
        if (!lastDeployment) return;
        navigator.clipboard.writeText(lastDeployment.embed_snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Card>
            <h2 className="text-xl font-bold text-white mb-4">Deploy Your Assistant</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="font-semibold">1. Generate Your Embed Code</h3>
                    <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="www.yourdomain.com" className="w-full bg-dark-bg border border-dark-border rounded-lg p-3"/>
                    <button onClick={handleGenerate} disabled={isGenerating} className="w-full bg-brand-primary hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg disabled:bg-slate-600">
                        {isGenerating ? <Spinner /> : (lastDeployment ? 'Re-issue Embed Code' : 'Generate Embed Code')}
                    </button>
                    {lastDeployment && (
                         <div className="space-y-2">
                            <h3 className="font-semibold">2. Install on Your Website</h3>
                            <pre className="bg-dark-bg p-4 rounded-lg text-xs font-mono whitespace-pre-wrap relative">
                                <code>{lastDeployment.embed_snippet}</code>
                                <button onClick={handleCopy} className="absolute top-2 right-2 p-1 bg-dark-border rounded">{copied ? '✅' : 'Copy'}</button>
                            </pre>
                             <p className="text-xs text-dark-text-secondary">Paste this code right before the closing `&lt;/body&gt;` tag on your website.</p>
                        </div>
                    )}
                </div>
                 <div className="bg-dark-bg p-4 rounded-lg">
                    <h3 className="font-semibold mb-2">3. Installation Guide</h3>
                    <ul className="list-decimal pl-5 space-y-2 text-sm text-dark-text-secondary">
                        <li>Generate your unique embed code.</li>
                        <li>Copy the provided `&lt;iframe&gt;` snippet.</li>
                        <li>Paste it into your website's HTML before the `&lt;/body&gt;` tag.</li>
                        <li>Publish your site changes.</li>
                        <li>Your AI assistant should now appear on your site!</li>
                    </ul>
                </div>
            </div>
        </Card>
    );
};

const ToggleSwitch: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void; }> = ({ enabled, onChange }) => (
    <button type="button" onClick={() => onChange(!enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-brand-primary' : 'bg-slate-600'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

const SettingsTab: React.FC<{config: WebAIBotConfig | null, onSave: (p: WebAISettingsPayload) => Promise<void>, userEmail: string }> = ({ config, onSave, userEmail }) => {
    const [formState, setFormState] = useState<Omit<WebAISettingsPayload, 'user_email'>>({
        tone: 'professional',
        escalation_rules: "Escalate on 3 fallback replies",
        greeting: "Hello! How can I assist you?",
        fallback: "I’m not sure, but I’ll connect you to support.",
        booking_enabled: false,
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (config) {
            setFormState({
                tone: (config.default_response_style as WebAISettingsPayload['tone']) || 'professional',
                escalation_rules: config.escalation_rules_json || "Escalate on 3 fallback replies",
                // Greeting and Fallback are new fields, use defaults if not in config.
                greeting: (config as any).greeting || "Hello! How can I assist you?",
                fallback: (config as any).fallback || "I’m not sure, but I’ll connect you to support.",
                booking_enabled: config.calendar_connected === 'TRUE',
            });
        }
    }, [config]);

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        const payload: WebAISettingsPayload = {
            ...formState,
            user_email: userEmail
        };
        await onSave(payload);
        setIsSaving(false);
    };

    return (
        <Card element="form" onSubmit={handleSave} className="max-w-3xl mx-auto">
             <h2 className="text-2xl font-bold text-white mb-1">Bot Configuration</h2>
             <p className="text-dark-text-secondary mb-6">Fine-tune your AI assistant's personality and behavior.</p>

             <div className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                     <div>
                        <label className="font-semibold text-dark-text">Tone & Style</label>
                        <p className="text-xs text-dark-text-secondary mb-2">Define how your bot communicates with users.</p>
                        <select value={formState.tone} onChange={e => setFormState(c => ({...c, tone: e.target.value as any}))} className="w-full bg-dark-bg border border-dark-border rounded-lg p-3">
                            <option value="formal">Formal</option>
                            <option value="casual">Casual</option>
                            <option value="empathetic">Empathetic</option>
                            <option value="professional">Professional</option>
                        </select>
                     </div>
                     <div>
                        <label className="font-semibold text-dark-text">Escalation Rules</label>
                        <p className="text-xs text-dark-text-secondary mb-2">When should the bot hand over to a human?</p>
                        <input type="text" value={formState.escalation_rules} onChange={e => setFormState(c => ({...c, escalation_rules: e.target.value}))} className="w-full bg-dark-bg border border-dark-border rounded-lg p-3" />
                     </div>
                 </div>

                 <div>
                    <label className="font-semibold text-dark-text">Default Greeting Message</label>
                    <p className="text-xs text-dark-text-secondary mb-2">The first thing your bot says to a new user.</p>
                    <input type="text" value={formState.greeting} onChange={e => setFormState(c => ({...c, greeting: e.target.value}))} className="w-full bg-dark-bg border border-dark-border rounded-lg p-3" />
                 </div>

                <div>
                    <label className="font-semibold text-dark-text">Fallback Response</label>
                    <p className="text-xs text-dark-text-secondary mb-2">What the bot says when it doesn't know the answer.</p>
                    <input type="text" value={formState.fallback} onChange={e => setFormState(c => ({...c, fallback: e.target.value}))} className="w-full bg-dark-bg border border-dark-border rounded-lg p-3" />
                </div>

                <div className="flex items-center justify-between border-t border-dark-border pt-4">
                     <div>
                        <label className="font-semibold text-dark-text">Meeting/Booking Integration</label>
                        <p className="text-xs text-dark-text-secondary">Allow the bot to book meetings in a connected calendar.</p>
                    </div>
                    <ToggleSwitch enabled={formState.booking_enabled} onChange={val => setFormState(c => ({...c, booking_enabled: val}))} />
                </div>

                <div className="flex justify-end pt-4">
                    <button type="submit" disabled={isSaving} className="bg-brand-primary hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg disabled:bg-slate-600 flex items-center gap-2">
                        {isSaving ? <Spinner /> : 'Save Configuration'}
                    </button>
                </div>
             </div>
        </Card>
    );
};

const IQMeter: React.FC<{ iq: number }> = ({ iq }) => (
    <div>
        <div className="flex justify-between items-baseline mb-1">
            <span className="text-xs font-semibold text-dark-text-secondary">Agent IQ</span>
            <span className="text-lg font-bold text-brand-accent">{iq}%</span>
        </div>
        <div className="w-full bg-dark-bg h-2.5 rounded-full border border-dark-border"><motion.div className="bg-brand-primary h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${iq}%` }} /></div>
    </div>
);

const DocumentList: React.FC<{ docs: UnifiedTrainingDoc[] }> = ({ docs }) => {
    const statusPill = (status: string) => {
        const styles: {[key:string]: string} = {
            'Complete': 'bg-green-500/20 text-green-400',
            'Partial': 'bg-amber-500/20 text-amber-400',
            'Empty': 'bg-red-500/20 text-red-400',
        };
        return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[status as keyof typeof styles]}`}>{status}</span>;
    };
    return (
        <div className="mt-4 pt-4 border-t border-dark-border space-y-2">
            <h4 className="text-sm font-bold text-white">Training Documents ({docs.length})</h4>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                {docs.map(doc => (
                    <div key={doc.doc_id} className="bg-dark-bg p-2 rounded-md flex justify-between items-center text-sm">
                        <div>
                            <p className="font-semibold text-white">{doc.doc_name}</p>
                            <p className="text-xs text-dark-text-secondary">{doc.doc_type} • Updated: {doc.last_updated}</p>
                        </div>
                        {statusPill(doc.doc_status)}
                    </div>
                ))}
            </div>
        </div>
    );
};

const TrainingTab: React.FC<{ userEmail: string, setNotification: (n: any) => void; setShowConfetti: (show: boolean) => void; }> = ({ userEmail, setNotification, setShowConfetti }) => {
    const [docs, setDocs] = useState<UnifiedTrainingDoc[]>([]);
    const [summary, setSummary] = useState<UnifiedTrainingDoc | null>(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    
    const fetchData = useCallback(() => {
        setLoading(true);
        webAIService.fetchWebAITrainingData(userEmail)
            .then(data => {
                const webAiDocs = data.filter((d: any) => d.agent_name === 'Web AI');
                if (webAiDocs.length > 0) {
                    setSummary(webAiDocs[0]); // Data is denormalized, so first doc contains summary
                    setDocs(webAiDocs);
                }
            })
            .catch(err => setNotification({ message: `Failed to load training data: ${err.message}`, type: 'error' }))
            .finally(() => setLoading(false));
    }, [userEmail, setNotification]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const iq = useMemo(() => summary ? parsePercent(summary.agent_iq) : 0, [summary]);
    const revenue = useMemo(() => summary ? parseCurrency(summary.revenue_value) : 0, [summary]);

    if (loading) {
        return <div className="text-center p-8"><Spinner message="Loading training data..." /></div>
    }

    if (!summary) {
        return (
            <div className="text-center p-8 bg-dark-card rounded-xl">
                <p className="text-dark-text-secondary">No training data found for Web AI.</p>
                <button onClick={() => setIsModalOpen(true)} className="mt-4 bg-brand-primary hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Add First Document</button>
                {isModalOpen && <AddDocumentModal agentName="Web AI" onClose={() => setIsModalOpen(false)} onSuccess={() => { setIsModalOpen(false); fetchData(); setNotification({message: 'Document added!', type: 'success'})}} />}
            </div>
        )
    }
    
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <motion.div layout className="bg-dark-card border border-dark-border rounded-xl p-6 flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <span className="text-brand-accent">{ICONS.training}</span>
                            Web AI Training Status
                        </h2>
                        <div className="text-right">
                            <p className="font-bold text-lg text-green-400">${revenue.toLocaleString()}</p>
                            <p className="text-xs text-dark-text-secondary">{summary.revenue_share_percent} of revenue</p>
                        </div>
                    </div>
                    <p className="text-sm text-dark-text-secondary mt-2 h-8 line-clamp-2">Last summary: {stripQuotes(summary.last_summary)}</p>
                    <div className="mt-3">
                        <IQMeter iq={iq} />
                    </div>
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <DocumentList docs={docs} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <div className="flex gap-2 mt-4">
                    <button onClick={() => setIsExpanded(prev => !prev)} className="flex-1 bg-dark-bg hover:bg-dark-border text-sm font-semibold py-2 rounded-lg">{isExpanded ? 'Collapse' : `View Documents (${docs.length} total)`}</button>
                    <button onClick={() => setIsModalOpen(true)} className="bg-brand-primary hover:bg-indigo-500 text-sm font-semibold py-2 px-4 rounded-lg">+ Add</button>
                </div>
            </motion.div>
            {isModalOpen && <AddDocumentModal agentName="Web AI" onClose={() => setIsModalOpen(false)} onSuccess={() => { setIsModalOpen(false); fetchData(); setNotification({message: 'Document added!', type: 'success'})}} />}
        </div>
    );
};

const AddDocumentModal: React.FC<{ agentName: string, onClose: () => void, onSuccess: () => void }> = ({ agentName, onClose, onSuccess }) => {
    // A simplified modal for adding training documents.
    const [docName, setDocName] = useState('');
    const [docType, setDocType] = useState('FAQ');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const payload = { user_email: "demo@zulari.app", agent_name: agentName, doc_name: docName, doc_type: docType, content };
            await webAIService.addWebAITrainingDoc(payload);
            onSuccess();
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
         <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-white text-lg">Add Document to {agentName}</h3>
                 <input value={docName} onChange={e=>setDocName(e.target.value)} placeholder="Document Name" className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border" />
                <select value={docType} onChange={e=>setDocType(e.target.value)} className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border"><option>FAQ</option><option>Policy</option></select>
                <textarea rows={8} value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste content..." className="w-full bg-dark-bg p-2 rounded text-sm border border-dark-border" />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="bg-dark-bg px-4 py-2 text-sm rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="bg-brand-primary px-4 py-2 text-sm rounded-lg">{isSubmitting ? 'Adding...' : 'Add'}</button>
                </div>
            </div>
        </div>
    );
};


const LiveChatPreview: React.FC<{ botName: string }> = ({ botName }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        const userMessage: ChatMessage = { role: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        setInput('');
        setIsLoading(true);

        try {
            const res = await webAIService.postWebAIMessage({
                sessionId: 'preview_session',
                message: currentInput,
                bot_name: botName,
                user_email: 'demo@zulari.app'
            });
            const aiMessage: ChatMessage = { role: 'assistant', text: res.bot_reply_text || "Sorry, I couldn't get a response." };
            setMessages(prev => [...prev, aiMessage]);
        } catch (e) {
            const errorMessage: ChatMessage = { role: 'assistant', text: "An error occurred. Please try again." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="flex flex-col h-full">
            <h2 className="text-xl font-bold text-white mb-4">Live Preview</h2>
            <div className="flex-grow bg-dark-bg p-2 rounded-lg overflow-y-auto space-y-2 min-h-[300px]">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`p-2 rounded-lg max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-brand-primary text-white' : 'bg-dark-border'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isLoading && <div className="flex justify-start"><TypingIndicator /></div>}
                <div ref={messagesEndRef} />
            </div>
            <div className="mt-4 flex gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Test your assistant..." className="w-full bg-dark-bg border border-dark-border rounded-lg p-2" disabled={isLoading} />
                <button onClick={handleSend} disabled={isLoading || !input.trim()} className="bg-brand-primary text-white px-3 rounded-lg disabled:bg-slate-600">{ICONS.paperPlane}</button>
            </div>
        </Card>
    );
};


export default WebAssistantServicePage;