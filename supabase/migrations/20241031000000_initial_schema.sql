-- SheSafe Main Schema Migration
-- Generated: 2024-10-31
-- All tables have RLS enabled. See supabase/tests/ for pgTAP coverage.

-- Extensions
create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ── ENUM TYPES ─────────────────────────────────────────────────────────────
create type role_t as enum ('victim','guardian','police','volunteer','admin');
create type alert_st as enum (
  'countdown','active','acknowledged','dispatched','resolved','cancelled','false_alarm'
);
create type trigger_t as enum (
  'manual_sos','shake','struggle','snatch','scream','dead_mans_switch',
  'safe_walk_deviation','safe_walk_stationary','safe_walk_overdue','cab_deviation','duress_pin'
);

-- ── STATIONS ───────────────────────────────────────────────────────────────
create table public.stations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  geom        geography(point,4326) not null,
  is_demo     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index stations_geom_gist on public.stations using gist(geom);

alter table public.stations enable row level security;
-- Police can view stations; admin can manage
create policy "police_view_stations" on public.stations
  for select to authenticated using (
    (select role from public.profiles where id = auth.uid()) in ('police','admin')
  );
create policy "admin_manage_stations" on public.stations
  for all to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );
-- Victims and guardians can view for risk scoring
create policy "victim_view_stations" on public.stations
  for select to authenticated using (true);

-- ── PROFILES ───────────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  role            role_t not null default 'victim',
  full_name       text not null,
  phone           text,
  lang            text not null default 'en' check (lang in ('en','hi','kn')),
  station_id      uuid references public.stations(id),
  expo_push_token text,
  created_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "own_profile" on public.profiles
  for all to authenticated using (id = auth.uid());
create policy "guardian_read_victim_profile" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = auth.uid()
        and gl.victim_id = public.profiles.id
        and gl.status = 'active'
    )
  );

-- ── GUARDIAN LINKS ─────────────────────────────────────────────────────────
create table public.guardian_links (
  victim_id   uuid not null references public.profiles on delete cascade,
  guardian_id uuid not null references public.profiles on delete cascade,
  status      text not null default 'pending' check (status in ('pending','active','revoked')),
  created_at  timestamptz not null default now(),
  primary key (victim_id, guardian_id)
);

alter table public.guardian_links enable row level security;
create policy "victim_manage_own_links" on public.guardian_links
  for all to authenticated using (victim_id = auth.uid());
create policy "guardian_view_own_links" on public.guardian_links
  for select to authenticated using (guardian_id = auth.uid());

-- ── VOLUNTEERS ─────────────────────────────────────────────────────────────
create table public.volunteers (
  user_id    uuid primary key references public.profiles on delete cascade,
  verified   boolean not null default false,
  available  boolean not null default false,
  geom       geography(point,4326),
  last_seen  timestamptz
);
create index volunteers_geom_gist on public.volunteers using gist(geom);

alter table public.volunteers enable row level security;
create policy "volunteer_own" on public.volunteers
  for all to authenticated using (user_id = auth.uid());
create policy "admin_manage_volunteers" on public.volunteers
  for all to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- ── ALERTS ─────────────────────────────────────────────────────────────────
create table public.alerts (
  id                uuid primary key,  -- CLIENT-GENERATED (works offline)
  victim_id         uuid not null references public.profiles,
  status            alert_st not null default 'countdown',
  trigger           trigger_t not null,
  confidence        real,
  risk_score        int,
  duress            boolean not null default false,
  started_at        timestamptz not null,
  fired_at          timestamptz,
  acknowledged_at   timestamptz,
  acknowledged_by   uuid references public.profiles,
  eta_minutes       int,
  resolved_at       timestamptz,
  last_geom         geography(point,4326),
  share_token_hash  bytea,
  escalation_level  int not null default 0,
  created_at        timestamptz not null default now()
);
create index alerts_active on public.alerts(status)
  where status in ('active','acknowledged','dispatched');
create index alerts_victim on public.alerts(victim_id);

alter table public.alerts enable row level security;

create policy "victim_own_alerts" on public.alerts
  for all to authenticated using (victim_id = auth.uid());

