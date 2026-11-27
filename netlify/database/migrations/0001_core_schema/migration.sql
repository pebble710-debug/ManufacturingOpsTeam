-- 0001_core_schema -- V1-CORE schema for the Manufacturing Shipping & Inventory Operations Dashboard.
-- Fictional data only (Cobalt Ridge Components, Inc.). Forward-only: never edit after it has been applied.
-- Conventions: snake_case singular table names; bigint identity PKs; timestamptz (UTC); text + CHECK enums.
-- Business clock (decision D-1, docs/plan/consistency-review.md): system and event timestamps store REAL now().
-- KPI period anchors that must follow the fixed reporting date are DATE columns named *business_date (set by the
-- server from business_today), except rework_event.completed_business_date, which is generated from completed_at.
-- User-entered business instants (detected_at, rework started_at AND completed_at, arrived_at) have no default:
-- the app passes business_now unless the user types a value.
-- T-022 (user decisions 2026-11-26): UD-2 approver <> submitter CHECK; UD-3 shipment/line lock triggers;
-- UD-5 severity Low/Medium/High/Critical; UD-6 no Delivered status; UD-9 packaging_error.packaging_related.

-- ---------------------------------------------------------------------------
-- 1. Helper trigger functions
-- ---------------------------------------------------------------------------
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are never deleted (use status / active)', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Users, sessions, login throttle, audit, settings
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username       text        NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  display_name   text        NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
  email          text        CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@example\.com$'),
  role           text        NOT NULL CHECK (role IN ('Admin','Supervisor','Shipping','Receiving','Quality','Viewer')),
  password_hash  text        CHECK (password_hash IS NULL OR password_hash ~ '^scrypt\$'),
  active         boolean     NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT active OR password_hash IS NOT NULL)
);

CREATE TABLE session (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash         bytea       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  user_id            bigint      NOT NULL REFERENCES app_user(id),
  csrf_token         text        NOT NULL CHECK (length(csrf_token) >= 32),
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  write_window_start timestamptz,
  write_count        integer     NOT NULL DEFAULT 0 CHECK (write_count >= 0),
  CHECK (expires_at > created_at)
);
CREATE INDEX session_user_idx    ON session (user_id);
CREATE INDEX session_expires_idx ON session (expires_at);

CREATE TABLE login_attempt (
  key          text        NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  window_start timestamptz NOT NULL,
  fail_count   integer     NOT NULL DEFAULT 1 CHECK (fail_count >= 1),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_start)
);
CREATE INDEX login_attempt_window_idx ON login_attempt (window_start);

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_id     bigint,
  action      text        NOT NULL CHECK (action ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  table_name  text,
  record_id   text,
  changes     jsonb
);
CREATE INDEX audit_log_at_idx     ON audit_log (at DESC, id DESC);
CREATE INDEX audit_log_record_idx ON audit_log (table_name, record_id);
CREATE INDEX audit_log_user_idx   ON audit_log (user_id, at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action, at DESC);

