import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ICONS } from '../../constants';
import * as supportService from '../../services/supportService';
import { AIChatPayload, ChatMessage, DashboardMetrics, SupportTicket } from '../../types';

const MotionDiv = motion.div as any;

interface SupportAIChatProps {
    tickets: SupportTicket[];
    metrics: DashboardMetrics | null;
}

const SupportAIChat: React.FC<SupportAIChatProps> = ({ tickets, metrics }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', text: "Ask me about your support data. Try 'How many tickets about refunds this week?'" }
    ]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);
    
    const handleSend = async () => {
        if (!input.trim()) return;
        const userMessage: ChatMessage = { role: 'user', text: input };
        const loadingMessage: ChatMessage = { role: 'assistant', text: '', isLoading: true };
        setMessages(prev => [...prev, userMessage, loadingMessage]);
        const currentInput = input;
        setInput('');

        try {
            const payload: AIChatPayload = {
                userId: 'demo-user-123',
                query: currentInput,
                context: {
                    currentData: tickets.slice(0, 50), // Send a sample of data for context
                    timeRange: 'today', // This could be dynamic based on filters
                    metrics: metrics,
                }
            };
            const res = await supportService.chatWithSupportAI(payload);
            const aiMessage: ChatMessage = { role: 'assistant', text: res.response };
            setMessages(prev => [...prev.slice(0, -1), aiMessage]);
        } catch (error: any) {
             const errorMessage: ChatMessage = { role: 'assistant', text: `Sorry, an error occurred: ${error.message}` };
             setMessages(prev => [...prev.slice(0, -1), errorMessage]);
        }
    };
    
    return (
        <>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-50 bg-brand-primary text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center transform hover:scale-110 transition-transform"
                aria-label="Open AI Assistant"
            >
                {isOpen ? React.cloneElement(ICONS.xClose, {className: 'h-8 w-8'}) : React.cloneElement(ICONS.chat, {className: 'h-8 w-8'})}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <MotionDiv
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-24 right-6 z-40 w-96 h-[500px] bg-dark-card border border-dark-border rounded-2xl shadow-2xl flex flex-col"
                    >
                        <header className="p-4 border-b border-dark-border flex-shrink-0">
                            <h3 className="font-bold text-white">Support AI Assistant</h3>
                        </header>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                    {msg.role === 'assistant' && <span className="text-xl">🤖</span>}
                                    <div className={`p-2 rounded-lg text-sm ${msg.role === 'user' ? 'bg-brand-primary text-white' : 'bg-dark-bg'}`}>
                                        {msg.isLoading ? '...' : msg.text}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <footer className="p-2 border-t border-dark-border">
                            <div className="flex gap-2">
                                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Ask about your data..." className="flex-1 bg-dark-bg border border-dark-border rounded-lg p-2 text-sm" />
                                <button onClick={handleSend} disabled={!input.trim()} className="p-2 bg-brand-primary rounded-lg disabled:bg-slate-500">{ICONS.paperPlane}</button>
                            </div>
                        </footer>
                    </MotionDiv>
                )}
            </AnimatePresence>
        </>
    );
};

export default SupportAIChat;