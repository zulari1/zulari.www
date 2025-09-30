// services/salesService.ts
import { SalesRow, SalesFilter, GoogleSheetsValuesResponse } from '../types';
import { mapValuesToObjects } from '../utils/salesUtils';
import { 
    VITE_SHEET_ID, 
    VITE_GOOGLE_API_KEY, 
    VITE_WEBHOOK_SALES_APPROVE_SEND,
    VITE_WEBHOOK_SALES_SAVE_DRAFT,
    VITE_WEBHOOK_SALES_ESCALATE,
    VITE_WEBHOOK_SALES_BOOK_MEETING,
    VITE_WEBHOOK_SALES_SETTINGS
} from '../env';

const RANGE = "Sheet1";
const API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${VITE_SHEET_ID}/values/${RANGE}?key=${VITE_GOOGLE_API_KEY}`;


async function postJson(url: string, payload: any) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const text = await res.text().catch(() => 'No response body');
        throw new Error(`Request failed ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : { status: 'ok' };
}


/**
 * Fetches and processes live data from the Google Sheet.
 */
export async function fetchRows(): Promise<SalesRow[]> {
  const res = await fetch(API_URL);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const errorMessage = errorBody?.error?.message || `Google Sheets fetch failed with status ${res.status}. Check Sheet ID, tab name ('${RANGE}'), and API key permissions.`;
    throw new Error(errorMessage);
  }
  
  const data: GoogleSheetsValuesResponse = await res.json();
  if (!data.values) {
    console.warn("Google Sheet response is missing 'values' array.");
    return [];
  }
  
  return mapValuesToObjects(data.values);
}

// --- New Webhook Functions from Blueprint ---

export const approveAndSend = (payload: any): Promise<any> => postJson(VITE_WEBHOOK_SALES_APPROVE_SEND, payload);
export const saveDraft = (payload: any): Promise<any> => postJson(VITE_WEBHOOK_SALES_SAVE_DRAFT, payload);
export const escalate = (payload: any): Promise<any> => postJson(VITE_WEBHOOK_SALES_ESCALATE, payload);
export const bookMeeting = (payload: any): Promise<any> => postJson(VITE_WEBHOOK_SALES_BOOK_MEETING, payload);
export const saveSettings = (payload: any): Promise<any> => postJson(VITE_WEBHOOK_SALES_SETTINGS, payload);


// Mocked write-actions for compatibility if needed elsewhere
export async function patchRow(rowNumber: number, updates: Partial<SalesRow>): Promise<{ status: string, updatedRowNumber: number }> {
  console.log(`Mock PATCH /api/sales/row/${rowNumber}`, { updates });
  await new Promise(resolve => setTimeout(resolve, 500));
  return { status: "ok", updatedRowNumber: rowNumber };
}

export async function train(payload: any): Promise<{ status: string, jobId: string, estimatedSeconds: number }> {
  console.log('Mock POST /api/sales/train', payload);
  await new Promise(resolve => setTimeout(resolve, 1200));
  return { status: "queued", jobId: `train_${Date.now()}`, estimatedSeconds: 120 };
}