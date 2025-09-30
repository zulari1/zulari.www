import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { deriveRow } from '../utils/salesUtils';
import { computeKpis } from '../utils/computeKpisRobust';
import { SalesRow, SalesFilter, SalesKpis } from '../types';
import * as salesService from '../services/salesService';
import { SheetsCache, SmartPollingManager, DeltaDetector } from '../utils/salesDataService';
import ActionNotification from '../components/ActionNotification';
import SalesHero from '../components/sales/SalesHero';
import SalesFilterBar from '../components/sales/SalesFilterBar';
import SalesList from '../components/sales/SalesList';
import SalesDetailDrawer from '../components/sales/SalesDetailDrawer';
import SalesSettingsModal from '../components/sales/SalesSettingsModal';
import IntegrationBanner from '../components/IntegrationBanner';
import { isSameDay } from 'date-fns';

type SyncStatus = {
    status: 'syncing' | 'synced' | 'delayed' | 'error' | 'paused';
    lastSync: Date | null;
};

const SalesAIAgentDashboardPage: React.FC = () => {
    const [allRows, setAllRows] = useState<SalesRow[]>([]);
    const [kpis, setKpis] = useState<SalesKpis | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [selectedRow, setSelectedRow] = useState<SalesRow | null>(null);
    const [activeFilter, setActiveFilter] = useState<SalesFilter>('PENDING');
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({ status: 'syncing', lastSync: null });

    const cacheRef = useRef(new SheetsCache());
    const deltaDetectorRef = useRef(new DeltaDetector());
    const pollingManagerRef = useRef<SmartPollingManager | null>(null);

    const onDataUpdate = useCallback((data: { rows: SalesRow[], lastSync: Date | null, isStale: boolean }) => {
        if (deltaDetectorRef.current.hasChanged(data.rows)) {
            const derivedRows = data.rows.map(deriveRow);
            setAllRows(derivedRows);
            setKpis(computeKpis(derivedRows));
        }

        setSyncStatus(prev => {
            if (prev.status === 'paused') {
                return { ...prev, lastSync: data.lastSync };
            }
            return { status: data.isStale ? 'delayed' : 'synced', lastSync: data.lastSync };
        });

        if (loading) setLoading(false);
    }, [loading]);

    useEffect(() => {
        pollingManagerRef.current = new SmartPollingManager(cacheRef.current, onDataUpdate);
        pollingManagerRef.current.start();

        return () => {
            pollingManagerRef.current?.stop();
        };
    }, [onDataUpdate]);
    
    const handlePauseToggle = () => {
        setIsPaused(prev => {
            const newPausedState = !prev;
            if (newPausedState) {
                pollingManagerRef.current?.stop();
                setSyncStatus(s => ({ ...s, status: 'paused' }));
            } else {
                pollingManagerRef.current?.start();
                setSyncStatus(s => ({ ...s, status: 'syncing' }));
            }
            return newPausedState;
        });
    };

    const handleManualSync = () => {
        if (pollingManagerRef.current) {
            setSyncStatus(s => ({...s, status: 'syncing'}));
            pollingManagerRef.current.forceUpdate();
        }
    };

    const handleAction = useCallback(async (rowNumber: number, updates: Partial<SalesRow>) => {
        setAllRows(prev => prev.map(r => r.rowNumber === rowNumber ? { ...r, ...updates, Status: 'In Progress' } : r));
        setSelectedRow(prev => prev && prev.rowNumber === rowNumber ? { ...prev, ...updates, Status: 'In Progress' } : prev);
        
        try {
            await salesService.patchRow(rowNumber, updates);
            setNotification({ message: 'Action successful!', type: 'success' });
            if (updates["Meeting Booked"] === "Yes") {
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 3000);
            }
        } catch (e: any) {
            setNotification({ message: `Action failed: ${e.message}`, type: 'error' });
        } finally {
            setTimeout(() => {
                pollingManagerRef.current?.forceUpdate();
            }, 2000);
        }
    }, []);

    const filteredRows = useMemo(() => {
        const today = new Date();
        return allRows.filter(row => {
            switch (activeFilter) {
                case 'TODAY': return row.submitted ? isSameDay(row.submitted, today) : false;
                case 'PENDING': return row.Status === 'Pending' || row.isEscalated;
                case 'BOOKING': return row['Email Type'] === 'Booking';
                case 'ALL': return true;
                default: return true;
            }
        });
    }, [allRows, activeFilter]);

    const pageContent = (
        <div className="space-y-6">
            {showConfetti && <div className="fixed inset-0 z-[100] pointer-events-none"><div className="animate-confetti-burst">🎉</div></div>}
            {notification && <ActionNotification message={notification.message} type={notification.type} />}
            
            <SalesHero 
                kpis={kpis} 
                isLoading={loading && allRows.length === 0}
                isPaused={isPaused} 
                onPauseToggle={handlePauseToggle} 
                onSync={handleManualSync}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenTraining={() => { /* Placeholder */ }}
                syncStatus={syncStatus}
            />
            
            <SalesFilterBar activeFilter={activeFilter} setFilter={setActiveFilter} />

            <SalesList loading={loading && allRows.length === 0} rows={filteredRows} onSelectRow={setSelectedRow} />

            <SalesDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} onAction={handleAction} />
            <SalesSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );

    return (
        <IntegrationBanner serviceName="Sales AI" required={['Gmail', 'Calendar']}>
            {pageContent}
        </IntegrationBanner>
    );
};

export default SalesAIAgentDashboardPage;