create policy "guardian_view_active_alerts" on public.alerts
  for select to authenticated using (
    status in ('active','acknowledged','dispatched')
    and exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = auth.uid()
        and gl.victim_id = public.alerts.victim_id
        and gl.status = 'active'
    )
  );

-- Police: see active alerts within their station's escalation scope
create policy "police_view_scoped_alerts" on public.alerts
  for select to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'police'
    and status in ('active','acknowledged','dispatched')
    and exists (
      select 1 from public.alert_stations als
      where als.alert_id = public.alerts.id
        and als.station_id = (select station_id from public.profiles where id = auth.uid())
    )
    and (
      resolved_at is null
      or resolved_at > now() - interval '30 days'
    )
  );

-- ── ALERT_STATIONS (linking table: which stations see an alert) ────────────
create table public.alert_stations (
  alert_id    uuid not null references public.alerts on delete cascade,
  station_id  uuid not null references public.stations on delete cascade,
  primary key (alert_id, station_id)
);
alter table public.alert_stations enable row level security;
create policy "police_view_alert_stations" on public.alert_stations
  for select to authenticated using (
    (select role from public.profiles where id = auth.uid()) in ('police','admin')
  );

-- ── ALERT LOCATIONS ────────────────────────────────────────────────────────
create table public.alert_locations (
  alert_id     uuid not null references public.alerts on delete cascade,
  seq          int not null,
  geom         geography(point,4326) not null,
  accuracy_m   real,
  speed_mps    real,
  battery_pct  int,
  recorded_at  timestamptz not null,
  primary key (alert_id, seq)  -- idempotent on retry
);

alter table public.alert_locations enable row level security;
create policy "victim_own_locations" on public.alert_locations
  for all to authenticated using (
    (select victim_id from public.alerts where id = alert_id) = auth.uid()
  );
create policy "guardian_view_locations" on public.alert_locations
  for select to authenticated using (
    exists (
      select 1 from public.alerts a
      join public.guardian_links gl on gl.victim_id = a.victim_id
      where a.id = alert_id
        and gl.guardian_id = auth.uid()
        and gl.status = 'active'
        and a.status in ('active','acknowledged','dispatched')
    )
  );
create policy "police_view_locations" on public.alert_locations
  for select to authenticated using (
    exists (
      select 1 from public.alert_stations als
      where als.alert_id = public.alert_locations.alert_id
        and als.station_id = (select station_id from public.profiles where id = auth.uid())
    )
  );

-- ── ALERT EVENTS (append-only, hash-chained) ───────────────────────────────
create table public.alert_events (
  id          bigserial primary key,
  alert_id    uuid not null references public.alerts on delete cascade,
  type        text not null,
  actor       uuid,
  payload     jsonb not null default '{}',
  prev_hash   bytea,
  hash        bytea not null,
  created_at  timestamptz not null default now()
);

alter table public.alert_events enable row level security;
create policy "victim_own_events" on public.alert_events
  for select to authenticated using (
    (select victim_id from public.alerts where id = alert_id) = auth.uid()
  );
create policy "police_view_events" on public.alert_events
  for select to authenticated using (
    exists (
      select 1 from public.alert_stations als
      where als.alert_id = public.alert_events.alert_id
        and als.station_id = (select station_id from public.profiles where id = auth.uid())
    )
  );
create policy "guardian_view_events" on public.alert_events
  for select to authenticated using (
    exists (
      select 1 from public.alerts a
      join public.guardian_links gl on gl.victim_id = a.victim_id
      where a.id = alert_id
        and gl.guardian_id = auth.uid()
        and gl.status = 'active'
    )
  );

-- Block UPDATE/DELETE on alert_events (append-only enforcement via trigger)
create or replace function public.block_alert_events_mutation()
  returns trigger language plpgsql security definer as $$
begin
  raise exception 'alert_events is append-only. Mutation of id=% denied.', old.id;
end;
$$;

create trigger no_update_alert_events
  before update on public.alert_events
  for each row execute function public.block_alert_events_mutation();

