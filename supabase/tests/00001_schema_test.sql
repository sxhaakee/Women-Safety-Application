begin;
select plan(70);

-- Extensions
select has_extension('postgis', 'postgis installed');
select has_extension('pgcrypto', 'pgcrypto installed');

-- Types
select has_type('role_t', 'role_t enum exists');
select has_type('alert_st', 'alert_st enum exists');
select has_type('trigger_t', 'trigger_t enum exists');

-- Tables
select has_table('stations', 'stations table exists');
select has_table('profiles', 'profiles table exists');
select has_table('guardian_links', 'guardian_links table exists');
select has_table('volunteers', 'volunteers table exists');
select has_table('alerts', 'alerts table exists');
select has_table('alert_stations', 'alert_stations table exists');
select has_table('alert_locations', 'alert_locations table exists');
select has_table('alert_events', 'alert_events table exists');
select has_table('evidence_chunks', 'evidence_chunks table exists');
select has_table('responder_pings', 'responder_pings table exists');
select has_table('unsafe_reports', 'unsafe_reports table exists');
select has_table('access_log', 'access_log table exists');

-- Columns: stations
select has_column('stations', 'id', 'stations.id exists');
select has_column('stations', 'name', 'stations.name exists');
select has_column('stations', 'geom', 'stations.geom exists');
select has_column('stations', 'is_demo', 'stations.is_demo exists');

-- Columns: profiles
select has_column('profiles', 'id', 'profiles.id exists');
select has_column('profiles', 'role', 'profiles.role exists');
select has_column('profiles', 'full_name', 'profiles.full_name exists');
select has_column('profiles', 'phone', 'profiles.phone exists');
select has_column('profiles', 'lang', 'profiles.lang exists');
select has_column('profiles', 'station_id', 'profiles.station_id exists');
select has_column('profiles', 'expo_push_token', 'profiles.expo_push_token exists');

-- Columns: alerts
select has_column('alerts', 'id', 'alerts.id exists');
select has_column('alerts', 'victim_id', 'alerts.victim_id exists');
select has_column('alerts', 'status', 'alerts.status exists');
select has_column('alerts', 'trigger', 'alerts.trigger exists');
select has_column('alerts', 'confidence', 'alerts.confidence exists');
select has_column('alerts', 'risk_score', 'alerts.risk_score exists');
select has_column('alerts', 'duress', 'alerts.duress exists');
select has_column('alerts', 'started_at', 'alerts.started_at exists');
select has_column('alerts', 'fired_at', 'alerts.fired_at exists');
select has_column('alerts', 'acknowledged_at', 'alerts.acknowledged_at exists');
select has_column('alerts', 'acknowledged_by', 'alerts.acknowledged_by exists');
select has_column('alerts', 'eta_minutes', 'alerts.eta_minutes exists');
select has_column('alerts', 'resolved_at', 'alerts.resolved_at exists');
select has_column('alerts', 'last_geom', 'alerts.last_geom exists');
select has_column('alerts', 'share_token_hash', 'alerts.share_token_hash exists');
select has_column('alerts', 'escalation_level', 'alerts.escalation_level exists');

-- Columns: alert_locations
select has_column('alert_locations', 'alert_id', 'alert_locations.alert_id exists');
select has_column('alert_locations', 'seq', 'alert_locations.seq exists');
select has_column('alert_locations', 'geom', 'alert_locations.geom exists');
select has_column('alert_locations', 'accuracy_m', 'alert_locations.accuracy_m exists');
select has_column('alert_locations', 'speed_mps', 'alert_locations.speed_mps exists');
select has_column('alert_locations', 'battery_pct', 'alert_locations.battery_pct exists');
select has_column('alert_locations', 'recorded_at', 'alert_locations.recorded_at exists');

-- Columns: alert_events
select has_column('alert_events', 'id', 'alert_events.id exists');
select has_column('alert_events', 'alert_id', 'alert_events.alert_id exists');
select has_column('alert_events', 'type', 'alert_events.type exists');
select has_column('alert_events', 'actor', 'alert_events.actor exists');
select has_column('alert_events', 'payload', 'alert_events.payload exists');
select has_column('alert_events', 'prev_hash', 'alert_events.prev_hash exists');
select has_column('alert_events', 'hash', 'alert_events.hash exists');

-- Columns: evidence_chunks
select has_column('evidence_chunks', 'alert_id', 'evidence_chunks.alert_id exists');
select has_column('evidence_chunks', 'seq', 'evidence_chunks.seq exists');
select has_column('evidence_chunks', 'kind', 'evidence_chunks.kind exists');
select has_column('evidence_chunks', 'storage_path', 'evidence_chunks.storage_path exists');
select has_column('evidence_chunks', 'sha256', 'evidence_chunks.sha256 exists');
select has_column('evidence_chunks', 'chain_hash', 'evidence_chunks.chain_hash exists');

-- Functions
select has_function('fire_alert', 'fire_alert RPC exists');
select has_function('push_locations', 'push_locations RPC exists');
select has_function('acknowledge_alert', 'acknowledge_alert RPC exists');
select has_function('dispatch_alert', 'dispatch_alert RPC exists');
select has_function('resolve_alert', 'resolve_alert RPC exists');
select has_function('cancel_alert', 'cancel_alert RPC exists');
select has_function('nearest_stations', 'nearest_stations RPC exists');
select has_function('nearby_volunteers', 'nearby_volunteers RPC exists');
select has_function('verify_chain', 'verify_chain function exists');
select has_function('delete_my_data', 'delete_my_data RPC exists');

-- RLS Check
select ok(
  (select count(*) = 11 from pg_tables t join pg_class c on c.relname = t.tablename where t.schemaname = 'public' and c.relrowsecurity = true and t.tablename in ('stations','profiles','guardian_links','volunteers','alerts','alert_stations','alert_locations','alert_events','evidence_chunks','responder_pings','unsafe_reports')),
  'All 11 public tables have Row Level Security enabled'
);

select * from finish();
rollback;
