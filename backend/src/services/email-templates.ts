import type { WeeklyDigestData, NextBestAction, TopCompany, TierChange, SignalsBySource } from './weekly-digest';

// ---------------------------------------------------------------------------
// Shared style constants (inline CSS for email clients)
// ---------------------------------------------------------------------------

const COLORS = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray500: '#6B7280',
  gray700: '#374151',
  gray900: '#111827',
  white: '#FFFFFF',
  hotBg: '#FEF2F2',
  hotText: '#991B1B',
  warmBg: '#FFFBEB',
  warmText: '#92400E',
  coldBg: '#EFF6FF',
  coldText: '#1E40AF',
  inactiveBg: '#F3F4F6',
  inactiveText: '#6B7280',
};

const TIER_STYLES: Record<string, { bg: string; text: string }> = {
  HOT: { bg: COLORS.hotBg, text: COLORS.hotText },
  WARM: { bg: COLORS.warmBg, text: COLORS.warmText },
  COLD: { bg: COLORS.coldBg, text: COLORS.coldText },
  INACTIVE: { bg: COLORS.inactiveBg, text: COLORS.inactiveText },
};

// ---------------------------------------------------------------------------
// Helper: format numbers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildSignalsBySourceRows(signals: SignalsBySource[]): string {
  if (signals.length === 0) {
    return `<tr><td colspan="2" style="padding:12px 16px;color:${COLORS.gray500};font-size:14px;text-align:center;">No signals this week</td></tr>`;
  }

  return signals
    .map(
      (s) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};font-size:14px;color:${COLORS.gray700};">${escapeHtml(s.source)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};font-size:14px;color:${COLORS.gray900};font-weight:600;text-align:right;">${formatNumber(s.count)}</td>
      </tr>`,
    )
    .join('');
}

function buildTopCompaniesRows(companies: TopCompany[]): string {
  if (companies.length === 0) {
    return `<tr><td colspan="3" style="padding:12px 16px;color:${COLORS.gray500};font-size:14px;text-align:center;">No company activity this week</td></tr>`;
  }

  return companies
    .map((c) => {
      const tierStyle = c.tier ? TIER_STYLES[c.tier] : TIER_STYLES.INACTIVE;
      const tierLabel = c.tier || 'N/A';
      return `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};">
          <div style="font-size:14px;font-weight:600;color:${COLORS.gray900};">${escapeHtml(c.name)}</div>
          ${c.domain ? `<div style="font-size:12px;color:${COLORS.gray500};">${escapeHtml(c.domain)}</div>` : ''}
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${tierStyle.bg};color:${tierStyle.text};">${tierLabel}</span>
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};font-size:14px;color:${COLORS.gray900};font-weight:600;text-align:right;">${formatNumber(c.signalCount)}</td>
      </tr>`;
    })
    .join('');
}

function buildTierChangesRows(changes: TierChange[]): string {
  if (changes.length === 0) {
    return `<tr><td colspan="3" style="padding:12px 16px;color:${COLORS.gray500};font-size:14px;text-align:center;">No tier changes this week</td></tr>`;
  }

  // Show max 10 changes
  const displayed = changes.slice(0, 10);
  const remaining = changes.length - displayed.length;

  let rows = displayed
    .map((tc) => {
      const arrow = tc.direction === 'up' ? '&#8593;' : '&#8595;';
      const arrowColor = tc.direction === 'up' ? COLORS.success : COLORS.danger;
      const currentStyle = TIER_STYLES[tc.currentTier] || TIER_STYLES.INACTIVE;
      return `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};font-size:14px;color:${COLORS.gray900};">${escapeHtml(tc.companyName)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};font-size:14px;text-align:center;">
          <span style="color:${COLORS.gray500};">${tc.previousTier}</span>
          <span style="color:${arrowColor};font-weight:700;padding:0 4px;">${arrow}</span>
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${currentStyle.bg};color:${currentStyle.text};">${tc.currentTier}</span>
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid ${COLORS.gray100};font-size:14px;color:${COLORS.gray900};text-align:right;">${tc.currentScore}</td>
      </tr>`;
    })
    .join('');

  if (remaining > 0) {
    rows += `<tr><td colspan="3" style="padding:10px 16px;color:${COLORS.gray500};font-size:13px;text-align:center;font-style:italic;">+ ${remaining} more tier changes</td></tr>`;
  }

  return rows;
}

function buildNextBestActions(actions: NextBestAction[]): string {
  if (actions.length === 0) {
    return `<div style="padding:16px;color:${COLORS.gray500};font-size:14px;text-align:center;">No recommendations this week. Keep monitoring your signals!</div>`;
  }

  const priorityColors: Record<string, string> = {
    high: COLORS.danger,
    medium: COLORS.warning,
    low: COLORS.gray500,
  };

  const priorityLabels: Record<string, string> = {
    high: 'HIGH',
    medium: 'MED',
    low: 'LOW',
  };

  return actions
    .map(
      (a) => `
      <div style="padding:12px 16px;border-bottom:1px solid ${COLORS.gray100};display:flex;">
        <div style="min-width:44px;">
          <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;color:${COLORS.white};background:${priorityColors[a.priority]};">${priorityLabels[a.priority]}</span>
        </div>
        <div style="font-size:14px;color:${COLORS.gray700};padding-left:8px;">${escapeHtml(a.message)}</div>
      </div>`,
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Escape HTML to prevent XSS in email
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// renderWeeklyDigestEmail — Main template renderer
// ---------------------------------------------------------------------------

export function renderWeeklyDigestEmail(
  data: WeeklyDigestData,
  appUrl: string,
  unsubscribeUrl?: string,
): string {
  const periodLabel = `${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}`;
  const unsub = unsubscribeUrl || `${appUrl}/settings/notifications`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Weekly Digest - ${escapeHtml(data.organizationName)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .stat-box { display: block !important; width: 100% !important; margin-bottom: 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.gray100};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<!-- Preheader text (hidden, used by email clients for preview) -->
<div style="display:none;font-size:1px;color:${COLORS.gray100};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  Your weekly signal intelligence report: ${formatNumber(data.totalSignals)} signals, ${data.newContactsCount} new contacts, ${data.tierChanges.length} tier changes
</div>

<!-- Email wrapper -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${COLORS.gray100};">
<tr>
<td align="center" style="padding:24px 16px;">

<!-- Email container -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="580" class="email-container" style="margin:0 auto;max-width:580px;">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,${COLORS.primary},${COLORS.primaryDark});border-radius:12px 12px 0 0;padding:32px 32px 24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td>
            <div style="font-size:22px;font-weight:700;color:${COLORS.white};letter-spacing:-0.3px;">DevSignal</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:2px;">Developer Signal Intelligence</div>
          </td>
          <td align="right" style="vertical-align:top;">
            <div style="font-size:12px;color:rgba(255,255,255,0.7);">Weekly Digest</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">${escapeHtml(periodLabel)}</div>
          </td>
        </tr>
      </table>
      <div style="margin-top:20px;">
        <div style="font-size:16px;font-weight:600;color:${COLORS.white};">Hi ${escapeHtml(data.organizationName)} team,</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.85);margin-top:6px;line-height:1.5;">Here is your weekly signal intelligence summary. Stay on top of your most engaged developer accounts.</div>
      </div>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="background-color:${COLORS.white};padding:0;">

      <!-- Stats row -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:24px 24px 16px;">
        <tr>
          <td class="stat-box" width="33%" style="padding:0 4px;">
            <div style="background:${COLORS.gray50};border-radius:8px;padding:16px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:${COLORS.primary};">${formatNumber(data.totalSignals)}</div>
              <div style="font-size:12px;color:${COLORS.gray500};margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Signals</div>
            </div>
          </td>
          <td class="stat-box" width="33%" style="padding:0 4px;">
            <div style="background:${COLORS.gray50};border-radius:8px;padding:16px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:${COLORS.primary};">${formatNumber(data.newContactsCount)}</div>
              <div style="font-size:12px;color:${COLORS.gray500};margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">New Contacts</div>
            </div>
          </td>
          <td class="stat-box" width="33%" style="padding:0 4px;">
            <div style="background:${COLORS.gray50};border-radius:8px;padding:16px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:${COLORS.primary};">${data.tierChanges.length}</div>
              <div style="font-size:12px;color:${COLORS.gray500};margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">Tier Changes</div>
            </div>
          </td>
        </tr>
      </table>

      <!-- Next Best Actions -->
      ${data.nextBestActions.length > 0 ? `
      <div style="padding:0 24px 24px;">
        <div style="background:${COLORS.gray50};border-radius:8px;border:1px solid ${COLORS.gray200};overflow:hidden;">
          <div style="padding:14px 16px;border-bottom:1px solid ${COLORS.gray200};">
            <div style="font-size:15px;font-weight:600;color:${COLORS.gray900};">Recommended Actions</div>
          </div>
          ${buildNextBestActions(data.nextBestActions)}
        </div>
      </div>
      ` : ''}

      <!-- Top Active Companies -->
      <div style="padding:0 24px 24px;">
        <div style="background:${COLORS.gray50};border-radius:8px;border:1px solid ${COLORS.gray200};overflow:hidden;">
          <div style="padding:14px 16px;border-bottom:1px solid ${COLORS.gray200};">
            <div style="font-size:15px;font-weight:600;color:${COLORS.gray900};">Top Active Companies</div>
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr style="background:${COLORS.white};">
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${COLORS.gray200};">Company</td>
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;text-align:center;border-bottom:1px solid ${COLORS.gray200};">Tier</td>
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid ${COLORS.gray200};">Signals</td>
            </tr>
            ${buildTopCompaniesRows(data.topCompanies)}
          </table>
        </div>
      </div>

      <!-- PQA Tier Changes -->
      ${data.tierChanges.length > 0 ? `
      <div style="padding:0 24px 24px;">
        <div style="background:${COLORS.gray50};border-radius:8px;border:1px solid ${COLORS.gray200};overflow:hidden;">
          <div style="padding:14px 16px;border-bottom:1px solid ${COLORS.gray200};">
            <div style="font-size:15px;font-weight:600;color:${COLORS.gray900};">PQA Score Tier Changes</div>
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr style="background:${COLORS.white};">
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${COLORS.gray200};">Company</td>
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;text-align:center;border-bottom:1px solid ${COLORS.gray200};">Change</td>
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid ${COLORS.gray200};">Score</td>
            </tr>
            ${buildTierChangesRows(data.tierChanges)}
          </table>
        </div>
      </div>
      ` : ''}

      <!-- Signals by Source -->
      <div style="padding:0 24px 24px;">
        <div style="background:${COLORS.gray50};border-radius:8px;border:1px solid ${COLORS.gray200};overflow:hidden;">
          <div style="padding:14px 16px;border-bottom:1px solid ${COLORS.gray200};">
            <div style="font-size:15px;font-weight:600;color:${COLORS.gray900};">Signals by Source</div>
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr style="background:${COLORS.white};">
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid ${COLORS.gray200};">Source</td>
              <td style="padding:8px 16px;font-size:11px;font-weight:600;color:${COLORS.gray500};text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid ${COLORS.gray200};">Count</td>
            </tr>
            ${buildSignalsBySourceRows(data.signalsBySource)}
          </table>
        </div>
      </div>

      <!-- Workflow Summary -->
      ${data.workflowsTriggered > 0 ? `
      <div style="padding:0 24px 24px;">
        <div style="background:${COLORS.gray50};border-radius:8px;border:1px solid ${COLORS.gray200};overflow:hidden;">
          <div style="padding:14px 16px;border-bottom:1px solid ${COLORS.gray200};">
            <div style="font-size:15px;font-weight:600;color:${COLORS.gray900};">Workflow Automation</div>
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding:12px 16px;">
            <tr>
              <td style="font-size:14px;color:${COLORS.gray700};padding:4px 0;">Total runs</td>
              <td style="font-size:14px;color:${COLORS.gray900};font-weight:600;text-align:right;padding:4px 0;">${formatNumber(data.workflowsTriggered)}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:${COLORS.gray700};padding:4px 0;">Succeeded</td>
              <td style="font-size:14px;color:${COLORS.success};font-weight:600;text-align:right;padding:4px 0;">${formatNumber(data.workflowsSucceeded)}</td>
            </tr>
            ${data.workflowsFailed > 0 ? `
            <tr>
              <td style="font-size:14px;color:${COLORS.gray700};padding:4px 0;">Failed</td>
              <td style="font-size:14px;color:${COLORS.danger};font-weight:600;text-align:right;padding:4px 0;">${formatNumber(data.workflowsFailed)}</td>
            </tr>
            ` : ''}
          </table>
        </div>
      </div>
      ` : ''}

      <!-- CTA Button -->
      <div style="padding:8px 24px 32px;text-align:center;">
        <a href="${appUrl}/dashboard" style="display:inline-block;background:${COLORS.primary};color:${COLORS.white};padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.2px;">View in DevSignal</a>
      </div>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:${COLORS.gray50};border-radius:0 0 12px 12px;padding:24px 32px;border-top:1px solid ${COLORS.gray200};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td>
            <div style="font-size:12px;color:${COLORS.gray500};line-height:1.6;">
              You are receiving this because you are a member of <strong>${escapeHtml(data.organizationName)}</strong> on DevSignal.
            </div>
            <div style="font-size:12px;color:${COLORS.gray500};margin-top:8px;">
              <a href="${unsub}" style="color:${COLORS.primary};text-decoration:underline;">Unsubscribe from weekly digests</a>
              &nbsp;&middot;&nbsp;
              <a href="${appUrl}/settings/notifications" style="color:${COLORS.primary};text-decoration:underline;">Notification preferences</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding-top:16px;">
            <div style="font-size:11px;color:${COLORS.gray300};">DevSignal - Developer Signal Intelligence</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
<!-- / Email container -->

</td>
</tr>
</table>
<!-- / Email wrapper -->

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// renderWeeklyDigestSubject — Generate the email subject line
// ---------------------------------------------------------------------------

export function renderWeeklyDigestSubject(data: WeeklyDigestData): string {
  const parts: string[] = [];

  if (data.totalSignals > 0) {
    parts.push(`${formatNumber(data.totalSignals)} signals`);
  }

  const hotChanges = data.tierChanges.filter(
    (tc) => tc.direction === 'up' && tc.currentTier === 'HOT',
  );
  if (hotChanges.length > 0) {
    parts.push(`${hotChanges.length} new HOT ${hotChanges.length === 1 ? 'account' : 'accounts'}`);
  }

  if (parts.length === 0) {
    return `Your DevSignal Weekly Digest`;
  }

  return `Weekly Digest: ${parts.join(', ')}`;
}
