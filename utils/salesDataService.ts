// utils/salesDataService.ts
import { SalesRow } from '../types';
import * as salesService from '../services/salesService';

export class SheetsCache {
  private cache: Map<string, { data: SalesRow[], timestamp: number }> = new Map();
  private lastFetch: number | null = null;
  public quotaExceeded = false;
  private backoffMultiplier = 1;
  private maxBackoff = 300000; // 5 minutes max
  private pendingRequest: Promise<SalesRow[]> | null = null;

  async getData(forceRefresh = false): Promise<{ rows: SalesRow[], lastSync: Date | null, isStale: boolean }> {
    const now = Date.now();
    const cacheKey = 'sales_data';
    
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (now - cached.timestamp < this.getCacheTTL()) {
        return { rows: cached.data, lastSync: new Date(cached.timestamp), isStale: false };
      }
    }
    
    if (this.pendingRequest) {
      const data = await this.pendingRequest;
      return { rows: data, lastSync: new Date(), isStale: false }; // Assuming pending request is fresh
    }
    
    if (this.quotaExceeded && this.lastFetch && now - this.lastFetch < this.getBackoffDelay()) {
      return { rows: this.getStaleData(), lastSync: this.lastFetch ? new Date(this.lastFetch) : null, isStale: true };
    }
    
    this.pendingRequest = this.fetchFromAPI();
    
    try {
      const data = await this.pendingRequest;
      this.onSuccessfulFetch(data, now);
      return { rows: data, lastSync: new Date(now), isStale: false };
    } catch (error: any) {
      this.onFailedFetch(error, now);
      return { rows: this.getStaleData(), lastSync: this.lastFetch ? new Date(this.lastFetch) : null, isStale: true };
    } finally {
      this.pendingRequest = null;
    }
  }

  async fetchFromAPI(): Promise<SalesRow[]> {
    try {
      return await salesService.fetchRows();
    } catch (error: any) {
        if (error.message.includes('429')) {
            throw new Error('QUOTA_EXCEEDED');
        }
        throw error;
    }
  }

  private onSuccessfulFetch(data: SalesRow[], timestamp: number) {
    this.cache.set('sales_data', { data, timestamp });
    this.lastFetch = timestamp;
    this.quotaExceeded = false;
    this.backoffMultiplier = 1;
    
    try {
      localStorage.setItem('sales_sheets_backup', JSON.stringify({ data, timestamp }));
    } catch (e) {
      console.warn('Failed to save sales backup to localStorage:', e);
    }
  }

  private onFailedFetch(error: Error, timestamp: number) {
    this.lastFetch = timestamp;
    
    if (error.message === 'QUOTA_EXCEEDED') {
      this.quotaExceeded = true;
      this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 32);
    }
    
    console.error('Sales AI fetch failed:', error.message);
  }

  private getCacheTTL(): number {
    if (this.quotaExceeded) return 120000;
    if (this.hasActivePendingItems()) return 15000;
    return 60000;
  }

  private getBackoffDelay(): number {
    return Math.min(30000 * this.backoffMultiplier, this.maxBackoff);
  }

  private getStaleData(): SalesRow[] {
    const cached = this.cache.get('sales_data');
    if (cached) return cached.data;
    
    try {
      const backup = localStorage.getItem('sales_sheets_backup');
      if (backup) {
        return JSON.parse(backup).data;
      }
    } catch (e) {
      console.warn('Failed to load sales backup from localStorage:', e);
    }
    
    return [];
  }

  hasActivePendingItems(): boolean {
    const cached = this.cache.get('sales_data');
    if (!cached) return false;
    
    return cached.data.some(item => item['Status'] === 'Pending');
  }

  async forceRefresh() {
    return await this.getData(true);
  }
}

export class SmartPollingManager {
  private cache: SheetsCache;
  private onDataUpdate: (data: { rows: SalesRow[], lastSync: Date | null, isStale: boolean }) => void;
  private pollInterval: number | null = null;
  private isVisible = !document.hidden;
  private lastActivity = Date.now();
  private debouncedActivityUpdater: number | null = null;

  constructor(cache: SheetsCache, onDataUpdate: (data: { rows: SalesRow[], lastSync: Date | null, isStale: boolean }) => void) {
    this.cache = cache;
    this.onDataUpdate = onDataUpdate;
    this.setupVisibilityHandling();
    this.setupUserActivityTracking();
  }

  start() {
    this.stop();
    this.pollOnce(true); // Initial load
    this.scheduleNextPoll();
  }

  stop() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.debouncedActivityUpdater) clearTimeout(this.debouncedActivityUpdater);
    this.pollInterval = null;
  }
  
  private scheduleNextPoll() {
      if (this.pollInterval) clearInterval(this.pollInterval);
      this.pollInterval = window.setInterval(() => this.pollOnce(), this.getCurrentPollInterval());
  }

  async pollOnce(isInitial = false) {
    if (!isInitial && !this.shouldPoll()) return;
    try {
      const data = await this.cache.getData();
      this.onDataUpdate(data);
    } catch (error) {
      console.error('Polling error:', error);
    } finally {
        this.scheduleNextPoll();
    }
  }

  private shouldPoll(): boolean {
    if (!this.isVisible) return false;
    if (this.cache.quotaExceeded) return false;
    return (Date.now() - this.lastActivity) < 300000;
  }

  private getCurrentPollInterval(): number {
    if (this.cache.hasActivePendingItems()) return 20000;
    if (Date.now() - this.lastActivity < 60000) return 45000;
    return 90000;
  }

  private setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (this.isVisible) {
        this.updateUserActivity();
        this.pollOnce();
      }
    });
  }

  private setupUserActivityTracking() {
    const activityEvents = ['click', 'keydown', 'scroll', 'mousemove'];
    const updateActivity = () => {
      if(this.debouncedActivityUpdater) clearTimeout(this.debouncedActivityUpdater);
      this.debouncedActivityUpdater = window.setTimeout(() => this.updateUserActivity(), 1000);
    };
    activityEvents.forEach(event => document.addEventListener(event, updateActivity, { passive: true }));
  }

  private updateUserActivity() {
    this.lastActivity = Date.now();
    this.scheduleNextPoll();
  }

  async forceUpdate() {
    const data = await this.cache.forceRefresh();
    this.onDataUpdate(data);
    return data;
  }
}

export class DeltaDetector {
  private lastDataVersion: string | null = null;

  hasChanged(newData: SalesRow[]): boolean {
    const newVersion = this.calculateDataVersion(newData);
    const changed = newVersion !== this.lastDataVersion;
    if (changed) this.lastDataVersion = newVersion;
    return changed;
  }

  private calculateDataVersion(data: SalesRow[]): string {
    return data.map(row => `${row['Message ID']}-${row['Status']}-${row['Approval']}-${row['Processed At']}`).sort().join('|');
  }
}