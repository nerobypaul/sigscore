import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// CSV Parser — handles quoted fields, commas inside quotes, double-quote
// escaping ("" -> "), \r\n and \n line endings, and BOM stripping.
// ---------------------------------------------------------------------------

export function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM
  let csv = content.replace(/^\uFEFF/, '');

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek next char: if also a quote, it is an escaped quote
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (ch === '\r') {
        // Handle \r\n
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        if (i < csv.length && csv[i] === '\n') {
          i++;
        }
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Push last field / row if there is remaining content
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  // First row is headers — normalize to trimmed lowercase
  const rawHeaders = rows[0];
  const headers = rawHeaders.map((h) => h.trim().toLowerCase());

  const dataRows: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip completely empty rows
    if (row.every((cell) => cell.trim() === '')) continue;

    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] ?? '').trim();
    }
    dataRows.push(obj);
  }

  return { headers, rows: dataRows };
}

// ---------------------------------------------------------------------------
// Column Mapping — auto-detect column names from HubSpot, Salesforce, Attio,
// Google Sheets, and other common CRM exports.
// ---------------------------------------------------------------------------

const CONTACT_COLUMN_MAP: Record<string, string> = {
  // Name fields
  'first name': 'firstName',
  'firstname': 'firstName',
  'first_name': 'firstName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'last_name': 'lastName',
  // Email
  'email': 'email',
  'email address': 'email',
  'e-mail': 'email',
  'e-mail address': 'email',
  // Phone
  'phone': 'phone',
  'phone number': 'phone',
  'work phone': 'phone',
  // Mobile
  'mobile': 'mobile',
  'mobile phone': 'mobile',
  'cell': 'mobile',
  'cell phone': 'mobile',
  // Title
  'title': 'title',
  'job title': 'title',
  'position': 'title',
  'role': 'title',
  // Company
  'company': 'companyName',
  'company name': 'companyName',
  'organization': 'companyName',
  'account name': 'companyName',
  // Social
  'linkedin': 'linkedIn',
  'linkedin url': 'linkedIn',
  'linkedin profile': 'linkedIn',
  'twitter': 'twitter',
  'twitter handle': 'twitter',
  'twitter url': 'twitter',
  'github': 'github',
  'github username': 'github',
  'github url': 'github',
  // Notes
  'notes': 'notes',
  'description': 'notes',
  'comments': 'notes',
  // Address
  'address': 'address',
  'street': 'address',
  'street address': 'address',
  'city': 'city',
  'state': 'state',
  'province': 'state',
  'region': 'state',
  'zip': 'postalCode',
  'postal code': 'postalCode',
  'zip code': 'postalCode',
  'zipcode': 'postalCode',
  'country': 'country',
};

const COMPANY_COLUMN_MAP: Record<string, string> = {
  'name': 'name',
  'company name': 'name',
  'company': 'name',
  'organization': 'name',
  'account name': 'name',
  // Domain
  'domain': 'domain',
  'website domain': 'domain',
  // Website
  'website': 'website',
  'url': 'website',
  'company url': 'website',
  'website url': 'website',
  // Industry
  'industry': 'industry',
  'sector': 'industry',
  // Size
  'size': 'size',
  'company size': 'size',
  'employees': 'size',
  'number of employees': 'size',
  'employee count': 'size',
  // Contact info
  'email': 'email',
  'company email': 'email',
  'phone': 'phone',
  'company phone': 'phone',
  // Social
  'linkedin': 'linkedIn',
  'linkedin url': 'linkedIn',
  'linkedin profile': 'linkedIn',
  'twitter': 'twitter',
  'twitter handle': 'twitter',
  'github': 'githubOrg',
  'github org': 'githubOrg',
  'github organization': 'githubOrg',
  // Description
  'description': 'description',
  'about': 'description',
  'notes': 'description',
  // Address
  'address': 'address',
  'street': 'address',
  'street address': 'address',
  'city': 'city',
  'state': 'state',
  'province': 'state',
  'region': 'state',
  'zip': 'postalCode',
  'postal code': 'postalCode',
  'zip code': 'postalCode',
  'zipcode': 'postalCode',
  'country': 'country',
};

function mapColumns(row: Record<string, string>, columnMap: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [csvCol, value] of Object.entries(row)) {
    const normalizedCol = csvCol.trim().toLowerCase();
    const mappedField = columnMap[normalizedCol];
    if (mappedField && value.trim()) {
      mapped[mappedField] = value.trim();
    }
  }
  return mapped;
}

/**
 * Normalize free-form company size strings to the CompanySize enum values
 * used in the Prisma schema (STARTUP | SMALL | MEDIUM | LARGE | ENTERPRISE).
 */
