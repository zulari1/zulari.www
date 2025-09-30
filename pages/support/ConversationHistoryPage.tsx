import React, { useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SupportTicket, ConversationThread, ConversationAnalytics, GoogleSheetsValuesResponse } from '../../types';
import * as supportService from '../../services/supportService';
import { processConversationData, calculateConversationAnalytics } from '../../utils/conversationUtils';
import SubPageHeader from '../../components/SubPageHeader';
import { ICONS } from '../../constants';
import ConversationHistoryStyles from '../../components/support/ConversationHistoryStyles';
import DOMPurify from 'dompurify';
// FIX: Add missing import for the 'animate' function from framer-motion.
import { animate } from 'framer-motion';

const AnimatedCounter: React.FC<{ value: number | string, prefix?: string, suffix?: string }> = ({ value, prefix = '', suffix = '' }) => {
    const numericValue = useMemo(() => parseFloat(String(value)), [value]);
    const [animatedValue, setAnimatedValue] = useState(0);

    useEffect(() => {
        if (isNaN(numericValue)) return;
        const controls = animate(animatedValue, numericValue, {
            duration: 1,
            ease: "easeOut",
            onUpdate: latest => setAnimatedValue(latest)
        });
        return () => controls.stop();
    }, [numericValue]);

    const displayValue = isNaN(numericValue) ? value : 
        (String(value).includes('.') ? animatedValue.toFixed(1) : Math.round(animatedValue));

    return <span>{prefix}{displayValue}{suffix}</span>;
};