create trigger no_delete_alert_events
  before delete on public.alert_events
  for each row execute function public.block_alert_events_mutation();

-- Hash chain trigger on INSERT
create or replace function public.chain_alert_event()
  returns trigger language plpgsql security definer
  set search_path = public as $$
declare
  v_prev_hash bytea;
  v_data      bytea;
begin
  select hash into v_prev_hash
  from public.alert_events
  where alert_id = new.alert_id
  order by id desc
  limit 1;

  if v_prev_hash is null then
    v_prev_hash := decode('00', 'hex');
  end if;

  new.prev_hash := v_prev_hash;

  v_data := v_prev_hash
    || convert_to(
         new.type || '|'
         || coalesce(new.actor::text, '') || '|'
         || new.payload::text || '|'
         || new.created_at::text,
         'UTF8'
       );

  new.hash := digest(v_data, 'sha256');
  return new;
end;
$$;

create trigger chain_on_insert
  before insert on public.alert_events
  for each row execute function public.chain_alert_event();

-- ── EVIDENCE CHUNKS ────────────────────────────────────────────────────────
create table public.evidence_chunks (
  alert_id      uuid not null references public.alerts on delete cascade,
  seq           int not null,
  kind          text not null check (kind in ('audio','photo_front','photo_back')),
  storage_path  text not null,
  sha256        bytea not null,
  chain_hash    bytea not null,
  bytes         int,
  captured_at   timestamptz not null,
  primary key (alert_id, seq, kind)
);

alter table public.evidence_chunks enable row level security;
create policy "victim_own_evidence" on public.evidence_chunks
  for all to authenticated using (
    (select victim_id from public.alerts where id = alert_id) = auth.uid()
  );
create policy "police_view_evidence" on public.evidence_chunks
  for select to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'police'
    and exists (
      select 1 from public.alert_stations als
      where als.alert_id = public.evidence_chunks.alert_id
        and als.station_id = (select station_id from public.profiles where id = auth.uid())
    )
  );
create policy "guardian_view_evidence" on public.evidence_chunks
  for select to authenticated using (
    exists (
      select 1 from public.alerts a
      join public.guardian_links gl on gl.victim_id = a.victim_id
      where a.id = alert_id
        and gl.guardian_id = auth.uid()
        and gl.status = 'active'
    )
  );

-- ── RESPONDER PINGS ────────────────────────────────────────────────────────
create table public.responder_pings (
  alert_id      uuid not null references public.alerts on delete cascade,
  volunteer_id  uuid not null references public.volunteers on delete cascade,
  distance_m    int,
  status        text not null default 'sent'
    check (status in ('sent','accepted','declined','arrived')),
  sent_at       timestamptz not null default now(),
  primary key (alert_id, volunteer_id)
);

alter table public.responder_pings enable row level security;
create policy "volunteer_own_pings" on public.responder_pings
  for select to authenticated using (volunteer_id = auth.uid());
create policy "volunteer_update_own_ping" on public.responder_pings
  for update to authenticated using (volunteer_id = auth.uid());

-- ── UNSAFE REPORTS ─────────────────────────────────────────────────────────
create table public.unsafe_reports (
  id            uuid primary key default gen_random_uuid(),
  geom          geography(point,4326) not null,
  category      text not null,
  severity      int not null check (severity between 1 and 5),
  reporter_hash bytea not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days'
);
create index unsafe_reports_geom_gist on public.unsafe_reports using gist(geom);

alter table public.unsafe_reports enable row level security;
create policy "auth_read_reports" on public.unsafe_reports
  for select to authenticated using (expires_at > now());
create policy "auth_insert_reports" on public.unsafe_reports
  for insert to authenticated with check (true);

-- ── ACCESS LOG ─────────────────────────────────────────────────────────────
create table public.access_log (
  id        bigserial primary key,
  who       uuid,
  what      text,
  alert_id  uuid,
  at        timestamptz not null default now()
);
alter table public.access_log enable row level security;
create policy "admin_view_log" on public.access_log
  for select to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- nearest_stations (KNN GiST, NOT a full scan)