function normalizeCompanySize(size: string): string | undefined {
  const s = size.toLowerCase().trim();
  if (s.includes('startup') || s === '1-10' || s === '1-50') return 'STARTUP';
  if (s.includes('small') || s === '11-50' || s === '51-200') return 'SMALL';
  if (s.includes('medium') || s === '201-500') return 'MEDIUM';
  if (s.includes('large') || s === '201-1000' || s === '501-1000') return 'LARGE';
  if (s.includes('enterprise') || s === '1000+' || s === '1001+' || s === '5000+' || s === '10000+') return 'ENTERPRISE';
  // Try parsing as a number
  const num = parseInt(s.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(num)) {
    if (num <= 10) return 'STARTUP';
    if (num <= 50) return 'SMALL';
    if (num <= 500) return 'MEDIUM';
    if (num <= 1000) return 'LARGE';
    return 'ENTERPRISE';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Import Result
// ---------------------------------------------------------------------------

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

const MAX_ROWS = 10_000;

// ---------------------------------------------------------------------------
// Import Contacts
// ---------------------------------------------------------------------------

export async function importContacts(
  organizationId: string,
  csvContent: string,
): Promise<ImportResult> {
  const { rows } = parseCSV(csvContent);
  const result: ImportResult = { total: rows.length, imported: 0, skipped: 0, errors: [] };

  if (rows.length > MAX_ROWS) {
    return {
      total: rows.length,
      imported: 0,
      skipped: 0,
      errors: [{ row: 0, error: `CSV exceeds the maximum of ${MAX_ROWS} rows (got ${rows.length})` }],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const mapped = mapColumns(rows[i], CONTACT_COLUMN_MAP);

      // If no first/last name was mapped, try to split a "name" / "full name" column
      if (!mapped.firstName && !mapped.lastName) {
        const fullName =
          rows[i]['name'] ||
          rows[i]['full name'] ||
          rows[i]['fullname'] ||
          rows[i]['contact name'] ||
          rows[i]['contact'] ||
          '';
        if (fullName.trim()) {
          const parts = fullName.trim().split(/\s+/);
          mapped.firstName = parts[0] || '';
          mapped.lastName = parts.slice(1).join(' ') || '';
        }
      }

      if (!mapped.firstName || !mapped.lastName) {
        result.errors.push({ row: i + 2, error: 'Missing first name or last name' });
        result.skipped++;
        continue;
      }

      // Duplicate detection by email
      if (mapped.email) {
        const existing = await prisma.contact.findFirst({
          where: { organizationId, email: mapped.email },
        });
        if (existing) {
          result.skipped++;
          continue;
        }
      }

      // Try to match company by name (case-insensitive)
      let companyId: string | undefined;
      if (mapped.companyName) {
        const company = await prisma.company.findFirst({
          where: {
            organizationId,
            name: { equals: mapped.companyName, mode: 'insensitive' },
          },
        });
        companyId = company?.id;
      }

      await prisma.contact.create({
        data: {
          organizationId,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          email: mapped.email || null,
          phone: mapped.phone || null,
          mobile: mapped.mobile || null,
          title: mapped.title || null,
          companyId: companyId || null,
          linkedIn: mapped.linkedIn || null,
          twitter: mapped.twitter || null,
          github: mapped.github || null,
          notes: mapped.notes || null,
          address: mapped.address || null,
          city: mapped.city || null,
          state: mapped.state || null,
          postalCode: mapped.postalCode || null,
          country: mapped.country || null,
        },
      });

      result.imported++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ row: i + 2, error: message });
      result.skipped++;
      logger.warn(`CSV contact import row ${i + 2} failed: ${message}`);
    }
  }

  logger.info(
    `Contact CSV import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Import Companies
// ---------------------------------------------------------------------------

export async function importCompanies(
  organizationId: string,
  csvContent: string,
): Promise<ImportResult> {
  const { rows } = parseCSV(csvContent);
  const result: ImportResult = { total: rows.length, imported: 0, skipped: 0, errors: [] };

  if (rows.length > MAX_ROWS) {
    return {
      total: rows.length,
      imported: 0,
      skipped: 0,
      errors: [{ row: 0, error: `CSV exceeds the maximum of ${MAX_ROWS} rows (got ${rows.length})` }],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const mapped = mapColumns(rows[i], COMPANY_COLUMN_MAP);

      if (!mapped.name) {
        result.errors.push({ row: i + 2, error: 'Missing company name' });
        result.skipped++;
        continue;
      }

      // Duplicate detection by name (case-insensitive)
      const existing = await prisma.company.findFirst({
        where: {
          organizationId,
          name: { equals: mapped.name, mode: 'insensitive' },
        },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      // Extract domain from website if not provided
      let domain = mapped.domain;
      if (!domain && mapped.website) {
        try {
          const url = mapped.website.startsWith('http')
            ? mapped.website
            : `https://${mapped.website}`;
          domain = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          // Ignore invalid URLs
        }
      }

      // Normalize company size
      const normalizedSize = mapped.size ? normalizeCompanySize(mapped.size) : undefined;

      await prisma.company.create({
        data: {
          organizationId,
          name: mapped.name,
          domain: domain || null,
          website: mapped.website || null,
          industry: mapped.industry || null,
          size: normalizedSize ? (normalizedSize as any) : null,
          email: mapped.email || null,
          phone: mapped.phone || null,
          linkedIn: mapped.linkedIn || null,
          twitter: mapped.twitter || null,
          githubOrg: mapped.githubOrg || null,
          description: mapped.description || null,
          address: mapped.address || null,
          city: mapped.city || null,
          state: mapped.state || null,
          postalCode: mapped.postalCode || null,
          country: mapped.country || null,
        },
      });

      result.imported++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ row: i + 2, error: message });
      result.skipped++;
      logger.warn(`CSV company import row ${i + 2} failed: ${message}`);
    }
  }

  logger.info(
    `Company CSV import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`,
  );

  return result;
}