const AnalyticsHeader: React.FC<{ analytics: ConversationAnalytics | null }> = ({ analytics }) => {
    if (!analytics) return <div className="analytics-header"><div className="analytics-grid">...loading</div></div>;

    const metrics = [
        { label: "Total Conversations", value: analytics.totalConversations, sublabel: "All time", type: 'primary' },
        { label: "Today's Conversations", value: analytics.todaysConversations, sublabel: "Last 24 hours", type: 'accent' },
        { label: "Avg Msgs/Thread", value: analytics.avgMessagesPerThread, sublabel: "Interaction depth" },
        { label: "AI Resolution Rate", value: `${analytics.aiResolutionRate}%`, sublabel: "Without escalation", type: analytics.aiResolutionRate >= 85 ? 'success' : 'warning' },
    ];
    
    return (
        <div className="analytics-header">
            <div className="analytics-grid">
                {metrics.map(metric => (
                    <div key={metric.label} className={`metric-card ${metric.type || ''}`}>
                        <div className="metric-value"><AnimatedCounter value={metric.value} /></div>
                        <div className="metric-label">{metric.label}</div>
                        <div className="metric-sublabel">{metric.sublabel}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FiltersBar: React.FC<{ filters: any, setFilters: Function, threads: ConversationThread[], onRefresh: () => void }> = ({ filters, setFilters, threads, onRefresh }) => {
    const uniqueTopics = useMemo(() => [...new Set(threads.map(t => t.topic))], [threads]);
    const handleFilterChange = (key: string, value: string) => setFilters((prev: any) => ({ ...prev, [key]: value }));

    return (
        <div className="filters-bar">
            <div className="filters-container">
                <select className="filter-select" value={filters.timeRange} onChange={e => handleFilterChange('timeRange', e.target.value)}>
                    <option value="all">All Time</option><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option>
                </select>
                <select className="filter-select" value={filters.topic} onChange={e => handleFilterChange('topic', e.target.value)}>
                    <option value="all">All Topics</option>
                    {uniqueTopics.map(topic => <option key={topic} value={topic}>{topic}</option>)}
                </select>
                <select className="filter-select" value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
                    <option value="all">All Status</option><option value="Completed">Completed</option><option value="Pending">Pending</option><option value="Escalated">Escalated</option>
                </select>
                <input type="text" className="search-input" placeholder="Search customer or message..." value={filters.search} onChange={e => handleFilterChange('search', e.target.value)} />
                <button className="btn-refresh" onClick={onRefresh}>Refresh</button>
            </div>
        </div>
    );
};

const ConversationHistoryPage: React.FC = () => {
    const [threads, setThreads] = useState<ConversationThread[]>([]);
    const [analytics, setAnalytics] = useState<ConversationAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [filters, setFilters] = useState({ timeRange: 'all', topic: 'all', status: 'all', search: '' });

    const loadConversations = useCallback(async () => {
        setLoading(true);
        try {
            const data = await supportService.fetchSupportTickets();
            const processedThreads = processConversationData(data);
            setThreads(processedThreads);
            setAnalytics(calculateConversationAnalytics(processedThreads));
            if (processedThreads.length > 0 && !selectedThreadId) {
                setSelectedThreadId(processedThreads[0].threadId);
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedThreadId]);

    useEffect(() => {
        loadConversations();
    }, []); // Run once on mount

    const filteredThreads = useMemo(() => {
        let filtered = [...threads];
        if (filters.timeRange !== 'all') {
            const now = new Date();
            let cutoff: Date;
            if (filters.timeRange === 'today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            else if (filters.timeRange === 'week') { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7); } 
            else { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 1); }
            filtered = filtered.filter(t => t.startTime && t.startTime >= cutoff);
        }
        if (filters.topic !== 'all') filtered = filtered.filter(t => t.topic === filters.topic);
        if (filters.status !== 'all') filtered = filtered.filter(t => t.status === filters.status);
        if (filters.search.trim()) {
            const query = filters.search.toLowerCase();
            filtered = filtered.filter(t =>
                t.customerName.toLowerCase().includes(query) ||
                t.customerEmail.toLowerCase().includes(query) ||
                t.topic.toLowerCase().includes(query) ||
                t.messages.some(m => m['Inquiry Body'].toLowerCase().includes(query))
            );
        }
        return filtered;
    }, [threads, filters]);

    const selectedThread = useMemo(() => threads.find(t => t.threadId === selectedThreadId), [threads, selectedThreadId]);

    const getTimeAgo = (date: Date | null) => {
        if (!date) return 'N/A';
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    const getStatusIcon = (thread: ConversationThread) => ({ 'Completed': '✅', 'Pending': '⏳', 'Escalated': '🚨', 'In Progress': '🔄' }[thread.status] || '📋');
    
    return (
        <div className="conversation-history-layout bg-dark-bg text-dark-text">
            <ConversationHistoryStyles />
            <SubPageHeader title="Conversation History" icon={ICONS.history} />

            <div className="mt-6">
                <AnalyticsHeader analytics={analytics} />
                <FiltersBar filters={filters} setFilters={setFilters} threads={threads} onRefresh={loadConversations} />

                <div className="conversation-layout">
                    <div className="thread-list-panel">
                        <div className="thread-list">
                            {loading && <p>Loading...</p>}
                            {!loading && filteredThreads.map(thread => (
                                <div key={thread.threadId} className={`thread-card ${selectedThreadId === thread.threadId ? 'selected' : ''}`} onClick={() => setSelectedThreadId(thread.threadId)}>
                                    <div className="thread-header">
                                        <div className="thread-customer"><strong>{thread.customerName}</strong></div>
                                        <div className="thread-time">{getTimeAgo(thread.startTime)}</div>
                                    </div>
                                    <div className="thread-topic">{thread.topic}</div>
                                    <div className="thread-meta">
                                        <span className="message-count">{thread.totalMessages} msg{thread.totalMessages > 1 ? 's' : ''}</span>
                                        <span className={`thread-status ${thread.status.toLowerCase()}`}>{getStatusIcon(thread)} {thread.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="conversation-detail-panel">
                        {selectedThread ? (
                            <div className="conversation-detail">
                                <DetailView thread={selectedThread} />
                            </div>
                        ) : <div className="empty-detail">Select a conversation to view details</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const DetailView: React.FC<{ thread: ConversationThread }> = ({ thread }) => {
    const formatDateTime = (date: Date | null) => date ? date.toLocaleString() : 'N/A';
    const formatDuration = (ms: number) => {
        if (!ms || ms <= 0) return 'N/A';
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    };
    
    return (
        <>
            <div className="detail-header">
                <div className="header-main">
                    <h2>Thread: {thread.threadId}</h2>
                    <div className="customer-info">
                        <strong>{thread.customerName}</strong><span className="email">{thread.customerEmail}</span>
                    </div>
                </div>
                <div className="header-meta">
                    <div className="meta-item"><span className="label">Topic:</span><span className="value">{thread.topic}</span></div>
                    <div className="meta-item"><span className="label">Started:</span><span className="value">{formatDateTime(thread.startTime)}</span></div>
                    <div className="meta-item"><span className="label">Status:</span><span className={`value status-badge ${thread.status.toLowerCase()}`}>{thread.status}</span></div>
                    <div className="meta-item"><span className="label">Messages:</span><span className="value">{thread.totalMessages}</span></div>
                    <div className="meta-item"><span className="label">Duration:</span><span className="value">{formatDuration(thread.duration)}</span></div>
                </div>
            </div>
            <div className="message-timeline">
                {thread.messages.map((msg, index) => <MessageBlock key={index} message={msg} />)}
            </div>
        </>
    );
};

const MessageBlock: React.FC<{ message: SupportTicket }> = ({ message }) => {
    const formatTime = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleTimeString() : 'N/A';
    const aiProcessingTime = (start: string, end: string) => {
        if (!start || !end) return null;
        const duration = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
        return duration.toFixed(1);
    };
    const processingTime = aiProcessingTime(message['Timestamp'], message['Processed At']);
    const approvalIcon = { 'Approved': '✅', 'Declined': '❌' }[message['Approval Status']] || '📋';
    return (
        <div className="message-block">
            <div className="message customer-message">
                <div className="message-header"><span className="message-icon">👤</span><span className="message-label">CUSTOMER MESSAGE</span><span className="message-time">{formatTime(message.Timestamp)}</span></div>
                <div className="message-content"><p>{message['Inquiry Body']}</p></div>
            </div>
            <div className="message ai-analysis">
                <div className="message-header"><span className="message-icon">🤖</span><span className="message-label">AI ANALYSIS & DRAFT</span>{processingTime && <span className="processing-badge">Generated in: {processingTime}s</span>}</div>
                <div className="reasoning-section"><strong>AI Reasoning:</strong><p>{message.Reasoning}</p></div>
                <div className="draft-section"><strong>Draft Response:</strong><div className="draft-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message['Draft Email Body']) }}></div></div>
            </div>
            {message['Approval Status'] && message['Processed At'] && (
                <div className="message human-action">
                    <div className="message-header"><span className="message-icon">👨</span><span className="message-label">HUMAN ACTION</span><span className="message-time">{formatTime(message['Processed At'])}</span></div>
                    <div className="action-details">
                        <div className={`action-status ${message['Approval Status'].toLowerCase().replace(' ', '-')}`}>{approvalIcon} {message['Approval Status']}</div>
                        <div className="action-outcome"><strong>Outcome:</strong> {message.Outcome}</div>
                    </div>
                </div>
            )}
        </div>
    );
};


export default ConversationHistoryPage;