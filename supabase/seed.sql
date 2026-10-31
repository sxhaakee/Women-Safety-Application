-- DEMO SEED DATA — labelled DEMO ONLY. Do NOT use in production.
-- All users/stations/reports are fictional. Coordinates are plausible for Mangaluru, India.

-- DEMO Police Stations (Mangaluru area)
insert into public.stations (id, name, phone, geom, is_demo) values
  ('11111111-0000-0000-0000-000000000001', 'DEMO - Mangaluru Central PS', '0824-2220201',
    ST_MakePoint(74.8560, 12.8698)::geography, true),
  ('11111111-0000-0000-0000-000000000002', 'DEMO - Kadri PS', '0824-2221002',
    ST_MakePoint(74.8660, 12.8756)::geography, true),
  ('11111111-0000-0000-0000-000000000003', 'DEMO - Bunder PS', '0824-2445001',
    ST_MakePoint(74.8396, 12.8644)::geography, true),
  ('11111111-0000-0000-0000-000000000004', 'DEMO - Ullal PS', '0824-2277101',
    ST_MakePoint(74.8609, 12.8006)::geography, true),
  ('11111111-0000-0000-0000-000000000005', 'DEMO - Mangaluru West PS', '0824-2493001',
    ST_MakePoint(74.8285, 12.8706)::geography, true),
  ('11111111-0000-0000-0000-000000000006', 'DEMO - Konchady PS', '0824-2261501',
    ST_MakePoint(74.8770, 12.8880)::geography, true);

-- NOTE: Demo users must be created via Supabase Auth Admin API (passwords in README)
-- Email: victim@demo.shesafe / guardian@demo.shesafe / police@demo.shesafe
-- Password: DemoOnly2024! (DEMO ONLY — reset immediately if used anywhere real)
-- After creating via Auth, insert profiles manually with those user IDs.

-- DEMO Unsafe Reports (40 scattered within Mangaluru)
insert into public.unsafe_reports (geom, category, severity, reporter_hash, created_at, expires_at)
select
  ST_MakePoint(
    74.84 + (random() * 0.06 - 0.03),  -- lng ±0.03
    12.85 + (random() * 0.06 - 0.03)   -- lat ±0.03
  )::geography,
  (array['poor_lighting','harassment','stalking','isolated','other'])[1 + floor(random()*5)::int],
  1 + floor(random()*5)::int,
  extensions.digest(extensions.gen_random_bytes(16), 'sha256'),
  now() - (random() * interval '25 days'),
  now() + interval '30 days'
from generate_series(1, 40);
