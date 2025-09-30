import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { SalesRow } from '../../types';
import { ICONS } from '../../constants';
import * as salesService from '../../services/salesService';

const MotionDiv = motion.div as any;

interface SalesDetailDrawerProps {
    row: SalesRow | null;
    onClose: () => void;
    onAction: (rowNumber: number, updates: Partial<SalesRow>) => void;
}

const DetailSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <details className="py-2 border-b border-dark-border last:border-b-0" open>
        <summary className="font-semibold text-white cursor-pointer list-none flex justify-between items-center">
            {title}
            <svg className="w-4 h-4 text-dark-text-secondary transition-transform transform details-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </summary>
        <div className="pt-2 text-sm text-dark-text-secondary prose prose-sm prose-invert max-w-none">{children}</div>
    </details>
);

const MeetingModal: React.FC<{ row: SalesRow, onSave: (updates: Partial<SalesRow>) => void, onCancel: () => void, isBooking: boolean }> = ({ row, onSave, onCancel, isBooking }) => {
    const [details, setDetails] = useState({
        date: '', time: '', link: '', attendees: row.Attendees || row["Customer Name"]
    });

    const handleSave = () => {
        onSave({
            "Meeting Date": details.date,
            "Meeting Time": details.time,
            "Meeting Link": details.link,
            "Attendees": details.attendees,
        });
    };

    return (
        <div className="absolute inset-0 bg-dark-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-dark-card border border-dark-border rounded-lg p-6 w-full max-w-sm space-y-4">
                <h4 className="font-bold text-white">Book Meeting with {row["Customer Name"]}</h4>
                <input type="date" value={details.date} onChange={e => setDetails(d => ({ ...d, date: e.target.value }))} className="w-full bg-dark-bg border border-dark-border rounded p-2 text-sm" />
                <input type="time" value={details.time} onChange={e => setDetails(d => ({ ...d, time: e.target.value }))} className="w-full bg-dark-bg border border-dark-border rounded p-2 text-sm" />
                <input type="url" value={details.link} onChange={e => setDetails(d => ({ ...d, link: e.target.value }))} placeholder="Meeting Link (e.g., meet.google.com/...)" className="w-full bg-dark-bg border border-dark-border rounded p-2 text-sm" />
                <input type="text" value={details.attendees} onChange={e => setDetails(d => ({ ...d, attendees: e.target.value }))} placeholder="Attendees" className="w-full bg-dark-bg border border-dark-border rounded p-2 text-sm" />
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="bg-dark-bg hover:bg-dark-border px-3 py-1.5 rounded text-sm">Cancel</button>
                    <button onClick={handleSave} disabled={isBooking} className="bg-brand-primary hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-sm font-semibold">{isBooking ? 'Booking...' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
};

const SalesDetailDrawer: React.FC<SalesDetailDrawerProps> = ({ row, onClose, onAction }) => {
    const [draft, setDraft] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isBooking, setIsBooking] = useState(false);
    const [showMeetingModal, setShowMeetingModal] = useState(false);
    const saveTimeout = useRef<number>();

    useEffect(() => {
        if (row) setDraft(row["Draft Email"]);
    }, [row]);

    useEffect(() => {
        if (row && draft !== row["Draft Email"]) {
            setIsSaving(true);
            clearTimeout(saveTimeout.current);
            saveTimeout.current = window.setTimeout(async () => {
                try {
                    await salesService.saveDraft({ client_request_id: crypto.randomUUID(), user_email: "demo@zulari.app", message_id: row["Message ID"], draft_email: draft });
                } catch(e) { console.error(e); } 
                finally { setIsSaving(false); }
            }, 1200);
        }
    }, [draft, row]);

    if (!row) return null;

    const handleAction = async (action: 'approve' | 'escalate') => {
        const payload = { client_request_id: crypto.randomUUID(), user_email: "demo@zulari.app", message_id: row["Message ID"], thread_id: row["Thread ID"] };
        const updates = action === 'approve' ? { Status: 'Resolved', Approval: 'Yes', Outcome: 'Approved' } : { Status: 'Escalated', Escalation: 'Yes' };
        onAction(row.rowNumber, updates);
        try {
            if (action === 'approve') await salesService.approveAndSend({...payload, customer_email: row["Customer Email"], subject: `Re: ${row["Inquiry Topic"]}`, body: draft, tone: 'professional'});
            else await salesService.escalate({...payload, assignee: 'sales_manager@company.com', escalation_note: 'User escalated from dashboard.'});
        } catch(e) { console.error(e); }
        onClose();
    };
    
    const handleBookMeeting = async (meetingDetails: Partial<SalesRow>) => {
        setIsBooking(true);
        try {
            const payload = { client_request_id: crypto.randomUUID(), user_email: "demo@zulari.app", message_id: row["Message ID"], customer_email: row["Customer Email"], proposed_slots: [{date: meetingDetails["Meeting Date"], time: meetingDetails["Meeting Time"]}], attendees: (meetingDetails.Attendees || '').split(','), timezone: 'America/New_York' };
            const res = await salesService.bookMeeting(payload);
            onAction(row.rowNumber, { ...meetingDetails, Status: 'Resolved', Outcome: 'Meeting Booked', "Meeting Booked": "Yes", "Meeting Link": res.meeting_link });
        } catch(e) { console.error(e); }
        finally {
            setIsBooking(false);
            setShowMeetingModal(false);
            onClose();
        }
    };

    return (
        <AnimatePresence>
            <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
            <MotionDiv initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="fixed top-0 right-0 h-full w-full max-w-lg bg-dark-card border-l border-dark-border z-50 flex flex-col">
                <header className="p-4 border-b border-dark-border flex-shrink-0 flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-white">{row["Customer Name"]}</h3>
                        <p className="text-sm text-dark-text-secondary">{row["Customer Email"]}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-dark-border text-2xl leading-none">&times;</button>
                </header>
                <main className="flex-1 p-4 overflow-y-auto space-y-2 relative">
                    <DetailSection title="Original Inquiry"><p className="bg-dark-bg p-3 rounded-lg mt-1 whitespace-pre-wrap">{row["Inquiry Body"]}</p></DetailSection>
                    <DetailSection title="AI Reasoning"><p className="bg-dark-bg p-3 rounded-lg mt-1">{row.Reasoning}</p></DetailSection>
                    <DetailSection title="Your Sales Reply (Editable)">
                        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={10} className="w-full bg-dark-bg p-2 rounded-md text-sm font-mono mt-1 border border-dark-border" />
                        <p className="text-xs text-right h-4">{isSaving ? 'Saving...' : 'Saved'}</p>
                    </DetailSection>
                    {showMeetingModal && <MeetingModal row={row} onCancel={() => setShowMeetingModal(false)} onSave={handleBookMeeting} isBooking={isBooking} />}
                </main>
                <footer className="p-3 border-t border-dark-border flex-shrink-0 space-y-2">
                     <div className="flex gap-2">
                        <button onClick={() => handleAction('approve')} className="flex-1 bg-brand-primary hover:bg-indigo-500 text-white font-bold py-2 rounded text-sm">✅ Approve & Send</button>
                        <button onClick={() => setShowMeetingModal(true)} className="flex-1 bg-brand-secondary hover:bg-emerald-500 text-white font-bold py-2 rounded text-sm">📅 Book Meeting</button>
                        <button onClick={() => handleAction('escalate')} className="bg-amber-600 hover:bg-amber-500 text-white font-bold p-2 rounded text-sm" title="Escalate">
                            {React.cloneElement(ICONS.warning, { className: 'h-4 w-4' })}
                        </button>
                    </div>
                </footer>
            </MotionDiv>
        </AnimatePresence>
    );
};

export default SalesDetailDrawer;