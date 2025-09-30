import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as salesService from '../../services/salesService';

const MotionDiv = motion.div as any;

interface SalesSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SalesSettingsModal: React.FC<SalesSettingsModalProps> = ({ isOpen, onClose }) => {
    const [settings, setSettings] = useState({
        auto_approve: { email_types: ["Info","Pricing"], approval_confidence_threshold: 0.7 },
        default_tone: "high-conversion",
        escalation_rules: { escalate_on: ["Partnership","Enterprise"], escalate_when_confidence_below: 0.6 }
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await salesService.saveSettings({ user_email: 'demo@zulari.app', ...settings });
            onClose();
        } catch (e: any) {
            console.error("Save settings failed:", e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                     <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60" onClick={onClose} />
                     <MotionDiv initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-dark-card rounded-xl border border-dark-border z-50 p-6">
                        <h2 className="text-xl font-bold text-white mb-4">Sales AI Settings</h2>
                        <div className="space-y-4 text-sm">
                            <label className="flex items-center justify-between">
                                <span>Auto-approve "Info" requests</span>
                                <input type="checkbox" checked={settings.auto_approve.email_types.includes("Info")} onChange={e => {
                                    const types = settings.auto_approve.email_types;
                                    const newTypes = e.target.checked ? [...types, "Info"] : types.filter(t => t !== "Info");
                                    setSettings(s => ({...s, auto_approve: {...s.auto_approve, email_types: newTypes}}));
                                }} />
                            </label>
                            <label className="flex items-center justify-between">
                                <span>Default Tone</span>
                                <select value={settings.default_tone} onChange={e => setSettings(s => ({...s, default_tone: e.target.value}))} className="bg-dark-bg p-1 rounded border border-dark-border">
                                    <option>high-conversion</option>
                                    <option>empathetic</option>
                                    <option>formal</option>
                                </select>
                            </label>
                             <label className="flex items-center justify-between">
                                <span>Confidence Threshold (%)</span>
                                <input type="number" min="50" max="100" value={settings.auto_approve.approval_confidence_threshold * 100} onChange={e => setSettings(s => ({...s, auto_approve: {...s.auto_approve, approval_confidence_threshold: +e.target.value / 100}}))} className="w-20 bg-dark-bg p-1 rounded border border-dark-border" />
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={onClose} className="bg-dark-bg hover:bg-dark-border px-4 py-2 text-sm rounded-lg">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="bg-brand-primary hover:bg-indigo-500 px-4 py-2 text-sm rounded-lg text-white">
                                {isSaving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                     </MotionDiv>
                 </div>
            )}
        </AnimatePresence>
    );
};

export default SalesSettingsModal;