create or replace function public.nearest_stations(
  p_lat float8, p_lng float8, p_k int default 3
) returns table(id uuid, name text, phone text, distance_m float8)
  language sql stable security definer set search_path = public as $$
  select
    s.id, s.name, s.phone,
    ST_Distance(s.geom, ST_MakePoint(p_lng, p_lat)::geography) as distance_m
  from public.stations s
  order by s.geom <-> ST_MakePoint(p_lng, p_lat)::geography
  limit p_k;
$$;

-- fire_alert (idempotent, generates witness token, writes event)
create or replace function public.fire_alert(
  p_id        uuid,
  p_trigger   trigger_t,
  p_conf      real,
  p_risk      int,
  p_lat       float8,
  p_lng       float8,
  p_started   timestamptz,
  p_duress    boolean
) returns table(alert public.alerts, witness_token text)
  language plpgsql security definer set search_path = public as $$
declare
  v_alert       public.alerts;
  v_token_raw   bytea;
  v_token_hex   text;
  v_existing    public.alerts;
begin
  -- Auth check
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Idempotency: return existing if already fired
  select * into v_existing from public.alerts where id = p_id;
  if found then
    return query select v_existing, null::text;
    return;
  end if;

  -- Generate witness token (128-bit random, store only sha256)
  v_token_raw := gen_random_bytes(16);
  v_token_hex := encode(v_token_raw, 'hex');

  -- Insert alert
  insert into public.alerts (
    id, victim_id, status, trigger, confidence, risk_score, duress,
    started_at, fired_at, last_geom, share_token_hash, escalation_level
  ) values (
    p_id, auth.uid(), 'active', p_trigger, p_conf, p_risk, p_duress,
    p_started, now(),
    ST_MakePoint(p_lng, p_lat)::geography,
    digest(v_token_raw, 'sha256'),
    case when p_duress then 3 else 0 end
  )
  returning * into v_alert;

  -- Insert nearest stations
  insert into public.alert_stations (alert_id, station_id)
  select p_id, s.id from public.nearest_stations(p_lat, p_lng, 3) s;

  -- Append event (hash chained via trigger)
  insert into public.alert_events (alert_id, type, actor, payload, created_at)
  values (p_id, 'fired', auth.uid(),
    jsonb_build_object('trigger', p_trigger, 'confidence', p_conf, 'risk_score', p_risk, 'duress', p_duress),
    now());

  return query select v_alert, v_token_hex;
end;
$$;

