-- SPIKE ONLY. Fictional data (Cobalt Ridge Components, Inc.). Forward-only.
CREATE TABLE shipment (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_no   text        NOT NULL UNIQUE,            -- SH-####
  customer      text        NOT NULL,
  status        text        NOT NULL DEFAULT 'Verified'
                CHECK (status IN ('Draft','Packed','Verified','Shipped','Cancelled')),
  shipped_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_transaction (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  part_no       text        NOT NULL,                   -- CRC-####-<rev>
  lot_no        text,
  qty_delta     integer     NOT NULL CHECK (qty_delta <> 0),
  reason        text        NOT NULL CHECK (reason IN ('RECEIPT','SHIP','ADJUST')),
  shipment_id   bigint      REFERENCES shipment(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor         text        NOT NULL,
  action        text        NOT NULL,
  entity        text        NOT NULL,
  entity_id     text        NOT NULL,
  detail        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER inventory_transaction_append_only
  BEFORE UPDATE OR DELETE ON inventory_transaction
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
