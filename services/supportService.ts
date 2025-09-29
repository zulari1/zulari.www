// services/supportService.ts
import { VITE_SUPPORT_SHEET_ID, VITE_GOOGLE_API_KEY, VITE_WEBHOOK_SUPPORT_AI_TRAIN } from '../env';
import { GoogleSheetsValuesResponse, SupportSettingsPayload, FeedbackPayload, AIChatPayload, AIChatResponse } from '../types';

const API_KEY = VITE_GOOGLE_API_KEY;

const NEW_SUPPORT_SHEET_URL = `https://sheets.googleapis.com/v4/spreadsheets/1cYaAG2upk2zp3OKrCQawZJO-L2tcjxGz8Y_LVCJ8lBI/values/Sheet1?key=${API_KEY}`;
const BASE_WEBHOOK_URL = 'https://zclari.app.n8n.cloud/webhook';


async function postToSupportWebhook(endpoint: string, payload: any) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_WEBHOOK_URL}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    mode: 'cors'
  });
  if (!res.ok) {
      const errorText = await res.text().catch(() => `Request failed with status ${res.status}`);
      throw new Error(errorText);
  }
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    // n8n often wraps responses in an array, so we extract the first element
    return Array.isArray(json) ? json[0] : json;
  } catch (e) {
    return { status: 'success', message: 'Action received' };
  }
}

export const approveAndSend = (payload: any) => postToSupportWebhook('support/approve_send', payload);
export const saveDraft = (payload: any) => postToSupportWebhook('support/save_draft', payload);
export const escalateTicket = (payload: any) => postToSupportWebhook('support/escalate', payload);
export const requestIteration = (payload: any) => postToSupportWebhook('support/needs_iteration', payload);

// --- Advanced Features Webhooks ---
export const saveSupportSettings = (payload: SupportSettingsPayload): Promise<{ status: string, configId: string }> => {
    return postToSupportWebhook('custumor_settings', payload);
};

export const submitSupportFeedback = (payload: FeedbackPayload): Promise<{ status: string, feedbackId: string }> => {
    return postToSupportWebhook('Custumor_feedback', payload);
};

export const chatWithSupportAI = (payload: AIChatPayload): Promise<AIChatResponse> => {
    return postToSupportWebhook('ai_assistant_chat', payload);
};


/**
 * Fetches the raw data from the Google Sheet specified in the new blueprint.
 */
export async function fetchSupportTickets(): Promise<GoogleSheetsValuesResponse> {
  const res = await fetch(NEW_SUPPORT_SHEET_URL);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const errorMessage = errorBody?.error?.message || `Google Sheets fetch failed with status ${res.status}. Check Sheet ID, tab name, and API key permissions.`;
    throw new Error(errorMessage);
  }
  return res.json();
}


export async function trainSupport(payload: {
  userEmail: string;
  trainingName: string;
  companyName: string;
  dataType: string;
  dataContent: string;
  tags?: string[];
}) {
  const WEBHOOK_URL = VITE_WEBHOOK_SUPPORT_AI_TRAIN;

  if (!WEBHOOK_URL) {
    throw new Error('Support AI Training webhook URL is not configured.');
  }

  const body = {
    userEmail: payload.userEmail,
    trainingName: payload.trainingName,
    companyName: payload.companyName,
    dataType: payload.dataType,
    dataContent: payload.dataContent,
    tags: payload.tags,
    timestamp: new Date().toISOString(),
    clientId: navigator.userAgent,
    source: 'web-support-training-v1'
  };

  const timeoutMs = 15000;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        mode: 'cors'
      });

      clearTimeout(id);
      
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch (e) {}

      if (!res.ok) {
        throw new Error(`Webhook responded ${res.status}: ${text}`);
      }
      
      const responseData = Array.isArray(json) ? json[0] : json;

      if (responseData && (responseData.status === 'queued' || responseData.jobId)) {
        return { jobId: responseData.jobId || `job_${Date.now()}`, raw: responseData };
      }
      
      if (res.status === 200) {
        return { jobId: null, raw: responseData || text };
      }
      
      throw new Error("Unexpected response from server");

    } catch (err: any) {
      if (attempt === 2) {
        throw new Error(`Failed to send training data: ${err.message || err}`);
      }
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error("Training request failed after multiple retries.");
}


export async function saveSettings(payload: any) {
  console.log(`POST /api/support/save-settings`, payload);
  await new Promise(resolve => setTimeout(resolve, 500));
  return { status: 'saved', savedAt: new Date().toISOString() };
}