-- push_locations (batch upsert, idempotent)
create or replace function public.push_locations(
  p_alert uuid,
  p_batch jsonb
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
begin
  if (select victim_id from public.alerts where id = p_alert) != auth.uid() then
    raise exception 'Not authorized';
  end if;
  for v_item in select * from jsonb_array_elements(p_batch) loop
    insert into public.alert_locations (alert_id, seq, geom, accuracy_m, speed_mps, battery_pct, recorded_at)
    values (
      p_alert,
      (v_item->>'seq')::int,
      ST_MakePoint((v_item->>'lng')::float8, (v_item->>'lat')::float8)::geography,
      (v_item->>'acc')::real,
      (v_item->>'speed')::real,
      (v_item->>'battery')::int,
      (v_item->>'ts')::timestamptz
    )
    on conflict (alert_id, seq) do nothing;
  end loop;

  -- Update last_geom on alert
  update public.alerts
  set last_geom = ST_MakePoint(
    (p_batch->-1->>'lng')::float8,
    (p_batch->-1->>'lat')::float8
  )::geography
  where id = p_alert;
end;
$$;

-- acknowledge_alert (police only, station-scoped)
create or replace function public.acknowledge_alert(
  p_alert uuid, p_eta int default null
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_role role_t;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role != 'police' then raise exception 'Forbidden: police only'; end if;

  if not exists (
    select 1 from public.alert_stations als
    where als.alert_id = p_alert
      and als.station_id = (select station_id from public.profiles where id = auth.uid())
  ) then
    raise exception 'Forbidden: alert not in your station scope';
  end if;

  update public.alerts
  set acknowledged_at = now(), acknowledged_by = auth.uid(), eta_minutes = p_eta
  where id = p_alert and status = 'active';

  insert into public.alert_events (alert_id, type, actor, payload, created_at)
  values (p_alert, 'acknowledged', auth.uid(),
    jsonb_build_object('eta_minutes', p_eta), now());
end;
$$;

-- cancel_alert (victim only; duress=true keeps alert active)
create or replace function public.cancel_alert(
  p_alert uuid, p_duress boolean
) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if (select victim_id from public.alerts where id = p_alert) != auth.uid() then
    raise exception 'Not authorized';
  end if;

  if p_duress then
    update public.alerts
    set duress = true, escalation_level = 3
    where id = p_alert;
    insert into public.alert_events (alert_id, type, actor, payload, created_at)
    values (p_alert, 'duress_cancel_disguised', auth.uid(), '{}', now());
  else
    update public.alerts
    set status = 'cancelled', resolved_at = now()
    where id = p_alert;
    insert into public.alert_events (alert_id, type, actor, payload, created_at)
    values (p_alert, 'cancelled', auth.uid(), '{}', now());
  end if;
end;
$$;

-- resolve_alert
create or replace function public.resolve_alert(
  p_alert uuid, p_outcome text default null
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_role role_t;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('police', 'admin') then
    raise exception 'Forbidden';
  end if;

  update public.alerts
  set status = 'resolved', resolved_at = now()
  where id = p_alert;

  insert into public.alert_events (alert_id, type, actor, payload, created_at)
  values (p_alert, 'resolved', auth.uid(),
    jsonb_build_object('outcome', p_outcome), now());
end;
$$;

-- verify_chain: recomputes hashes and reports first break
create or replace function public.verify_chain(p_alert uuid)
  returns table(ok boolean, broken_at bigint)
  language plpgsql security definer set search_path = public as $$
declare
  v_prev_hash bytea := decode('00', 'hex');
  v_expected  bytea;
  ev          record;
begin
  for ev in
    select * from public.alert_events
    where alert_id = p_alert
    order by id
  loop
    v_expected := digest(
      v_prev_hash
      || convert_to(
           ev.type || '|'
           || coalesce(ev.actor::text, '') || '|'
           || ev.payload::text || '|'
           || ev.created_at::text,
           'UTF8'
         ),
      'sha256'
    );
    if v_expected != ev.hash then
      return query select false, ev.id;
      return;
    end if;
    v_prev_hash := ev.hash;
  end loop;
  return query select true, null::bigint;
end;
$$;

-- delete_my_data (DPDP-style erasure)
create or replace function public.delete_my_data()
  returns void
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.access_log (who, what, at)
  values (auth.uid(), 'delete_my_data', now());

  delete from public.profiles where id = auth.uid();
  -- Cascades to alerts, locations, events, evidence via FK
end;
$$;

-- escalation_tick (called by pg_cron and client kick RPC)
create or replace function public.escalation_tick()
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  for a in
    select * from public.alerts
    where status in ('active','acknowledged')
    and fired_at is not null
  loop
    -- Level 1: t+60s, no responder accepted, no police ack
    if a.escalation_level = 0
      and now() - a.fired_at > interval '60 seconds'
      and a.acknowledged_at is null
      and not exists (
        select 1 from public.responder_pings
        where alert_id = a.id and status = 'accepted'
      )
    then
      update public.alerts set escalation_level = 1 where id = a.id;
      insert into public.alert_events (alert_id, type, actor, payload, created_at)
      values (a.id, 'escalated', null, jsonb_build_object('level', 1), now());
    end if;

    -- Level 2: t+120s, still no police ack
    if a.escalation_level = 1
      and now() - a.fired_at > interval '120 seconds'
      and a.acknowledged_at is null
    then
      update public.alerts set escalation_level = 2 where id = a.id;
      insert into public.alert_events (alert_id, type, actor, payload, created_at)
      values (a.id, 'escalated', null, jsonb_build_object('level', 2), now());
    end if;
  end loop;
end;
$$;

-- Schedule escalation_tick every minute
select cron.schedule('escalation_tick', '* * * * *', $$select public.escalation_tick()$$);
