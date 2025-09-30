import React from 'react';

const ConversationHistoryStyles: React.FC = () => (
  <style>{`
    /* Main Layout */
    .conversation-history-layout {
      font-family: sans-serif;
      min-height: 100vh;
    }

    /* Analytics Header */
    .analytics-header {
      margin-bottom: 30px;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }

    .metric-card {
      background: #1F2937; /* dark-card */
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      transition: all 0.3s ease;
      border-left: 4px solid #374151; /* dark-border */
      color: #F9FAFB; /* dark-text */
    }

    .metric-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 16px rgba(0,0,0,0.1);
    }

    .metric-card.primary {
      border-left-color: #4F46E5; /* brand-primary */
      background: linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(120, 113, 220, 0.1) 100%);
    }

    .metric-card.accent {
      border-left-color: #10B981; /* brand-secondary */
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(10, 150, 105, 0.1) 100%);
    }

    .metric-card.success {
      border-left-color: #10B981;
    }

    .metric-card.warning {
      border-left-color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
    }

    .metric-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #F9FAFB;
      margin-bottom: 8px;
    }

    .metric-label {
      font-size: 0.95rem;
      font-weight: 600;
      color: #9CA3AF;
      margin-bottom: 4px;
    }

    .metric-sublabel {
      font-size: 0.8rem;
      color: #6B7280;
    }

    /* Filters Bar */
    .filters-bar {
      background: #1F2937; /* dark-card */
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .filters-container {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .filter-select {
      padding: 10px 14px;
      border: 2px solid #374151;
      border-radius: 8px;
      font-size: 14px;
      background: #111827; /* dark-bg */
      color: #F9FAFB;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-select:hover,
    .filter-select:focus {
      border-color: #4F46E5;
      outline: none;
    }

    .search-input {
      flex: 1;
      min-width: 250px;
      padding: 10px 14px;
      border: 2px solid #374151;
      border-radius: 8px;
      font-size: 14px;
      background: #111827;
      color: #F9FAFB;
      transition: all 0.2s;
    }

    .search-input:focus {
      border-color: #4F46E5;
      outline: none;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }

    .btn-refresh {
      padding: 10px 20px;
      background: #4F46E5;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-refresh:hover {
      background: #4338CA;
      transform: translateY(-1px);
    }

    /* Two-Column Layout */
    .conversation-layout {
      display: grid;
      grid-template-columns: 400px 1fr;
      gap: 20px;
      height: calc(100vh - 420px);
      min-height: 600px;
    }

    /* Thread List Panel */
    .thread-list-panel {
      background: #1F2937;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .thread-list {
      overflow-y: auto;
      flex: 1;
      padding: 10px;
    }

    .thread-card {
      padding: 16px;
      margin-bottom: 10px;
      background: #111827;
      border: 2px solid transparent;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .thread-card:hover {
      background: #374151;
      border-color: #4B5563;
    }

    .thread-card.selected {
      background: rgba(79, 70, 229, 0.15);
      border-color: #4F46E5;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);
    }

    .thread-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .thread-customer strong { font-size: 15px; color: #F9FAFB; }
    .thread-time { font-size: 12px; color: #9CA3AF; }
    .thread-topic { font-size: 13px; color: #D1D5DB; margin-bottom: 8px; font-weight: 500; }
    .thread-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
    .message-count { color: #9CA3AF; }
    .thread-status { padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11px; }
    .thread-status.completed { background: #064E3B; color: #A7F3D0; }
    .thread-status.pending { background: #92400E; color: #FCD34D; }
    .thread-status.escalated { background: #991B1B; color: #FECACA; }
    .empty-state { padding: 60px 20px; text-align: center; color: #9CA3AF; font-size: 15px; }

    /* Conversation Detail Panel */
    .conversation-detail-panel {
      background: #1F2937;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      overflow-y: auto;
      padding: 30px;
      color: #F9FAFB;
    }
    .empty-detail { display: flex; align-items: center; justify-content: center; height: 100%; color: #9CA3AF; font-size: 16px; }

    /* Detail Header */
    .detail-header { padding-bottom: 25px; border-bottom: 2px solid #374151; margin-bottom: 30px; }
    .header-main h2 { font-size: 18px; color: #4F46E5; margin-bottom: 10px; font-weight: 700; }
    .customer-info { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
    .customer-info strong { font-size: 20px; color: #F9FAFB; }
    .customer-info .email { color: #9CA3AF; font-size: 14px; }
    .header-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .meta-item { display: flex; flex-direction: column; gap: 4px; }
    .meta-item .label { font-size: 12px; color: #9CA3AF; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
    .meta-item .value { font-size: 14px; color: #F9FAFB; font-weight: 500; }
    .status-badge { padding: 4px 12px; border-radius: 14px; font-size: 12px; font-weight: 600; display: inline-block; }
    .status-badge.completed { background: #064E3B; color: #A7F3D0; }
    .status-badge.pending { background: #92400E; color: #FCD34D; }
    .status-badge.escalated { background: #991B1B; color: #FECACA; }
    
    /* Message Timeline */
    .message-timeline { display: flex; flex-direction: column; gap: 30px; }
    .message-block { display: flex; flex-direction: column; gap: 15px; position: relative; padding-left: 30px; }
    .message-block::before { content: ''; position: absolute; left: 12px; top: 40px; bottom: -15px; width: 2px; background: linear-gradient(180deg, #4F46E5 0%, #374151 100%); }
    .message-block:last-child::before { display: none; }
    .message { background: #111827; border-radius: 12px; padding: 20px; border-left: 4px solid #374151; position: relative; }
    .customer-message { border-left-color: #3B82F6; background: #1E3A8A; }
    .ai-analysis { border-left-color: #8B5CF6; background: #5B21B6; }
    .human-action { border-left-color: #10B981; background: #065F46; }
    .message-header { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
    .message-icon { font-size: 20px; }
    .message-label { font-weight: 700; font-size: 12px; color: #D1D5DB; letter-spacing: 0.5px; }
    .message-time { margin-left: auto; font-size: 12px; color: #9CA3AF; }
    .processing-badge, .duration-badge { padding: 4px 10px; background: rgba(79, 70, 229, 0.2); color: #A5B4FC; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .message-content { margin-bottom: 12px; line-height: 1.6; }
    .message-content p { color: #F9FAFB; font-size: 15px; }
    .message-meta { display: flex; gap: 10px; flex-wrap: wrap; }
    .meta-tag { padding: 4px 10px; background: #374151; border-radius: 8px; font-size: 12px; color: #D1D5DB; border: 1px solid #4B5563; }
    .context-section, .reasoning-section, .draft-section { margin-bottom: 15px; }
    .context-section strong, .reasoning-section strong, .draft-section strong { display: block; margin-bottom: 8px; color: #D1D5DB; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .context-section p, .reasoning-section p { color: #F3F4F6; font-size: 14px; line-height: 1.6; }
    .draft-content { background: #1F2937; padding: 15px; border-radius: 8px; border: 2px solid #374151; color: #F9FAFB; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    .action-details { display: flex; flex-direction: column; gap: 12px; }
    .action-status { padding: 12px 16px; border-radius: 10px; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; }
    .action-status.approved { background: #065F46; color: #A7F3D0; }
    .action-status.declined { background: #991B1B; color: #FECACA; }
    .action-outcome, .email-status { font-size: 14px; color: #D1D5DB; }
    .action-outcome strong, .email-status strong { color: #F9FAFB; }
    .status-indicator { margin-left: 8px; color: #10B981; font-weight: 600; }

    /* Thread Metrics */
    .thread-metrics { margin-top: 40px; padding-top: 30px; border-top: 2px solid #374151; }
    .thread-metrics h3 { font-size: 18px; color: #F9FAFB; margin-bottom: 20px; font-weight: 700; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
    .metric-item { background: #111827; padding: 15px; border-radius: 10px; border-left: 3px solid #4F46E5; }
    .metric-item .metric-label { display: block; font-size: 12px; color: #9CA3AF; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-item .metric-value { font-size: 20px; font-weight: 700; color: #F9FAFB; }
    .action-buttons { display: flex; gap: 12px; }
    .btn-secondary { padding: 10px 20px; background: #111827; border: 2px solid #4F46E5; color: #A5B4FC; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-secondary:hover { background: #4F46E5; color: white; transform: translateY(-1px); }

    @media (max-width: 1200px) { .conversation-layout { grid-template-columns: 350px 1fr; } }
    @media (max-width: 992px) { .conversation-layout { grid-template-columns: 1fr; height: auto; } .thread-list-panel { max-height: 400px; } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .message-block, .thread-card { animation: fadeIn 0.4s ease-out; }
    
    /* Scrollbar Styling */
    .thread-list::-webkit-scrollbar,
    .conversation-detail-panel::-webkit-scrollbar { width: 8px; }
    .thread-list::-webkit-scrollbar-track,
    .conversation-detail-panel::-webkit-scrollbar-track { background: #111827; }
    .thread-list::-webkit-scrollbar-thumb,
    .conversation-detail-panel::-webkit-scrollbar-thumb { background: #4B5563; border-radius: 4px; }
    .thread-list::-webkit-scrollbar-thumb:hover,
    .conversation-detail-panel::-webkit-scrollbar-thumb:hover { background: #6B7280; }
  `}</style>
);
export default ConversationHistoryStyles;
