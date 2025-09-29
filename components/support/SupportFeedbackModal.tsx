import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ICONS } from '../../constants';
import * as supportService from '../../services/supportService';
import { FeedbackPayload, SupportTicket } from '../../types';

const MotionDiv = motion.div as any;

interface SupportFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: SupportTicket | null;
    onFeedbackSent: (ticketId: string) => void;
}

const StarRating: React.FC<{ rating: number, setRating: (r: number) => void }> = ({ rating, setRating }) => (
    <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(star => (
            <button key={star} onClick={() => setRating(star)} className="text-3xl transition-transform hover:scale-110">
                <span className={star <= rating ? 'text-amber-400' : 'text-dark-border'}>★</span>
            </button>
        ))}
    </div>
);

const SupportFeedbackModal: React.FC<SupportFeedbackModalProps> = ({ isOpen, onClose, ticket, onFeedbackSent }) => {
    const [rating, setRating] = useState(0);
    const [message, setMessage] = useState('');
    const [feedbackType, setFeedbackType] = useState<FeedbackPayload['feedbackType']>('improvement');
    const [isSending, setIsSending] = useState(false);
    
    const handleSubmit = async () => {
        if (!ticket || rating === 0) return;
        setIsSending(true);
        try {
            const payload: FeedbackPayload = {
                userId: 'demo-user-123',
                feedbackType,
                rating,
                message,
                context: {
                    threadId: ticket['Thread ID'],
                    aiAction: ticket['Approval Status'].toLowerCase() as any,
                },
                timestamp: new Date().toISOString()
            };
            await supportService.submitSupportFeedback(payload);
            onFeedbackSent(ticket._messageId);
            onClose();
        } catch (error) {
            console.error("Failed to send feedback", error);
        } finally {
            setIsSending(false);
        }
    };
    
    if (!ticket) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60" onClick={onClose} />
                    <MotionDiv initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-dark-card rounded-xl border border-dark-border z-50">
                        <header className="p-4 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">Feedback on AI Draft</h2>
                            <button onClick={onClose}>{ICONS.xClose}</button>
                        </header>
                        <div className="p-6 space-y-4">
                            <StarRating rating={rating} setRating={setRating} />
                            <div className="flex gap-2 p-1 bg-dark-bg rounded-lg">
                                <button onClick={() => setFeedbackType('improvement')} className={`flex-1 text-sm py-1 rounded-md ${feedbackType==='improvement' ? 'bg-brand-primary' : ''}`}>Improvement</button>
                                <button onClick={() => setFeedbackType('praise')} className={`flex-1 text-sm py-1 rounded-md ${feedbackType==='praise' ? 'bg-brand-primary' : ''}`}>Praise</button>
                                <button onClick={() => setFeedbackType('bug')} className={`flex-1 text-sm py-1 rounded-md ${feedbackType==='bug' ? 'bg-brand-primary' : ''}`}>Bug</button>
                            </div>
                            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Your comments (optional)..." className="w-full bg-dark-bg border border-dark-border rounded p-2 text-sm font-mono"></textarea>
                        </div>
                        <footer className="p-4 flex justify-end">
                             <button onClick={handleSubmit} disabled={isSending || rating === 0} className="bg-brand-primary hover:bg-indigo-500 text-white font-semibold px-4 py-2 text-sm rounded-lg disabled:bg-slate-600">
                                {isSending ? 'Sending...' : 'Send Feedback'}
                            </button>
                        </footer>
                    </MotionDiv>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SupportFeedbackModal;