CREATE TABLE setting (
  key           text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  value         text        NOT NULL,
  default_value text        NOT NULL,
  value_type    text        NOT NULL CHECK (value_type IN ('number','date','text','bool','enum')),
  scope         text        NOT NULL DEFAULT 'config' CHECK (scope IN ('config','system')),
  min_value     numeric,
  max_value     numeric,
  description   text        NOT NULL DEFAULT '',
  updated_by    bigint,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (value_type <> 'bool' OR value IN ('true','false')),
  CHECK (value_type <> 'date' OR value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CHECK (CASE WHEN value_type = 'number'
              THEN CASE WHEN value ~ '^-?[0-9]+(\.[0-9]+)?$'
                        THEN value::numeric BETWEEN COALESCE(min_value, -1e12) AND COALESCE(max_value, 1e12)
                        ELSE false END
              ELSE true END),
  CHECK (key <> 'reporting_mode' OR value IN ('fixed','live')),
  CHECK (key <> 'on_time_basis'  OR value IN ('promise','requested')),
  CHECK (CASE WHEN key = 'reporting_date'
              THEN CASE WHEN value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                        THEN value::date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' ELSE false END
              ELSE true END)
);

INSERT INTO setting (key, value, default_value, value_type, scope, min_value, max_value, description) VALUES
  ('reporting_mode',                'fixed',      'fixed',      'enum',   'config', NULL, NULL, 'fixed = business clock uses reporting_date; live = real date'),
  ('reporting_date',                '2026-11-25', '2026-11-25', 'date',   'config', NULL, NULL, 'Fixed demo reporting date (UTC calendar date)'),
  ('on_time_basis',                 'promise',    'promise',    'enum',   'config', NULL, NULL, 'KPI-1/2 reference date: promise or requested'),
  ('on_time_tolerance_days',        '0',          '0',          'number', 'config', 0, 30,    'KPI-1/2 tolerance in days (integer)'),
  ('target_on_time_pct',            '95',         '95',         'number', 'config', 0, 100,   'KPI-1 target %'),
  ('target_otif_pct',               '93',         '93',         'number', 'config', 0, 100,   'KPI-2 target %'),
  ('target_pkg_error_rate_pct',     '2',          '2',          'number', 'config', 0, 100,   'KPI-3 target % (below is good)'),
  ('target_fpy_pct',                '98',         '98',         'number', 'config', 0, 100,   'KPI-4 target %'),
  ('target_rework_freq_pct',        '2',          '2',          'number', 'config', 0, 100,   'KPI-5 target % (below is good)'),
  ('target_cycle_time_h',           '24',         '24',         'number', 'config', 0.01, 720, 'KPI-6 target hours (median)'),
  ('target_inventory_accuracy_pct', '97',         '97',         'number', 'config', 0, 100,   'KPI-7 target %'),
  ('target_dock_to_stock_h',        '8',          '8',          'number', 'config', 0.01, 720, 'KPI-8 target hours (KPI-8 is deferred; value kept for US-008)'),
  ('tolerance_a_pct',               '0',          '0',          'number', 'config', 0, 100,   'Cycle-count tolerance, A items (%)'),
  ('tolerance_b_pct',               '2',          '2',          'number', 'config', 0, 100,   'Cycle-count tolerance, B items (%)'),
  ('tolerance_c_pct',               '5',          '5',          'number', 'config', 0, 100,   'Cycle-count tolerance, C items (%)'),
  ('last_demo_reset_at',           '',           '',           'text',   'system', NULL, NULL, 'ISO timestamp of the last completed demo reset (cooldown); empty = never'),
  ('demo_read_only_mode',           'false',      'false',      'bool',   'config', NULL, NULL, '[P] kill switch: all writes refused while true (security plan PD-7)');

-- Per-database random salt for hashing client keys (security plan 3.3). System row: never shown, never reset.
INSERT INTO setting (key, value, default_value, value_type, scope, description)
VALUES ('client_key_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), '', 'text', 'system',
        'Random per-database salt for login-throttle client keys');

-- ---------------------------------------------------------------------------
-- 3. Lookups
-- ---------------------------------------------------------------------------
CREATE TABLE customer (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{1,20}$'),
  name          text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  ship_to_city  text,
  ship_to_state text,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplier (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{1,20}$'),
  name       text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE carrier (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text        NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  mode       text        NOT NULL CHECK (mode IN ('Parcel','LTL','Truckload','Pickup')),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE part (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  part_number             text        NOT NULL UNIQUE CHECK (part_number ~ '^[A-Z0-9][A-Z0-9-]{2,29}$'),
  revision                text        NOT NULL CHECK (revision ~ '^[A-Z0-9]{1,10}$'),
  description             text        NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  unit_of_measure         text        NOT NULL DEFAULT 'EA' CHECK (length(unit_of_measure) BETWEEN 1 AND 10),
  abc_class               text        NOT NULL CHECK (abc_class IN ('A','B','C')),
  packaging_instruction_ref text CHECK (length(packaging_instruction_ref) <= 100),
  requires_coc            boolean     NOT NULL DEFAULT false,
  active                  boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (part_number LIKE '%-' || revision)
);

CREATE TABLE location (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        text        NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{2,20}$'),
  type        text        NOT NULL CHECK (type IN ('Stock','Receiving','Hold','Shipping','FG')),
  description text        NOT NULL DEFAULT '',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reason_code (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category   text        NOT NULL CHECK (category IN ('late','hold','adjust','scrap')),
  code       text        NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,30}$'),
  label      text        NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, code)
);

CREATE TABLE lot (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_number text        NOT NULL UNIQUE CHECK (lot_number ~ '^[A-Z0-9][A-Z0-9-]{2,29}$'),
  part_id    bigint      NOT NULL REFERENCES part(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_id, lot_number)
);

-- ---------------------------------------------------------------------------
-- 4. Shipping
-- ---------------------------------------------------------------------------
CREATE SEQUENCE shipment_no_seq START 1001;

CREATE TABLE shipment (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_no      text        NOT NULL UNIQUE
                   DEFAULT ('SH-' || lpad(nextval('shipment_no_seq')::text, 4, '0'))
                   CHECK (shipment_no ~ '^SH-[0-9]{4,}$'),
  customer_id      bigint      NOT NULL REFERENCES customer(id),
  customer_po      text        NOT NULL CHECK (length(btrim(customer_po)) BETWEEN 1 AND 40),
  order_date       date        NOT NULL,
  requested_date   date        NOT NULL,
  promise_date     date        NOT NULL,
  status           text        NOT NULL DEFAULT 'Planned'
                   CHECK (status IN ('Planned','Ready to Pack','Packing','Verified','Shipped','On Hold','Rework','Cancelled')),
  held_from_status text        CHECK (held_from_status IN ('Planned','Ready to Pack','Packing','Verified','Rework')),
  hold_reason_id   bigint      REFERENCES reason_code(id),
  hold_owner_dept  text        CHECK (hold_owner_dept IN ('Shipping','Quality','Receiving','Production','Planning','Customer')),
  rework_origin    text        CHECK (rework_origin IN ('VERIFICATION_FAILED','ERROR_LOGGED','EDITED_AFTER_VERIFY')),
  rework_episode   integer     NOT NULL DEFAULT 0 CHECK (rework_episode >= 0),
  late_reason_id   bigint      REFERENCES reason_code(id),
  ship_date        date,
  shipped_at       timestamptz,
  carrier_id       bigint      REFERENCES carrier(id),
  tracking_number  text        CHECK (tracking_number ~ '^[A-Za-z0-9-]{1,40}$'),
  service_level    text        CHECK (length(service_level) <= 40),
  packages_count   integer     CHECK (packages_count >= 1),
  total_weight_lb  numeric(10,2) CHECK (total_weight_lb > 0),
  doc_packing_slip boolean     NOT NULL DEFAULT false,
  doc_bol          boolean     NOT NULL DEFAULT false,
  doc_coc          boolean     NOT NULL DEFAULT false,
  doc_labels       boolean     NOT NULL DEFAULT false,
  packed_by        bigint      REFERENCES app_user(id),
  verified_by      bigint      REFERENCES app_user(id),
  verified_at      timestamptz,
  notes            text        CHECK (length(notes) <= 1000),
  created_by       bigint      NOT NULL REFERENCES app_user(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipment_dates_chk        CHECK (promise_date >= order_date AND requested_date >= order_date),
  CONSTRAINT shipment_hold_chk         CHECK ((status = 'On Hold') = (held_from_status IS NOT NULL)
                                              AND (status = 'On Hold') = (hold_reason_id IS NOT NULL)
                                              AND (status = 'On Hold') = (hold_owner_dept IS NOT NULL)),
  CONSTRAINT shipment_rework_chk       CHECK ((status <> 'Rework' OR rework_origin IS NOT NULL)
                                              AND (rework_origin IS NULL OR status IN ('Rework','On Hold','Cancelled'))),
  CONSTRAINT shipment_verified_chk     CHECK ((verified_by IS NULL) = (verified_at IS NULL)
                                              AND (verified_by IS NULL OR verified_by <> packed_by)),
  CONSTRAINT shipment_shipped_fields_chk CHECK (
      (status = 'Shipped' OR (ship_date IS NULL AND shipped_at IS NULL))
      AND (status <> 'Shipped' OR (ship_date IS NOT NULL AND shipped_at IS NOT NULL AND carrier_id IS NOT NULL
           AND packages_count IS NOT NULL AND total_weight_lb IS NOT NULL AND verified_by IS NOT NULL))),
  CONSTRAINT shipment_late_reason_chk  CHECK ((status <> 'Shipped' OR ship_date <= promise_date OR late_reason_id IS NOT NULL)
                                              AND (late_reason_id IS NULL OR status = 'Shipped'))
);
ALTER SEQUENCE shipment_no_seq OWNED BY shipment.shipment_no;
CREATE INDEX shipment_ship_date_idx   ON shipment (ship_date) WHERE status = 'Shipped';
CREATE INDEX shipment_status_idx      ON shipment (status);
CREATE INDEX shipment_customer_idx    ON shipment (customer_id, order_date);
CREATE INDEX shipment_carrier_idx     ON shipment (carrier_id) WHERE carrier_id IS NOT NULL;
CREATE INDEX shipment_open_promise_idx ON shipment (promise_date) WHERE status NOT IN ('Shipped','Cancelled');
CREATE INDEX shipment_packed_by_idx   ON shipment (packed_by) WHERE packed_by IS NOT NULL;

CREATE TABLE shipment_line (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_id  bigint      NOT NULL REFERENCES shipment(id),
  line_no      integer     NOT NULL CHECK (line_no >= 1),
  part_id      bigint      NOT NULL REFERENCES part(id),
  qty_ordered  integer     NOT NULL CHECK (qty_ordered > 0),
  qty_shipped  integer     CHECK (qty_shipped >= 0),
  lot_number   text,
  location_id  bigint      REFERENCES location(id),
  short_note   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, line_no),
  UNIQUE (id, shipment_id),
  UNIQUE (id, part_id, location_id, lot_number),
  FOREIGN KEY (part_id, lot_number) REFERENCES lot (part_id, lot_number),
  CHECK (qty_shipped IS NULL OR qty_shipped >= qty_ordered OR length(btrim(COALESCE(short_note, ''))) > 0)
);
CREATE INDEX shipment_line_part_lot_idx ON shipment_line (part_id, lot_number);
CREATE INDEX shipment_line_lot_idx      ON shipment_line (lot_number) WHERE lot_number IS NOT NULL;

CREATE FUNCTION shipment_line_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM shipment WHERE id = OLD.shipment_id) NOT IN ('Planned','Ready to Pack') THEN
    RAISE EXCEPTION 'shipment_line rows can only be deleted while the shipment is Planned or Ready to Pack'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER shipment_line_delete_guard BEFORE DELETE ON shipment_line
  FOR EACH ROW EXECUTE FUNCTION shipment_line_delete_guard();

-- UD-3 / matrix R-14: Shipped and Cancelled shipments are locked. Status is terminal; only the columns that the
-- Supervisor correction action (contract E-53, P-28) may change are allowed to differ. Everything else raises.
-- The ship action must therefore update shipment_line rows BEFORE it sets shipment.status = 'Shipped'.
CREATE FUNCTION shipment_lock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  correctable text[] := ARRAY['customer_po','requested_date','promise_date','ship_date','carrier_id','tracking_number',
                              'service_level','packages_count','total_weight_lb','late_reason_id','doc_packing_slip',
                              'doc_bol','doc_coc','doc_labels','notes','updated_at'];
BEGIN
  IF OLD.status NOT IN ('Shipped','Cancelled') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'shipment % is % and locked: its status cannot change', OLD.shipment_no, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - correctable) IS DISTINCT FROM (to_jsonb(OLD) - correctable) THEN
    RAISE EXCEPTION 'shipment % is % and locked: only correctable fields may change (correction action)', OLD.shipment_no, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shipment_lock_guard BEFORE UPDATE ON shipment
  FOR EACH ROW EXECUTE FUNCTION shipment_lock_guard();

-- UD-3: lines of a Shipped or Cancelled shipment are locked too, except the short-shipment note (correction action).
CREATE FUNCTION shipment_line_lock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM shipment WHERE id = OLD.shipment_id) IN ('Shipped','Cancelled')
     AND (to_jsonb(NEW) - ARRAY['short_note','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['short_note','updated_at']) THEN
    RAISE EXCEPTION 'shipment_line % belongs to a locked shipment: only short_note may change (correction action)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shipment_line_lock_guard BEFORE UPDATE ON shipment_line
  FOR EACH ROW EXECUTE FUNCTION shipment_line_lock_guard();

-- Allowed status transitions (reference data owned by the migration, not by the seed).
CREATE TABLE ref_shipment_transition (
  from_status text NOT NULL,
  to_status   text NOT NULL,
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO ref_shipment_transition (from_status, to_status) VALUES
  ('Planned','Ready to Pack'), ('Ready to Pack','Packing'), ('Packing','Verified'), ('Verified','Shipped'),
  ('Packing','Rework'), ('Verified','Rework'), ('Rework','Packing'),
  ('Planned','On Hold'), ('Ready to Pack','On Hold'), ('Packing','On Hold'), ('Verified','On Hold'), ('Rework','On Hold'),
  ('On Hold','Planned'), ('On Hold','Ready to Pack'), ('On Hold','Packing'), ('On Hold','Verified'), ('On Hold','Rework'),
  ('Planned','Cancelled'), ('Ready to Pack','Cancelled'), ('Packing','Cancelled'), ('Verified','Cancelled'),
  ('Rework','Cancelled'), ('On Hold','Cancelled');

-- ---------------------------------------------------------------------------
-- 5. Packaging quality
-- ---------------------------------------------------------------------------
CREATE SEQUENCE packaging_error_no_seq START 1;

CREATE TABLE packaging_error (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  error_no            text        NOT NULL UNIQUE
                      DEFAULT ('PE-' || lpad(nextval('packaging_error_no_seq')::text, 4, '0'))
                      CHECK (error_no ~ '^PE-[0-9]{4,}$'),
  shipment_id         bigint      NOT NULL REFERENCES shipment(id),
  shipment_line_id    bigint,
  detected_at         timestamptz NOT NULL,
  rework_episode      integer     CHECK (rework_episode >= 1),
  detected_by_role    text        NOT NULL CHECK (detected_by_role IN ('Packer','Verifier','Quality','Customer')),
  detected_stage      text        NOT NULL CHECK (detected_stage IN ('Before ship','After ship')),
  category            text        NOT NULL CHECK (category IN ('Wrong part','Wrong quantity','Incorrect label','Paperwork',
                                                               'Packaging method','Damage','Traceability','Other')),
  paperwork_subtype   text        CHECK (paperwork_subtype IN ('Packing slip','BOL','C of C','Customer-specific form','Commercial invoice')),
  severity            text        NOT NULL CHECK (severity IN ('Low','Medium','High','Critical')),  -- UD-5
  description         text        NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 1000),
  root_cause_category text        CHECK (root_cause_category IN ('Method','People','Material','Machine','Measurement','Environment')),
  root_cause_note     text        CHECK (length(root_cause_note) <= 2000),
  status              text        NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Contained','Closed')),
  packaging_related   boolean     NOT NULL DEFAULT true,   -- UD-9 / kpi-spec S-1: false only for a customer-found error not caused by our packing
  closed_at           timestamptz,
  reported_by         bigint      NOT NULL REFERENCES app_user(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shipment_id),
  FOREIGN KEY (shipment_line_id, shipment_id) REFERENCES shipment_line (id, shipment_id),
  CHECK ((category = 'Paperwork') = (paperwork_subtype IS NOT NULL)),
  CHECK ((status = 'Closed') = (closed_at IS NOT NULL)),
  CHECK (detected_by_role <> 'Customer' OR detected_stage = 'After ship'),
  CHECK (detected_stage <> 'After ship' OR detected_by_role IN ('Quality','Customer')),
  CHECK (rework_episode IS NULL OR detected_stage = 'Before ship'),
  CONSTRAINT packaging_error_related_chk CHECK (packaging_related OR detected_stage = 'After ship')   -- UD-9
);
ALTER SEQUENCE packaging_error_no_seq OWNED BY packaging_error.error_no;
CREATE INDEX packaging_error_shipment_idx ON packaging_error (shipment_id);
CREATE INDEX packaging_error_detected_idx ON packaging_error (detected_at);
CREATE INDEX packaging_error_category_idx ON packaging_error (category);
CREATE INDEX packaging_error_open_idx     ON packaging_error (status) WHERE status <> 'Closed';

CREATE TABLE rework_event (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  packaging_error_id bigint      NOT NULL,
  shipment_id        bigint      NOT NULL,
  action             text        NOT NULL CHECK (action IN ('Relabel','Repack','Reprint paperwork','Replace part','Recount','Other')),
  started_at         timestamptz NOT NULL,
  completed_at       timestamptz,
  completed_business_date date GENERATED ALWAYS AS ((completed_at AT TIME ZONE 'UTC')::date) STORED,  -- D-1: same clock as completed_at
  minutes            integer GENERATED ALWAYS AS (floor(extract(epoch FROM (completed_at - started_at)) / 60)::integer) STORED,
  performed_by       bigint      NOT NULL REFERENCES app_user(id),
  reverified_ok      boolean,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (packaging_error_id, shipment_id) REFERENCES packaging_error (id, shipment_id),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE INDEX rework_event_error_idx     ON rework_event (packaging_error_id);
CREATE INDEX rework_event_shipment_idx  ON rework_event (shipment_id);
CREATE INDEX rework_event_completed_idx ON rework_event (completed_business_date) WHERE completed_business_date IS NOT NULL;

CREATE TABLE corrective_action (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  packaging_error_id bigint      NOT NULL REFERENCES packaging_error(id),
  action_description text        NOT NULL CHECK (length(btrim(action_description)) BETWEEN 1 AND 1000),
  owner_id           bigint      NOT NULL REFERENCES app_user(id),
  due_date           date        NOT NULL,
  status             text        NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Closed')),
  closed_at          timestamptz,
  created_by         bigint      NOT NULL REFERENCES app_user(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'Closed') = (closed_at IS NOT NULL))
);
CREATE INDEX corrective_action_error_idx ON corrective_action (packaging_error_id);
CREATE INDEX corrective_action_due_idx   ON corrective_action (status, due_date);

-- Status history and verification attempts (append-only; need packaging_error for the optional link).
CREATE TABLE shipment_status_history (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_id        bigint      NOT NULL REFERENCES shipment(id),
  from_status        text,
  to_status          text        NOT NULL,
  changed_at         timestamptz NOT NULL DEFAULT now(),
  business_date      date        NOT NULL,
  changed_by         bigint      NOT NULL REFERENCES app_user(id),
  note               text        CHECK (length(note) <= 500),
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (from_status, to_status) REFERENCES ref_shipment_transition (from_status, to_status),
  CHECK (from_status IS NOT NULL OR to_status = 'Planned')
);
CREATE INDEX shipment_status_history_shipment_idx ON shipment_status_history (shipment_id, changed_at, id);
CREATE INDEX shipment_status_history_to_idx       ON shipment_status_history (to_status, changed_at);
CREATE INDEX shipment_status_history_bd_idx       ON shipment_status_history (business_date);

CREATE FUNCTION status_history_chain_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_to text;
  last_at timestamptz;
BEGIN
  SELECT to_status, changed_at INTO last_to, last_at
    FROM shipment_status_history WHERE shipment_id = NEW.shipment_id
    ORDER BY changed_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW.from_status IS NOT NULL THEN
      RAISE EXCEPTION 'first status history row for a shipment must have from_status NULL' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.from_status IS DISTINCT FROM last_to THEN
      RAISE EXCEPTION 'status history chain broken: expected from_status %, got %', last_to, NEW.from_status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.changed_at < last_at THEN
      RAISE EXCEPTION 'status history timestamps must not go backwards (% < %)', NEW.changed_at, last_at USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shipment_status_history_chain BEFORE INSERT ON shipment_status_history
  FOR EACH ROW EXECUTE FUNCTION status_history_chain_check();

CREATE TABLE shipment_verification (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_id   bigint      NOT NULL REFERENCES shipment(id),
  attempt_no    integer     NOT NULL CHECK (attempt_no >= 1),
  result        text        NOT NULL CHECK (result IN ('Pass','Fail')),
  packer_id     bigint      NOT NULL REFERENCES app_user(id),
  verified_by   bigint      NOT NULL REFERENCES app_user(id),
  checklist     jsonb       NOT NULL,
  failed_items  text[]      NOT NULL DEFAULT '{}',
  note          text        CHECK (length(note) <= 500),
  verified_at   timestamptz NOT NULL DEFAULT now(),
  business_date date        NOT NULL,
  UNIQUE (shipment_id, attempt_no),
  CHECK (verified_by <> packer_id),
  CHECK (jsonb_typeof(checklist) = 'object'
         AND checklist ?& ARRAY['part_number','revision','quantity','lot','labels','packing_slip','packaging_method']),
  CHECK (failed_items <@ ARRAY['part_number','revision','quantity','lot','labels','packing_slip','coc','packaging_method']),
  CHECK ((result = 'Pass') = (cardinality(failed_items) = 0))
);
CREATE INDEX shipment_verification_bd_idx    ON shipment_verification (business_date);
CREATE INDEX shipment_verification_first_idx ON shipment_verification (business_date) WHERE attempt_no = 1;

-- ---------------------------------------------------------------------------
-- 6. Inventory
-- ---------------------------------------------------------------------------
CREATE SEQUENCE receipt_no_seq START 1;

CREATE TABLE receipt (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_no        text        NOT NULL UNIQUE
                    DEFAULT ('RC-' || lpad(nextval('receipt_no_seq')::text, 4, '0'))
                    CHECK (receipt_no ~ '^RC-[0-9]{4,}$'),
  supplier_id       bigint      NOT NULL REFERENCES supplier(id),
  supplier_po       text        NOT NULL CHECK (length(btrim(supplier_po)) BETWEEN 1 AND 40),
  part_id           bigint      NOT NULL REFERENCES part(id),
  qty_received      integer     NOT NULL CHECK (qty_received > 0),
  lot_number        text        NOT NULL,
  arrived_at        timestamptz NOT NULL,
  location_id       bigint      REFERENCES location(id),
  inspection_status text        NOT NULL CHECK (inspection_status IN ('Accepted','On Hold','Rejected')),
  received_by       bigint      NOT NULL REFERENCES app_user(id),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, part_id, location_id, lot_number),
  FOREIGN KEY (part_id, lot_number) REFERENCES lot (part_id, lot_number),
  CHECK ((inspection_status = 'Rejected') = (location_id IS NULL))
);
ALTER SEQUENCE receipt_no_seq OWNED BY receipt.receipt_no;
CREATE INDEX receipt_arrived_idx  ON receipt (arrived_at);
CREATE INDEX receipt_lot_idx      ON receipt (lot_number);
CREATE INDEX receipt_part_idx     ON receipt (part_id, arrived_at);
CREATE INDEX receipt_supplier_idx ON receipt (supplier_id);

CREATE SEQUENCE cycle_count_no_seq START 1;

CREATE TABLE cycle_count (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  count_no       text        NOT NULL UNIQUE
                 DEFAULT ('CC-' || lpad(nextval('cycle_count_no_seq')::text, 4, '0'))
                 CHECK (count_no ~ '^CC-[0-9]{4,}$'),
  scheduled_date date        NOT NULL,
  status         text        NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Counted','Approved')),
  scope_abc_class text       CHECK (scope_abc_class IN ('A','B','C')),
  scope_location_id bigint   REFERENCES location(id),
  created_by     bigint      NOT NULL REFERENCES app_user(id),
  submitted_by   bigint      REFERENCES app_user(id),
  submitted_at   timestamptz,
  approved_by    bigint      REFERENCES app_user(id),
  approved_at    timestamptz,
  approved_business_date date,
  approval_reason_code_id bigint REFERENCES reason_code(id),
  approval_note  text        CHECK (length(approval_note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('Counted','Approved')) = (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)),
  CHECK ((status = 'Approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_business_date IS NOT NULL)),
  CONSTRAINT cycle_count_approver_not_submitter_chk CHECK (approved_by IS NULL OR approved_by <> submitted_by),  -- UD-2 (R-4 widened)
  CHECK (approved_at IS NULL OR submitted_at IS NULL OR approved_at >= submitted_at)
);
ALTER SEQUENCE cycle_count_no_seq OWNED BY cycle_count.count_no;
CREATE INDEX cycle_count_approved_idx ON cycle_count (approved_business_date) WHERE status = 'Approved';
CREATE INDEX cycle_count_status_idx   ON cycle_count (status);

CREATE TABLE cycle_count_line (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_count_id bigint      NOT NULL REFERENCES cycle_count(id),
  part_id        bigint      NOT NULL REFERENCES part(id),
  location_id    bigint      NOT NULL REFERENCES location(id),
  lot_number     text        NOT NULL,
  abc_class      text        NOT NULL CHECK (abc_class IN ('A','B','C')),
  tolerance_pct  numeric(5,2) NOT NULL CHECK (tolerance_pct BETWEEN 0 AND 100),
  system_qty     integer     NOT NULL CHECK (system_qty >= 0),
  counted_qty    integer     CHECK (counted_qty >= 0),
  counted_by     bigint      REFERENCES app_user(id),
  counted_at     timestamptz,
  recount_qty    integer     CHECK (recount_qty >= 0),
  recounted_by   bigint      REFERENCES app_user(id),
  recounted_at   timestamptz,
  final_qty      integer GENERATED ALWAYS AS (COALESCE(recount_qty, counted_qty)) STORED,
  first_variance_qty integer GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  variance_qty   integer GENERATED ALWAYS AS (COALESCE(recount_qty, counted_qty) - system_qty) STORED,
  first_in_tolerance boolean GENERATED ALWAYS AS (abs(counted_qty - system_qty) * 100 <= system_qty * tolerance_pct) STORED,
  final_in_tolerance boolean GENERATED ALWAYS AS (abs(COALESCE(recount_qty, counted_qty) - system_qty) * 100 <= system_qty * tolerance_pct) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_count_id, part_id, location_id, lot_number),
  UNIQUE (id, part_id, location_id, lot_number),
  FOREIGN KEY (part_id, lot_number) REFERENCES lot (part_id, lot_number),
  CHECK ((counted_qty IS NULL) = (counted_by IS NULL AND counted_at IS NULL)),
  CHECK ((recount_qty IS NULL) = (recounted_by IS NULL AND recounted_at IS NULL)),
  CHECK (recount_qty IS NULL OR counted_qty IS NOT NULL)
);
CREATE INDEX cycle_count_line_count_idx ON cycle_count_line (cycle_count_id);
CREATE INDEX cycle_count_line_part_idx  ON cycle_count_line (part_id);

-- R-4 (widened by UD-2): the approver may not be the counter or a recounter of any line (this trigger) nor the
-- submitter (cycle_count_approver_not_submitter_chk). Defence in depth; the API checks first and answers 403.
-- An Approved count is terminal.
CREATE FUNCTION cycle_count_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'Approved' THEN
    RAISE EXCEPTION 'an Approved cycle count cannot be changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status = 'Approved' AND EXISTS (
       SELECT 1 FROM cycle_count_line l
        WHERE l.cycle_count_id = NEW.id
          AND (l.counted_by = NEW.approved_by OR l.recounted_by = NEW.approved_by)) THEN
    RAISE EXCEPTION 'the approver must not be a counter or recounter of this count (R-4)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cycle_count_approval_guard BEFORE UPDATE ON cycle_count
  FOR EACH ROW EXECUTE FUNCTION cycle_count_approval_guard();

CREATE TABLE inventory_transaction (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  txn_type           text        NOT NULL CHECK (txn_type IN ('RECEIPT','SHIP','TRANSFER','PRODUCTION_COMPLETE','SCRAP','ADJUST')),
  part_id            bigint      NOT NULL REFERENCES part(id),
  location_id        bigint      NOT NULL REFERENCES location(id),
  lot_number         text        NOT NULL,
  qty_change         integer     NOT NULL CHECK (qty_change <> 0),
  reason_code_id     bigint      REFERENCES reason_code(id),
  receipt_id         bigint,
  shipment_line_id   bigint,
  cycle_count_line_id bigint,
  txn_group          uuid,
  note               text,
  txn_at             timestamptz NOT NULL DEFAULT now(),
  created_by         bigint      NOT NULL REFERENCES app_user(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (part_id, lot_number) REFERENCES lot (part_id, lot_number),
  FOREIGN KEY (receipt_id, part_id, location_id, lot_number)
    REFERENCES receipt (id, part_id, location_id, lot_number),
  FOREIGN KEY (shipment_line_id, part_id, location_id, lot_number)
    REFERENCES shipment_line (id, part_id, location_id, lot_number),
  FOREIGN KEY (cycle_count_line_id, part_id, location_id, lot_number)
    REFERENCES cycle_count_line (id, part_id, location_id, lot_number),
  CHECK (txn_type <> 'RECEIPT'             OR (qty_change > 0 AND receipt_id IS NOT NULL)),
  CHECK (txn_type <> 'SHIP'                OR (qty_change < 0 AND shipment_line_id IS NOT NULL)),
  CHECK (txn_type <> 'PRODUCTION_COMPLETE' OR qty_change > 0),
  CHECK (txn_type <> 'SCRAP'               OR (qty_change < 0 AND reason_code_id IS NOT NULL)),
  CONSTRAINT inventory_transaction_adjust_chk CHECK (txn_type <> 'ADJUST' OR (reason_code_id IS NOT NULL AND cycle_count_line_id IS NOT NULL)),
  CHECK (txn_type <> 'TRANSFER'            OR txn_group IS NOT NULL),
  CHECK (receipt_id IS NULL          OR txn_type = 'RECEIPT'),
  CHECK (shipment_line_id IS NULL    OR txn_type = 'SHIP'),
  CHECK (cycle_count_line_id IS NULL OR txn_type = 'ADJUST'),
  CHECK (txn_group IS NULL           OR txn_type = 'TRANSFER')
);
CREATE INDEX inventory_transaction_key_idx  ON inventory_transaction (part_id, location_id, lot_number);
CREATE INDEX inventory_transaction_lot_idx  ON inventory_transaction (lot_number, txn_at, id);
CREATE INDEX inventory_transaction_time_idx ON inventory_transaction (txn_at);
CREATE INDEX inventory_transaction_ship_idx ON inventory_transaction (shipment_line_id) WHERE shipment_line_id IS NOT NULL;
CREATE INDEX inventory_transaction_rcpt_idx ON inventory_transaction (receipt_id) WHERE receipt_id IS NOT NULL;
CREATE UNIQUE INDEX inventory_transaction_one_adjust_per_line ON inventory_transaction (cycle_count_line_id) WHERE cycle_count_line_id IS NOT NULL;
CREATE INDEX inventory_transaction_group_idx ON inventory_transaction (txn_group) WHERE txn_group IS NOT NULL;

-- Deferred integrity checks evaluated at COMMIT:
-- (a) on-hand of (part, location, lot) never negative; advisory lock serialises concurrent postings to one key.
CREATE FUNCTION inventory_nonnegative_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bal bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('inv:' || NEW.part_id || ':' || NEW.location_id || ':' || NEW.lot_number, 0));
  SELECT COALESCE(SUM(qty_change), 0) INTO bal FROM inventory_transaction
   WHERE part_id = NEW.part_id AND location_id = NEW.location_id AND lot_number = NEW.lot_number;
  IF bal < 0 THEN
    RAISE EXCEPTION 'on-hand would be negative (%) for part %, location %, lot %', bal, NEW.part_id, NEW.location_id, NEW.lot_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER inventory_transaction_nonnegative
  AFTER INSERT ON inventory_transaction DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION inventory_nonnegative_check();

-- (b) a TRANSFER group is exactly two legs that sum to zero.
CREATE FUNCTION transfer_balanced_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s bigint; n bigint;
BEGIN
  IF NEW.txn_group IS NOT NULL THEN
    SELECT COALESCE(SUM(qty_change), 0), COUNT(*) INTO s, n FROM inventory_transaction WHERE txn_group = NEW.txn_group;
    IF s <> 0 OR n <> 2 THEN
      RAISE EXCEPTION 'TRANSFER group % must have exactly two legs summing to zero (legs=%, sum=%)', NEW.txn_group, n, s
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER inventory_transaction_transfer_balanced
  AFTER INSERT ON inventory_transaction DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION transfer_balanced_check();

-- ---------------------------------------------------------------------------
-- 7. Append-only, no-delete and updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log','shipment_status_history','shipment_verification','inventory_transaction'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_mutation()',
                   t || '_append_only', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['app_user','setting','customer','supplier','carrier','part','location','reason_code','lot',
                           'shipment','packaging_error','rework_event','corrective_action','receipt','cycle_count',
                           'cycle_count_line','ref_shipment_transition'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_delete()',
                   t || '_no_delete', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['app_user','setting','customer','supplier','carrier','part','location','reason_code',
                           'shipment','shipment_line','packaging_error','rework_event','corrective_action','receipt',
                           'cycle_count','cycle_count_line'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t || '_set_updated_at', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Views (helpers for the single KPI module and the reports)
-- ---------------------------------------------------------------------------
CREATE VIEW v_on_hand AS
SELECT part_id, location_id, lot_number, SUM(qty_change)::integer AS qty_on_hand
  FROM inventory_transaction
 GROUP BY part_id, location_id, lot_number
HAVING SUM(qty_change) <> 0;

CREATE VIEW v_on_hand_detail AS
SELECT oh.part_id, p.part_number, p.description, p.abc_class,
       oh.location_id, l.code AS location_code, l.type AS location_type,
       oh.lot_number, oh.qty_on_hand, (l.type = 'Hold') AS on_hold
  FROM v_on_hand oh
  JOIN part p     ON p.id = oh.part_id
  JOIN location l ON l.id = oh.location_id;

-- KPI-1, KPI-2, KPI-6 base rows: one row per Shipped shipment.
CREATE VIEW v_shipment_delivery AS
SELECT s.id AS shipment_id, s.shipment_no, s.customer_id, s.carrier_id,
       s.ship_date, s.shipped_at, s.promise_date, s.requested_date,
       (s.ship_date - s.promise_date)   AS days_late_vs_promise,
       (s.ship_date - s.requested_date) AS days_late_vs_requested,
       NOT EXISTS (SELECT 1 FROM shipment_line sl
                    WHERE sl.shipment_id = s.id AND COALESCE(sl.qty_shipped, 0) < sl.qty_ordered) AS in_full,
       h.ready_to_pack_at,
       (EXTRACT(EPOCH FROM (s.shipped_at - h.ready_to_pack_at)) / 3600.0)::double precision AS cycle_hours  -- unrounded (UD-10)
  FROM shipment s
  LEFT JOIN LATERAL (SELECT MIN(changed_at) AS ready_to_pack_at
                       FROM shipment_status_history
                      WHERE shipment_id = s.id AND to_status = 'Ready to Pack') h ON true
 WHERE s.status = 'Shipped';

-- KPI-3, KPI-4 helper rows: one row per non-cancelled shipment. Error counts use the countable-error rule of
-- docs/kpi/kpi-spec.md section 3 (Before ship, or After ship and packaging_related). The KPI module uses the
-- base-table SQL of kpi-spec sections 6.2/6.3; this view is a convenience for reports and must give the same counts.
CREATE VIEW v_shipment_quality AS
SELECT s.id AS shipment_id, s.shipment_no, s.status, s.customer_id, s.carrier_id, s.ship_date,
       v1.verified_at AS first_verified_at,
       v1.business_date AS first_verified_business_date,
       v1.result      AS first_result,
       (SELECT COUNT(*) FROM packaging_error e WHERE e.shipment_id = s.id
           AND (e.detected_stage = 'Before ship' OR e.packaging_related))                                  AS error_count,
       (SELECT COUNT(*) FROM packaging_error e WHERE e.shipment_id = s.id AND e.detected_stage = 'Before ship') AS internal_error_count,
       (SELECT COUNT(*) FROM packaging_error e WHERE e.shipment_id = s.id AND e.detected_stage = 'After ship'
           AND e.packaging_related)                                                                         AS escape_error_count
  FROM shipment s
  LEFT JOIN shipment_verification v1 ON v1.shipment_id = s.id AND v1.attempt_no = 1
 WHERE s.status <> 'Cancelled';

-- Ledger rows with the API's reference_type / reference_id (contract section 7).
CREATE VIEW v_inventory_transaction AS
SELECT t.*,
       CASE WHEN t.receipt_id IS NOT NULL THEN 'receipt'
            WHEN t.shipment_line_id IS NOT NULL THEN 'shipment'
            WHEN t.cycle_count_line_id IS NOT NULL THEN 'cycle_count'
            ELSE 'manual' END AS reference_type,
       COALESCE(t.receipt_id, sl.shipment_id, ccl.cycle_count_id) AS reference_id
  FROM inventory_transaction t
  LEFT JOIN shipment_line sl ON sl.id = t.shipment_line_id
  LEFT JOIN cycle_count_line ccl ON ccl.id = t.cycle_count_line_id;
