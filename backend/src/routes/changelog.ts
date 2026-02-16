import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChangelogEntry {
  date: string;
  time: string;
  title: string;
  content: string;
  status: 'completed' | 'needs-review' | 'blocked' | 'unknown';
}

interface ChangelogResponse {
  entries: ChangelogEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// In-memory cache (5-minute TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedEntries: ChangelogEntry[] | null = null;
let cacheTimestamp = 0;

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function extractStatus(content: string): ChangelogEntry['status'] {
  const statusMatch = content.match(/\*\*Status:\*\*\s*(completed|needs-review|blocked)/i);
  if (statusMatch) {
    const raw = statusMatch[1].toLowerCase();
    if (raw === 'completed' || raw === 'needs-review' || raw === 'blocked') {
      return raw;
    }
  }
  return 'unknown';
}

function parseChangelogFile(filePath: string, dateStr: string): ChangelogEntry[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries: ChangelogEntry[] = [];

  // Split on ## headers that start a new entry (e.g., "## 14:30 — Title")
  // The regex splits on lines starting with "## " but not "### " or deeper
  const sections = raw.split(/^## /m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    // Skip summary sections that don't start with a time (HH:MM)
    const headerMatch = section.match(/^(\d{1,2}:\d{2})\s*(?:--|—|-)\s*(.+)/);
    if (!headerMatch) continue;

    const time = headerMatch[1];
    const title = headerMatch[2].trim();

    // The content is everything after the first line
    const firstNewline = section.indexOf('\n');
    const content = firstNewline >= 0 ? section.slice(firstNewline + 1).trim() : '';

    const status = extractStatus(content);

    entries.push({
      date: dateStr,
      time,
      title,
      content,
      status,
    });
  }

  return entries;
}

function loadAllEntries(): ChangelogEntry[] {
  const changelogDir = path.resolve(__dirname, '../../../.changelog');

  if (!fs.existsSync(changelogDir)) {
    return [];
  }

  const files = fs.readdirSync(changelogDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse(); // newest dates first

  const allEntries: ChangelogEntry[] = [];

  for (const file of files) {
    const dateStr = file.replace('.md', '');
    const filePath = path.join(changelogDir, file);
    const entries = parseChangelogFile(filePath, dateStr);
    allEntries.push(...entries);
  }

  return allEntries;
}

function getCachedEntries(): ChangelogEntry[] {
  const now = Date.now();
  if (cachedEntries && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEntries;
  }

  cachedEntries = loadAllEntries();
  cacheTimestamp = now;
  return cachedEntries;
}

// ---------------------------------------------------------------------------
// GET /api/v1/changelog
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api/v1/changelog:
 *   get:
 *     summary: List product changelog entries
 *     description: Returns parsed changelog entries sorted by date descending. Public endpoint, no auth required.
 *     tags: [Changelog]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of entries to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of entries to skip
 *     responses:
 *       200:
 *         description: Paginated changelog entries
 */
router.get('/', (_req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(_req.query.limit)) || 20, 1), 100);
    const offset = Math.max(parseInt(String(_req.query.offset)) || 0, 0);

    const allEntries = getCachedEntries();
    const paginated = allEntries.slice(offset, offset + limit);

    const response: ChangelogResponse = {
      entries: paginated,
      total: allEntries.length,
      limit,
      offset,
    };

    res.json(response);
  } catch (err) {
    console.error('Failed to load changelog:', err);
    res.status(500).json({ error: 'Failed to load changelog' });
  }
});

export default router;
