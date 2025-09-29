import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ICONS } from '../../constants';
import * as supportService from '../../services/supportService';
import { SupportSettingsPayload } from '../../types';

const MotionDiv = motion.div as any;

interface SupportSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

const Toggle: React.FC<{ enabled: boolean; onChange: (e: boolean) => void; label: string; }> = ({ enabled, onChange, label }) => (
    <label className="flex items-center justify-between cursor-pointer">
        <span className="text-sm font-medium text-dark-text">{label}</span>
        <div className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${enabled ? 'bg-brand-primary' : 'bg-dark-bg'}`}>
            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </div>
        <input type="checkbox" className="sr-only" checked={enabled} onChange={e => onChange(e.target.checked)} />
    </label>
);

const SupportSettingsModal: React.FC<SupportSettingsModalProps> = ({ isOpen, onClose, onSave }) => {
    const [settings, setSettings] = useState<Omit<SupportSettingsPayload, 'userId'>>({
        aiTone: 'empathetic',
        responseStyle: 'consultative',
        escalationRules: {
            technicalIssues: true,
            refundsAbove: 100,
            confidenceThreshold: 85
        },
        autoApprovalEnabled: false,
        customInstructions: 'Always end with "Is there anything else I can help with today?".'
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await supportService.saveSupportSettings({ ...settings, userId: 'demo-user-123' });
            onSave();
            onClose();
        } catch (error) {
            console.error("Failed to save settings", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
                    <MotionDiv initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-lg bg-dark-card rounded-xl border border-dark-border z-50">
                        <header className="p-4 border-b border-dark-border flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">{ICONS.settings} AI Settings</h2>
                            <button onClick={onClose} className="p-1 rounded-full hover:bg-dark-border">{ICONS.xClose}</button>
                        </header>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-semibold">AI Tone</label><select value={settings.aiTone} onChange={e => setSettings(s=>({...s, aiTone: e.target.value as any}))} className="w-full bg-dark-bg p-2 rounded text-sm mt-1 border border-dark-border"><option>professional</option><option>casual</option><option>empathetic</option></select></div>
                                <div><label className="text-xs font-semibold">Response Style</label><select value={settings.responseStyle} onChange={e => setSettings(s=>({...s, responseStyle: e.target.value as any}))} className="w-full bg-dark-bg p-2 rounded text-sm mt-1 border border-dark-border"><option>brief</option><option>detailed</option><option>consultative</option></select></div>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold mt-2 mb-2">Escalation Rules</h4>
                                <div className="space-y-3 bg-dark-bg p-3 rounded-lg">
                                    <Toggle enabled={settings.escalationRules.technicalIssues} onChange={e => setSettings(s=>({...s, escalationRules: {...s.escalationRules, technicalIssues: e}}))} label="Auto-escalate technical issues" />
                                    <div><label className="text-sm">Refunds above ($)</label><input type="number" value={settings.escalationRules.refundsAbove} onChange={e => setSettings(s=>({...s, escalationRules: {...s.escalationRules, refundsAbove: +e.target.value}}))} className="w-full bg-dark-card p-2 rounded text-sm mt-1 border border-dark-border" /></div>
                                    <div><label className="text-sm">Confidence threshold below (%)</label><input type="range" min="50" max="95" value={settings.escalationRules.confidenceThreshold} onChange={e => setSettings(s=>({...s, escalationRules: {...s.escalationRules, confidenceThreshold: +e.target.value}}))} className="w-full" /></div>
                                </div>
                            </div>
                             <div>
                                <h4 className="text-sm font-bold mt-2 mb-2">Automation</h4>
                                <div className="space-y-3 bg-dark-bg p-3 rounded-lg">
                                     <Toggle enabled={settings.autoApprovalEnabled} onChange={e => setSettings(s=>({...s, autoApprovalEnabled: e}))} label="Auto-approve high confidence replies" />
                                </div>
                            </div>
                            <div><label className="text-xs font-semibold">Custom Instructions</label><textarea value={settings.customInstructions} onChange={e => setSettings(s=>({...s, customInstructions: e.target.value}))} rows={3} placeholder="e.g., Always be positive..." className="w-full bg-dark-bg p-2 rounded text-sm mt-1 border border-dark-border font-mono"></textarea></div>
                        </div>
                        <footer className="p-4 border-t border-dark-border flex justify-end gap-2">
                            <button onClick={onClose} className="bg-dark-bg hover:bg-dark-border px-4 py-2 text-sm rounded-lg">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="bg-brand-primary hover:bg-indigo-500 px-4 py-2 text-sm rounded-lg text-white font-semibold">{isSaving ? 'Saving...' : 'Save Settings'}</button>
                        </footer>
                    </MotionDiv>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SupportSettingsModal;