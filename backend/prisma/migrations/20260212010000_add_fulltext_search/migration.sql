-- Add full-text search columns and indexes

-- Contacts: search across firstName, lastName, email, title, notes
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("firstName", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("lastName", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(email, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(notes, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts USING GIN (search_vector);

-- Companies: search across name, domain, industry, description
ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(domain, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(industry, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_companies_search ON companies USING GIN (search_vector);

-- Signals: search across type and metadata (cast to text)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(type, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(metadata::text, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_signals_search ON signals USING GIN (search_vector);

-- Deals: search across title and description
ALTER TABLE deals ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_deals_search ON deals USING GIN (search_vector);
